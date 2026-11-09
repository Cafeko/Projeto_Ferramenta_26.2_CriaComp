"""Serverless Function da Vercel: API FastAPI do SpriteTransfer Web.

A Vercel detecta automaticamente o objeto ASGI chamado ``app`` neste arquivo.
Todas as requisições ``/api/**`` são reescritas para cá (ver ``vercel.json``).
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="SpriteTransfer API",
    description="API de geração e transferência de animações em pixel art.",
    version="0.1.0",
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


@app.get("/api/health", tags=["infra"], summary="Health check da API")
@app.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    """Retorna o status da função. Usado pelo frontend para testar a conexão."""
    return {"status": "ok"}
