import { ArrowRight, Gauge } from 'lucide-react'

import { formatDuration, formatUsd } from '../../lib/api'
import { Card } from './ui'

function formatTokens(value) {
  if (typeof value !== 'number') return '—'
  return value.toLocaleString('pt-BR')
}

function CompactMetric({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-2.5 py-2">
      <p className="text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-[13px] font-semibold text-slate-100">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[9px] text-slate-500">{hint}</p>}
    </div>
  )
}

/**
 * Resumo compacto das métricas de IA na coluna direita.
 *
 * @param {{
 *   history: Array<Record<string, any>>,
 *   onOpenLogs: () => void,
 * }} props
 */
export default function UsageSummary({ history, onOpenLogs }) {
  const totals = history.reduce(
    (acc, entry) => {
      acc.calls += 1
      if (entry.status === 'error') acc.errors += 1
      else acc.success += 1
      if (typeof entry.usage?.costUsd === 'number') {
        acc.cost += entry.usage.costUsd
        acc.costed += 1
      }
      if (typeof entry.usage?.totalTokens === 'number') {
        acc.tokens += entry.usage.totalTokens
        acc.tokenCalls += 1
      }
      if (typeof entry.quality?.score === 'number') {
        acc.qualitySum += entry.quality.score
        acc.rated += 1
      }
      return acc
    },
    {
      calls: 0,
      success: 0,
      errors: 0,
      cost: 0,
      costed: 0,
      tokens: 0,
      tokenCalls: 0,
      qualitySum: 0,
      rated: 0,
    },
  )

  const last = history[history.length - 1] ?? null
  const averageQuality =
    totals.rated > 0 ? Math.round(totals.qualitySum / totals.rated) : null

  return (
    <Card
      title="Resumo da IA"
      subtitle="Custo, tokens e qualidade"
      icon={Gauge}
      bodyClassName="p-3"
      help={
        <>
          <p>
            Resumo das últimas {history.length} requisição
            {history.length === 1 ? '' : 's'} registradas neste dispositivo.
          </p>
          <p>
            Gasto e tokens somam as chamadas com valor informado ou estimado. A
            qualidade média usa apenas as chamadas avaliadas.
          </p>
          <p>
            A tabela completa, com filtros e exportação, fica em{' '}
            <strong>Atividade → Logs</strong>.
          </p>
        </>
      }
    >
      {totals.calls === 0 ? (
        <p className="text-[11px] leading-relaxed text-slate-500">
          Sem chamadas registradas ainda. O resumo aparece aqui e em{' '}
          <strong className="text-slate-300">Atividade → Logs</strong>.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <CompactMetric
              label="Gasto total"
              value={formatUsd(totals.cost)}
              hint={`${totals.costed} com custo`}
            />
            <CompactMetric
              label="Chamadas"
              value={totals.calls}
              hint={`${totals.success} ok · ${totals.errors} erro${
                totals.errors === 1 ? '' : 's'
              }`}
            />
            <CompactMetric
              label="Tokens"
              value={
                totals.tokenCalls > 0 ? formatTokens(totals.tokens) : '—'
              }
              hint={
                totals.tokenCalls > 0
                  ? 'entrada + saída'
                  : 'provedor não informou'
              }
            />
            <CompactMetric
              label="Qualidade média"
              value={averageQuality === null ? '—' : `${averageQuality}/100`}
              hint={
                totals.rated > 0
                  ? `${totals.rated} avaliada${totals.rated === 1 ? '' : 's'}`
                  : 'sem avaliação'
              }
            />
          </div>

          {last && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/10 px-2.5 py-1.5 text-[10px]">
              <span className="flex min-w-0 items-center gap-1.5 text-slate-500">
                <span
                  className={`size-1.5 shrink-0 rounded-full ${
                    last.status === 'error' ? 'bg-rose-400' : 'bg-emerald-400'
                  }`}
                />
                <span className="truncate" title={last.modelId}>
                  {last.modelId || '—'}
                </span>
              </span>
              <span className="shrink-0 font-mono text-slate-500">
                {formatDuration(last.usage?.clientElapsedMs)} ·{' '}
                {formatUsd(last.usage?.costUsd)}
              </span>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onOpenLogs}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 px-2 py-1.5 text-[10px] font-semibold text-slate-400 transition hover:border-cyan-400/30 hover:bg-cyan-400/5 hover:text-cyan-300"
      >
        Ver logs completos
        <ArrowRight className="size-3" />
      </button>
    </Card>
  )
}
