import { Loader2, Sparkles, Wand2 } from 'lucide-react'

import { qualityGrade } from '../../utils/qualityMetrics'
import { Pill } from './ui'

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

function plural(count, singular, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm
}

function ScoreBar({ label, value, hint, title }) {
  const tone = value === null ? null : qualityGrade(value).tone
  return (
    <div title={title}>
      <div className="flex items-baseline justify-between gap-2 text-[10px]">
        <span className="font-semibold text-slate-400">{label}</span>
        <span className="font-mono text-slate-300">
          {value === null ? '—' : value}
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
        {value !== null && (
          <div
            className={`h-full rounded-full ${BAR_TONES[tone]}`}
            style={{ width: `${value}%` }}
          />
        )}
      </div>
      {hint && <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p>}
    </div>
  )
}

/**
 * Nota de qualidade da imagem exibida (pose, consistência e pixel art).
 *
 * @param {{
 *   quality: import('../../utils/qualityMetrics').QualityReport | null,
 *   busy?: boolean,
 *   onEditFrame?: ((index: number) => void) | null,
 * }} props
 */
export default function QualityCard({ quality, busy = false, onEditFrame = null }) {
  if (!quality) {
    return (
      <div className="rounded-lg border border-white/5 bg-black/20 p-2.5">
        <p className="flex items-center gap-1.5 text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
          <Sparkles className="size-3" />
          Qualidade do resultado
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] leading-relaxed text-slate-500">
          {busy ? (
            <>
              <Loader2 className="size-3 animate-spin" />
              Avaliando a qualidade do resultado…
            </>
          ) : (
            'Gere uma imagem para avaliar a qualidade.'
          )}
        </p>
      </div>
    )
  }

  const grade = qualityGrade(quality.score)
  const colors = typeof quality.colors === 'number' ? quality.colors : null
  const background = BACKGROUND_LABELS[quality.backgroundKind] || null
  const worst = quality.worstFrameIndex

  return (
    <div className="rounded-lg border border-white/5 bg-black/20 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
          <Sparkles className="size-3" />
          Qualidade do resultado
          {busy && <Loader2 className="size-3 animate-spin text-slate-500" />}
        </p>
        <Pill tone={grade.tone}>{grade.label}</Pill>
      </div>

      <div className="rounded-md border border-white/5 bg-black/20 px-2.5 py-2">
        <p className="text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
          Nota
        </p>
        <p className="mt-0.5 font-mono text-[15px] font-semibold text-slate-100">
          {quality.score}
          <span className="text-[11px] text-slate-500">/100</span>
        </p>

        <div className="mt-2 space-y-2">
          <ScoreBar
            label="Fidelidade de pose"
            value={quality.pose ?? null}
            title="Silhueta de cada frame comparada com o frame de referência correspondente"
            hint={
              quality.pose === null || quality.pose === undefined
                ? 'Sem referência fatiada para comparar'
                : null
            }
          />
          <ScoreBar
            label="Consistência do personagem"
            value={quality.consistency ?? null}
            title="Semelhança das cores do personagem entre os frames"
          />
          <ScoreBar
            label="Pixel art utilizável"
            value={quality.pixelArt ?? null}
            title="Paleta enxuta e fundo fácil de remover"
            hint={
              colors !== null
                ? `~${colors} cores dominantes${
                    background ? ` · ${background}` : ''
                  }`
                : null
            }
          />
        </div>
      </div>

      {quality.emptyFrames > 0 && (
        <p className="mt-1.5 text-[10px] leading-relaxed text-amber-300/80">
          {quality.emptyFrames}{' '}
          {plural(quality.emptyFrames, 'frame vazio', 'frames vazios')}: a nota
          foi reduzida proporcionalmente.
        </p>
      )}

      {worst !== null && worst !== undefined && onEditFrame && (
        <button
          type="button"
          onClick={() => onEditFrame(worst)}
          className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-cyan-300 transition hover:bg-cyan-400/10"
          title="Abrir a correção individual deste frame"
        >
          <Wand2 className="size-3" />
          Frame {worst + 1} destoa (nota {quality.perFrame?.[worst]}) — corrigir
        </button>
      )}
    </div>
  )
}
