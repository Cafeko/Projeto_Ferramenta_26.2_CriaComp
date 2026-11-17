import {
  ArrowRight,
  Clock,
  Coins,
  Gauge,
  Hash,
  ImageIcon,
  Server,
} from 'lucide-react'

import { PROVIDERS, formatDuration, formatUsd } from '../../lib/api'
import { Card, Pill } from './ui'
import QualityCard from './QualityCard'

const KIND_LABELS = {
  generation: 'Geração',
  single: 'Correção individual',
  batch: 'Correção em lote',
  edit: 'Edição',
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

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0 rounded-md border border-white/5 bg-white/[0.02] px-2 py-1.5">
      <p className="flex items-center gap-1 text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
        <Icon className="size-2.5" />
        {label}
      </p>
      <p className="mt-0.5 truncate font-mono text-[11px] text-slate-200">
        {value || '—'}
      </p>
    </div>
  )
}

/** Última chamada que devolveu uma imagem (usado só como reserva). */
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
 * Métricas de IA: qualidade do resultado, dados da imagem mais recente e totais.
 *
 * @param {{
 *   history: Array<Record<string, any>>,
 *   latest?: Record<string, any> | null,
 *   quality?: import('../../utils/qualityMetrics').QualityReport | null,
 *   onEditFrame?: ((index: number) => void) | null,
 *   onOpenLogs: () => void,
 * }} props
 */
export default function UsageSummary({
  history,
  latest,
  quality = null,
  onEditFrame = null,
  onOpenLogs,
}) {
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

  const last = latest === undefined ? pickLatestGeneration(history) : latest
  const averageQuality =
    totals.rated > 0 ? Math.round(totals.qualitySum / totals.rated) : null

  // A avaliação ao vivo tem pose/paleta/fundo; o histórico guarda só as notas.
  const qualityForCard =
    quality ||
    (last?.quality
      ? {
          score: last.quality.score,
          pose: last.quality.pose,
          consistency: last.quality.consistency,
          pixelArt: last.quality.pixelArt,
        }
      : null)

  return (
    <Card
      title="Métricas"
      subtitle="Qualidade, imagem recente e totais"
      icon={Gauge}
      bodyClassName="p-3"
      help={
        <>
          <p>
            Resumo das últimas {history.length} requisição
            {history.length === 1 ? '' : 's'} registradas neste dispositivo.
          </p>
          <p>
            À esquerda fica a <strong>qualidade do resultado</strong> exibido na
            visualização; no meio, os dados da <strong>imagem mais recente</strong>{' '}
            (limpos ao remover essa imagem); à direita, os <strong>totais</strong>{' '}
            de gasto, tokens e tempo.
          </p>
          <p>
            A tabela completa, com filtros e exportação, fica em{' '}
            <strong>Atividade → Logs</strong>. Você pode ocultar este painel em{' '}
            <strong>Configurações</strong>.
          </p>
        </>
      }
    >
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-[minmax(0,330px)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <QualityCard quality={qualityForCard} onEditFrame={onEditFrame} />
        </div>

        <div className="rounded-lg border border-white/5 bg-black/20 p-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
              <ImageIcon className="size-3" />
              Imagem mais recente
            </p>
            {last && <Pill tone="green">Gerada</Pill>}
          </div>

          {!last ? (
            <p className="py-4 text-center text-[11px] leading-relaxed text-slate-500">
              Nenhuma imagem gerada. Ao remover o resultado, estes dados também
              são limpos.
            </p>
          ) : (
            <>
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

              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                <Stat
                  icon={Clock}
                  label="Resposta"
                  value={formatDuration(last.usage?.clientElapsedMs)}
                />
                <Stat
                  icon={Server}
                  label="Servidor"
                  value={formatDuration(last.usage?.serverElapsedMs)}
                />
                <Stat
                  icon={Hash}
                  label="Tokens"
                  value={formatTokens(last.usage?.totalTokens)}
                />
                <Stat
                  icon={Coins}
                  label="Custo"
                  value={formatUsd(last.usage?.costUsd)}
                />
                <Stat
                  icon={ImageIcon}
                  label="Imagens"
                  value={
                    typeof last.usage?.imageCount === 'number'
                      ? String(last.usage.imageCount)
                      : '—'
                  }
                />
              </div>
            </>
          )}
        </div>

        <div className="lg:col-span-2 xl:col-span-1">
          <p className="mb-1.5 text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
            Totais
          </p>
          {totals.calls === 0 ? (
            <p className="text-[11px] leading-relaxed text-slate-500">
              Sem chamadas registradas ainda. O histórico completo fica em{' '}
              <strong className="text-slate-300">Atividade → Logs</strong>.
            </p>
          ) : (
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
                  totals.timed > 0
                    ? `${totals.timed} medida${totals.timed === 1 ? '' : 's'}`
                    : 'sem medição'
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
          )}
        </div>
      </div>

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
