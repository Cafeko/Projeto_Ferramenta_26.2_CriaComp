import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  ImagePlus,
  KeyRound,
  Sparkles,
} from 'lucide-react'

import ApiConfigPanel from './ApiConfigPanel'
import ExportPanel from './ExportPanel'
import GridPanel from './GridPanel'
import PreviewPanel from './PreviewPanel'
import ReferencePanel from './ReferencePanel'
import UsageSummary from './UsageSummary'

/**
 * Modo básico: conduz o usuário por um bloco de cada vez, de cima para baixo.
 *
 * Passos: API → Referências e Personagem → Resultado (visualização, grade,
 * exportação e métricas). No fim, o usuário pode continuar no modo avançado
 * levando o que fez.
 *
 * @param {{
 *   step: number,
 *   onStepChange: (step: number) => void,
 *   showMetrics: boolean,
 *   api: Record<string, any>,
 *   reference: Record<string, any>,
 *   preview: Record<string, any>,
 *   grid: Record<string, any>,
 *   exportPanel: Record<string, any>,
 *   metrics: Record<string, any>,
 *   onContinueAdvanced: () => void,
 * }} props
 */
export default function SimpleMode({
  step,
  onStepChange,
  showMetrics,
  api,
  reference,
  preview,
  grid,
  exportPanel,
  metrics,
  onContinueAdvanced,
}) {
  const steps = [
    { id: 1, label: 'API', icon: KeyRound },
    { id: 2, label: 'Entradas', icon: ImagePlus },
    { id: 3, label: 'Resultado', icon: Eye },
  ]
  const totalSteps = steps.length

  const apiReady = api.status === 'valid' && Boolean(api.modelId)
  const resultReady = Array.isArray(preview.frames) && preview.frames.length > 0

  // Passo 2 fica sempre acessível (é só preencher); o resultado só quando
  // existir algo gerado/restaurado.
  const maxUnlocked = resultReady ? 3 : 2
  const canGoTo = (id) => id <= Math.max(step, maxUnlocked)

  const next = () => onStepChange(Math.min(totalSteps, step + 1))
  const back = () => onStepChange(Math.max(1, step - 1))

  const continueButton = (ready, hint) => (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        onClick={back}
        disabled={step === 1}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-400 transition hover:bg-white/5 hover:text-slate-200 disabled:invisible"
      >
        <ArrowLeft className="size-3" />
        Voltar
      </button>

      <div className="flex items-center gap-3">
        {!ready && hint && (
          <span className="text-[10px] text-slate-500">{hint}</span>
        )}
        <button
          type="button"
          onClick={next}
          disabled={!ready}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 px-3 py-1.5 text-[11px] font-bold tracking-wide text-white uppercase shadow-lg shadow-blue-950/40 transition hover:from-sky-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          Continuar
          <ArrowRight className="size-3" />
        </button>
      </div>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      {/* Trilha de passos */}
      <ol className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-surface/60 p-2">
        {steps.map((item, index) => {
          const Icon = item.icon
          const current = item.id === step
          const done = item.id < step
          const enabled = canGoTo(item.id)
          return (
            <li key={item.id} className="flex items-center gap-2">
              {index > 0 && <span className="text-slate-700">›</span>}
              <button
                type="button"
                onClick={() => enabled && onStepChange(item.id)}
                disabled={!enabled}
                aria-current={current ? 'step' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  current
                    ? 'bg-cyan-400/15 text-cyan-200'
                    : done
                      ? 'text-emerald-300 hover:bg-white/5'
                      : 'text-slate-500 hover:bg-white/5 disabled:hover:bg-transparent'
                } disabled:cursor-not-allowed`}
              >
                {done ? (
                  <Check className="size-3.5" />
                ) : (
                  <Icon className="size-3.5" />
                )}
                {item.id}. {item.label}
              </button>
            </li>
          )
        })}
      </ol>

      {step === 1 && (
        <section>
          <p className="mb-2 text-[12px] text-slate-400">
            <strong className="text-slate-200">Configure a API.</strong> Escolha
            o provedor, cole a chave e valide.
          </p>
          <div className="mx-auto max-w-md">
            <ApiConfigPanel {...api} />
          </div>
          {continueButton(
            apiReady,
            'Valide a chave e escolha um modelo para continuar.',
          )}
        </section>
      )}

      {step === 2 && (
        <section>
          <p className="mb-2 text-[12px] text-slate-400">
            <strong className="text-slate-200">Informe as entradas.</strong>{' '}
            Envie a referência, descreva o personagem e gere os frames.
          </p>
          <ReferencePanel {...reference} />
          {continueButton(resultReady, 'Gere os frames para continuar.')}
        </section>
      )}

      {step === 3 && (
        <section>
          <p className="mb-2 text-[12px] text-slate-400">
            <strong className="text-slate-200">Confira o resultado.</strong>{' '}
            Veja os frames, ajuste o recorte, exporte
            {showMetrics ? ' e confira as métricas.' : '.'}
          </p>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <PreviewPanel {...preview} />
            <div className="grid gap-4 md:grid-cols-2 xl:block xl:space-y-4">
              <GridPanel {...grid} />
              <ExportPanel {...exportPanel} />
            </div>
          </div>

          {showMetrics && (
            <div className="mt-4">
              <UsageSummary {...metrics} />
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3">
            <button
              type="button"
              onClick={back}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
            >
              <ArrowLeft className="size-3" />
              Voltar
            </button>

            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={onContinueAdvanced}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
              >
                <Sparkles className="size-3.5" />
                Continuar para o modo avançado
                <ArrowRight className="size-3" />
              </button>
              <span className="text-[10px] text-slate-500">
                Leva o que fez para o modo avançado.
              </span>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
