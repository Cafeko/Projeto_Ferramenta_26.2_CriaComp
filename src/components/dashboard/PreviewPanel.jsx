import {
  Film,
  ImageOff,
  Loader2,
  Pause,
  Pencil,
  Play,
  Scan,
  Sparkles,
} from 'lucide-react'

import { formatElapsed } from '../../lib/api'
import { Alert, Card, Pill } from './ui'

/**
 * Um dos lados do player (referência ou resultado).
 *
 * @param {{
 *   label: string,
 *   accent: 'slate' | 'cyan',
 *   frames: string[],
 *   index: number,
 *   loading: boolean,
 *   loadingLabel: string,
 *   emptyLabel: string,
 * }} props
 */
function Player({ label, accent, frames, index, loading, loadingLabel, emptyLabel }) {
  const current = frames.length > 0 ? frames[index % frames.length] : null
  const accentUi =
    accent === 'cyan'
      ? 'border-cyan-400/25 bg-cyan-400/[0.04]'
      : 'border-white/10 bg-white/[0.02]'

  return (
    <div className={`rounded-xl border p-2.5 ${accentUi}`}>
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <span
          className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase ${
            accent === 'cyan' ? 'text-cyan-300' : 'text-slate-400'
          }`}
        >
          {accent === 'cyan' ? <Sparkles className="size-3.5" /> : <Scan className="size-3.5" />}
          {label}
        </span>
        <span className="font-mono text-[10px] text-slate-500">
          {frames.length > 0 ? `${(index % frames.length) + 1}/${frames.length}` : '—'}
        </span>
      </div>

      <div className="bg-checkerboard relative grid h-52 place-items-center overflow-hidden rounded-lg border border-white/5 sm:h-60">
        {current ? (
          <img
            src={current}
            alt={label}
            className="pixelated h-full w-full object-contain"
          />
        ) : (
          <div className="flex max-w-[80%] flex-col items-center gap-1.5 text-center">
            <ImageOff className="size-6 text-slate-600" />
            <p className="text-[11px] leading-relaxed text-slate-500">{emptyLabel}</p>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-canvas/80 backdrop-blur-sm">
            <Loader2 className="size-6 animate-spin text-cyan-300" />
            <p className="text-[11px] font-medium text-cyan-200">{loadingLabel}</p>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Coluna central: player lado a lado + filmstrip.
 *
 * @param {{
 *   referenceFrames: string[],
 *   frames: string[],
 *   fps: number,
 *   onFpsChange: (value: number) => void,
 *   playing: boolean,
 *   onTogglePlay: () => void,
 *   tick: number,
 *   generating: boolean,
 *   referenceBusy: boolean,
 *   elapsed: number,
 *   onEditFrame: (index: number) => void,
 *   editingFrame: number | null,
 *   generationError: string,
 * }} props
 */
export default function PreviewPanel({
  referenceFrames,
  frames,
  fps,
  onFpsChange,
  playing,
  onTogglePlay,
  tick,
  generating,
  referenceBusy,
  elapsed,
  onEditFrame,
  editingFrame,
  generationError,
}) {
  const hasFrames = frames.length > 0

  return (
    <div className="space-y-4">
      <Card
        title="Preview da Animação"
        subtitle="Referência e resultado rodando em loop"
        icon={Play}
        badge={
          <Pill tone={playing ? 'green' : 'neutral'}>
            <span
              className={`size-1.5 rounded-full ${playing ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'}`}
            />
            {playing ? 'loop' : 'pausado'}
          </Pill>
        }
        bodyClassName="p-3.5"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Player
            label="Original"
            accent="slate"
            frames={referenceFrames}
            index={tick}
            loading={referenceBusy}
            loadingLabel="Fatiando referência…"
            emptyLabel="Escolha um preset ou envie uma imagem de referência."
          />
          <Player
            label="Nova animação"
            accent="cyan"
            frames={frames}
            index={tick}
            loading={generating}
            loadingLabel={`Gerando frames… ${formatElapsed(elapsed)}`}
            emptyLabel="O resultado gerado aparece aqui, quadro a quadro."
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-white/5 bg-black/25 px-3 py-2">
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={!hasFrames && referenceFrames.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={playing ? 'Pausar animação' : 'Reproduzir animação'}
          >
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {playing ? 'Pausar' : 'Play'}
          </button>

          <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-slate-400">
            <span className="shrink-0 font-semibold tracking-wide uppercase">FPS</span>
            <input
              type="range"
              min={1}
              max={24}
              step={1}
              value={fps}
              onChange={(event) => onFpsChange(Number(event.target.value))}
              className="h-1.5 min-w-0 flex-1 cursor-pointer accent-cyan-400"
              aria-label="Quadros por segundo"
            />
            <span className="w-7 shrink-0 text-right font-mono text-[11px] text-cyan-300">
              {fps}
            </span>
          </label>

          <span className="ml-auto font-mono text-[10px] text-slate-500">
            {referenceFrames.length} ref · {frames.length} gerados
          </span>
        </div>
      </Card>

      <Card
        title="Filmstrip"
        subtitle="Frames isolados em PNG"
        icon={Film}
        badge={<Pill tone={hasFrames ? 'cyan' : 'neutral'}>{frames.length} frames</Pill>}
        bodyClassName="p-3"
      >
        {generationError && (
          <Alert tone="error" className="mb-3">
            {generationError}
          </Alert>
        )}

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
          <div className="grid max-h-[360px] grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2 overflow-y-auto pr-1">
            {frames.map((frame, index) => {
              const editing = editingFrame === index
              return (
                <figure
                  key={`${index}-${frame.slice(-24)}`}
                  className={`overflow-hidden rounded-lg border bg-black/20 transition ${
                    editing
                      ? 'border-cyan-400/70 shadow-md shadow-cyan-950/50'
                      : 'border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="bg-checkerboard relative grid aspect-square place-items-center p-1.5">
                    <img
                      src={frame}
                      alt={`Frame ${index + 1}`}
                      className="pixelated h-full w-full object-contain"
                    />
                    <span className="absolute top-1 left-1 rounded bg-canvas/80 px-1 py-0.5 font-mono text-[10px] font-semibold text-slate-300 ring-1 ring-white/10">
                      #{index + 1}
                    </span>
                    {editing && (
                      <span className="absolute top-1 right-1 rounded bg-cyan-400/90 px-1 py-0.5 text-[9px] font-bold text-slate-950">
                        EDITANDO
                      </span>
                    )}
                  </div>
                  <figcaption className="border-t border-white/5 p-1">
                    <button
                      type="button"
                      onClick={() => onEditFrame(index)}
                      className={`inline-flex w-full items-center justify-center gap-1 rounded px-1.5 py-1 font-mono text-[10px] font-semibold transition ${
                        editing
                          ? 'bg-cyan-400/15 text-cyan-200'
                          : 'text-slate-400 hover:bg-white/5 hover:text-cyan-200'
                      }`}
                    >
                      <Pencil className="size-2.5" />
                      [ Editar Frame ]
                    </button>
                  </figcaption>
                </figure>
              )
            })}
          </div>
        )}

        {hasFrames && (
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
            <Pencil className="size-3" />
            Editar um frame envia só aquele quadro para correção, preservando os demais.
          </p>
        )}
      </Card>
    </div>
  )
}
