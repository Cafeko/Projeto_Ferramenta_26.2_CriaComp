import { Film } from 'lucide-react'

import { Card, Pill } from './ui'

/**
 * Lista de frames individuais com edição por frame.
 *
 * @param {{
 *   frames: string[],
 *   currentFrameIndex: number,
 *   onCurrentFrameIndexChange: (value: number) => void,
 *   onEditFrame: (index: number) => void,
 *   editingFrame: number | null,
 * }} props
 */
export default function AnimationFramesPanel({
  frames,
  currentFrameIndex,
  onCurrentFrameIndexChange,
  onEditFrame,
  editingFrame,
}) {
  const displayFrames = Array.isArray(frames) ? frames : []
  const safeTotal = Math.max(1, displayFrames.length)
  const safeIndex = Math.max(
    0,
    Math.min(Math.floor(currentFrameIndex || 0), safeTotal - 1),
  )
  const hasFrames = displayFrames.length > 0

  return (
    <Card
      title="Animation Frames"
      subtitle="Todos os frames individuais"
      icon={Film}
      badge={
        <Pill tone={hasFrames ? 'cyan' : 'neutral'}>
          {displayFrames.length} frames
        </Pill>
      }
      bodyClassName="p-3"
      help={
        <>
          <p>
            Clique em um frame para vê-lo lado a lado. O botão{' '}
            <strong>[ Editar ]</strong> abre a correção individual daquele frame.
          </p>
          <p>
            A correção individual envia só o frame escolhido e pode ser mantida
            como candidata antes de substituir o atual.
          </p>
        </>
      }
    >
      {!displayFrames.length ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center">
          <Film className="size-7 text-slate-600" />
          <p className="text-[12px] font-medium text-slate-400">
            Nenhum frame gerado ainda
          </p>
          <p className="max-w-sm text-[11px] leading-relaxed text-slate-500">
            Configure o personagem e clique em{' '}
            <span className="font-mono text-slate-400">
              [ GERAR NOVO SPRITESHEET ]
            </span>
            . Os frames aparecem aqui com opção de edição individual.
          </p>
        </div>
      ) : (
        <div className="grid max-h-[300px] grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-2 overflow-y-auto pr-1">
          {displayFrames.map((frame, index) => {
            const isCurrent = index === safeIndex
            const isEditing = editingFrame === index
            const frameKey = String(frame ?? '').slice(-24)
            return (
              <figure
                key={`${index}-${frameKey}`}
                className={`overflow-hidden rounded-lg border bg-black/20 transition ${
                  isCurrent
                    ? 'border-cyan-400/70 shadow-md shadow-cyan-950/50 ring-1 ring-cyan-400'
                    : 'border-white/10 hover:border-white/25'
                } ${
                  isEditing ? 'border-violet-400/70 shadow-violet-950/50' : ''
                }`}
              >
                <div
                  className="bg-checkerboard relative grid aspect-square cursor-pointer place-items-center p-1.5"
                  onClick={() => onCurrentFrameIndexChange(index)}
                >
                  <img
                    src={String(frame)}
                    alt={`Frame ${index + 1}`}
                    className="pixelated max-h-full max-w-full object-contain"
                  />
                  <span className="absolute top-1 left-1 rounded bg-canvas/80 px-1 py-0.5 font-mono text-[10px] font-semibold text-slate-300 ring-1 ring-white/10">
                    #{index + 1}
                  </span>
                  {isCurrent && (
                    <span className="absolute bottom-1 left-1 rounded bg-cyan-400/90 px-1 py-0.5 text-[9px] font-bold text-slate-950">
                      ATUAL
                    </span>
                  )}
                  {isEditing && (
                    <span className="absolute top-1 right-1 rounded bg-violet-400/90 px-1 py-0.5 text-[9px] font-bold text-slate-950">
                      EDITANDO
                    </span>
                  )}
                </div>
                <figcaption className="border-t border-white/5 p-1">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onEditFrame(index)
                    }}
                    className={`inline-flex w-full items-center justify-center gap-1 rounded px-1.5 py-1 font-mono text-[10px] font-semibold transition ${
                      isEditing
                        ? 'bg-violet-400/15 text-violet-200'
                        : 'text-slate-400 hover:bg-white/5 hover:text-cyan-200'
                    }`}
                  >
                    <span className="size-2.5">✎</span>
                    [ Editar ]
                  </button>
                </figcaption>
              </figure>
            )
          })}
        </div>
      )}
    </Card>
  )
}
