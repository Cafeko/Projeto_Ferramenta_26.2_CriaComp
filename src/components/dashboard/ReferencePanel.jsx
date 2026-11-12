import { useRef, useState } from 'react'
import {
  Film,
  Image as ImageIcon,
  ImagePlus,
  Palette,
  RefreshCw,
  Sparkles,
  Upload,
  User,
  X,
} from 'lucide-react'

import { formatElapsed } from '../../lib/api'
import { Card, Field, PrimaryButton, inputClass } from './ui'

/**
 * Coluna esquerda: referência de movimento, prompts e botão de geração.
 *
 * Os presets rápidos foram retirados da interface, mas o gerador procedural
 * continua disponível em `src/utils/presets.js` para uso futuro.
 *
 * @param {{
 *   reference: { dataUrl: string, width: number, height: number, name: string, kind: string } | null,
 *   onFileSelected: (file: File) => void,
 *   onClearReference: () => void,
 *   appearance: string,
 *   onAppearanceChange: (value: string) => void,
 *   appearanceReference: { dataUrl: string, name: string } | null,
 *   onAppearanceFileSelected: (file: File) => void,
 *   onClearAppearanceReference: () => void,
 *   artStyle: string,
 *   onArtStyleChange: (value: string) => void,
 *   styleReference: { dataUrl: string, name: string } | null,
 *   onStyleFileSelected: (file: File) => void,
 *   onClearStyleReference: () => void,
 *   onGenerate: () => void,
 *   generating: boolean,
 *   elapsed: number,
 *   canGenerate: boolean,
 *   generateHint: string,
 * }} props
 */
export default function ReferencePanel({
  reference,
  onFileSelected,
  onClearReference,
  appearance,
  onAppearanceChange,
  appearanceReference,
  onAppearanceFileSelected,
  onClearAppearanceReference,
  artStyle,
  onArtStyleChange,
  styleReference,
  onStyleFileSelected,
  onClearStyleReference,
  onGenerate,
  generating,
  elapsed,
  canGenerate,
  generateHint,
}) {
  const inputRef = useRef(null)
  const styleInputRef = useRef(null)
  const appearanceInputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [styleDragging, setStyleDragging] = useState(false)
  const [appearanceDragging, setAppearanceDragging] = useState(false)

  function openPicker() {
    inputRef.current?.click()
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer?.files?.[0]
    if (file) onFileSelected(file)
  }

  function handleStyleDrop(event) {
    event.preventDefault()
    setStyleDragging(false)
    const file = event.dataTransfer?.files?.[0]
    if (file) onStyleFileSelected(file)
  }

  function handleAppearanceDrop(event) {
    event.preventDefault()
    setAppearanceDragging(false)
    const file = event.dataTransfer?.files?.[0]
    if (file) onAppearanceFileSelected(file)
  }

  return (
    <div className="space-y-4">
      <Card
        title="Referência de Movimento"
        subtitle="Poses que a IA deve seguir"
        icon={Film}
        badge={
          reference ? (
            <span className="text-[10px] font-semibold text-slate-500">
              {reference.width}×{reference.height}
            </span>
          ) : null
        }
      >
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/webp,image/gif,image/jpeg,image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onFileSelected(file)
              event.target.value = ''
            }}
          />

          <div
            role="button"
            tabIndex={0}
            onClick={openPicker}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                openPicker()
              }
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`cursor-pointer rounded-lg border border-dashed p-3 transition focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:outline-none ${
              dragging
                ? 'border-cyan-400/70 bg-cyan-400/10'
                : 'border-white/15 bg-black/20 hover:border-cyan-400/40 hover:bg-white/[0.03]'
            }`}
          >
            {reference ? (
              <div className="flex items-center gap-3">
                <div className="bg-checkerboard grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded border border-white/10">
                  <img
                    src={reference.dataUrl}
                    alt="Referência de movimento"
                    className="pixelated max-h-14 max-w-20 object-contain"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-slate-200">
                    {reference.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Imagem de referência enviada
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-300">
                      <RefreshCw className="size-3" />
                      trocar
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onClearReference()
                      }}
                      className="inline-flex items-center gap-1 rounded px-1 text-[10px] font-semibold text-slate-400 transition hover:bg-white/5 hover:text-rose-300"
                    >
                      <X className="size-3" />
                      remover
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 py-2 text-center">
                <Upload className="size-5 text-slate-500" />
                <p className="text-[12px] font-medium text-slate-300">
                  Arraste um PNG ou spritesheet
                </p>
                <p className="text-[11px] text-slate-500">ou clique para escolher</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card title="Descrição do Personagem" subtitle="Quem deve aparecer nos frames" icon={User}>
        <div className="space-y-3">
          <Field
            label="Aparência do Personagem"
            htmlFor="appearance-input"
            hint="Detalhe cores, roupa, arma, proporções e detalhes marcantes."
          >
            <textarea
              id="appearance-input"
              rows={3}
              value={appearance}
              onChange={(event) => onAppearanceChange(event.target.value)}
              placeholder="Ex.: cavaleira de armadura azul, cabelo curto branco, espada dourada, 32×32 px"
              className={`${inputClass} resize-y`}
            />

            <input
              ref={appearanceInputRef}
              type="file"
              accept="image/png,image/webp,image/gif,image/jpeg,image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onAppearanceFileSelected(file)
                event.target.value = ''
              }}
            />

            <div className="mt-2">
              <div
                role="button"
                tabIndex={0}
                onClick={() => appearanceInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    appearanceInputRef.current?.click()
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  setAppearanceDragging(true)
                }}
                onDragLeave={() => setAppearanceDragging(false)}
                onDrop={handleAppearanceDrop}
                className={`cursor-pointer rounded-lg border transition focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:outline-none ${
                  appearanceDragging
                    ? 'border-cyan-400/70 bg-cyan-400/10'
                    : 'border-dashed border-white/15 bg-black/15 hover:border-cyan-400/40 hover:bg-white/[0.03]'
                }`}
              >
                {appearanceReference ? (
                  <div className="flex items-center gap-2 p-1.5">
                    <div className="bg-checkerboard grid h-10 w-12 shrink-0 place-items-center overflow-hidden rounded border border-white/10">
                      <img
                        src={appearanceReference.dataUrl}
                        alt="Referência de aparência do personagem"
                        className="pixelated max-h-10 max-w-12 object-contain"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium text-slate-200">
                        {appearanceReference.name}
                      </p>
                      <p
                        className={`text-[10px] ${
                          appearanceDragging ? 'text-cyan-300' : 'text-slate-500'
                        }`}
                      >
                        {appearanceDragging
                          ? 'Solte para substituir'
                          : 'Aparência — clique ou arraste para trocar'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onClearAppearanceReference()
                      }}
                      className="rounded p-1 text-slate-400 transition hover:bg-white/5 hover:text-rose-300"
                      aria-label="Remover referência de aparência"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    className={`flex w-full items-center justify-center gap-1.5 px-2 py-2 text-[11px] font-medium ${
                      appearanceDragging ? 'text-cyan-200' : 'text-slate-400'
                    }`}
                  >
                    <ImagePlus className="size-3.5" />
                    {appearanceDragging
                      ? 'Solte a imagem aqui'
                      : 'Arraste uma imagem de referência ou clique (opcional)'}
                  </div>
                )}
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                Usada apenas para a aparência (roupa, cores, cabelo). Não afeta a
                pose nem o estilo de arte.
              </p>
            </div>
          </Field>

          <Field
            label="Estilo de Arte"
            icon={Palette}
            htmlFor="style-input"
            hint="Paleta, contorno, iluminação e nível de detalhe."
          >
            <textarea
              id="style-input"
              rows={2}
              value={artStyle}
              onChange={(event) => onArtStyleChange(event.target.value)}
              placeholder="Ex.: pixel art 16-bit, paleta limitada, contorno nítido, fundo transparente"
              className={`${inputClass} resize-y`}
            />

            <input
              ref={styleInputRef}
              type="file"
              accept="image/png,image/webp,image/gif,image/jpeg,image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onStyleFileSelected(file)
                event.target.value = ''
              }}
            />

            <div className="mt-2">
              <div
                role="button"
                tabIndex={0}
                onClick={() => styleInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    styleInputRef.current?.click()
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  setStyleDragging(true)
                }}
                onDragLeave={() => setStyleDragging(false)}
                onDrop={handleStyleDrop}
                className={`cursor-pointer rounded-lg border transition focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:outline-none ${
                  styleDragging
                    ? 'border-cyan-400/70 bg-cyan-400/10'
                    : 'border-dashed border-white/15 bg-black/15 hover:border-cyan-400/40 hover:bg-white/[0.03]'
                }`}
              >
                {styleReference ? (
                  <div className="flex items-center gap-2 p-1.5">
                    <div className="bg-checkerboard grid h-10 w-12 shrink-0 place-items-center overflow-hidden rounded border border-white/10">
                      <img
                        src={styleReference.dataUrl}
                        alt="Referência de estilo de arte"
                        className="pixelated max-h-10 max-w-12 object-contain"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium text-slate-200">
                        {styleReference.name}
                      </p>
                      <p
                        className={`text-[10px] ${
                          styleDragging ? 'text-cyan-300' : 'text-slate-500'
                        }`}
                      >
                        {styleDragging
                          ? 'Solte para substituir'
                          : 'Referência de estilo — clique ou arraste para trocar'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onClearStyleReference()
                      }}
                      className="rounded p-1 text-slate-400 transition hover:bg-white/5 hover:text-rose-300"
                      aria-label="Remover referência de estilo"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    className={`flex w-full items-center justify-center gap-1.5 px-2 py-2 text-[11px] font-medium ${
                      styleDragging ? 'text-cyan-200' : 'text-slate-400'
                    }`}
                  >
                    <ImagePlus className="size-3.5" />
                    {styleDragging
                      ? 'Solte a imagem aqui'
                      : 'Arraste uma imagem de estilo ou clique (opcional)'}
                  </div>
                )}
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                Sem texto e sem imagem de estilo, a referência de movimento
                também define o estilo.
              </p>
            </div>
          </Field>
        </div>
      </Card>

      <div className="space-y-2">
        <PrimaryButton
          onClick={onGenerate}
          loading={generating}
          loadingLabel={`Gerando… ${formatElapsed(elapsed)}`}
          disabled={!canGenerate}
          icon={Sparkles}
        >
          <span className="font-mono">[ GERAR NOVO SPRITESHEET ]</span>
        </PrimaryButton>
        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-500">
          <ImageIcon className="size-3" />
          {generateHint}
        </p>
      </div>
    </div>
  )
}
