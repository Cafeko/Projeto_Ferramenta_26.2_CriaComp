import { BookOpen, FlaskConical, Gamepad2, ShieldCheck } from 'lucide-react'

import MainDashboard from './components/MainDashboard'

export default function App() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 bg-pixel-grid" aria-hidden="true" />
      <div
        className="pointer-events-none fixed -top-48 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed top-1/3 -right-40 h-[26rem] w-[26rem] rounded-full bg-violet-500/10 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative">
        <header className="sticky top-0 z-40 border-b border-white/5 bg-canvas/85 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 text-slate-950 shadow-lg shadow-cyan-500/20">
                <Gamepad2 className="size-5" strokeWidth={2.5} />
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-semibold tracking-tight text-white">
                  SpriteTransfer <span className="text-cyan-400">Web</span>
                </p>
                <p className="hidden text-[11px] text-slate-500 sm:block">
                  pixel art · animação assistida por IA
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1 text-[11px] font-medium text-emerald-300 md:inline-flex">
                <ShieldCheck className="size-3" />
                BYOK · chave só na memória
              </span>

              <a
                href="/laboratorio-api.html"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-cyan-400/30 hover:text-cyan-200"
                title="Laboratório de teste da API"
              >
                <FlaskConical className="size-3.5" />
                <span className="hidden sm:inline">Laboratório</span>
              </a>

              <a
                href="/api/docs"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-cyan-400/30 hover:text-cyan-200"
                title="Documentação da API"
              >
                <BookOpen className="size-3.5" />
                <span className="hidden sm:inline">API</span>
              </a>
            </div>
          </div>
        </header>

        <MainDashboard />

        <footer className="border-t border-white/5">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-4 py-5 text-[11px] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>SpriteTransfer Web · IF866 Criatividade Computacional · 2026.2</p>
            <p className="font-mono">
              React + Vite · FastAPI serverless · pipeline Canvas local
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
