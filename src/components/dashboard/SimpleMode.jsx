import { useEffect } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  Gauge,
  ImagePlus,
  KeyRound,
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
 * Passos: API → Referências e Personagem → Visualização/grade/exportação →
 * métricas (se ativadas). Cada passo tem uma frase curta de instrução e um
 * botão de continuar que só libera quando o passo está pronto.
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
}) {
  const steps = [
    { id: 1, label: 'API', icon: KeyRound },
    { id: 2, label: 'Entradas', icon: ImagePlus },
    { id: 3, label: 'Resultado', icon: Eye },
    ...(showMetrics ? [{ id: 4, label: 'Métricas', icon: Gauge }] : []),
  ]
  const totalSteps = steps.length

  // Se as métricas forem desativadas, não deixa o passo atual fora da trilha.
  useEffect(() => {
    if (step > totalSteps) onStepChange(totalSteps)
  }, [step, totalSteps, onStepChange])

  const apiReady = api.status === 'valid' && Boolean(api.modelId)
  const resultReady = Array.isArray(preview.frames) && preview.frames.length > 0

  let maxUnlocked = 1
  if (apiReady) maxUnlocked = 2
  if (apiReady && resultReady) maxUnlocked = 3
  if (showMetrics && maxUnlocked >= 3) maxUnlocked = 4

  const canGoTo = (id) => id <= Math.max(step, maxUnlocked)

  const next = () => onStepChange(Math.min(totalSteps, step + 1))
  const back = () => onStepChange(Math.max(1, step - 1))

  const nav = (ready, hint, nextLabel = 'Continuar', isLast = false) => (
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

      {!isLast && (
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
            {nextLabel}
            <ArrowRight className="size-3" />
          </button>
        </div>
      )}
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
          {nav(
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
          {nav(resultReady, 'Gere os frames para continuar.')}
        </section>
      )}

      {step === 3 && (
        <section>
          <p className="mb-2 text-[12px] text-slate-400">
            <strong className="text-slate-200">Confira o resultado.</strong>{' '}
            Veja os frames, ajuste o recorte e exporte.
          </p>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <PreviewPanel {...preview} />
            <div className="grid gap-4 md:grid-cols-2 xl:block xl:space-y-4">
              <GridPanel {...grid} />
              <ExportPanel {...exportPanel} />
            </div>
          </div>
          {showMetrics
            ? nav(resultReady, 'Gere os frames para continuar.', 'Ver métricas')
            : nav(false, '', 'Continuar', true)}
        </section>
      )}

      {step === 4 && showMetrics && (
        <section>
          <p className="mb-2 text-[12px] text-slate-400">
            <strong className="text-slate-200">Métricas.</strong> Custo, tempo e
            qualidade desta sessão.
          </p>
          <UsageSummary {...metrics} />
          {nav(false, '', 'Concluir', true)}
        </section>
      )}
    </div>
  )
}
