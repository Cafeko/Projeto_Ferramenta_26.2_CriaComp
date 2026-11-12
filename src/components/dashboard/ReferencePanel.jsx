import { useRef, useState } from 'react'
import {
  Film,
  Image as ImageIcon,
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
 *   artStyle: string,
 *   onArtStyleChange: (value: string) => void,
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
  artStyle,
  onArtStyleChange,
  onGenerate,
  generating,
  elapsed,
  canGenerate,
  generateHint,
}) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  function openPicker() {
    inputRef.current?.click()
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer?.files?.[0]
    if (file) onFileSelected(file)
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
              placeholder="pixel art 16-bit, paleta limitada, fundo transparente…"
              className={`${inputClass} resize-y`}
            />
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
