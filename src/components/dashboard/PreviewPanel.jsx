import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  Film,
  ImageOff,
  LayoutGrid,
  Maximize2 as Maximize,
  RefreshCw,
  Square,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

import { Alert, Card, Pill } from './ui'

const MIN_ZOOM = 1
const MAX_ZOOM = 8
const MAX_PAN = 1.5

function clampPan(value) {
  return Math.min(MAX_PAN, Math.max(-MAX_PAN, value))
}

/**
 * Roda do mouse com `preventDefault` (o React registra wheel como passivo).
 * Mantém o callback atual em uma ref para não reanexar o listener a cada zoom.
 */
function useWheelZoom(ref, onStep, enabled = true) {
  const stepRef = useRef(onStep)
  stepRef.current = onStep

  useEffect(() => {
    const element = ref.current
    if (!enabled || !element) return undefined
    const handle = (event) => {
      event.preventDefault()
      stepRef.current(event.deltaY < 0 ? 1 : -1)
    }
    element.addEventListener('wheel', handle, { passive: false })
    return () => element.removeEventListener('wheel', handle)
  }, [ref, enabled])
}

/**
 * Um dos lados do player (referência ou resultado) para UM frame.
 *
 * O quadro tem zoom, arraste e tela cheia para inspecionar frames que não
 * cabem ou que têm detalhes pequenos. O zoom/posição é mantido ao navegar
 * entre frames e é redefinido quando o tamanho da imagem muda.
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
 *   viewMode: 'loop' | 'frame-by-frame',
 *   onViewModeChange: (value: 'loop' | 'frame-by-frame') => void,
 *   fps: number,
 *   onFpsChange: (value: number) => void,
 *   onPrev: () => void,
 *   onNext: () => void,
 * }} props
 */
function FrameView({
  label,
  accent,
  frame,
  frameIndex,
  totalFrames,
  loading,
  loadingLabel,
  emptyLabel,
  viewMode,
  onViewModeChange,
  fps,
  onFpsChange,
  onPrev,
  onNext,
}) {
  const safeTotal = Math.max(1, Math.floor(totalFrames || 0))
  const safeIndex = Math.max(0, Math.min(Math.floor(frameIndex || 0), safeTotal - 1))

  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [expanded, setExpanded] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef(null)
  const inlineRef = useRef(null)
  const fullscreenRef = useRef(null)
  const lastSizeRef = useRef('')
  const hasFrame = Boolean(frame)
  // Mantém os callbacks de navegação atuais sem reanexar o listener de teclado.
  const navRef = useRef({ onPrev, onNext })
  navRef.current = { onPrev, onNext }

  const resetView = () => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }

  // Atualização funcional: cliques/scroll rápidos não perdem o zoom anterior.
  const zoomBy = (factor) => {
    setZoom((current) =>
      Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * factor)),
    )
  }
  const wheelStep = (direction) => zoomBy(direction > 0 ? 1.15 : 1 / 1.15)

  // Ao voltar para 100%, recentraliza a imagem.
  useEffect(() => {
    if (zoom !== MIN_ZOOM) return
    setOffset((current) =>
      current.x === 0 && current.y === 0 ? current : { x: 0, y: 0 },
    )
  }, [zoom])

  useWheelZoom(inlineRef, wheelStep)
  useWheelZoom(fullscreenRef, wheelStep, expanded)

  const startDrag = (event) => {
    if (!hasFrame) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      // Ponteiro sintético/antigo: o arraste continua via eventos normais.
    }
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      ox: offset.x,
      oy: offset.y,
    }
    setDragging(true)
  }

  const moveDrag = (event) => {
    const drag = dragRef.current
    if (!drag) return
    const rect = event.currentTarget.getBoundingClientRect()
    setOffset({
      x: clampPan(drag.ox + (event.clientX - drag.x) / Math.max(1, rect.width)),
      y: clampPan(drag.oy + (event.clientY - drag.y) / Math.max(1, rect.height)),
    })
  }

  const endDrag = (event) => {
    if (!dragRef.current) return
    dragRef.current = null
    setDragging(false)
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    } catch {
      // Ignora ponteiros que não estavam capturados.
    }
  }

  const handleImageLoad = (event) => {
    const image = event.currentTarget
    const size = `${image.naturalWidth}x${image.naturalHeight}`
    // Uma imagem nova com outras dimensões recomeça enquadrada.
    if (lastSizeRef.current && lastSizeRef.current !== size) resetView()
    lastSizeRef.current = size
  }

  useEffect(() => {
    if (!expanded) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setExpanded(false)
        return
      }
      const tag = event.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (event.key === 'ArrowLeft') navRef.current.onPrev?.()
      else if (event.key === 'ArrowRight') navRef.current.onNext?.()
      else if (event.key === '+' || event.key === '=') zoomBy(1.25)
      else if (event.key === '-') zoomBy(1 / 1.25)
      else if (event.key === '0') resetView()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
    // As funções usam o zoom atual; o efeito é reanexado quando ele muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, zoom])

  const transformStyle = {
    transform: `translate(${offset.x * 100}%, ${offset.y * 100}%) scale(${zoom})`,
    transformOrigin: 'center center',
    transition: dragging ? 'none' : 'transform 80ms ease-out',
  }

  const controls = (fullscreen = false) => (
    <div
      className={`flex items-center gap-0.5 rounded-md border border-white/10 bg-black/70 px-0.5 py-0.5 text-slate-300 backdrop-blur ${
        fullscreen
          ? ''
          : 'pointer-events-none absolute top-1.5 right-1.5 z-10 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100'
      }`}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => zoomBy(1 / 1.25)}
        title="Diminuir zoom"
        aria-label="Diminuir zoom"
        className="grid size-6 place-items-center rounded transition hover:bg-white/10"
      >
        <ZoomOut className="size-3" />
      </button>
      <button
        type="button"
        onClick={resetView}
        title="Redefinir zoom e posição"
        aria-label="Redefinir zoom e posição"
        className="min-w-11 rounded px-1 py-1 font-mono text-[10px] tabular-nums text-slate-300 transition hover:bg-white/10"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={() => zoomBy(1.25)}
        title="Aumentar zoom"
        aria-label="Aumentar zoom"
        className="grid size-6 place-items-center rounded transition hover:bg-white/10"
      >
        <ZoomIn className="size-3" />
      </button>
      {!fullscreen && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title="Ver em tela cheia"
          aria-label="Ver em tela cheia"
          className="grid size-6 place-items-center rounded transition hover:bg-white/10"
        >
          <Maximize className="size-3" />
        </button>
      )}
    </div>
  )

  const viewer = (ref, fullscreen = false) => (
    <div
      ref={ref}
      data-frame-viewer={fullscreen ? 'fullscreen' : 'inline'}
      className={`group bg-checkerboard relative overflow-hidden border ${
        fullscreen
          ? 'min-h-0 flex-1 rounded-xl border-white/10'
          : 'h-72 rounded-lg border-white/15 sm:h-80'
      } ${hasFrame ? 'cursor-grab touch-none select-none' : ''} ${
        dragging ? 'cursor-grabbing' : ''
      }`}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={resetView}
    >
      {hasFrame ? (
        <img
          src={String(frame)}
          alt={label}
          draggable={false}
          data-frame-image="true"
          onLoad={handleImageLoad}
          className="pixelated pointer-events-none absolute inset-0 h-full w-full object-contain select-none"
          style={transformStyle}
        />
      ) : (
        <div className="grid h-full place-items-center">
          <div className="flex max-w-[80%] flex-col items-center justify-center text-center">
            <ImageOff className="size-6 text-slate-600" />
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              {emptyLabel}
            </p>
          </div>
        </div>
      )}

      {hasFrame && controls(fullscreen)}

      {loading && !fullscreen && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-canvas/80 backdrop-blur-sm">
          <span className="size-6 animate-spin text-cyan-300" />
          <p className="text-[11px] font-medium text-cyan-200">{loadingLabel}</p>
        </div>
      )}
    </div>
  )

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
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

      {viewer(inlineRef)}

      {expanded &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex flex-col bg-[#070b12]/98 p-3 sm:p-4">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold tracking-wide text-slate-200 uppercase">
                  {label}
                </span>
                <span className="font-mono text-[10px] text-slate-500">
                  {safeTotal > 0 ? `${safeIndex + 1}/${safeTotal}` : '—'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {controls(true)}
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  title="Fechar (Esc)"
                  aria-label="Fechar tela cheia"
                  className="grid size-7 place-items-center rounded-md border border-white/10 bg-black/70 text-slate-300 transition hover:bg-white/10"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {viewer(fullscreenRef, true)}

            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => navRef.current.onPrev?.()}
                disabled={safeTotal === 0}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-semibold text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="size-3.5" />
                Anterior
              </button>
              <button
                type="button"
                onClick={() => navRef.current.onNext?.()}
                disabled={safeTotal === 0}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-semibold text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Próximo
                <ChevronRight className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  onViewModeChange?.(
                    viewMode === 'loop' ? 'frame-by-frame' : 'loop',
                  )
                }
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition ${
                  viewMode === 'loop'
                    ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
                    : 'border-white/10 bg-black/40 text-slate-300 hover:bg-white/10'
                }`}
              >
                {viewMode === 'loop' ? (
                  <RefreshCw className="size-3.5" />
                ) : (
                  <Square className="size-3.5" />
                )}
                {viewMode === 'loop' ? 'Animação' : 'Frame a frame'}
              </button>
              {viewMode === 'loop' && (
                <label className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                  FPS
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={fps}
                    aria-label="Quadros por segundo"
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10)
                      if (Number.isFinite(value)) {
                        onFpsChange?.(Math.min(60, Math.max(1, value)))
                      }
                    }}
                    className="w-14 rounded-md border border-white/10 bg-black/40 px-1.5 py-1 font-mono text-[10px] text-slate-100 focus:border-cyan-400/60 focus:outline-none"
                  />
                </label>
              )}
            </div>

            <p className="mt-1.5 text-center text-[10px] text-slate-600">
              Arraste para mover · ←/→ troca de frame · +/− zoom · duplo
              clique/0 redefine · Esc sai
            </p>
          </div>,
          document.body,
        )}
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
 *   slicing: boolean,
 *   children?: import('react').ReactNode,
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
  slicing,
  children,
}) {
  const refs = Array.isArray(referenceFrames) ? referenceFrames : []
  const gens = Array.isArray(frames) ? frames : []
  const totalFrames = Math.max(refs.length, gens.length)
  const safeTotal = Math.max(1, totalFrames)
  const safeIndex = totalFrames > 0 ? Math.max(0, Math.min(Math.floor(currentFrameIndex || 0), totalFrames - 1)) : 0
  const hasFrames = gens.length > 0
  const hasReference = refs.length > 0

  // Navegação circular: do último vai para o primeiro e vice-versa.
  const goPrev = () => {
    if (totalFrames === 0) return
    onCurrentFrameIndexChange((safeIndex - 1 + totalFrames) % totalFrames)
  }
  const goNext = () => {
    if (totalFrames === 0) return
    onCurrentFrameIndexChange((safeIndex + 1) % totalFrames)
  }

  // Os frames já chegam fatiados do MainDashboard. A grade é recalculada lá
  // a partir do spritesheet bruto, então trocar colunas/linhas não apaga nada.
  const displayFrames = gens

  return (
    <div className="space-y-4">
      <Card
        title="Visualização dos frames"
        subtitle="Original e novo frame lado a lado"
        icon={LayoutGrid}
        bodyClassName="p-3.5"
      >
        {/* Barra de modo: frame a frame ou animação */}
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/10 pb-3">
          <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
            Modo:
          </span>

          <div className="inline-flex overflow-hidden rounded-md border border-white/15">
            <button
              type="button"
              onClick={() => onViewModeChange('frame-by-frame')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold transition ${
                viewMode === 'frame-by-frame'
                  ? 'bg-cyan-400/15 text-cyan-200'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <Square className="size-3" />
              Frame a frame
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('loop')}
              className={`inline-flex items-center gap-1.5 border-l border-white/10 px-2.5 py-1.5 text-[11px] font-semibold transition ${
                viewMode === 'loop'
                  ? 'bg-cyan-400/15 text-cyan-200'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <RefreshCw className="size-3" />
              Animação
            </button>
          </div>

          {viewMode === 'frame-by-frame' ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={goPrev}
                disabled={totalFrames === 0}
                className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/20 px-2 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="size-3.5" />
                Anterior
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={totalFrames === 0}
                className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/20 px-2 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Próximo
                <ChevronRight className="size-3.5" />
              </button>

              <span className="ml-1 text-[11px] text-slate-400">Frame:</span>
              <input
                type="number"
                min={1}
                max={safeTotal}
                value={safeIndex + 1}
                aria-label="Quadro atual"
                onChange={(event) => {
                  const v = Number.parseInt(event.target.value, 10)
                  if (!Number.isNaN(v) && v >= 1 && v <= safeTotal) {
                    onCurrentFrameIndexChange(v - 1)
                  }
                }}
                className="w-12 rounded-md border border-white/15 bg-black/30 px-1.5 py-1 text-center font-mono text-[11px] text-slate-100 focus:border-cyan-400/60 focus:outline-none"
              />
              <span className="text-[11px] text-slate-500">de {safeTotal}</span>
            </div>
          ) : (
            <div className="flex min-w-[220px] flex-1 items-center gap-3">
              <input
                type="range"
                min={1}
                max={60}
                value={fps}
                aria-label="Velocidade da animação em FPS"
                onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10)
                  if (Number.isFinite(value)) {
                    onFpsChange(Math.min(60, Math.max(1, value)))
                  }
                }}
                className="h-1.5 min-w-24 flex-1 cursor-pointer accent-cyan-400"
              />
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={fps}
                  aria-label="Quadros por segundo"
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10)
                    if (Number.isFinite(value)) {
                      onFpsChange(Math.min(60, Math.max(1, value)))
                    }
                  }}
                  className="w-12 rounded-md border border-white/15 bg-black/30 px-1.5 py-1 text-center font-mono text-[11px] text-slate-100 focus:border-cyan-400/60 focus:outline-none"
                />
                <span className="text-[11px] text-slate-500">fps</span>
              </label>
            </div>
          )}
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
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            fps={fps}
            onFpsChange={onFpsChange}
            onPrev={goPrev}
            onNext={goNext}
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
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            fps={fps}
            onFpsChange={onFpsChange}
            onPrev={goPrev}
            onNext={goNext}
          />
        </div>

        {generationError && (
          <Alert tone="error" className="mt-3">
            {generationError}
          </Alert>
        )}
      </Card>

      {/* Animation Frames */}
      <Card
        title="Animation Frames"
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

      {/* Correção em lote e outros painéis passados pelo dashboard */}
      {children}
    </div>
  )
}
