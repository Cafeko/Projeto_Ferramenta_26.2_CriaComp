import {
  ChevronLeft,
  ChevronRight,
  Film,
  ImageOff,
  LayoutGrid,
  Maximize2 as Maximize,
  RefreshCw,
  Square,
} from 'lucide-react'

import { formatElapsed } from '../../lib/api'
import { Alert, Card, Pill } from './ui'

/**
 * Um dos lados do player (referência ou resultado) para UM frame.
 *
 * @param {{
 *   label: string,
 *   accent: 'slate' | 'cyan',
 *   frame: string | null,
 *   frameIndex: number,
 *   totalFrames: number,
 *   loading: boolean,
 *   loadingLabel: string,
 *   emptyLabel: string,
 * }} props
 */
function FrameView({ label, accent, frame, frameIndex, totalFrames, loading, loadingLabel, emptyLabel }) {
  const accentUi =
    accent === 'cyan'
      ? 'border-cyan-400/25 bg-cyan-400/[0.04]'
      : 'border-white/10 bg-white/[0.02]'

  const safeTotal = totalFrames > 0 ? totalFrames : 1
  const safeIndex = frameIndex % safeTotal

  return (
    <div className={`rounded-xl border p-2.5 ${accentUi}`}>
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <span
          className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase ${
            accent === 'cyan' ? 'text-cyan-300' : 'text-slate-400'
          }`}
        >
          {accent === 'cyan' ? <Maximize className="size-3.5" /> : <LayoutGrid className="size-3.5" />}
          {label}
        </span>
        <span className="font-mono text-[10px] text-slate-500">
          {safeTotal > 0 ? `${safeIndex + 1}/${safeTotal}` : '—'}
        </span>
      </div>

      <div className="bg-checkerboard relative grid h-64 place-items-center overflow-hidden rounded-lg border border-white/5 sm:h-72">
        {frame ? (
          <img
            src={frame}
            alt={label}
            className="pixelated max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="flex max-w-[80%] flex-col items-center justify-center text-center">
            <ImageOff className="size-6 text-slate-600" />
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{emptyLabel}</p>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-canvas/80 backdrop-blur-sm">
            <span className="size-6 animate-spin text-cyan-300" />
            <p className="text-[11px] font-medium text-cyan-200">{loadingLabel}</p>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Coluna central: frames lado a lado com navegação frame a frame.
 *
 * @param {{
 *   referenceFrames: string[],
 *   frames: string[],
 *   fps: number,
 *   onFpsChange: (value: number) => void,
 *   viewMode: 'loop' | 'frame-by-frame',
 *   onViewModeChange: (value: 'loop' | 'frame-by-frame') => void,
 *   currentFrameIndex: number,
 *   onCurrentFrameIndexChange: (value: number) => void,
 *   generating: boolean,
 *   referenceBusy: boolean,
 *   generationError: string,
 *   onEditFrame: (index: number) => void,
 *   editingFrame: number | null,
 * }} props
 */
export default function PreviewPanel({
  referenceFrames,
  frames,
  fps,
  onFpsChange,
  viewMode,
  onViewModeChange,
  currentFrameIndex,
  onCurrentFrameIndexChange,
  generating,
  referenceBusy,
  generationError,
  onEditFrame,
  editingFrame,
}) {
  const refs = Array.isArray(referenceFrames) ? referenceFrames : []
  const gens = Array.isArray(frames) ? frames : []
  const totalFrames = Math.max(refs.length, gens.length)
  const safeIndex = totalFrames > 0 ? Math.max(0, Math.min(currentFrameIndex, totalFrames - 1)) : 0
  const hasFrames = gens.length > 0
  const hasReference = refs.length > 0

  return (
    <div className="space-y-4">
      <Card
        title="Frames Lado a Lado"
        subtitle="Frame original vs. novo — navegue quadro a quadro"
        icon={LayoutGrid}
        badge={
          <Pill tone={viewMode === 'loop' ? 'green' : 'neutral'}>
            <span
              className={`size-1.5 rounded-full ${
                viewMode === 'loop' ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'
              }`}
            />
            {viewMode === 'loop' ? 'loop' : 'frame a frame'}
          </Pill>
        }
        bodyClassName="p-3.5"
      >
        {/* Controles de navegação */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onCurrentFrameIndexChange(Math.max(0, safeIndex - 1))}
              disabled={safeIndex === 0 || totalFrames === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
              Anterior
            </button>
            <button
              type="button"
              onClick={() => onCurrentFrameIndexChange(Math.min(totalFrames - 1, safeIndex + 1))}
              disabled={safeIndex >= totalFrames - 1 || totalFrames === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Próximo
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase">Quadro</span>
            <input
              type="number"
              min={1}
              max={Math.max(1, totalFrames)}
              value={safeIndex + 1}
              onChange={(event) => {
                const v = Number.parseInt(event.target.value, 10)
                if (!Number.isNaN(v) && v >= 1 && v <= Math.max(1, totalFrames)) {
                  onCurrentFrameIndexChange(v - 1)
                }
              }}
              className="w-12 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-slate-100 focus:border-cyan-400/60 focus:outline-none"
            />
            <span className="text-[11px] text-slate-500">de {Math.max(1, totalFrames)}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => onViewModeChange((v) => (v === 'loop' ? 'frame-by-frame' : 'loop'))}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-semibold transition ${
                viewMode === 'loop'
                  ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
                  : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:bg-white/[0.04]'
              }`}
            >
              {viewMode === 'loop' ? <RefreshCw className="size-3.5" /> : <Square className="size-3.5" />}
              {viewMode === 'loop' ? 'Loop' : 'Frame a frame'}
            </button>
          </div>
        </div>

        {/* Player de frames lado a lado */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FrameView
            label="Original"
            accent="slate"
            frame={hasReference ? refs[safeIndex % refs.length] : null}
            frameIndex={safeIndex}
            totalFrames={refs.length}
            loading={referenceBusy}
            loadingLabel="Processando referência…"
            emptyLabel="Nenhuma referência de movimento."
          />
          <FrameView
            label="Novo frame"
            accent="cyan"
            frame={hasFrames ? gens[safeIndex % gens.length] : null}
            frameIndex={safeIndex}
            totalFrames={gens.length}
            loading={generating}
            loadingLabel="Gerando frame…"
            emptyLabel="Gere um spritesheet para ver o resultado aqui."
          />
        </div>

        {generationError && (
          <Alert tone="error" className="mt-3">
            {generationError}
          </Alert>
        )}
      </Card>

      {/* Filmstrip */}
      <Card
        title="Filmstrip"
        subtitle="Todos os frames individuais"
        icon={Film}
        badge={<Pill tone={hasFrames ? 'cyan' : 'neutral'}>{gens.length} frames</Pill>}
        bodyClassName="p-3"
      >
        {!hasFrames ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center">
            <Film className="size-7 text-slate-600" />
            <p className="text-[12px] font-medium text-slate-400">
              Nenhum frame gerado ainda
            </p>
            <p className="max-w-sm text-[11px] leading-relaxed text-slate-500">
              Configure o personagem e clique em{' '}
              <span className="font-mono text-slate-400">[ GERAR NOVO SPRITESHEET ]</span>.
              Os frames aparecem aqui com opção de edição individual.
            </p>
          </div>
        ) : (
          <div className="grid max-h-[300px] grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-2 overflow-y-auto pr-1">
            {gens.map((frame, index) => {
              const isCurrent = index === safeIndex
              const isEditing = editingFrame === index
              return (
                <figure
                  key={`${index}-${String(frame).slice(-24)}`}
                  className={`overflow-hidden rounded-lg border bg-black/20 transition ${
                    isCurrent
                      ? 'border-cyan-400/70 shadow-md shadow-cyan-950/50 ring-1 ring-cyan-400'
                      : 'border-white/10 hover:border-white/25'
                  } ${
                    isEditing ? 'border-violet-400/70 shadow-violet-950/50' : ''
                  }`}
                >
                  <div className="bg-checkerboard relative grid aspect-square place-items-center p-1.5 cursor-pointer" onClick={() => onCurrentFrameIndexChange(index)}>
                    <img
                      src={frame}
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

        {hasFrames && (
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="size-3">✎</span>
            Clique em qualquer frame para vê-lo lado a lado. Edite um frame para corrigi-lo individualmente.
          </p>
        )}
      </Card>
    </div>
  )
}
