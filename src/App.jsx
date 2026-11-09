import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  Gamepad2,
  Loader2,
  RefreshCw,
  Server,
  Sparkles,
  Terminal,
  XCircle,
  Zap,
} from 'lucide-react'

// Em produção (mesmo domínio na Vercel) a base fica vazia.
// Em dev, o proxy do Vite encaminha /api para http://127.0.0.1:8000.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
const HEALTH_URL = `${API_BASE_URL}/api/health`

const STATUS_UI = {
  idle: {
    label: 'Aguardando teste',
    dot: 'bg-slate-500',
    text: 'text-slate-400',
    ring: 'ring-slate-500/20 bg-slate-500/5',
  },
  loading: {
    label: 'Verificando…',
    dot: 'bg-amber-400 animate-pulse',
    text: 'text-amber-300',
    ring: 'ring-amber-400/20 bg-amber-400/5',
  },
  online: {
    label: 'Online',
    dot: 'bg-emerald-400',
    text: 'text-emerald-300',
    ring: 'ring-emerald-400/20 bg-emerald-400/5',
  },
  offline: {
    label: 'Offline',
    dot: 'bg-rose-500',
    text: 'text-rose-300',
    ring: 'ring-rose-500/20 bg-rose-500/5',
  },
}

const FEATURES = [
  {
    title: 'Referência de movimento',
    description: 'A pose e a fluidez da animação original guiam o novo sprite.',
  },
  {
    title: 'Identidade por texto',
    description: 'Descreva o personagem e o estilo de arte que você quer ver.',
  },
  {
    title: 'Ajustes por quadro',
    description: 'Refine um frame isolado sem quebrar a consistência do conjunto.',
  },
]

export default function App() {
  const [status, setStatus] = useState('idle')
  const [health, setHealth] = useState(null)
  const [latency, setLatency] = useState(null)
  const [error, setError] = useState(null)

  const checkHealth = useCallback(async () => {
    setStatus('loading')
    setError(null)
    const startedAt = performance.now()

    try {
      const response = await fetch(HEALTH_URL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`.trim())
      }

      setHealth(payload)
      setLatency(Math.round(performance.now() - startedAt))
      setStatus('online')
    } catch (err) {
      setHealth(null)
      setLatency(null)
      setError(
        err.name === 'TimeoutError'
          ? 'Tempo esgotado após 8s sem resposta.'
          : err.message || 'Não foi possível conectar à API.',
      )
      setStatus('offline')
    }
  }, [])

  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  const statusUi = STATUS_UI[status]
  const isLoading = status === 'loading'

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-pixel-grid" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative">
        <header className="border-b border-white/5 bg-canvas/60 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 text-slate-950 shadow-lg shadow-cyan-500/20">
                <Gamepad2 className="size-5" strokeWidth={2.5} />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold tracking-tight text-white">
                  SpriteTransfer <span className="text-cyan-400">Web</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  pixel art · animação assistida
                </p>
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-slate-400">
              <Zap className="size-3 text-cyan-400" />
              Base Vercel · v0.1.0
            </span>
          </div>
        </header>

        <main className="mx-auto grid max-w-6xl gap-12 px-6 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-16 lg:py-20">
          <section>
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1 text-[11px] font-medium tracking-wide text-cyan-300 uppercase">
              <Sparkles className="size-3.5" />
              Creative computing
            </p>

            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white text-balance sm:text-5xl">
              Animações em pixel art,{' '}
              <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-400 bg-clip-text text-transparent">
                sem animar quadro a quadro
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Transfira a pose e o ritmo de uma animação de referência para um
              personagem novo, definido por você. A base do frontend (React +
              Tailwind) e do backend (FastAPI) já está configurada para a Vercel.
            </p>

            <ul className="mt-9 space-y-4">
              {FEATURES.map((feature) => (
                <li key={feature.title} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-cyan-400/80" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">
                      {feature.title}
                    </p>
                    <p className="text-sm text-slate-500">
                      {feature.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex flex-wrap gap-2">
              {['React 19', 'Vite 8', 'Tailwind 4', 'FastAPI', 'Vercel'].map(
                (tech) => (
                  <span
                    key={tech}
                    className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] text-slate-400"
                  >
                    {tech}
                  </span>
                ),
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/40 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                  <Server className="size-4 text-cyan-400" />
                  Backend · FastAPI
                </div>
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${statusUi.ring} ${statusUi.text}`}
                  aria-live="polite"
                >
                  <span className={`size-1.5 rounded-full ${statusUi.dot}`} />
                  {statusUi.label}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs">
                <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300">
                  GET
                </span>
                <span className="truncate text-slate-300">/api/health</span>
              </div>

              <div className="mt-4 min-h-32 rounded-xl border border-white/5 bg-[#05080d] p-4 font-mono text-xs leading-relaxed">
                {status === 'idle' && (
                  <p className="text-slate-500">
                    Nenhuma requisição feita ainda.
                  </p>
                )}

                {isLoading && (
                  <p className="flex items-center gap-2 text-amber-300">
                    <Loader2 className="size-3.5 animate-spin" />
                    GET {HEALTH_URL || '/api/health'}…
                  </p>
                )}

                {status === 'online' && (
                  <>
                    <pre className="whitespace-pre-wrap text-emerald-300">
                      {JSON.stringify(health, null, 2)}
                    </pre>
                    <p className="mt-3 text-slate-500">
                      200 OK · {latency} ms
                    </p>
                  </>
                )}

                {status === 'offline' && (
                  <>
                    <p className="flex items-center gap-2 text-rose-300">
                      <XCircle className="size-3.5" />
                      Falha ao conectar
                    </p>
                    <p className="mt-2 break-words text-slate-400">{error}</p>
                    <p className="mt-3 text-slate-500">
                      Inicie a API com{' '}
                      <code className="rounded bg-white/5 px-1 py-0.5 text-slate-300">
                        npm run dev:api
                      </code>
                    </p>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={checkHealth}
                disabled={isLoading}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                {isLoading ? 'Testando…' : 'Testar health check'}
              </button>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                <Terminal className="size-3.5" />
                Ambiente local
              </div>
              <p className="mt-2 font-mono text-xs text-slate-400">
                web :5173 · api :8000 · proxy /api
              </p>
            </div>

            <p className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-slate-600">
              <Activity className="mt-0.5 size-3.5 shrink-0" />
              Em produção, frontend e API compartilham o mesmo domínio na Vercel —
              nenhuma variável de ambiente é obrigatória.
            </p>
          </section>
        </main>

        <footer className="border-t border-white/5">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 text-[11px] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>SpriteTransfer Web · IF866 Criatividade Computacional · 2026.2</p>
            <p className="font-mono">React + Vite · FastAPI serverless</p>
          </div>
        </footer>
      </div>
    </div>
  )
}
