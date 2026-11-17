import { useRef, useState } from 'react'
import {
  Film,
  Grid3X3,
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
import { Alert, Card, Field, HelpTip, PrimaryButton, inputClass } from './ui'

/**
 * Faixa superior (ao lado da configuração da API): referência de movimento,
 * prompts e botão de geração.
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
 *   referenceError?: string,
 *   onMultipleFiles?: () => void,
 *   referenceGrid: { columns: number, rows: number, total?: number },
 *   generationColumns: string,
 *   generationRows: string,
 *   onGenerationColumnsChange: (value: string) => void,
 *   onGenerationRowsChange: (value: string) => void,
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
  referenceError = '',
  onMultipleFiles,
  referenceGrid,
  generationColumns,
  generationRows,
  onGenerationColumnsChange,
  onGenerationRowsChange,
}) {
  const inputRef = useRef(null)
  const styleInputRef = useRef(null)
  const appearanceInputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [styleDragging, setStyleDragging] = useState(false)
  const [appearanceDragging, setAppearanceDragging] = useState(false)

  const parsedGenerationColumns = Math.max(
    1,
    Math.min(64, Number.parseInt(generationColumns, 10) || 1),
  )
  const parsedGenerationRows = Math.max(
    1,
    Math.min(64, Number.parseInt(generationRows, 10) || 1),
  )
  const generationTotal = parsedGenerationColumns * parsedGenerationRows
  const referenceGridTotal = referenceGrid?.total ?? 1
  // Os campos manuais ficam escondidos por padrão. Aparecem se o usuário pedir
  // ou se a detecção não conseguiu dividir a folha (1×1) — aí são o fallback.
  const [manualFramesOpen, setManualFramesOpen] = useState(
    () => generationTotal !== referenceGridTotal,
  )
  const detectionUncertain = Boolean(reference) && referenceGridTotal <= 1
  const showManualFrames =
    Boolean(reference) && (manualFramesOpen || detectionUncertain)

  function openPicker() {
    inputRef.current?.click()
  }

  function pickDroppedFile(event) {
    const files = event.dataTransfer?.files
    if (files && files.length > 1) onMultipleFiles?.()
    return files?.[0]
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragging(false)
    const file = pickDroppedFile(event)
    if (file) onFileSelected(file)
  }

  function handleStyleDrop(event) {
    event.preventDefault()
    setStyleDragging(false)
    const file = pickDroppedFile(event)
    if (file) onStyleFileSelected(file)
  }

  function handleAppearanceDrop(event) {
    event.preventDefault()
    setAppearanceDragging(false)
    const file = pickDroppedFile(event)
    if (file) onAppearanceFileSelected(file)
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <Card
        title="Referências e Personagem"
        subtitle="Movimento, aparência e estilo"
        icon={Sparkles}
        className="flex flex-1 flex-col"
        bodyClassName="flex flex-1 flex-col p-4"
        help={
          <>
            <p>
              <strong>Referência de movimento:</strong> envie a spritesheet com
              as poses. Ela define apenas layout, posição e silhueta.
            </p>
            <p>
              <strong>Aparência:</strong> identidade do personagem (roupa, cores,
              cabelo, equipamento e proporções), por texto e/ou imagem.
            </p>
            <p>
              <strong>Estilo:</strong> renderização visual (pixel density,
              paleta, contorno, sombreamento e detalhe), por texto e/ou imagem.
              Sem estilo informado, a referência de movimento também vale como
              estilo.
            </p>
            <p>
              A detecção preenche a grade de recorte e a de geração; ajuste em
              <strong> Grade de Recorte</strong> e <strong>Frames a Gerar</strong>{' '}
              se necessário.
            </p>
          </>
        }
      >
        <div className="grid flex-1 gap-4 xl:auto-rows-fr xl:grid-cols-3">
          <section className="flex h-full flex-col">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                <Film className="size-3.5 text-cyan-400" />
                Referência de Movimento
              </h3>
              {reference && (
                <span className="font-mono text-[10px] text-slate-500">
                  {reference.width}×{reference.height}
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col">
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
            className={`flex flex-1 cursor-pointer flex-col justify-center rounded-lg border border-dashed p-3 transition focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:outline-none ${
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
          {referenceError && (
            <Alert tone="error" className="mt-2">
              {referenceError}
            </Alert>
          )}

          {showManualFrames ? (
            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                    <Grid3X3 className="size-3.5 text-cyan-400" />
                    Frames a Gerar
                  </p>
                  <HelpTip
                    label="Ajuda: Frames a Gerar"
                    content={
                      <>
                        <p>
                          Define a grade que a IA deve desenhar: Colunas × Linhas
                          = total de frames.
                        </p>
                        <p>
                          É independente da <strong>Grade de Recorte</strong>.
                          Use estes campos quando a detecção automática não
                          dividir a folha corretamente (ex.: 4×2 = 8 frames).
                        </p>
                      </>
                    }
                  />
                  <span className="font-mono text-[10px] text-slate-500">
                    {parsedGenerationColumns}×{parsedGenerationRows} ={' '}
                    {generationTotal}
                  </span>
                </div>
                {!detectionUncertain && (
                  <button
                    type="button"
                    onClick={() => setManualFramesOpen(false)}
                    className="text-[10px] font-semibold text-slate-500 transition hover:text-slate-300"
                  >
                    Ocultar
                  </button>
                )}
              </div>

              {detectionUncertain && (
                <p className="mb-2 rounded-md border border-amber-400/20 bg-amber-400/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-200">
                  A detecção automática não conseguiu dividir a folha. Informe a
                  grade real (ex.: 4×2 = 8 frames).
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-400"
                    htmlFor="generation-columns"
                  >
                    Colunas
                  </label>
                  <input
                    id="generation-columns"
                    type="number"
                    min={1}
                    max={64}
                    value={generationColumns}
                    onChange={(event) => {
                      setManualFramesOpen(true)
                      onGenerationColumnsChange(event.target.value)
                    }}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-400"
                    htmlFor="generation-rows"
                  >
                    Linhas
                  </label>
                  <input
                    id="generation-rows"
                    type="number"
                    min={1}
                    max={64}
                    value={generationRows}
                    onChange={(event) => {
                      setManualFramesOpen(true)
                      onGenerationRowsChange(event.target.value)
                    }}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          ) : reference ? (
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
              <p className="text-[10px] text-slate-500">
                Frames a gerar:{' '}
                <strong className="text-slate-300">
                  {parsedGenerationColumns}×{parsedGenerationRows} ={' '}
                  {generationTotal}
                </strong>
              </p>
              <button
                type="button"
                onClick={() => setManualFramesOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-slate-400 transition hover:border-cyan-400/30 hover:text-cyan-300"
              >
                <Grid3X3 className="size-3" />
                Ajustar
              </button>
            </div>
          ) : null}
        </div>
        </section>

        <section className="flex h-full flex-col border-t border-white/10 pt-4 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
            <User className="size-3.5 text-cyan-400" />
            Aparência do Personagem
          </h3>
          <div className="flex flex-1 flex-col gap-3">
          <Field
            label="Descrição"
            htmlFor="appearance-input"
            className="flex flex-1 flex-col"
            stretch
          >
            <textarea
              id="appearance-input"
              rows={3}
              value={appearance}
              onChange={(event) => onAppearanceChange(event.target.value)}
              placeholder="Ex.: cavaleira de armadura azul, cabelo curto branco, espada dourada, 32×32 px"
              className={`${inputClass} flex-1 resize-y`}
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
            </div>
          </Field>
          </div>
        </section>

        <section className="flex h-full flex-col border-t border-white/10 pt-4 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
            <Palette className="size-3.5 text-cyan-400" />
            Estilo de Arte
          </h3>
          <div className="flex flex-1 flex-col gap-3">
            <Field
              label="Descrição"
              htmlFor="style-input"
              className="flex flex-1 flex-col"
              stretch
            >
            <textarea
              id="style-input"
              rows={2}
              value={artStyle}
              onChange={(event) => onArtStyleChange(event.target.value)}
              placeholder="Ex.: pixel art 16-bit, paleta limitada, contorno nítido, fundo transparente"
              className={`${inputClass} flex-1 resize-y`}
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
            </div>
          </Field>
          </div>
        </section>
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
