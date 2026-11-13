import { Clock, Coins, Gauge, RotateCcw } from 'lucide-react'

import { formatDuration, formatUsd } from '../../lib/api'
import { Card, Pill } from './ui'

const KIND_LABELS = {
  generation: 'Geração',
  batch: 'Correção em lote',
  single: 'Correção de frame',
}

const SOURCE_UI = {
  provider: { label: 'real', tone: 'green', title: 'Valor cobrado informado pelo provedor' },
  estimate: { label: 'estimado', tone: 'amber', title: 'Tokens/imagens × tabela de preços' },
  unavailable: { label: 'sem custo', tone: 'neutral', title: 'O provedor não informa base para calcular' },
}

function formatTokens(value) {
  if (typeof value !== 'number') return '—'
  return value.toLocaleString('pt-BR')
}

function Metric({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="mt-1 font-mono text-[15px] font-semibold text-slate-100">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p>}
    </div>
  )
}

/**
 * Métricas de avaliação (tempo e custo) e controle de custo da sessão.
 *
 * @param {{
 *   history: Array<{
 *     id: number,
 *     at: number,
 *     kind: keyof typeof KIND_LABELS,
 *     provider: string,
 *     modelId: string,
 *     usage: import('../../lib/api').GenerationUsage,
 *   }>,
 *   onReset: () => void,
 * }} props
 */
export default function UsagePanel({ history, onReset }) {
  const last = history[history.length - 1] ?? null

  const totals = history.reduce(
    (acc, entry) => {
      acc.calls += 1
      acc.timeMs += entry.usage.clientElapsedMs
      acc.tokens += entry.usage.totalTokens ?? 0
      if (entry.usage.costUsd !== null) {
        acc.cost += entry.usage.costUsd
        if (entry.usage.costSource === 'estimate') acc.estimated += 1
      } else {
        acc.uncosted += 1
      }
      return acc
    },
    { calls: 0, timeMs: 0, tokens: 0, cost: 0, estimated: 0, uncosted: 0 },
  )

  return (
    <Card
      title="Métricas e custo"
      subtitle="Tempo e gasto de cada chamada à IA"
      icon={Gauge}
      badge={
        history.length > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
            title="Zerar histórico de custo"
          >
            <RotateCcw className="size-3" />
            Zerar
          </button>
        )
      }
    >
      {!last ? (
        <p className="text-[11px] leading-relaxed text-slate-500">
          Gere ou corrija frames para ver o tempo, os tokens e o custo de cada
          chamada. O total acumulado fica salvo neste navegador.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 flex items-center justify-between text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              Última chamada
              <Pill tone={SOURCE_UI[last.usage.costSource].tone}>
                <span title={SOURCE_UI[last.usage.costSource].title}>
                  {SOURCE_UI[last.usage.costSource].label}
                </span>
              </Pill>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Metric
                icon={Clock}
                label="Tempo"
                value={formatDuration(last.usage.clientElapsedMs)}
                hint={
                  last.usage.computeSeconds !== null
                    ? `GPU: ${formatDuration(last.usage.computeSeconds * 1000)}`
                    : last.usage.serverElapsedMs !== null
                      ? `Provedor: ${formatDuration(last.usage.serverElapsedMs)}`
                      : null
                }
              />
              <Metric
                icon={Coins}
                label="Custo"
                value={formatUsd(last.usage.costUsd)}
                hint={
                  last.usage.totalTokens !== null
                    ? `${formatTokens(last.usage.inputTokens)} in · ${formatTokens(last.usage.outputTokens)} out`
                    : `${last.usage.imageCount} imagem(ns)`
                }
              />
            </div>
            <p className="mt-1.5 truncate font-mono text-[10px] text-slate-500" title={last.modelId}>
              {KIND_LABELS[last.kind] ?? last.kind} · {last.provider} · {last.modelId}
            </p>
            {last.usage.costNote && (
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                {last.usage.costNote}
              </p>
            )}
          </div>

          <div className="border-t border-white/5 pt-3">
            <p className="mb-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              Total acumulado
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Metric
                icon={Coins}
                label="Gasto"
                value={formatUsd(totals.cost)}
                hint={`${totals.calls} chamada${totals.calls === 1 ? '' : 's'}`}
              />
              <Metric
                icon={Clock}
                label="Tempo total"
                value={formatDuration(totals.timeMs)}
                hint={`${formatTokens(totals.tokens)} tokens`}
              />
            </div>
            {(totals.estimated > 0 || totals.uncosted > 0) && (
              <p className="mt-1.5 text-[10px] leading-relaxed text-amber-300/80">
                {totals.estimated > 0 &&
                  `${totals.estimated} valor${totals.estimated === 1 ? '' : 'es'} estimado${totals.estimated === 1 ? '' : 's'}. `}
                {totals.uncosted > 0 &&
                  `${totals.uncosted} chamada${totals.uncosted === 1 ? '' : 's'} sem custo calculável (não somada${totals.uncosted === 1 ? '' : 's'}).`}
              </p>
            )}
          </div>

          {history.length > 1 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto border-t border-white/5 pt-2">
              {history
                .slice()
                .reverse()
                .map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-2 font-mono text-[10px] text-slate-400"
                  >
                    <span className="truncate" title={`${entry.provider} · ${entry.modelId}`}>
                      {KIND_LABELS[entry.kind] ?? entry.kind}
                    </span>
                    <span className="shrink-0 text-slate-500">
                      {formatDuration(entry.usage.clientElapsedMs)} ·{' '}
                      <span className={entry.usage.costSource === 'estimate' ? 'text-amber-300/80' : ''}>
                        {formatUsd(entry.usage.costUsd)}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}
