import { Clock, Coins, Gauge, Hash, Loader2, RotateCcw, Sparkles, Wand2 } from 'lucide-react'

import { formatDuration, formatUsd } from '../../lib/api'
import { qualityGrade } from '../../utils/qualityMetrics'
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

const BACKGROUND_LABELS = {
  transparent: 'fundo transparente',
  solid: 'fundo sólido',
  noisy: 'fundo com cenário',
}

const BAR_TONES = {
  green: 'bg-emerald-400',
  cyan: 'bg-cyan-400',
  amber: 'bg-amber-400',
  red: 'bg-rose-400',
}

function formatTokens(value) {
  if (typeof value !== 'number') return '—'
  return value.toLocaleString('pt-BR')
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm
}

function Metric({ icon: Icon, label, value, hint, className = '' }) {
  return (
    <div className={`rounded-lg border border-white/5 bg-black/20 px-3 py-2 ${className}`}>
      <p className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="mt-1 font-mono text-[15px] font-semibold text-slate-100">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p>}
    </div>
  )
}

function ScoreBar({ label, value, hint, title }) {
  const tone = value === null ? null : qualityGrade(value).tone
  return (
    <div title={title}>
      <div className="flex items-baseline justify-between gap-2 text-[10px]">
        <span className="font-semibold text-slate-400">{label}</span>
        <span className="font-mono text-slate-300">{value === null ? '—' : value}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
        {value !== null && (
          <div className={`h-full rounded-full ${BAR_TONES[tone]}`} style={{ width: `${value}%` }} />
        )}
      </div>
      {hint && <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p>}
    </div>
  )
}

/**
 * Qualidade do resultado exibido no preview.
 *
 * @param {{
 *   quality: import('../../utils/qualityMetrics').QualityReport | null,
 *   busy: boolean,
 *   onEditFrame: ((index: number) => void) | null,
 * }} props
 */
function QualitySection({ quality, busy, onEditFrame }) {
  if (!quality) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <Loader2 className="size-3 animate-spin" />
        Avaliando a qualidade do resultado…
      </p>
    )
  }

  const grade = qualityGrade(quality.score)
  const worst = quality.worstFrameIndex
  return (
    <div>
      <p className="mb-1.5 flex items-center justify-between text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
        <span className="flex items-center gap-1">
          Qualidade do resultado
          {busy && <Loader2 className="size-3 animate-spin text-slate-500" />}
        </span>
        <Pill tone={grade.tone}>{grade.label}</Pill>
      </p>
      <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
        <p className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
          <Sparkles className="size-3" />
          Nota
        </p>
        <p className="mt-1 font-mono text-[15px] font-semibold text-slate-100">
          {quality.score}
          <span className="text-[11px] text-slate-500">/100</span>
        </p>
        <div className="mt-2 space-y-2">
          <ScoreBar
            label="Fidelidade de pose"
            value={quality.pose}
            title="Silhueta de cada frame comparada com o frame de referência correspondente"
            hint={quality.pose === null ? 'Sem referência fatiada para comparar' : null}
          />
          <ScoreBar
            label="Consistência do personagem"
            value={quality.consistency}
            title="Semelhança das cores do personagem entre os frames"
          />
          <ScoreBar
            label="Pixel art utilizável"
            value={quality.pixelArt}
            title="Paleta enxuta e fundo fácil de remover"
            hint={`~${quality.colors} cores dominantes · ${BACKGROUND_LABELS[quality.backgroundKind]}`}
          />
        </div>
      </div>
      {quality.emptyFrames > 0 && (
        <p className="mt-1.5 text-[10px] leading-relaxed text-amber-300/80">
          {quality.emptyFrames} {plural(quality.emptyFrames, 'frame vazio', 'frames vazios')}: a
          nota foi reduzida proporcionalmente.
        </p>
      )}
      {worst !== null && (
        <button
          type="button"
          onClick={() => onEditFrame?.(worst)}
          disabled={!onEditFrame}
          className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-cyan-300 transition hover:bg-cyan-400/10 disabled:cursor-default disabled:text-slate-500 disabled:hover:bg-transparent"
          title="Abrir a correção individual deste frame"
        >
          <Wand2 className="size-3" />
          Frame {worst + 1} destoa (nota {quality.perFrame[worst]}) — corrigir
        </button>
      )}
    </div>
  )
}

/**
 * Métricas de avaliação (tempo, custo e qualidade) e controle de custo da sessão.
 *
 * @param {{
 *   history: Array<{
 *     id: number,
 *     at: number,
 *     kind: keyof typeof KIND_LABELS,
 *     provider: string,
 *     modelId: string,
 *     usage: import('../../lib/api').GenerationUsage,
 *     quality?: { score: number, pose: number | null, consistency: number, pixelArt: number },
 *   }>,
 *   onReset: () => void,
 *   quality: import('../../utils/qualityMetrics').QualityReport | null,
 *   qualityBusy: boolean,
 *   onEditFrame: ((index: number) => void) | null,
 * }} props
 */
export default function UsagePanel({ history, onReset, quality, qualityBusy, onEditFrame }) {
  const last = history[history.length - 1] ?? null
  const showQuality = Boolean(quality || qualityBusy)

  const totals = history.reduce(
    (acc, entry) => {
      acc.calls += 1
      acc.timeMs += entry.usage.clientElapsedMs
      acc.inputTokens += entry.usage.inputTokens ?? 0
      acc.outputTokens += entry.usage.outputTokens ?? 0
      if (typeof entry.usage.totalTokens === 'number') {
        acc.tokens += entry.usage.totalTokens
        acc.tokenCalls += 1
      }
      if (entry.usage.costUsd !== null) {
        acc.cost += entry.usage.costUsd
        if (entry.usage.costSource === 'estimate') acc.estimated += 1
      } else {
        acc.uncosted += 1
      }
      if (entry.quality) {
        acc.qualitySum += entry.quality.score
        acc.rated += 1
      }
      return acc
    },
    {
      calls: 0,
      timeMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      tokens: 0,
      tokenCalls: 0,
      cost: 0,
      estimated: 0,
      uncosted: 0,
      qualitySum: 0,
      rated: 0,
    },
  )

  return (
    <Card
      title="Uso e custo da IA"
      subtitle="Tokens, custo, tempo e qualidade por chamada"
      icon={Gauge}
      badge={
        history.length > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
            title="Zerar histórico de métricas"
          >
            <RotateCcw className="size-3" />
            Zerar
          </button>
        )
      }
    >
      {showQuality && (
        <div className={last ? 'mb-3 border-b border-white/5 pb-3' : ''}>
          <QualitySection quality={quality} busy={qualityBusy} onEditFrame={onEditFrame} />
        </div>
      )}

      {!last ? (
        !showQuality && (
          <p className="text-[11px] leading-relaxed text-slate-500">
            Gere ou corrija frames para ver os tokens usados, o custo, o tempo e
            a qualidade de cada chamada. O total acumulado fica salvo neste navegador.
          </p>
        )
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
                icon={Hash}
                label="Tokens usados"
                value={formatTokens(last.usage.totalTokens)}
                hint={
                  last.usage.totalTokens !== null
                    ? `${formatTokens(last.usage.inputTokens)} entrada · ${formatTokens(last.usage.outputTokens)} saída`
                    : `${last.usage.imageCount} imagem(ns) · tokens não informados`
                }
              />
              <Metric
                icon={Coins}
                label="Custo"
                value={formatUsd(last.usage.costUsd)}
                hint={
                  last.usage.costSource === 'estimate'
                    ? 'Estimativa baseada nos preços do modelo'
                    : last.usage.costSource === 'provider'
                      ? 'Valor informado pelo provedor'
                      : 'Custo não informado pelo provedor'
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
                hint={`${totals.calls} ${plural(totals.calls, 'chamada')}`}
              />
              <Metric
                icon={Hash}
                label="Tokens usados"
                value={totals.tokenCalls > 0 ? formatTokens(totals.tokens) : '—'}
                hint={
                  totals.tokenCalls > 0
                    ? `${formatTokens(totals.inputTokens)} entrada · ${formatTokens(totals.outputTokens)} saída`
                    : 'Provedor não informou tokens'
                }
              />
              <Metric
                icon={Clock}
                label="Tempo total"
                value={formatDuration(totals.timeMs)}
                hint={`${totals.calls} chamada${totals.calls === 1 ? '' : 's'}`}
              />
              {totals.rated > 0 && (
                <Metric
                  icon={Sparkles}
                  label="Qualidade média"
                  value={`${Math.round(totals.qualitySum / totals.rated)}/100`}
                  hint={`${totals.rated} ${plural(totals.rated, 'resultado avaliado', 'resultados avaliados')}`}
                  className="col-span-2"
                />
              )}
            </div>
            {(totals.estimated > 0 || totals.uncosted > 0) && (
              <p className="mt-1.5 text-[10px] leading-relaxed text-amber-300/80">
                {totals.estimated > 0 &&
                  `${totals.estimated} ${plural(totals.estimated, 'valor estimado', 'valores estimados')}. `}
                {totals.uncosted > 0 &&
                  `${totals.uncosted} ${plural(totals.uncosted, 'chamada')} sem custo calculável (não ${plural(totals.uncosted, 'somada')}).`}
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
                      {entry.quality && (
                        <span title="Nota de qualidade do resultado"> · Q{entry.quality.score}</span>
                      )}
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
