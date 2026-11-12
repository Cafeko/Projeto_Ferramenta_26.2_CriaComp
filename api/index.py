"""API FastAPI do SpriteTransfer Web (BYOK - Bring Your Own Key).

A camada é deliberadamente sem estado: a chave de API enviada pelo cliente é
usada apenas para falar com o provedor escolhido, nunca é persistida nem
registrada em log. Cada provedor tem um adaptador próprio para que o contrato
do frontend permaneça estável mesmo com APIs externas diferentes.

Endpoints:
    GET  /api/health   -> status da função
    POST /api/models   -> valida a chave e lista modelos de imagem/visão
    POST /api/generate -> gera ou corrige frames de sprite
"""

from __future__ import annotations

import base64
import binascii
import logging
import os
import time
from dataclasses import dataclass
from typing import Any, Iterable, Literal

import requests
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------------
# Configuração e constantes
# ---------------------------------------------------------------------------

logger = logging.getLogger("spritetransfer.api")

PROVIDER_LABELS: dict[str, str] = {
    "gemini": "Google Gemini",
    "openai": "OpenAI",
    "openrouter": "OpenRouter",
    "replicate": "Replicate",
}

PROVIDER_NAMES = tuple(PROVIDER_LABELS)

# Timeouts de rede. A geração de imagem pode demorar bastante; o limite de
# execução da função na Vercel é configurado no vercel.json (maxDuration).
_CONNECT_TIMEOUT = float(os.getenv("PROVIDER_CONNECT_TIMEOUT_SECONDS", "15"))
_READ_TIMEOUT = float(os.getenv("PROVIDER_READ_TIMEOUT_SECONDS", "180"))
_REQUEST_TIMEOUT = (_CONNECT_TIMEOUT, _READ_TIMEOUT)
_DOWNLOAD_TIMEOUT = (10.0, 60.0)

MAX_INPUT_IMAGE_BYTES = int(os.getenv("MAX_INPUT_IMAGE_BYTES", str(8 * 1024 * 1024)))
MAX_OUTPUT_IMAGE_BYTES = int(os.getenv("MAX_OUTPUT_IMAGE_BYTES", str(20 * 1024 * 1024)))
MAX_REFERENCE_IMAGES = 24
MAX_PREVIOUS_IMAGES = 12

# A Vercel limita o corpo da requisição a ~4,5 MB. Como Base64 cresce ~33%,
# deixamos uma margem para o restante do JSON.
MAX_TOTAL_BASE64_CHARS = 4_000_000

REPLICATE_API = "https://api.replicate.com/v1"
OPENAI_API = "https://api.openai.com/v1"
OPENROUTER_API = "https://openrouter.ai/api/v1"
GEMINI_API = "https://generativelanguage.googleapis.com/v1beta"
GEMINI_API_REVISION = "2026-05-20"

MIME_EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/bmp": "bmp",
    "image/svg+xml": "svg",
}

# ---------------------------------------------------------------------------
# Erros
# ---------------------------------------------------------------------------


class ApiError(Exception):
    """Erro previsto, já traduzido para uma resposta amigável ao frontend."""

    def __init__(
        self,
        status_code: int,
        message: str,
        *,
        code: str = "provider_error",
        provider: str | None = None,
        provider_status: int | None = None,
        details: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.code = code
        self.provider = provider
        self.provider_status = provider_status
        self.details = details


# ---------------------------------------------------------------------------
# Contrato HTTP (Pydantic)
# ---------------------------------------------------------------------------


class _ProviderRequest(BaseModel):
    provider: str
    api_key: str

    @field_validator("provider")
    @classmethod
    def _validate_provider(cls, value: str) -> str:
        normalized = (value or "").strip().lower()
        if normalized not in PROVIDER_LABELS:
            raise ValueError(
                "provedor inválido; use gemini, openai, openrouter ou replicate"
            )
        return normalized

    @field_validator("api_key")
    @classmethod
    def _validate_api_key(cls, value: str) -> str:
        normalized = (value or "").strip()
        if not normalized:
            raise ValueError("informe a chave de API")
        if len(normalized) > 4096:
            raise ValueError("a chave de API informada é longa demais")
        return normalized


class ModelsRequest(_ProviderRequest):
    pass


class GenerateRequest(_ProviderRequest):
    model_id: str = Field(max_length=200)
    reference_images: list[str] = Field(
        default_factory=list, max_length=MAX_REFERENCE_IMAGES
    )
    # Imagens de referência de ESTILO (opcionais): definem apenas a aparência
    # visual final (pixel density, paleta, contorno, nível de detalhe).
    style_images: list[str] = Field(default_factory=list, max_length=4)
    # Imagens de referência de APARÊNCIA (opcionais): definem apenas a
    # identidade do personagem (roupa, cores, cabelo, proporções, equipamento).
    appearance_images: list[str] = Field(default_factory=list, max_length=4)
    character_appearance: str = Field(default="", max_length=6000)
    art_style: str = Field(default="", max_length=6000)
    previous_generated_images: list[str] = Field(
        default_factory=list, max_length=MAX_PREVIOUS_IMAGES
    )
    correction_prompt: str | None = Field(default=None, max_length=6000)
    target_frame_index: int | None = Field(default=None, ge=0)
    # Quantidade de frames que a saída deve conter. O frontend envia o total de
    # células da grade da referência (ex.: 16) para a IA não gerar 1 frame só.
    frame_count: int | None = Field(default=None, ge=1, le=64)
    # Formato da grade usada no recorte local (ex.: 4 colunas × 4 linhas). A IA
    # deve organizar a spritesheet no mesmo formato para o recorte bater.
    grid_columns: int | None = Field(default=None, ge=1, le=64)
    grid_rows: int | None = Field(default=None, ge=1, le=64)

    @field_validator("model_id")
    @classmethod
    def _validate_model_id(cls, value: str) -> str:
        normalized = (value or "").strip()
        if not normalized:
            raise ValueError("informe o model_id do provedor")
        return normalized

    @field_validator("character_appearance", "art_style")
    @classmethod
    def _strip_text(cls, value: str) -> str:
        return (value or "").strip()

    @field_validator("correction_prompt")
    @classmethod
    def _normalize_correction(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    def total_base64_chars(self) -> int:
        return (
            sum(len(item) for item in self.reference_images)
            + sum(len(item) for item in self.style_images)
            + sum(len(item) for item in self.appearance_images)
            + sum(len(item) for item in self.previous_generated_images)
        )


class ModelOption(BaseModel):
    id: str
    name: str
    description: str | None = None
    supports_reference_images: bool = True


class ModelsResponse(BaseModel):
    provider: str
    source: Literal["remote", "fallback"]
    models: list[ModelOption]
    warning: str | None = None


class GenerateResponse(BaseModel):
    provider: str
    model_id: str
    mode: Literal["generation", "correction"]
    target_frame_index: int | None = None
    images: list[str]
    mime_types: list[str]


# ---------------------------------------------------------------------------
# Imagens (normalização, sniff de MIME e download)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ImagePayload:
    b64: str
    mime_type: str
    data_url: str


@dataclass(frozen=True)
class VisualInput:
    label: str
    role: Literal["pose", "appearance", "style", "previous"]
    image: ImagePayload


@dataclass(frozen=True)
class PromptPlan:
    mode: Literal["generation", "correction"]
    order_text: str
    body: str
    visuals: tuple[VisualInput, ...]
    target_frame_index: int | None
    frame_count_override: int | None = None
    grid_columns: int | None = None
    grid_rows: int | None = None

    @property
    def prompt(self) -> str:
        if not self.order_text:
            return self.body
        return f"{self.order_text}\n\n{self.body}"

    @property
    def aspect(self) -> str:
        """Proporção adequada ao formato da grade de saída."""
        columns = max(1, self.grid_columns or self.frame_count)
        rows = max(1, self.grid_rows or 1)
        ratio = columns / rows
        if ratio >= 2.6:
            return "21:9"
        if ratio >= 1.8:
            return "16:9"
        if ratio >= 1.25:
            return "3:2"
        return "1:1"

    @property
    def frame_count(self) -> int:
        """Quantidade de frames esperada na saída deste plano."""
        if self.frame_count_override is not None:
            return self.frame_count_override
        if self.mode == "generation":
            return sum(1 for visual in self.visuals if visual.role == "pose") or 1
        if self.target_frame_index is not None:
            return 1
        previous = sum(1 for visual in self.visuals if visual.role == "previous")
        return previous or 1


def _sniff_mime(raw: bytes) -> str | None:
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if raw.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if raw.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    if raw.startswith(b"BM"):
        return "image/bmp"
    return None


def _canonical_b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


def _decode_b64(value: str) -> bytes:
    compact = "".join(value.split())
    if not compact:
        raise ValueError("Base64 vazio")
    if "-" in compact or "_" in compact:
        compact = compact.replace("-", "+").replace("_", "/")
    compact += "=" * (-len(compact) % 4)
    return base64.b64decode(compact, validate=True)


def _make_image(raw: bytes, mime_type: str | None) -> ImagePayload:
    if len(raw) > MAX_OUTPUT_IMAGE_BYTES:
        raise ApiError(
            502,
            "O provedor retornou uma imagem maior do que o limite permitido.",
            code="provider_image_too_large",
        )
    mime = _sniff_mime(raw) or (mime_type or "image/png").split(";")[0].strip()
    if not mime.startswith("image/"):
        mime = "image/png"
    b64 = _canonical_b64(raw)
    return ImagePayload(
        b64=b64, mime_type=mime, data_url=f"data:{mime};base64,{b64}"
    )


def _image_from_provider_b64(b64: str, mime_type: str | None = None) -> ImagePayload:
    try:
        raw = _decode_b64(b64)
    except (binascii.Error, ValueError) as exc:
        raise ApiError(
            502,
            "O provedor retornou uma imagem em Base64 inválida.",
            code="invalid_provider_image",
        ) from exc
    return _make_image(raw, mime_type)


def _normalize_input_image(value: str, field: str, index: int) -> ImagePayload:
    if not isinstance(value, str) or not value.strip():
        raise ApiError(
            400,
            f"A imagem {index + 1} do campo '{field}' está vazia.",
            code="invalid_image",
        )

    raw_value = value.strip()
    declared_mime: str | None = None
    if raw_value.startswith("data:"):
        header, separator, data = raw_value.partition(",")
        if not separator or ";base64" not in header.lower():
            raise ApiError(
                400,
                f"A imagem {index + 1} do campo '{field}' não é um data URL Base64 válido.",
                code="invalid_image",
            )
        declared_mime = header[5:].split(";", 1)[0].strip() or None
        raw_value = data

    try:
        raw = _decode_b64(raw_value)
    except (binascii.Error, ValueError) as exc:
        raise ApiError(
            400,
            f"A imagem {index + 1} do campo '{field}' não está em Base64 válido.",
            code="invalid_image",
        ) from exc

    if not raw:
        raise ApiError(
            400,
            f"A imagem {index + 1} do campo '{field}' está vazia.",
            code="invalid_image",
        )
    if len(raw) > MAX_INPUT_IMAGE_BYTES:
        raise ApiError(
            413,
            f"A imagem {index + 1} do campo '{field}' excede o limite de "
            f"{MAX_INPUT_IMAGE_BYTES // (1024 * 1024)} MB.",
            code="image_too_large",
        )

    mime = _sniff_mime(raw)
    if not mime and declared_mime and declared_mime.startswith("image/"):
        mime = declared_mime
    if not mime:
        mime = "image/png"
    return _make_image(raw, mime)


def _truncate(text: str, limit: int = 400) -> str:
    text = " ".join((text or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _provider_message(response: requests.Response) -> str:
    """Extrai a mensagem mais útil do corpo de erro sem expor credenciais."""
    try:
        payload = response.json()
    except ValueError:
        return _truncate(response.text)

    if isinstance(payload, str):
        return _truncate(payload)
    if not isinstance(payload, dict):
        return _truncate(str(payload))

    error = payload.get("error")
    if isinstance(error, dict):
        message = error.get("message") or error.get("detail")
        if message:
            return _truncate(str(message))
    elif isinstance(error, str) and error.strip():
        return _truncate(error)

    for key in ("message", "detail", "title", "reason"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return _truncate(value)
        if isinstance(value, list) and value:
            return _truncate("; ".join(str(item) for item in value))

    return _truncate(str(payload))


_QUOTA_HINTS = (
    "insufficient_quota",
    "quota",
    "billing",
    "credit",
    "balance",
    "saldo",
    "payment",
    "exceeded your current quota",
)

_INVALID_KEY_HINTS = (
    "api key not valid",
    "api_key_invalid",
    "invalid api key",
    "incorrect api key",
    "invalid_api_key",
    "authentication",
    "unauthorized",
)

_SAFETY_HINTS = (
    "safety",
    "moderation",
    "nsfw",
    "blocked by policy",
    "prohibited",
    "content policy",
)


def _http_error(provider: str, response: requests.Response) -> ApiError:
    label = PROVIDER_LABELS.get(provider, provider)
    status = response.status_code
    upstream = _provider_message(response)
    upstream_lower = upstream.lower()

    if any(hint in upstream_lower for hint in _SAFETY_HINTS):
        return ApiError(
            422,
            f"O {label} bloqueou a geração por segurança. "
            "Ajuste o personagem, o estilo ou a instrução e tente novamente.",
            code="safety_blocked",
            provider=provider,
            provider_status=status,
            details=upstream,
        )

    if status in (401, 403) or any(
        hint in upstream_lower for hint in _INVALID_KEY_HINTS
    ):
        return ApiError(
            401,
            f"Chave de API inválida ou sem permissão no {label}. "
            "Confira a chave e as permissões da conta e tente novamente.",
            code="invalid_api_key",
            provider=provider,
            provider_status=status,
        )

    if status == 402 or status == 429 or any(
        hint in upstream_lower for hint in _QUOTA_HINTS
    ):
        if status == 402 or any(hint in upstream_lower for hint in _QUOTA_HINTS):
            return ApiError(
                402,
                f"Saldo ou cota esgotados no {label}. "
                "Adicione créditos na conta do provedor ou use outra chave.",
                code="quota_exhausted",
                provider=provider,
                provider_status=status,
            )
        return ApiError(
            429,
            f"Limite de requisições atingido no {label}. "
            "Aguarde alguns instantes e tente novamente.",
            code="rate_limit",
            provider=provider,
            provider_status=status,
            details=upstream,
        )

    if status == 404:
        return ApiError(
            400,
            f"O {label} não encontrou o modelo ou recurso solicitado. "
            "Confira o model_id escolhido.",
            code="model_not_found",
            provider=provider,
            provider_status=status,
            details=upstream,
        )

    if status == 413:
        return ApiError(
            413,
            "As imagens enviadas são grandes demais para o provedor. "
            "Reduza a resolução ou a quantidade de frames e tente novamente.",
            code="payload_too_large",
            provider=provider,
            provider_status=status,
            details=upstream,
        )

    if status in (400, 422):
        return ApiError(
            400,
            f"A requisição foi recusada pelo {label}. {upstream}",
            code="invalid_request",
            provider=provider,
            provider_status=status,
            details=upstream,
        )

    if status >= 500:
        return ApiError(
            502,
            f"O {label} está temporariamente indisponível. Tente novamente em instantes.",
            code="provider_unavailable",
            provider=provider,
            provider_status=status,
            details=upstream,
        )

    return ApiError(
        502,
        f"O {label} recusou a requisição. {upstream}",
        code="provider_error",
        provider=provider,
        provider_status=status,
        details=upstream,
    )


def _request_json(
    method: str,
    url: str,
    *,
    provider: str,
    headers: dict[str, str] | None = None,
    json_body: Any = None,
    timeout: tuple[float, float] = _REQUEST_TIMEOUT,
) -> Any:
    label = PROVIDER_LABELS.get(provider, provider)
    try:
        response = requests.request(
            method,
            url,
            headers=headers,
            json=json_body,
            timeout=timeout,
        )
    except requests.Timeout as exc:
        raise ApiError(
            504,
            f"O {label} demorou demais para responder. "
            "Tente novamente ou escolha um modelo mais rápido.",
            code="provider_timeout",
            provider=provider,
        ) from exc
    except requests.ConnectionError as exc:
        raise ApiError(
            502,
            f"Não foi possível conectar ao {label}. Verifique sua internet e tente novamente.",
            code="connection_error",
            provider=provider,
        ) from exc
    except requests.RequestException as exc:
        raise ApiError(
            502,
            f"Falha de rede ao falar com o {label}. Tente novamente.",
            code="network_error",
            provider=provider,
            details=type(exc).__name__,
        ) from exc

    if response.status_code >= 400:
        raise _http_error(provider, response)

    try:
        return response.json()
    except ValueError as exc:
        raise ApiError(
            502,
            f"O {label} devolveu uma resposta que não é JSON válido.",
            code="invalid_provider_response",
            provider=provider,
            provider_status=response.status_code,
            details=_truncate(response.text, 300),
        ) from exc


def _download_image(
    url: str,
    *,
    provider: str,
    api_key: str | None = None,
) -> ImagePayload:
    label = PROVIDER_LABELS.get(provider, provider)
    headers: dict[str, str] = {}
    if api_key and provider == "replicate":
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        response = requests.get(
            url, headers=headers, timeout=_DOWNLOAD_TIMEOUT, stream=True
        )
        # Alguns links do Replicate são assinados e recusam o header Bearer.
        if response.status_code in (401, 403) and headers:
            response.close()
            response = requests.get(url, timeout=_DOWNLOAD_TIMEOUT, stream=True)
    except requests.Timeout as exc:
        raise ApiError(
            504,
            f"O download da imagem gerada pelo {label} demorou demais.",
            code="download_timeout",
            provider=provider,
        ) from exc
    except requests.RequestException as exc:
        raise ApiError(
            502,
            f"Não foi possível baixar a imagem gerada pelo {label}.",
            code="download_failed",
            provider=provider,
            details=type(exc).__name__,
        ) from exc

    try:
        if response.status_code >= 400:
            raise ApiError(
                502,
                f"Não foi possível baixar a imagem gerada pelo {label} "
                f"(HTTP {response.status_code}).",
                code="download_failed",
                provider=provider,
                provider_status=response.status_code,
            )
        content = bytearray()
        for chunk in response.iter_content(chunk_size=64 * 1024):
            if not chunk:
                continue
            content.extend(chunk)
            if len(content) > MAX_OUTPUT_IMAGE_BYTES:
                raise ApiError(
                    502,
                    "A imagem retornada pelo provedor é grande demais.",
                    code="provider_image_too_large",
                    provider=provider,
                )
        if not content:
            raise ApiError(
                502,
                f"O {label} retornou uma imagem vazia.",
                code="empty_provider_image",
                provider=provider,
            )
        return _make_image(
            bytes(content), response.headers.get("Content-Type", "image/png")
        )
    finally:
        response.close()


def _frame_aspect(frame_count: int) -> str:
    """Sugere uma proporção que acomode a spritesheet horizontal."""
    if frame_count >= 8:
        return "21:9"
    if frame_count >= 4:
        return "16:9"
    if frame_count >= 2:
        return "3:2"
    return "1:1"


def _frame_size(frame_count: int) -> str:
    """Tamanho aceito pela Images API da OpenAI (retrato/paisagem/quadrado)."""
    return "1024x1024" if frame_count <= 1 else "1536x1024"


def _order_text(visuals: Iterable[VisualInput]) -> str:
    lines = [f"{index + 1}. {visual.label}" for index, visual in enumerate(visuals)]
    if not lines:
        return ""
    return "INPUT IMAGES, IN THIS EXACT ORDER:\n" + "\n".join(lines)


def _generation_body(request: GenerateRequest, frame_count: int) -> str:
    has_appearance_image = bool(request.appearance_images)
    has_appearance_text = bool(request.character_appearance.strip())
    if has_appearance_text:
        character = request.character_appearance
    elif has_appearance_image:
        character = (
            "Use the APPEARANCE REFERENCE image for the character identity: "
            "clothing, colors, hair, equipment, proportions and defining traits."
        )
    else:
        character = "A generic 2D game character."

    if has_appearance_image:
        appearance_source_rule = (
            "- An APPEARANCE REFERENCE image is provided. Use it ONLY for the "
            "character's identity: clothing, colors, hair, equipment, proportions "
            "and defining traits. Render it in the ART STYLE. Do NOT copy its "
            "pose, position, frame layout, background, pixel density, outlines, "
            "shading or rendering style.\n"
        )
    elif has_appearance_text:
        appearance_source_rule = (
            "- The CHARACTER DESCRIPTION defines the character's identity; render "
            "it in the ART STYLE and simplify details to fit the resolution.\n"
        )
    else:
        appearance_source_rule = ""

    has_style_image = bool(request.style_images)
    has_style_text = bool(request.art_style.strip())

    if has_style_text:
        style_block = request.art_style
    elif has_style_image:
        style_block = (
            "Follow the ART STYLE REFERENCE image for the rendering style "
            "(pixel density, palette, outlines, shading and level of detail)."
        )
    else:
        style_block = (
            "No art style image or description was provided. In this case only, "
            "use the POSE REFERENCE's rendering style as the art style too "
            "(pixel density, palette, outlines, shading and level of detail), "
            "while still using its poses only."
        )

    if has_style_image:
        style_source_rule = (
            "- An ART STYLE REFERENCE image is provided. It defines ONLY the "
            "rendering style: pixel density, level of abstraction, palette, "
            "outline style, shading, texture and amount of detail. Do NOT copy "
            "its character identity, clothing, pose, frame layout or background.\n"
        )
    elif has_style_text:
        style_source_rule = (
            "- No art style image was provided. The ART STYLE DESCRIPTION below "
            "defines the rendering style.\n"
        )
    else:
        style_source_rule = (
            "- Neither an art style image nor an art style description was "
            "provided. The POSE REFERENCE is the only fallback for rendering "
            "style: match its pixel density, palette, outline style, shading and "
            "level of detail. Its poses still remain the only source of poses.\n"
        )

    single_sheet = len(request.reference_images) == 1
    grid_columns = request.grid_columns or (frame_count if frame_count > 0 else 1)
    grid_rows = request.grid_rows or 1
    if grid_columns * grid_rows != frame_count:
        # Grade inconsistente com a contagem: cai para uma linha única.
        grid_columns = frame_count
        grid_rows = 1
    grid_layout = (
        "side by side in a single row"
        if grid_rows == 1
        else f"arranged in a {grid_columns} columns × {grid_rows} rows grid"
    )
    cell_order = "left-to-right (and top-to-bottom when there are multiple rows)"

    if frame_count > 1:
        if single_sheet:
            layout_rule = (
                "The POSE REFERENCE is a SINGLE sprite sheet image. It contains "
                f"EXACTLY {frame_count} frames (animation cells) arranged in a grid. "
                f"Read the cells in order: {cell_order}. "
                "Do not treat the whole sheet as one single pose."
            )
        else:
            layout_rule = (
                f"There are {frame_count} POSE REFERENCE images, one per frame, "
                "in the same order as the output frames."
            )
        output_rule = (
            f"OUTPUT FORMAT - CRITICAL:\n"
            f"- Return ONE single sprite sheet with EXACTLY {frame_count} frames, "
            f"{grid_layout}, in reading order: {cell_order}.\n"
            f"- The sheet MUST contain exactly {frame_count} different frames: not "
            f"one, not fewer, not more.\n"
            "- Every frame must show the SAME character in the pose of the "
            "corresponding reference frame.\n"
            "- Frame N of the output = frame N of the reference (same pose, same "
            "limb positions, same timing phase).\n"
            "- Never repeat the same pose across frames. Never merge two reference "
            "poses into one frame.\n"
            "- Frames must be evenly spaced, with the same canvas size and scale, "
            "no gaps, no borders, no labels and no extra panels."
        )
    else:
        layout_rule = (
            "The POSE REFERENCE shows a single pose. The output must be a single "
            "frame with that same pose."
        )
        output_rule = (
            "OUTPUT FORMAT: exactly one single sprite frame, centered, with no "
            "sprite sheet, no border and no extra panels."
        )

    if not request.reference_images:
        layout_rule = (
            "No pose reference was provided. Use a clear neutral idle pose."
        )

    return f"""You are generating a 2D game sprite sheet.

TASK: Transfer ONLY the poses from the POSE REFERENCE onto the CHARACTER
defined below (by the CHARACTER APPEARANCE section and/or the APPEARANCE
REFERENCE), rendered in the ART STYLE. The result must look like a native
low-resolution game sprite sheet created directly within the target pixel
limitations of the art style.

INPUT ROLES (strict):
1) POSE REFERENCE = frame layout, pose, position, timing, silhouette, body
   orientation and camera angle ONLY. It is a technical template. NEVER copy
   its character identity, clothing, colors, palette, shading, texture or
   rendering style.
2) APPEARANCE REFERENCE (when present) = character identity ONLY: clothing,
   colors, hair, equipment, proportions and defining traits. NEVER copy its
   pose, position, frame layout, background, pixel density, outlines, shading
   or rendering style.
3) ART STYLE REFERENCE (when present) = rendering style ONLY: pixel density,
   level of abstraction, palette discipline, outline style, shading, texture
   and amount of detail. NEVER copy its character identity, pose, frame layout
   or background.
4) CHARACTER DESCRIPTION = who the character is (clothing, colors, proportions,
   hair, equipment, defining traits).
5) ART STYLE DESCRIPTION = the rendering style.
{appearance_source_rule}{style_source_rule}- {layout_rule}

CHARACTER APPEARANCE:
{character}

ART STYLE (MANDATORY - overrides conflicting details):
{style_block}

{output_rule}

POSE REFERENCE AS TECHNICAL TEMPLATE:
- Preserve the same canvas dimensions and aspect ratio as the POSE REFERENCE
  sprite sheet.
- Preserve the same number of frames, the same frame order, the same grid
  arrangement and the same spacing between frames.
- Preserve the approximate position of the character inside each frame,
  including the amount of empty space surrounding it. Do not automatically
  center every frame or reposition the character independently.
- Preserve the approximate sprite scale relative to each frame. Do not enlarge
  the character to show more detail.
- Do not crop, extend, add margins or padding, change the aspect ratio or
  upscale the canvas.
- Do not add, remove, duplicate, split or merge frames.
- Each output frame corresponds directly to the same reference frame.

STYLE AND TECHNICAL LIMITATIONS:
- Design the sprite DIRECTLY at the target pixel scale. Do not create a detailed
  illustration and then convert it into pixel art.
- Do not simulate pixel art at a higher resolution.
- Large, clearly visible pixels; hard pixel edges; no anti-aliasing, no smooth
  edges, no gradients, no soft shadows and no subpixel detail.
- Very limited, discrete color palette. No photographic color variation and no
  colors added just to create realistic lighting or depth.
- Simple geometric pixel shapes; minimal shading and texture; simplified facial
  features, anatomy and clothing.
- Do not add detail that the target resolution cannot represent. If a feature
  cannot be represented clearly, simplify it instead of adding pixels.
- The ART STYLE defines the exact level of pixel density, complexity and
  detail. The POSE REFERENCE only defines the layout and the poses.
- Do not increase sprite size, canvas resolution, pixel density or color
  complexity to accommodate the character description.

CONSISTENCY RULES:
- Every frame must depict the same character with the same clothing, hair,
  accessories, palette, outlines and proportions.
- Preserve each reference pose and silhouette as closely as possible.
- Keep the character inside the same general area occupied by the reference
  character in each frame.
- Isolate the sprite on the same background/transparency characteristic as the
  reference. If a solid background is needed, use a single flat chroma-key
  magenta #FF00FF with no shadows, gradients, texture or scenery.
- No text, no watermark, no UI, no speech bubbles, no extra characters and no
  background objects.

FRAME COUNT:
- Output EXACTLY {frame_count} frame(s).
- When {frame_count} is greater than 1, the result MUST be one sprite sheet
  with {frame_count} frames. Returning a single frame is wrong.

MOST IMPORTANT RULE:
- The target style's pixel limitations are more important than adding detail
  from the character description.
- NEVER increase resolution, sprite size, pixel density, color complexity or
  visual detail to accommodate the description.
- If there is not enough resolution to represent a characteristic, simplify it.
- The result must look like an authentic low-resolution game sprite sheet, not
  a modern high-resolution pixel-art illustration."""


def _correction_body(
    request: GenerateRequest,
    *,
    target_frame_index: int | None,
    previous_count: int,
    pose_count: int,
    frame_count: int,
    grid_columns: int,
    grid_rows: int,
) -> str:
    correction = request.correction_prompt or ""
    if target_frame_index is not None:
        scope = (
            f"Apply the correction ONLY to frame {target_frame_index + 1}. "
            "The previous generated sprite for that frame is the source of truth."
        )
        output_rule = (
            "OUTPUT FORMAT: exactly one corrected sprite frame, with no sprite "
            "sheet, no border and no extra panels."
        )
    else:
        if frame_count > 1:
            scope = (
                f"Apply the correction consistently to every frame inside the "
                f"provided sprite sheet ({frame_count} frames). Preserve each "
                "frame's pose, grid position and timing."
            )
        else:
            scope = (
                "Apply the correction consistently to the provided sprite. "
                "Preserve its pose and timing."
            )
        if frame_count > 1:
            layout = (
                "side by side in a single row"
                if grid_rows == 1
                else f"arranged in a {grid_columns} columns × {grid_rows} rows grid"
            )
            output_rule = (
                f"OUTPUT FORMAT - CRITICAL:\n"
                f"- Return ONE single sprite sheet containing EXACTLY {frame_count} "
                f"frames, {layout}, in the same reading order and at the same grid "
                "positions as the PREVIOUS GENERATED sheet.\n"
                "- The PREVIOUS GENERATED input may be a single sprite sheet with "
                "multiple frames. Treat every cell as one separate frame.\n"
                "- Apply the correction to EVERY cell, preserving each frame's "
                "pose, position, timing and canvas size.\n"
                "- Do not crop, merge, reorder, add or remove frames. Do not return "
                f"a single frame when {frame_count} frames are expected."
            )
        else:
            output_rule = (
                "OUTPUT FORMAT: exactly one corrected sprite frame, with no sprite "
                "sheet, no border and no extra panels."
            )

    pose_rule = (
        "- The POSE REFERENCE image(s) define the required pose and silhouette. "
        "Do not copy their character design.\n"
        if pose_count
        else ""
    )
    if request.appearance_images:
        appearance_rule = (
            "- The APPEARANCE REFERENCE image defines the character's identity "
            "(clothing, colors, hair, equipment, proportions). Do not copy its "
            "pose, position, frame layout or rendering style.\n"
        )
    elif request.character_appearance.strip():
        appearance_rule = (
            "- The CHARACTER DESCRIPTION defines the character's identity; keep "
            "it consistent with the previous generated frame.\n"
        )
    else:
        appearance_rule = ""
    if request.style_images:
        style_rule = (
            "- The ART STYLE REFERENCE image defines the rendering style "
            "(pixel density, palette, outlines, shading and detail level). Do not "
            "copy its character design or pose.\n"
        )
    elif request.art_style.strip():
        style_rule = (
            "- The ART STYLE DESCRIPTION defines the rendering style; respect its "
            "pixel density, palette and level of detail.\n"
        )
    else:
        style_rule = ""

    sheet_rule = (
        f"- The PREVIOUS GENERATED input is a sprite sheet with {frame_count} "
        "frames. Keep the same number of frames and the same grid positions, and "
        "verify that no frame is missing.\n"
        if target_frame_index is None and frame_count > 1
        else ""
    )

    return f"""You are correcting a sprite frame for a 2D game animation.

MODE: {scope}

CORRECTION REQUESTED BY THE USER (may be written in Portuguese; follow it exactly):
\"\"\"
{correction}
\"\"\"

RULES:
- The PREVIOUS GENERATED image(s) are the source of truth for character identity, palette, proportions, outline thickness, pixel density, canvas size and background.
{pose_rule}{appearance_rule}{style_rule}{sheet_rule}- Change ONLY what the correction explicitly requests. Preserve everything else as close to pixel-for-pixel as possible.
- Do not redesign, re-pose, re-frame, re-color or add elements that were not requested.
- Keep the sprite isolated on the same flat, uniform background. Do not add scenery, shadows, text, watermarks or extra panels.
- Pixel art only: hard edges, no anti-aliasing, no blur and no noise.

{output_rule}"""


def _build_prompt_plan(request: GenerateRequest) -> PromptPlan:
    if request.total_base64_chars() > MAX_TOTAL_BASE64_CHARS:
        raise ApiError(
            413,
            "O conjunto de imagens enviado é grande demais para a função na Vercel. "
            "Reduza a resolução ou a quantidade de frames e tente novamente.",
            code="payload_too_large",
        )

    pose_images = [
        _normalize_input_image(value, "reference_images", index)
        for index, value in enumerate(request.reference_images)
    ]
    style_images = [
        _normalize_input_image(value, "style_images", index)
        for index, value in enumerate(request.style_images)
    ]
    appearance_images = [
        _normalize_input_image(value, "appearance_images", index)
        for index, value in enumerate(request.appearance_images)
    ]
    previous_images = [
        _normalize_input_image(value, "previous_generated_images", index)
        for index, value in enumerate(request.previous_generated_images)
    ]

    correction = request.correction_prompt
    target = request.target_frame_index

    if correction and not previous_images:
        raise ApiError(
            400,
            "Para aplicar uma correção, envie ao menos uma imagem em "
            "'previous_generated_images'.",
            code="missing_previous_images",
        )
    if target is not None and not correction:
        raise ApiError(
            400,
            "'target_frame_index' só pode ser usado junto com 'correction_prompt'.",
            code="invalid_target_frame",
        )

    visuals: list[VisualInput] = []

    if correction:
        if target is not None:
            if target >= len(previous_images):
                raise ApiError(
                    400,
                    f"'target_frame_index' ({target}) está fora do intervalo de "
                    f"'previous_generated_images' (0 a {len(previous_images) - 1}).",
                    code="target_frame_index_out_of_range",
                )
            previous_selected = [previous_images[target]]
            pose_selected = (
                [pose_images[target]] if target < len(pose_images) else []
            )
            corrected_frames = 1
            grid_columns = 1
            grid_rows = 1
        else:
            previous_selected = previous_images
            # Alinha as referências de pose com os frames que serão corrigidos.
            pose_selected = pose_images[: len(previous_images)]
            corrected_frames = request.frame_count or len(previous_images) or 1
            grid_columns = request.grid_columns or corrected_frames
            grid_rows = request.grid_rows or 1
            if grid_columns * grid_rows != corrected_frames:
                grid_columns = corrected_frames
                grid_rows = 1

        for index, image in enumerate(previous_selected):
            if target is not None:
                label = f"PREVIOUS GENERATED sprite to correct (frame {target + 1})"
            elif len(previous_selected) == 1 and corrected_frames > 1:
                label = (
                    f"PREVIOUS GENERATED sprite SHEET with {corrected_frames} "
                    "frames (correct every cell in place and preserve the grid)"
                )
            else:
                label = (
                    f"PREVIOUS GENERATED sprite frame {index + 1} "
                    f"of {len(previous_selected)}"
                )
            visuals.append(VisualInput(label=label, role="previous", image=image))

        for index, image in enumerate(pose_selected):
            if target is not None:
                label = f"POSE REFERENCE for frame {target + 1}"
            elif len(pose_selected) == 1:
                label = (
                    "POSE REFERENCE sprite sheet (source of poses only; do not "
                    "copy its character design or art style)"
                )
            else:
                label = (
                    f"POSE REFERENCE frame {index + 1} "
                    f"of {len(pose_selected)}"
                )
            visuals.append(VisualInput(label=label, role="pose", image=image))

        for index, image in enumerate(appearance_images):
            if len(appearance_images) == 1:
                label = (
                    "APPEARANCE REFERENCE (character identity only; do not copy "
                    "its pose, position or rendering style)"
                )
            else:
                label = (
                    f"APPEARANCE REFERENCE {index + 1} of "
                    f"{len(appearance_images)}"
                )
            visuals.append(VisualInput(label=label, role="appearance", image=image))

        for index, image in enumerate(style_images):
            if len(style_images) == 1:
                label = (
                    "ART STYLE REFERENCE (rendering style only; do not copy its "
                    "character design or pose)"
                )
            else:
                label = (
                    f"ART STYLE REFERENCE {index + 1} of {len(style_images)}"
                )
            visuals.append(VisualInput(label=label, role="style", image=image))

        if not visuals:
            raise ApiError(
                400,
                "Nenhuma imagem válida foi enviada para a correção.",
                code="missing_images",
            )

        body = _correction_body(
            request,
            target_frame_index=target,
            previous_count=len(previous_selected),
            pose_count=len(pose_selected),
            frame_count=corrected_frames,
            grid_columns=grid_columns,
            grid_rows=grid_rows,
        )
        return PromptPlan(
            mode="correction",
            order_text=_order_text(visuals),
            body=body,
            visuals=tuple(visuals),
            target_frame_index=target,
            frame_count_override=corrected_frames,
            grid_columns=grid_columns,
            grid_rows=grid_rows,
        )

    for index, image in enumerate(pose_images):
        if len(pose_images) == 1:
            label = (
                "POSE REFERENCE sprite sheet (source of poses only; do not copy "
                "its character design or art style)"
            )
        else:
            label = f"POSE REFERENCE frame {index + 1} of {len(pose_images)}"
        visuals.append(VisualInput(label=label, role="pose", image=image))

    for index, image in enumerate(appearance_images):
        if len(appearance_images) == 1:
            label = (
                "APPEARANCE REFERENCE (character identity only; do not copy its "
                "pose, position or rendering style)"
            )
        else:
            label = (
                f"APPEARANCE REFERENCE {index + 1} of {len(appearance_images)}"
            )
        visuals.append(VisualInput(label=label, role="appearance", image=image))

    for index, image in enumerate(style_images):
        if len(style_images) == 1:
            label = (
                "ART STYLE REFERENCE (rendering style only; do not copy its "
                "character design or pose)"
            )
        else:
            label = f"ART STYLE REFERENCE {index + 1} of {len(style_images)}"
        visuals.append(VisualInput(label=label, role="style", image=image))

    # O frontend informa quantas células a grade da referência tem. Sem esse
    # campo (clientes antigos), assume 1 frame por imagem enviada.
    requested_frames = request.frame_count or len(pose_images) or 1
    body = _generation_body(request, requested_frames)
    return PromptPlan(
        mode="generation",
        order_text=_order_text(visuals),
        body=body,
        visuals=tuple(visuals),
        target_frame_index=None,
        frame_count_override=requested_frames,
        grid_columns=request.grid_columns or requested_frames,
        grid_rows=request.grid_rows or 1,
    )


class ProviderAdapter:
    provider: str

    @property
    def label(self) -> str:
        return PROVIDER_LABELS[self.provider]

    def list_models(self, api_key: str) -> ModelsResponse:
        raise NotImplementedError

    def generate(
        self, api_key: str, model_id: str, plan: PromptPlan
    ) -> list[ImagePayload]:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Google Gemini (Interactions API)
# ---------------------------------------------------------------------------

_GEMINI_FALLBACK = [
    ModelOption(
        id="gemini-nano-banana-2.1",
        name="Nano Banana 2.1",
        description="Geração e edição de imagens com múltiplas referências e até 4K.",
    ),
    ModelOption(
        id="gemini-3.1-flash-image",
        name="Nano Banana 2 (Gemini 3.1 Flash Image)",
        description="Modelo rápido e econômico para geração e edição de imagens.",
    ),
    ModelOption(
        id="gemini-3.1-flash-lite-image",
        name="Nano Banana 2 Lite",
        description="Opção mais rápida e barata; menos indicada para várias referências.",
    ),
    ModelOption(
        id="gemini-3-pro-image",
        name="Nano Banana Pro (Gemini 3 Pro Image)",
        description="Modelo premium para tarefas visuais complexas e texto nítido.",
    ),
    ModelOption(
        id="gemini-2.5-flash-image",
        name="Nano Banana (Gemini 2.5 Flash Image)",
        description="Modelo legado de geração e edição de imagens.",
    ),
]


def _gemini_headers(api_key: str, *, interactions: bool = False) -> dict[str, str]:
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    if interactions:
        headers["Api-Revision"] = GEMINI_API_REVISION
    return headers


def _gemini_collect_images(payload: Any) -> list[ImagePayload]:
    found: list[ImagePayload] = []
    seen: set[str] = set()

    def add(block: Any) -> None:
        if not isinstance(block, dict):
            return
        data = block.get("data") or block.get("b64_json")
        if not isinstance(data, str) or not data.strip():
            return
        image = _image_from_provider_b64(
            data, block.get("mime_type") or block.get("mimeType") or "image/png"
        )
        if image.b64 not in seen:
            seen.add(image.b64)
            found.append(image)

    if isinstance(payload, dict):
        for key in ("output_image", "outputImage"):
            value = payload.get(key)
            if isinstance(value, list):
                for item in value:
                    add(item)
            else:
                add(value)

        for step in payload.get("steps") or []:
            if not isinstance(step, dict):
                continue
            if step.get("type") in ("model_output", "modelOutput"):
                for block in step.get("content") or []:
                    if isinstance(block, dict) and block.get("type") == "image":
                        add(block)
            elif step.get("type") == "image":
                add(step)

        if not found:
            for value in payload.values():
                if isinstance(value, dict) and value.get("type") == "image":
                    add(value)
                elif isinstance(value, list):
                    for item in value:
                        if isinstance(item, dict) and item.get("type") == "image":
                            add(item)

    return found


def _gemini_collect_text(payload: Any) -> str:
    parts: list[str] = []

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            if value.get("type") == "text" and isinstance(value.get("text"), str):
                parts.append(value["text"])
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(payload)
    return _truncate(" ".join(part for part in parts if part.strip()), 500)


class GeminiAdapter(ProviderAdapter):
    provider = "gemini"

    def list_models(self, api_key: str) -> ModelsResponse:
        try:
            payload = _request_json(
                "GET",
                f"{GEMINI_API}/models?pageSize=1000",
                provider=self.provider,
                headers=_gemini_headers(api_key),
                timeout=_REQUEST_TIMEOUT,
            )
            models: list[ModelOption] = []
            for item in payload.get("models") or []:
                if not isinstance(item, dict):
                    continue
                model_id = str(item.get("name") or "").split("/")[-1]
                if not model_id:
                    continue
                methods = item.get("supportedGenerationMethods") or []
                looks_like_image = (
                    "image" in model_id.lower() or "banana" in model_id.lower()
                )
                if not looks_like_image or "imagen" in model_id.lower():
                    continue
                if methods and not any(
                    method in ("generateContent", "interactions")
                    for method in methods
                ):
                    continue
                models.append(
                    ModelOption(
                        id=model_id,
                        name=item.get("displayName") or model_id,
                        description=item.get("description"),
                        supports_reference_images=True,
                    )
                )

            if models:
                return ModelsResponse(
                    provider=self.provider, source="remote", models=models
                )
            return ModelsResponse(
                provider=self.provider,
                source="fallback",
                models=_GEMINI_FALLBACK,
                warning=(
                    "A conta não retornou modelos de imagem na listagem; "
                    "foram usados modelos recomendados."
                ),
            )
        except ApiError:
            raise

    def generate(
        self, api_key: str, model_id: str, plan: PromptPlan
    ) -> list[ImagePayload]:
        if len(plan.visuals) > 14:
            raise ApiError(
                400,
                "O Gemini aceita no máximo 14 imagens de referência por requisição. "
                "Reduza a quantidade de frames e tente novamente.",
                code="too_many_images",
                provider=self.provider,
            )

        inputs: list[dict[str, Any]] = []
        if plan.order_text:
            inputs.append({"type": "text", "text": plan.order_text})
        for visual in plan.visuals:
            inputs.append(
                {
                    "type": "image",
                    "mime_type": visual.image.mime_type,
                    "data": visual.image.b64,
                }
            )
        inputs.append({"type": "text", "text": plan.body})

        payload = _request_json(
            "POST",
            f"{GEMINI_API}/interactions",
            provider=self.provider,
            headers=_gemini_headers(api_key, interactions=True),
            json_body={
                "model": model_id,
                "input": inputs,
                "response_format": {
                    "type": "image",
                    "mime_type": "image/jpeg",
                    "aspect_ratio": plan.aspect,
                },
            },
        )

        images = _gemini_collect_images(payload)
        if not images:
            text = _gemini_collect_text(payload)
            raise ApiError(
                422,
                "O Gemini não retornou nenhuma imagem. "
                "Isso pode acontecer por bloqueio de segurança ou por um prompt "
                "que o modelo interpretou como texto."
                + (f" Resposta do modelo: {text}" if text else ""),
                code="no_image_returned",
                provider=self.provider,
            )
        return images


# ---------------------------------------------------------------------------
# OpenAI (Images API)
# ---------------------------------------------------------------------------

_OPENAI_FALLBACK = [
    ModelOption(
        id="gpt-image-2.5-sunburst",
        name="GPT Image 2.5 Sunburst",
        description="Foco em precisão de edição e consistência de personagem.",
    ),
    ModelOption(
        id="gpt-image-2.5-flare",
        name="GPT Image 2.5 Flare",
        description="Geração rápida e econômica para iterações do dia a dia.",
    ),
    ModelOption(
        id="gpt-image-2.6-sunburst",
        name="GPT Image 2.6 Sunburst",
        description="Edição detalhada, markup e formatos avançados.",
    ),
    ModelOption(
        id="gpt-image-2.6-flare",
        name="GPT Image 2.6 Flare",
        description="Iteração rápida com os recursos mais recentes da família GPT Image.",
    ),
    ModelOption(
        id="gpt-image-2",
        name="GPT Image 2",
        description="Modelo de geração e edição de imagens da geração anterior.",
    ),
    ModelOption(
        id="gpt-image-1.5",
        name="GPT Image 1.5",
        description="Modelo de edição com controle de fidelidade às imagens de entrada.",
    ),
    ModelOption(
        id="gpt-image-1-mini",
        name="GPT Image 1 Mini",
        description="Versão econômica para geração e edição simples.",
    ),
    ModelOption(
        id="dall-e-3",
        name="DALL·E 3",
        description="Geração apenas por texto; não aceita imagens de referência.",
        supports_reference_images=False,
    ),
]


def _openai_headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def _openai_is_gpt_image(model_id: str) -> bool:
    lowered = model_id.lower()
    return lowered.startswith("gpt-image-") or lowered.startswith("chatgpt-image-")


def _openai_image_mime(payload: dict[str, Any], item: dict[str, Any]) -> str:
    media_type = item.get("media_type")
    if isinstance(media_type, str) and media_type.startswith("image/"):
        return media_type
    output_format = str(payload.get("output_format") or "png").lower()
    return {
        "png": "image/png",
        "jpeg": "image/jpeg",
        "jpg": "image/jpeg",
        "webp": "image/webp",
        "gif": "image/gif",
        "svg": "image/svg+xml",
    }.get(output_format, "image/png")


def _openai_collect_images(
    payload: dict[str, Any], api_key: str
) -> list[ImagePayload]:
    images: list[ImagePayload] = []
    for item in payload.get("data") or []:
        if not isinstance(item, dict):
            continue
        b64 = item.get("b64_json")
        if isinstance(b64, str) and b64.strip():
            images.append(
                _image_from_provider_b64(b64, _openai_image_mime(payload, item))
            )
            continue
        url = item.get("url")
        if isinstance(url, str) and url.startswith(("http://", "https://")):
            images.append(_download_image(url, provider="openai", api_key=api_key))
    return images


class OpenAIAdapter(ProviderAdapter):
    provider = "openai"

    def list_models(self, api_key: str) -> ModelsResponse:
        payload = _request_json(
            "GET",
            f"{OPENAI_API}/models",
            provider=self.provider,
            headers=_openai_headers(api_key),
        )
        items = [
            item
            for item in (payload.get("data") or [])
            if isinstance(item, dict) and item.get("id")
        ]
        items.sort(key=lambda item: item.get("created") or 0, reverse=True)

        models: list[ModelOption] = []
        for item in items:
            model_id = str(item["id"])
            lowered = model_id.lower()
            if "image" not in lowered and not lowered.startswith("dall-e"):
                continue
            models.append(
                ModelOption(
                    id=model_id,
                    name=model_id,
                    description=None,
                    supports_reference_images=_openai_is_gpt_image(model_id),
                )
            )

        if models:
            return ModelsResponse(
                provider=self.provider, source="remote", models=models
            )
        return ModelsResponse(
            provider=self.provider,
            source="fallback",
            models=_OPENAI_FALLBACK,
            warning=(
                "A conta não retornou modelos de imagem na listagem; "
                "foram usados modelos recomendados."
            ),
        )

    def generate(
        self, api_key: str, model_id: str, plan: PromptPlan
    ) -> list[ImagePayload]:
        is_gpt_image = _openai_is_gpt_image(model_id)
        headers = _openai_headers(api_key)

        if plan.visuals:
            if not is_gpt_image:
                raise ApiError(
                    400,
                    f"O modelo '{model_id}' não aceita imagens de referência. "
                    "Escolha um modelo GPT Image para transferência de movimento "
                    "ou correção de frames.",
                    code="model_without_image_input",
                    provider=self.provider,
                )
            if len(plan.visuals) > 16:
                raise ApiError(
                    400,
                    "A OpenAI aceita no máximo 16 imagens por requisição. "
                    "Reduza a quantidade de frames e tente novamente.",
                    code="too_many_images",
                    provider=self.provider,
                )
            body: dict[str, Any] = {
                "model": model_id,
                "prompt": plan.prompt,
                "images": [
                    {"image_url": visual.image.data_url}
                    for visual in plan.visuals
                ],
                "n": 1,
                "size": _frame_size(plan.frame_count),
                "output_format": "png",
                "background": "transparent",
            }
            payload = _request_json(
                "POST",
                f"{OPENAI_API}/images/edits",
                provider=self.provider,
                headers=headers,
                json_body=body,
            )
        else:
            body = {
                "model": model_id,
                "prompt": plan.prompt,
                "n": 1,
                "size": _frame_size(plan.frame_count),
            }
            if is_gpt_image:
                body["output_format"] = "png"
                body["background"] = "transparent"
            payload = _request_json(
                "POST",
                f"{OPENAI_API}/images/generations",
                provider=self.provider,
                headers=headers,
                json_body=body,
            )

        if not isinstance(payload, dict):
            raise ApiError(
                502,
                "A OpenAI retornou uma resposta inesperada.",
                code="invalid_provider_response",
                provider=self.provider,
            )
        images = _openai_collect_images(payload, api_key)
        if not images:
            raise ApiError(
                422,
                "A OpenAI não retornou nenhuma imagem. "
                "Tente novamente ou ajuste a descrição do personagem/estilo.",
                code="no_image_returned",
                provider=self.provider,
            )
        return images


# ---------------------------------------------------------------------------
# OpenRouter (Dedicated Image API)
# ---------------------------------------------------------------------------

_OPENROUTER_FALLBACK = [
    ModelOption(
        id="google/gemini-3.1-flash-image",
        name="Gemini 3.1 Flash Image (Nano Banana 2)",
        description="Geração e edição rápidas com suporte a referências visuais.",
    ),
    ModelOption(
        id="google/gemini-3-pro-image",
        name="Gemini 3 Pro Image (Nano Banana Pro)",
        description="Modelo premium para composições complexas e texto nítido.",
    ),
    ModelOption(
        id="google/gemini-2.5-flash-image",
        name="Gemini 2.5 Flash Image (Nano Banana)",
        description="Modelo legado de geração e edição de imagens.",
    ),
    ModelOption(
        id="openai/gpt-image-2",
        name="OpenAI GPT Image 2",
        description="Geração e edição de imagens via OpenRouter.",
    ),
    ModelOption(
        id="bytedance-seed/seedream-4.5",
        name="Seedream 4.5",
        description="Modelo de imagem com suporte a referências visuais.",
    ),
    ModelOption(
        id="black-forest-labs/flux.2-pro",
        name="FLUX.2 Pro",
        description="Geração de imagens de alta qualidade.",
    ),
]


def _openrouter_headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def _openrouter_model_options(payload: Any) -> list[ModelOption]:
    models: list[ModelOption] = []
    for item in (payload.get("data") if isinstance(payload, dict) else None) or []:
        if not isinstance(item, dict) or not item.get("id"):
            continue
        model_id = str(item["id"])
        architecture = item.get("architecture") or {}
        output_modalities = architecture.get("output_modalities") or []
        input_modalities = architecture.get("input_modalities") or []
        if output_modalities and "image" not in output_modalities:
            continue
        models.append(
            ModelOption(
                id=model_id,
                name=str(item.get("name") or model_id),
                description=item.get("description"),
                supports_reference_images=(
                    not input_modalities or "image" in input_modalities
                ),
            )
        )
    return models


class OpenRouterAdapter(ProviderAdapter):
    provider = "openrouter"

    def list_models(self, api_key: str) -> ModelsResponse:
        headers = _openrouter_headers(api_key)
        # /key valida a chave de forma explícita antes da listagem.
        _request_json(
            "GET", f"{OPENROUTER_API}/key", provider=self.provider, headers=headers
        )

        payload: Any = None
        try:
            payload = _request_json(
                "GET",
                f"{OPENROUTER_API}/images/models",
                provider=self.provider,
                headers=headers,
            )
        except ApiError as exc:
            if exc.provider_status not in (400, 404, 405, 501):
                raise
            try:
                payload = _request_json(
                    "GET",
                    f"{OPENROUTER_API}/models?output_modalities=image",
                    provider=self.provider,
                    headers=headers,
                )
            except ApiError:
                raise exc

        models = _openrouter_model_options(payload)
        if models:
            return ModelsResponse(
                provider=self.provider, source="remote", models=models
            )
        return ModelsResponse(
            provider=self.provider,
            source="fallback",
            models=_OPENROUTER_FALLBACK,
            warning=(
                "O OpenRouter não retornou modelos de imagem na listagem; "
                "foram usados modelos recomendados."
            ),
        )

    def generate(
        self, api_key: str, model_id: str, plan: PromptPlan
    ) -> list[ImagePayload]:
        body: dict[str, Any] = {
            "model": model_id,
            "prompt": plan.prompt,
            "n": 1,
            "aspect_ratio": plan.aspect,
            "output_format": "png",
        }
        if plan.visuals:
            body["input_references"] = [
                {
                    "type": "image_url",
                    "image_url": {"url": visual.image.data_url},
                }
                for visual in plan.visuals
            ]

        payload = _request_json(
            "POST",
            f"{OPENROUTER_API}/images",
            provider=self.provider,
            headers=_openrouter_headers(api_key),
            json_body=body,
        )
        if not isinstance(payload, dict):
            raise ApiError(
                502,
                "O OpenRouter retornou uma resposta inesperada.",
                code="invalid_provider_response",
                provider=self.provider,
            )
        if payload.get("error"):
            message = _truncate(str(payload["error"]), 400)
            raise ApiError(
                502,
                f"O OpenRouter recusou a geração. {message}",
                code="provider_error",
                provider=self.provider,
                details=message,
            )

        images: list[ImagePayload] = []
        for item in payload.get("data") or []:
            if not isinstance(item, dict):
                continue
            b64 = item.get("b64_json")
            if isinstance(b64, str) and b64.strip():
                images.append(
                    _image_from_provider_b64(
                        b64, item.get("media_type") or "image/png"
                    )
                )
                continue
            url = item.get("url")
            if isinstance(url, str) and url.startswith(("http://", "https://")):
                images.append(
                    _download_image(url, provider="openrouter", api_key=api_key)
                )

        if not images:
            raise ApiError(
                422,
                "O OpenRouter não retornou nenhuma imagem. "
                "Confira se o modelo escolhido aceita referências visuais e "
                "tente novamente.",
                code="no_image_returned",
                provider=self.provider,
            )
        return images


# ---------------------------------------------------------------------------
# Replicate (modelos oficiais e versões)
# ---------------------------------------------------------------------------

_REPLICATE_FALLBACK = [
    ModelOption(
        id="google/nano-banana-2.1",
        name="Google Nano Banana 2.1",
        description=(
            "Geração e edição de imagens com até 14 referências, texto nítido "
            "e saída de 1K a 4K."
        ),
    ),
    ModelOption(
        id="google/nano-banana",
        name="Google Nano Banana",
        description="Geração e edição de imagens com referências visuais.",
    ),
    ModelOption(
        id="black-forest-labs/flux-kontext-pro",
        name="FLUX.1 Kontext Pro",
        description="Edição de imagens guiada por texto e imagem de entrada.",
    ),
    ModelOption(
        id="black-forest-labs/flux-2-pro",
        name="FLUX.2 Pro",
        description="Geração e edição de alta qualidade com referências visuais.",
    ),
    ModelOption(
        id="bytedance/seedream-4",
        name="Seedream 4",
        description="Geração e edição de imagens com múltiplas referências.",
    ),
    ModelOption(
        id="openai/gpt-image-2",
        name="OpenAI GPT Image 2",
        description="Geração e edição de imagens via Replicate.",
    ),
]


def _replicate_headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def _replicate_parse_model(model_id: str) -> tuple[str, str, str | None]:
    raw = model_id.strip()
    version: str | None = None
    if ":" in raw:
        raw, version = raw.rsplit(":", 1)
        version = version.strip() or None
    if "/" not in raw:
        raise ApiError(
            400,
            "No Replicate, use 'owner/modelo' (modelo oficial) ou "
            "'owner/modelo:versão'. Exemplo: 'google/nano-banana'.",
            code="invalid_model_id",
            provider="replicate",
        )
    owner, name = raw.split("/", 1)
    owner, name = owner.strip(), name.strip()
    if not owner or not name:
        raise ApiError(
            400,
            "O model_id do Replicate deve estar no formato 'owner/modelo'.",
            code="invalid_model_id",
            provider="replicate",
        )
    return owner, name, version


def _replicate_fetch_schema(
    api_key: str, owner: str, name: str, version: str | None
) -> tuple[dict[str, Any], str | None]:
    headers = _replicate_headers(api_key)
    resolved_version = version
    if version:
        detail = _request_json(
            "GET",
            f"{REPLICATE_API}/models/{owner}/{name}/versions/{version}",
            provider="replicate",
            headers=headers,
        )
        schema = detail.get("openapi_schema") if isinstance(detail, dict) else None
    else:
        detail = _request_json(
            "GET",
            f"{REPLICATE_API}/models/{owner}/{name}",
            provider="replicate",
            headers=headers,
        )
        latest = detail.get("latest_version") if isinstance(detail, dict) else None
        schema = latest.get("openapi_schema") if isinstance(latest, dict) else None
        if isinstance(latest, dict) and latest.get("id"):
            resolved_version = str(latest["id"])

    if not isinstance(schema, dict):
        raise ApiError(
            400,
            "Não foi possível ler o schema de entrada desse modelo do Replicate. "
            "Confira se o modelo é público e tem uma versão disponível.",
            code="invalid_model_schema",
            provider="replicate",
        )
    return schema, resolved_version


def _replicate_is_image_prop(name: str, spec: dict[str, Any]) -> bool:
    lowered = name.lower()
    if any(
        token in lowered
        for token in (
            "size",
            "format",
            "quality",
            "count",
            "num",
            "weight",
            "strength",
            "scale",
            "seed",
            "mask",
            "embedding",
            "encoder",
            "prompt",
            "negative",
        )
    ):
        return False

    spec_type = spec.get("type")
    items = spec.get("items") if isinstance(spec.get("items"), dict) else {}
    if spec.get("format") in ("uri", "data-url", "binary"):
        return True
    if items.get("format") in ("uri", "data-url", "binary"):
        return True
    if spec_type == "array" and items.get("type") == "string":
        return any(token in lowered for token in ("image", "img", "photo", "reference"))
    if spec_type == "string":
        return any(token in lowered for token in ("image", "img", "photo"))
    return False


def _replicate_pick_prop(
    props: dict[str, Any], preferences: tuple[str, ...]
) -> tuple[str, dict[str, Any]] | None:
    for name in preferences:
        if name in props:
            return name, props[name]
    if props:
        return next(iter(props.items()))
    return None


def _replicate_set_supported(
    inputs: dict[str, Any], props: dict[str, Any], name: str, value: Any
) -> None:
    spec = props.get(name)
    if not isinstance(spec, dict) or name in inputs:
        return
    enum = spec.get("enum")
    if isinstance(enum, list) and value not in enum:
        return
    inputs[name] = value


def _replicate_build_input(
    schema: dict[str, Any], plan: PromptPlan
) -> dict[str, Any]:
    input_schema = (
        (schema.get("components") or {}).get("schemas", {}).get("Input", {})
    )
    props = input_schema.get("properties") if isinstance(input_schema, dict) else None
    if not isinstance(props, dict) or not props:
        raise ApiError(
            400,
            "O schema do modelo do Replicate não expôs os campos de entrada.",
            code="invalid_model_schema",
            provider="replicate",
        )

    prompt_name: str | None = None
    for candidate in ("prompt", "text", "instruction"):
        if candidate in props:
            prompt_name = candidate
            break
    if not prompt_name:
        for name, spec in props.items():
            if (
                isinstance(spec, dict)
                and spec.get("type") == "string"
                and "prompt" in name.lower()
            ):
                prompt_name = name
                break
    if not prompt_name:
        raise ApiError(
            400,
            "Não encontrei um campo de prompt no schema desse modelo do Replicate. "
            f"Campos disponíveis: {', '.join(props)}.",
            code="unsupported_model_input",
            provider="replicate",
        )

    inputs: dict[str, Any] = {prompt_name: plan.prompt}

    image_props = {
        name: spec
        for name, spec in props.items()
        if isinstance(spec, dict) and _replicate_is_image_prop(name, spec)
    }
    array_props = {
        name: spec
        for name, spec in image_props.items()
        if spec.get("type") == "array"
    }
    single_props = {
        name: spec
        for name, spec in image_props.items()
        if spec.get("type") != "array"
    }

    if plan.visuals and not image_props:
        raise ApiError(
            400,
            "Este modelo do Replicate não aceita imagens de referência. "
            "Escolha um modelo de edição (por exemplo, google/nano-banana-2.1 ou "
            "black-forest-labs/flux-kontext-pro).",
            code="model_without_image_input",
            provider="replicate",
        )

    if plan.visuals:
        if array_props:
            name, spec = _replicate_pick_prop(
                array_props,
                ("image_input", "input_images", "images", "image_urls", "reference_images"),
            )
            max_items = spec.get("maxItems")
            if isinstance(max_items, int) and max_items > 0 and len(plan.visuals) > max_items:
                raise ApiError(
                    400,
                    f"Este modelo do Replicate aceita no máximo {max_items} imagens "
                    f"por requisição, mas {len(plan.visuals)} foram enviadas.",
                    code="too_many_images",
                    provider="replicate",
                )
            inputs[name] = [visual.image.data_url for visual in plan.visuals]
        elif single_props:
            name, _ = _replicate_pick_prop(
                single_props,
                ("input_image", "image", "init_image", "source_image", "image_url"),
            )
            if len(plan.visuals) > 1:
                if plan.mode != "correction":
                    raise ApiError(
                        400,
                        "Este modelo do Replicate aceita apenas uma imagem de "
                        "referência. Gere um frame por vez ou escolha um modelo "
                        "multi-imagem.",
                        code="too_many_images",
                        provider="replicate",
                    )
                previous_visuals = [
                    visual for visual in plan.visuals if visual.role == "previous"
                ]
                if plan.target_frame_index is None and len(previous_visuals) > 1:
                    raise ApiError(
                        400,
                        "Este modelo do Replicate aceita apenas uma imagem por vez. "
                        "Informe 'target_frame_index' para corrigir um frame isolado "
                        "ou escolha um modelo multi-imagem.",
                        code="too_many_images",
                        provider="replicate",
                    )
                primary = previous_visuals[0]
                inputs[name] = primary.image.data_url
                inputs[prompt_name] = (
                    "INPUT IMAGE: the previous generated sprite frame to correct.\n\n"
                    + plan.body
                    + "\n\nNOTE: this model accepts only one input image. The "
                    "provided image is the previous generated sprite; use it as "
                    "the source of truth for both pose and correction."
                )
            else:
                inputs[name] = plan.visuals[0].image.data_url
        else:
            raise ApiError(
                400,
                "Este modelo do Replicate não declarou um campo de imagem compatível.",
                code="unsupported_model_input",
                provider="replicate",
            )

    _replicate_set_supported(inputs, props, "output_format", "png")
    _replicate_set_supported(inputs, props, "aspect_ratio", plan.aspect)
    _replicate_set_supported(inputs, props, "num_outputs", 1)
    _replicate_set_supported(inputs, props, "num_images", 1)
    return inputs


def _replicate_cancel(api_key: str, prediction: dict[str, Any]) -> None:
    cancel_url = (prediction.get("urls") or {}).get("cancel")
    if not isinstance(cancel_url, str):
        return
    try:
        requests.post(
            cancel_url,
            headers=_replicate_headers(api_key),
            timeout=(5.0, 10.0),
        )
    except requests.RequestException:
        pass


def _replicate_wait(
    api_key: str, prediction: dict[str, Any]
) -> dict[str, Any]:
    deadline = time.monotonic() + float(
        os.getenv("REPLICATE_TIMEOUT_SECONDS", "200")
    )
    status = prediction.get("status")
    headers = _replicate_headers(api_key)

    while status in ("starting", "processing"):
        if time.monotonic() >= deadline:
            _replicate_cancel(api_key, prediction)
            raise ApiError(
                504,
                "O Replicate ainda está processando a imagem e o tempo limite foi "
                "atingido. Tente novamente ou escolha um modelo mais rápido.",
                code="provider_timeout",
                provider="replicate",
            )
        time.sleep(2)
        get_url = (prediction.get("urls") or {}).get("get")
        if not isinstance(get_url, str):
            raise ApiError(
                502,
                "O Replicate não retornou a URL de acompanhamento da previsão.",
                code="invalid_provider_response",
                provider="replicate",
            )
        prediction = _request_json(
            "GET", get_url, provider="replicate", headers=headers
        )
        if not isinstance(prediction, dict):
            raise ApiError(
                502,
                "O Replicate retornou uma resposta inesperada.",
                code="invalid_provider_response",
                provider="replicate",
            )
        status = prediction.get("status")

    if status != "succeeded":
        error = _truncate(str(prediction.get("error") or "erro desconhecido"), 400)
        lowered = error.lower()
        if status == "canceled":
            raise ApiError(
                502,
                "A geração no Replicate foi cancelada antes de terminar.",
                code="generation_canceled",
                provider="replicate",
                details=error,
            )
        if "rate limit" in lowered or "too many requests" in lowered:
            raise ApiError(
                429,
                "Limite de requisições atingido no Replicate. "
                "Aguarde alguns instantes e tente novamente.",
                code="rate_limit",
                provider="replicate",
                details=error,
            )
        if "nsfw" in lowered or "safety" in lowered:
            raise ApiError(
                422,
                "O Replicate bloqueou a geração por segurança. "
                "Ajuste o personagem, o estilo ou a instrução e tente novamente.",
                code="safety_blocked",
                provider="replicate",
                details=error,
            )
        raise ApiError(
            502,
            f"O Replicate não conseguiu gerar a imagem: {error}",
            code="generation_failed",
            provider="replicate",
            details=error,
        )

    return prediction


def _replicate_iter_urls(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        if value.startswith(("http://", "https://", "data:image/")):
            yield value
    elif isinstance(value, dict):
        url = value.get("url")
        if isinstance(url, str) and url.startswith(("http://", "https://", "data:image/")):
            yield url
        else:
            for child in value.values():
                yield from _replicate_iter_urls(child)
    elif isinstance(value, list):
        for child in value:
            yield from _replicate_iter_urls(child)


def _replicate_collect_images(
    prediction: dict[str, Any], api_key: str
) -> list[ImagePayload]:
    images: list[ImagePayload] = []
    seen: set[str] = set()

    for url in _replicate_iter_urls(prediction.get("output")):
        if url in seen:
            continue
        seen.add(url)
        if url.startswith("data:image/"):
            header, _, data = url.partition(",")
            mime = header[5:].split(";", 1)[0] or "image/png"
            images.append(_image_from_provider_b64(data, mime))
        else:
            images.append(
                _download_image(url, provider="replicate", api_key=api_key)
            )

    return images


class ReplicateAdapter(ProviderAdapter):
    provider = "replicate"

    def list_models(self, api_key: str) -> ModelsResponse:
        _request_json(
            "GET",
            f"{REPLICATE_API}/account",
            provider=self.provider,
            headers=_replicate_headers(api_key),
        )
        return ModelsResponse(
            provider=self.provider,
            source="fallback",
            models=_REPLICATE_FALLBACK,
            warning=(
                "O Replicate não oferece uma listagem simples por modalidade. "
                "Estes são modelos recomendados; você também pode informar "
                "'owner/modelo' ou 'owner/modelo:versão'."
            ),
        )

    def generate(
        self, api_key: str, model_id: str, plan: PromptPlan
    ) -> list[ImagePayload]:
        owner, name, version = _replicate_parse_model(model_id)
        schema, resolved_version = _replicate_fetch_schema(
            api_key, owner, name, version
        )
        inputs = _replicate_build_input(schema, plan)

        headers = _replicate_headers(api_key)
        headers["Prefer"] = "wait=60"
        headers["Cancel-After"] = "240s"

        if resolved_version:
            prediction = _request_json(
                "POST",
                f"{REPLICATE_API}/predictions",
                provider=self.provider,
                headers=headers,
                json_body={"version": resolved_version, "input": inputs},
            )
        else:
            prediction = _request_json(
                "POST",
                f"{REPLICATE_API}/models/{owner}/{name}/predictions",
                provider=self.provider,
                headers=headers,
                json_body={"input": inputs},
            )

        if not isinstance(prediction, dict):
            raise ApiError(
                502,
                "O Replicate retornou uma resposta inesperada.",
                code="invalid_provider_response",
                provider=self.provider,
            )

        prediction = _replicate_wait(api_key, prediction)
        images = _replicate_collect_images(prediction, api_key)
        if not images:
            raise ApiError(
                422,
                "O Replicate não retornou nenhuma imagem. "
                "Confira o modelo escolhido e tente novamente.",
                code="no_image_returned",
                provider=self.provider,
            )
        return images


# ---------------------------------------------------------------------------
# Registro de adaptadores
# ---------------------------------------------------------------------------

_ADAPTERS: dict[str, ProviderAdapter] = {
    "gemini": GeminiAdapter(),
    "openai": OpenAIAdapter(),
    "openrouter": OpenRouterAdapter(),
    "replicate": ReplicateAdapter(),
}


def _get_adapter(provider: str) -> ProviderAdapter:
    adapter = _ADAPTERS.get(provider)
    if adapter is None:
        raise ApiError(
            400,
            "Provedor não suportado. Use gemini, openai, openrouter ou replicate.",
            code="unsupported_provider",
        )
    return adapter


# ---------------------------------------------------------------------------
# Aplicação FastAPI
# ---------------------------------------------------------------------------

app = FastAPI(
    title="SpriteTransfer API",
    description=(
        "API BYOK de geração e transferência de animações em pixel art. "
        "As chaves enviadas pelo cliente não são armazenadas."
    ),
    version="0.2.0",
    # Docs expostas sob /api para funcionarem tanto no deploy quanto no uvicorn local.
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# Em produção frontend e API compartilham o mesmo domínio (não há CORS).
# Em desenvolvimento o Vite faz proxy de /api -> :8000, mas mantemos as
# origens locais liberadas como fallback para quem chamar a API direto.
_default_origins = "http://localhost:5173,http://127.0.0.1:5173"
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", _default_origins).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ApiError)
async def _api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    body: dict[str, Any] = {"detail": exc.message, "code": exc.code}
    if exc.provider:
        body["provider"] = exc.provider
    if exc.provider_status is not None:
        body["provider_status"] = exc.provider_status
    if exc.details:
        body["details"] = exc.details
    return JSONResponse(status_code=exc.status_code, content=body)


@app.exception_handler(RequestValidationError)
async def _validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    errors = exc.errors()
    first = errors[0] if errors else {}
    location = ".".join(
        str(part) for part in first.get("loc", []) if part not in ("body",)
    )
    message = first.get("msg") or "valor inválido"
    detail = (
        f"Parâmetro inválido ({location}): {message}"
        if location
        else f"Requisição inválida: {message}"
    )
    return JSONResponse(
        status_code=422,
        content={"detail": detail, "code": "validation_error"},
    )


@app.exception_handler(Exception)
async def _unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Erro inesperado em %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "detail": (
                "Erro interno inesperado ao falar com o provedor. "
                "Tente novamente em instantes."
            ),
            "code": "internal_error",
        },
    )


@app.get("/api/health", tags=["infra"], summary="Health check da API")
@app.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    """Retorna o status da função. Usado pelo frontend para testar a conexão."""
    return {"status": "ok"}


@app.post(
    "/api/models",
    response_model=ModelsResponse,
    tags=["modelos"],
    summary="Valida a chave e lista modelos de imagem/visão",
)
def list_models(payload: ModelsRequest) -> ModelsResponse:
    """Consulta o provedor e devolve os modelos disponíveis.

    A chave nunca é gravada. Em caso de chave inválida, cota esgotada ou erro
    HTTP, a resposta vem com uma mensagem explicativa em português.
    """
    adapter = _get_adapter(payload.provider)
    return adapter.list_models(payload.api_key)


@app.post(
    "/api/generate",
    response_model=GenerateResponse,
    tags=["geração"],
    summary="Gera ou corrige frames de sprite",
)
def generate(payload: GenerateRequest) -> GenerateResponse:
    """Gera frames a partir das referências de pose ou corrige frames anteriores."""
    adapter = _get_adapter(payload.provider)
    plan = _build_prompt_plan(payload)
    images = adapter.generate(payload.api_key, payload.model_id, plan)

    total_chars = sum(len(image.b64) for image in images)
    if total_chars > MAX_TOTAL_BASE64_CHARS:
        raise ApiError(
            413,
            "As imagens geradas são grandes demais para serem devolvidas pela "
            "Vercel. Reduza a resolução ou a quantidade de frames e tente novamente.",
            code="response_too_large",
            provider=payload.provider,
        )

    return GenerateResponse(
        provider=payload.provider,
        model_id=payload.model_id,
        mode=plan.mode,
        target_frame_index=plan.target_frame_index,
        images=[image.b64 for image in images],
        mime_types=[image.mime_type for image in images],
    )

