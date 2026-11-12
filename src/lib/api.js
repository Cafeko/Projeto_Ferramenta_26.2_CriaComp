/**
 * Cliente do backend BYOK do SpriteTransfer.
 *
 * Em produção (mesmo domínio na Vercel) a base fica vazia. Em desenvolvimento o
 * proxy do Vite encaminha `/api` para `http://127.0.0.1:8000`.
 */

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

/** Provedores suportados, com o link onde o usuário obtém a chave. */
export const PROVIDERS = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    shortLabel: 'Gemini',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyLabel: 'Google AI Studio',
    hint: 'Modelos Nano Banana / Gemini Image.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    shortLabel: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyLabel: 'OpenAI Platform',
    hint: 'Modelos gpt-image.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    shortLabel: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/keys',
    keyLabel: 'OpenRouter',
    hint: 'Acesso unificado a modelos de imagem.',
  },
  {
    id: 'replicate',
    label: 'Replicate',
    shortLabel: 'Replicate',
    keyUrl: 'https://replicate.com/account/api-tokens',
    keyLabel: 'Replicate',
    hint: 'Nano Banana 2.1, Flux Kontext e outros.',
  },
]

export const DEFAULT_PROVIDER = PROVIDERS[0].id

/** Limites alinhados ao backend (`MAX_REFERENCE_IMAGES` / `MAX_PREVIOUS_IMAGES`). */
export const MAX_REFERENCE_FRAMES = 32
export const MAX_PREVIOUS_FRAMES = 32

/** Margem segura abaixo do limite de ~4,5 MB por requisição da Vercel. */
export const MAX_TOTAL_BASE64_CHARS = 3_900_000

export const DEFAULT_ART_STYLE =
  'pixel art estilo 16-bit, paleta limitada, contorno nítido, fundo transparente'

/** Erro normalizado da API, com status HTTP e código do backend. */
export class ApiRequestError extends Error {
  constructor(message, { status = 0, code = 'request_failed', provider = null } = {}) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
    this.provider = provider
  }
}

/**
 * Faz um POST JSON e traduz falhas de rede/HTTP em mensagens em português.
 *
 * @param {string} path
 * @param {unknown} body
 * @returns {Promise<any>}
 */
async function postJson(path, body) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiRequestError(
      'Não foi possível falar com o backend. Verifique sua conexão e tente de novo.',
      { code: 'network_error' },
    )
  }

  const text = await response.text().catch(() => '')
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const detail =
      data && typeof data.detail === 'string' && data.detail.trim()
        ? data.detail
        : null
    const fallbackByStatus =
      response.status === 413
        ? 'O conjunto de imagens passou do limite de tamanho da Vercel. Reduza a quantidade ou a resolução dos frames.'
        : response.status === 504
          ? 'A geração demorou demais e foi interrompida. Tente novamente com menos frames.'
          : response.status >= 500
            ? 'O backend falhou ao processar o pedido. Tente novamente em alguns instantes.'
            : `A API respondeu com status ${response.status}.`

    throw new ApiRequestError(detail || fallbackByStatus, {
      status: response.status,
      code: data?.code || 'http_error',
      provider: data?.provider || null,
    })
  }

  if (!data) {
    throw new ApiRequestError(
      'O backend respondeu sem um JSON válido. Verifique se a API está no ar.',
      { status: response.status, code: 'invalid_response' },
    )
  }

  return data
}

/**
 * Valida a chave e lista os modelos de imagem/visão do provedor.
 *
 * @param {{ provider: string, apiKey: string }} input
 */
export async function listModels({ provider, apiKey }) {
  const data = await postJson('/api/models', {
    provider,
    api_key: apiKey,
  })

  return {
    provider: data.provider || provider,
    source: data.source || 'remote',
    warning: data.warning || null,
    models: Array.isArray(data.models) ? data.models : [],
  }
}

/**
 * Gera frames do zero ou aplica uma correção sobre os frames anteriores.
 *
 * @param {{
 *   provider: string,
 *   apiKey: string,
 *   modelId: string,
 *   referenceImages: string[],
 *   characterAppearance: string,
 *   artStyle: string,
 *   styleImages?: string[],
 *   frameCount?: number | null,
 *   gridColumns?: number | null,
 *   gridRows?: number | null,
 *   previousImages?: string[],
 *   correctionPrompt?: string | null,
 *   targetFrameIndex?: number | null,
 * }} input
 */
export async function generateSprites({
  provider,
  apiKey,
  modelId,
  referenceImages,
  characterAppearance,
  artStyle,
  styleImages = [],
  frameCount = null,
  gridColumns = null,
  gridRows = null,
  previousImages = [],
  correctionPrompt = null,
  targetFrameIndex = null,
}) {
  /** @type {Record<string, unknown>} */
  const payload = {
    provider,
    api_key: apiKey,
    model_id: modelId,
    reference_images: referenceImages,
    character_appearance: characterAppearance,
    art_style: artStyle,
  }

  if (Number.isInteger(frameCount) && frameCount > 0) {
    payload.frame_count = frameCount
  }
  if (styleImages.length > 0) {
    payload.style_images = styleImages
  }
  if (Number.isInteger(gridColumns) && gridColumns > 0) {
    payload.grid_columns = gridColumns
  }
  if (Number.isInteger(gridRows) && gridRows > 0) {
    payload.grid_rows = gridRows
  }
  if (previousImages.length > 0) {
    payload.previous_generated_images = previousImages
  }
  if (correctionPrompt) {
    payload.correction_prompt = correctionPrompt
  }
  if (targetFrameIndex !== null && targetFrameIndex !== undefined) {
    payload.target_frame_index = targetFrameIndex
  }

  const data = await postJson('/api/generate', payload)
  const mimeTypes = Array.isArray(data.mime_types) ? data.mime_types : []

  return {
    provider: data.provider || provider,
    modelId: data.model_id || modelId,
    mode: data.mode || 'generation',
    targetFrameIndex:
      typeof data.target_frame_index === 'number'
        ? data.target_frame_index
        : null,
    images: (Array.isArray(data.images) ? data.images : []).map((base64, index) =>
      toDataUrl(base64, mimeTypes[index]),
    ),
  }
}

/**
 * Converte o Base64 puro devolvido pelo backend em Data URL.
 *
 * @param {string} base64
 * @param {string} [mimeType]
 * @returns {string}
 */
export function toDataUrl(base64, mimeType = 'image/png') {
  const value = String(base64 || '')
  if (value.startsWith('data:')) return value
  return `data:${mimeType || 'image/png'};base64,${value}`
}

/**
 * Conta apenas os caracteres Base64 (sem o cabeçalho `data:...;base64,`).
 *
 * @param {string[]} dataUrls
 * @returns {number}
 */
export function countBase64Chars(dataUrls) {
  return dataUrls.reduce((total, dataUrl) => {
    const value = String(dataUrl || '')
    const comma = value.indexOf(',')
    return total + (comma === -1 ? value.length : value.length - comma - 1)
  }, 0)
}

/**
 * Texto amigável para qualquer erro das chamadas acima.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function describeApiError(error) {
  if (error instanceof ApiRequestError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Ocorreu um erro inesperado. Tente novamente.'
}

/**
 * @param {number} totalSeconds
 * @returns {string} `m:ss`
 */
export function formatElapsed(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds || 0))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
