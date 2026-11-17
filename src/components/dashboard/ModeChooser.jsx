import { ArrowRight, LayoutGrid, PencilLine, Sparkles } from 'lucide-react'

const MODES = [
  {
    id: 'simple',
    title: 'Modo básico',
    icon: Sparkles,
    badge: 'Recomendado',
    description:
      'Um passo de cada vez: API, entradas e resultado. As métricas aparecem junto do resultado.',
    points: [
      'Um bloco por vez, de cima para baixo',
      'Instruções curtas em cada passo',
      'Pode continuar para o avançado no fim',
    ],
  },
  {
    id: 'advanced',
    title: 'Modo avançado',
    icon: LayoutGrid,
    description:
      'Todos os painéis de uma vez: referências, geração, frames, correção, exportação e métricas.',
    points: [
      'Controle total de grade, FPS e exportação',
      'Edição por frame ou em lote',
      'Métricas e logs à mão',
    ],
  },
  {
    id: 'editor',
    title: 'Modo editor',
    icon: PencilLine,
    description:
      'Carregue uma imagem pronta e edite como novo frame, com divisão em frames e exportação.',
    points: [
      'Só a imagem para começar',
      'Edição em lote ou por frame',
      'Exporta PNG e GIF',
    ],
  },
]

/**
 * Página inicial: escolha do modo (básico, avançado ou editor).
 *
 * @param {{
 *   currentMode: 'simple' | 'advanced' | 'editor',
 *   onSelect: (mode: 'simple' | 'advanced' | 'editor') => void,
 * }} props
 */
export default function ModeChooser({ currentMode, onSelect }) {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-6 text-center">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-cyan-300 uppercase">
          SpriteTransfer Web
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white">
          Como você quer começar?
        </h1>
        <p className="mt-1.5 text-[12px] text-slate-500">
          Escolha um modo. Cada um guarda seus próprios dados neste navegador.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {MODES.map((mode) => {
          const Icon = mode.icon
          const active = currentMode === mode.id
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onSelect(mode.id)}
              className={`group flex h-full flex-col rounded-xl border p-4 text-left transition focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:outline-none ${
                active
                  ? 'border-cyan-400/40 bg-cyan-400/[0.06] hover:bg-cyan-400/10'
                  : 'border-white/10 bg-surface/70 hover:border-cyan-400/30 hover:bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="grid size-9 place-items-center rounded-lg border border-white/10 bg-black/30 text-cyan-300">
                  <Icon className="size-4.5" />
                </span>
                {mode.badge ? (
                  <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-emerald-300 uppercase">
                    {mode.badge}
                  </span>
                ) : (
                  active && (
                    <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-cyan-200 uppercase">
                      Atual
                    </span>
                  )
                )}
              </div>

              <h2 className="mt-3 text-[15px] font-semibold text-slate-100">
                {mode.title}
              </h2>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                {mode.description}
              </p>

              <ul className="mt-3 space-y-1.5">
                {mode.points.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-400"
                  >
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-cyan-400/70" />
                    {point}
                  </li>
                ))}
              </ul>

              <span className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-cyan-300 transition group-hover:text-cyan-200">
                {active ? 'Continuar neste modo' : 'Usar este modo'}
                <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </button>
          )
        })}
      </div>

      <p className="mt-6 text-center text-[10px] text-slate-600">
        Você pode trocar de modo a qualquer momento em Configurações.
      </p>
    </div>
  )
}
