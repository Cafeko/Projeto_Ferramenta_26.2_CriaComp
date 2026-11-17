import { ArrowRight, Clock, Gauge, ImageIcon } from 'lucide-react'

import { PROVIDERS, formatDuration, formatUsd } from '../../lib/api'
import { qualityGrade } from '../../utils/qualityMetrics'
import { Card, Pill } from './ui'

const KIND_LABELS = {
  generation: 'Geração',
  single: 'Correção individual',
  batch: 'Correção em lote',
}

const PROVIDER_LABELS = Object.fromEntries(
  PROVIDERS.map((provider) => [provider.id, provider.label]),
)

function formatTokens(value) {
  if (typeof value !== 'number') return '—'
  return value.toLocaleString('pt-BR')
}

function formatDateTime(value) {
  if (typeof value !== 'number') return '—'
  return new Date(value).toLocaleString('pt-BR')
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

function DetailRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-white/5 py-1 last:border-b-0">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className="text-right font-mono text-[11px] text-slate-200">
        {value || '—'}
      </span>
    </div>
  )
}

/** Última chamada que devolveu uma imagem (ou, na falta, a última bem-sucedida). */
function pickLatestGeneration(history) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index]
    if (entry.status === 'error') continue
    if (typeof entry.usage?.imageCount === 'number' && entry.usage.imageCount > 0) {
      return entry
    }
  }
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].status !== 'error') return history[index]
  }
  return null
}

/**
 * Resumo compacto das métricas de IA, com os totais gerais e os dados da
 * imagem gerada mais recentemente.
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
      if (typeof entry.usage?.clientElapsedMs === 'number') {
        acc.elapsedMs += entry.usage.clientElapsedMs
        acc.timed += 1
      }
      if (typeof entry.usage?.imageCount === 'number') {
        acc.images += entry.usage.imageCount
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
      elapsedMs: 0,
      timed: 0,
      images: 0,
      qualitySum: 0,
      rated: 0,
    },
  )

  const last = pickLatestGeneration(history)
  const averageQuality =
    totals.rated > 0 ? Math.round(totals.qualitySum / totals.rated) : null

  return (
    <Card
      title="Resumo da IA"
      subtitle="Totais e a imagem gerada mais recentemente"
      icon={Gauge}
      bodyClassName="p-3"
      help={
        <>
          <p>
            Resumo das últimas {history.length} requisição
            {history.length === 1 ? '' : 's'} registradas neste dispositivo.
          </p>
          <p>
            Gasto, tokens e tempo somam as chamadas com valor informado ou
            estimado. A qualidade média usa apenas as chamadas avaliadas.
          </p>
          <p>
            À direita ficam os dados específicos da última chamada que devolveu
            uma imagem. A tabela completa, com filtros e exportação, fica em{' '}
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
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="mb-1.5 text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
              Totais gerais
            </p>
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
                label="Tempo total"
                value={totals.timed > 0 ? formatDuration(totals.elapsedMs) : '—'}
                hint={
                  totals.timed > 0 ? `${totals.timed} medidas` : 'sem medição'
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
              <CompactMetric
                label="Imagens geradas"
                value={formatTokens(totals.images)}
                hint="nos registros salvos"
              />
            </div>
          </div>

          <div className="rounded-lg border border-white/5 bg-black/20 p-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
                <ImageIcon className="size-3" />
                Imagem mais recente
              </p>
              {last && (
                <Pill tone={last.status === 'error' ? 'red' : 'green'}>
                  {last.status === 'error' ? 'Erro' : 'Sucesso'}
                </Pill>
              )}
            </div>

            {!last ? (
              <p className="py-4 text-center text-[11px] text-slate-500">
                Nenhuma geração bem-sucedida registrada.
              </p>
            ) : (
              <>
                <div className="mb-1.5 min-w-0">
                  <p
                    className="truncate text-[12px] font-semibold text-slate-100"
                    title={last.modelId}
                  >
                    {last.modelId || 'Modelo não informado'}
                  </p>
                  <p className="truncate text-[10px] text-slate-500">
                    {PROVIDER_LABELS[last.provider] ||
                      last.provider ||
                      'API não informada'}{' '}
                    · {KIND_LABELS[last.kind] || last.kind || '—'} ·{' '}
                    {formatDateTime(last.at)}
                  </p>
                </div>

                <div className="grid gap-x-4 sm:grid-cols-2">
                  <DetailRow
                    label="Tempo de resposta"
                    value={formatDuration(last.usage?.clientElapsedMs)}
                  />
                  <DetailRow
                    label="Tempo no servidor"
                    value={formatDuration(last.usage?.serverElapsedMs)}
                  />
                  <DetailRow
                    label="Tokens"
                    value={formatTokens(last.usage?.totalTokens)}
                  />
                  <DetailRow
                    label="Custo"
                    value={formatUsd(last.usage?.costUsd)}
                  />
                  <DetailRow
                    label="Imagens"
                    value={
                      typeof last.usage?.imageCount === 'number'
                        ? last.usage.imageCount
                        : '—'
                    }
                  />
                  <DetailRow
                    label="Qualidade"
                    value={
                      typeof last.quality?.score === 'number'
                        ? `${last.quality.score}/100 · ${
                            qualityGrade(last.quality.score).label
                          }`
                        : '—'
                    }
                  />
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {[
                    ['Pose', last.quality?.pose],
                    ['Consistência', last.quality?.consistency],
                    ['Pixel art', last.quality?.pixelArt],
                  ].map(([label, value]) => (
                    <span
                      key={label}
                      className="rounded border border-white/5 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9px] text-slate-400"
                    >
                      {label} {typeof value === 'number' ? `${value}` : '—'}
                    </span>
                  ))}
                  <span className="flex items-center gap-1 font-mono text-[9px] text-slate-600">
                    <Clock className="size-2.5" />
                    {formatDuration(last.usage?.clientElapsedMs)}
                  </span>
                </div>

                {last.status === 'error' && (
                  <p className="mt-1.5 text-[10px] text-rose-300">
                    {last.errorCode || 'request_failed'}
                    {last.errorMessage ? ` — ${last.errorMessage}` : ''}
                  </p>
                )}
              </>
            )}
          </div>
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
