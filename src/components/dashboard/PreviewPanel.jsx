import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Film,
  Grid3X3,
  Image as ImageIcon,
  ImageOff,
  LayoutGrid,
  Loader2,
  Maximize2 as Maximize,
  RefreshCw,
  Scan,
  Square,
  Upload,
} from 'lucide-react'

import { sliceSpritesheet } from '../../utils/imagePipeline'
import { formatElapsed } from '../../lib/api'
import { Alert, Card, Field, Pill, inputClass, labelClass } from './ui'

/**
 * Um dos lados do player (referência ou resultado) para UM frame.
 *
 * @param {{
 *   label: string,
 *   accent: 'slate' | 'cyan',
 *   frame: string | null | undefined,
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

  const safeTotal = Math.max(1, Math.floor(totalFrames || 0))
  const safeIndex = Math.max(0, Math.min(Math.floor(frameIndex || 0), safeTotal - 1))

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
            src={String(frame)}
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
 * Coluna central: frames lado a lado com navegação frame a frame e controle de grid.
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
 *   columns: string,
 *   rows: string,
 *   autoSlice: boolean,
 *   onColumnsChange: (value: string) => void,
 *   onRowsChange: (value: string) => void,
 *   onAutoSliceChange: (value: boolean) => void,
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
  columns,
  rows,
  autoSlice,
  onColumnsChange,
  onRowsChange,
  onAutoSliceChange,
}) {
  const refs = Array.isArray(referenceFrames) ? referenceFrames : []
  const gens = Array.isArray(frames) ? frames : []
  const totalFrames = Math.max(refs.length, gens.length)
  const safeTotal = Math.max(1, totalFrames)
  const safeIndex = totalFrames > 0 ? Math.max(0, Math.min(Math.floor(currentFrameIndex || 0), totalFrames - 1)) : 0
  const hasFrames = gens.length > 0
  const hasReference = refs.length > 0

  // Estado para os frames após slicing (grid aplicado)
  const [slicedFrames, setSlicedFrames] = useState([])
  const [slicing, setSlicing] = useState(false)

  // Recalcular slicing quando mudar colunas/linhas/autoSlice ou frames
  useEffect(() => {
    if (!autoSlice || gens.length === 0) {
      setSlicedFrames(gens)
      return
    }

    const cols = Math.max(1, Number.parseInt(columns, 10) || 1)
    const rows = Math.max(1, Number.parseInt(rows, 10) || 1)
    const isSingleImage = cols === 1 && rows === 1

    if (isSingleImage) {
      setSlicedFrames(gens)
      return
    }

    setSlicing(true)
    ;(async () => {
      try {
        // Se há um único frame (spritesheet inteiro), fatiar em grid
        if (gens.length === 1) {
          const sliced = await sliceSpritesheet(gens[0], cols, rows)
          if (sliced.length > 0) {
            setSlicedFrames(sliced)
            return
          }
        }
        // Se já há múltiplos frames, manter como está
        setSlicedFrames(gens)
      } catch (error) {
        console.error('[slice-spritesheet]', error)
        setSlicedFrames(gens)
      } finally {
        setSlicing(false)
      }
    })()
  }, [gens, columns, rows, autoSlice])

  const displayFrames = slicedFrames.length > 0 ? slicedFrames : gens
  const displayTotal = Math.max(refs.length, displayFrames.length)

  if (totalFrames > 0 && (currentFrameIndex == null || currentFrameIndex < 0 || currentFrameIndex >= totalFrames)) {
    // Índice fora do range, corrigir silenciosamente
  }

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
              max={safeTotal}
              value={safeIndex + 1}
              onChange={(event) => {
                const v = Number.parseInt(event.target.value, 10)
                if (!Number.isNaN(v) && v >= 1 && v <= safeTotal) {
                  onCurrentFrameIndexChange(v - 1)
                }
              }}
              className="w-12 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-slate-100 focus:border-cyan-400/60 focus:outline-none"
            />
            <span className="text-[11px] text-slate-500">de {safeTotal}</span>
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
            frame={hasReference && refs.length > 0 ? refs[safeIndex % refs.length] : null}
            frameIndex={safeIndex}
            totalFrames={refs.length}
            loading={referenceBusy}
            loadingLabel="Processando referência…"
            emptyLabel="Nenhuma referência de movimento."
          />
          <FrameView
            label="Novo frame"
            accent="cyan"
            frame={displayFrames.length > 0 ? displayFrames[safeIndex % displayFrames.length] : null}
            frameIndex={safeIndex}
            totalFrames={displayFrames.length}
            loading={generating || slicing}
            loadingLabel={slicing ? 'Aplicando grade…' : 'Gerando frame…'}
            emptyLabel="Gere um spritesheet para ver o resultado aqui."
          />
        </div>

        {generationError && (
          <Alert tone="error" className="mt-3">
            {generationError}
          </Alert>
        )}
      </Card>

      {/* Controle de Grid - aqui no meio, não apaga a imagem ao mudar */}
      <Card
        title="Grade de Frames (Grid)"
        subtitle="Divide o spritesheet gerado em frames individuais para exibição"
        icon={Grid3X3}
        bodyClassName="p-3"
      >
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
              <Grid3X3 className="size-3.5 text-cyan-400" />
              Auto-fatiar grid
            </span>
            <input
              type="checkbox"
              checked={autoSlice}
              onChange={(event) => onAutoSliceChange(event.target.checked)}
              className="size-4 accent-cyan-400"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={`${labelClass} mb-1`} htmlFor="grid-columns">
                Colunas
              </label>
              <input
                id="grid-columns"
                type="number"
                min={1}
                max={64}
                value={columns}
                disabled={!autoSlice}
                onChange={(event) => onColumnsChange(event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={`${labelClass} mb-1`} htmlFor="grid-rows">
                Linhas
              </label>
              <input
                id="grid-rows"
                type="number"
                min={1}
                max={64}
                value={rows}
                disabled={!autoSlice}
                onChange={(event) => onRowsChange(event.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-500">
              {slicing ? (
                <span className="inline-flex items-center gap-1.5 text-cyan-300">
                  <Loader2 className="size-3 animate-spin" />
                  aplicando grade…
                </span>
              ) : (
                `${displayFrames.length} frame${displayFrames.length === 1 ? '' : 's'}`
              )}
            </span>
            {!autoSlice && (
              <span className="text-amber-300 text-[10px]">
                Grade desativada — imagem única
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Filmstrip */}
      <Card
        title="Filmstrip"
        subtitle="Todos os frames individuais"
        icon={Film}
        badge={<Pill tone={hasFrames ? 'cyan' : 'neutral'}>{displayFrames.length} frames</Pill>}
        bodyClassName="p-3"
      >
        {!displayFrames.length ? (
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
                  <div className="bg-checkerboard relative grid aspect-square place-items-center p-1.5 cursor-pointer" onClick={() => onCurrentFrameIndexChange(index)}>
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

        {displayFrames.length && (
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="size-3">✎</span>
            Clique em qualquer frame para vê-lo lado a lado. Edite um frame para corrigi-lo individualmente.
          </p>
        )}
      </Card>
    </div>
  )
}
