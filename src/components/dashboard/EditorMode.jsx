import { useRef, useState } from 'react'
import {
  Image as ImageIcon,
  ImagePlus,
  PencilLine,
  RefreshCw,
  Upload,
  Wand2,
  X,
} from 'lucide-react'

import { formatElapsed } from '../../lib/api'
import ApiConfigPanel from './ApiConfigPanel'
import {
  Alert,
  Card,
  Field,
  HelpTip,
  PrimaryButton,
  inputClass,
} from './ui'

/**
 * Modo editor: recebe uma imagem pronta e aplica uma instrução, devolvendo o
 * resultado como novo frame. O resultado alimenta a mesma pipeline de
 * visualização, grade, frames, correção e exportação do modo avançado.
 *
 * @param {{
 *   provider: string,
 *   onProviderChange: (value: string) => void,
 *   apiKey: string,
 *   onApiKeyChange: (value: string) => void,
 *   onValidate: () => void,
 *   status: string,
 *   error: string,
 *   models: Array<{ id: string, name: string }>,
 *   modelId: string,
 *   onModelChange: (value: string) => void,
 *   modelsWarning?: string | null,
 *   rememberKey: boolean,
 *   onRememberKeyChange: (value: boolean) => void,
 *   onClearKey: () => void,
 *   source: { dataUrl: string, name: string } | null,
 *   onFileSelected: (file: File) => void,
 *   onClearSource: () => void,
 *   prompt: string,
 *   onPromptChange: (value: string) => void,
 *   onApply: () => void,
 *   busy: boolean,
 *   elapsed: number,
 *   error: string,
 *   canApply: boolean,
 *   hint: string,
 *   hasResult: boolean,
 *   onUseResultAsBase: () => void,
 * }} props
 */
export default function EditorMode({
  provider,
  onProviderChange,
  apiKey,
  onApiKeyChange,
  onValidate,
  status,
  error,
  models,
  modelId,
  onModelChange,
  modelsWarning,
  rememberKey,
  onRememberKeyChange,
  onClearKey,
  source,
  onFileSelected,
  onClearSource,
  prompt,
  onPromptChange,
  onApply,
  busy,
  elapsed,
  error: editError,
  canApply,
  hint,
  hasResult,
  onUseResultAsBase,
}) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const openPicker = () => inputRef.current?.click()

  return (
    <section className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <ApiConfigPanel
        provider={provider}
        onProviderChange={onProviderChange}
        apiKey={apiKey}
        onApiKeyChange={onApiKeyChange}
        onValidate={onValidate}
        status={status}
        error={error}
        models={models}
        modelId={modelId}
        onModelChange={onModelChange}
        modelsWarning={modelsWarning}
        rememberKey={rememberKey}
        onRememberKeyChange={onRememberKeyChange}
        onClearKey={onClearKey}
      />

      <Card
        title="Imagem para editar"
        subtitle="Envie a imagem e descreva a edição"
        icon={PencilLine}
        help={
          <>
            <p>
              Envie qualquer imagem (frame, sprite ou arte) e descreva a
              edição. O resultado entra na mesma pipeline do modo avançado, como
              um <strong>novo spritesheet</strong>.
            </p>
            <p>
              Depois de aplicar, use <strong>Grade de Recorte</strong> para
              dividir os frames, <strong>Animation Frames</strong> para editar
              cada um, e <strong>Exportação</strong> para salvar PNG ou GIF.
            </p>
            <p>
              A imagem enviada é a fonte de verdade: o modelo deve alterar
              apenas o que a instrução pedir.
            </p>
          </>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
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
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                const file = event.dataTransfer?.files?.[0]
                if (file) onFileSelected(file)
              }}
              className={`bg-checkerboard flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-3 text-center transition focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:outline-none ${
                dragging
                  ? 'border-cyan-400/70 bg-cyan-400/10'
                  : 'border-white/15 hover:border-cyan-400/40'
              }`}
            >
              {source ? (
                <>
                  <img
                    src={source.dataUrl}
                    alt={source.name || 'Imagem para editar'}
                    className="pixelated max-h-44 max-w-full object-contain"
                  />
                  <p className="max-w-full truncate text-[11px] text-slate-300">
                    {source.name}
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-300">
                      <Upload className="size-3" />
                      trocar
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onClearSource()
                      }}
                      className="inline-flex items-center gap-1 rounded px-1 text-[10px] font-semibold text-slate-400 transition hover:bg-white/5 hover:text-rose-300"
                    >
                      <X className="size-3" />
                      remover
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <ImagePlus className="size-6 text-slate-500" />
                  <p className="text-[12px] font-medium text-slate-300">
                    Arraste uma imagem ou clique para escolher
                  </p>
                  <p className="text-[10px] text-slate-500">
                    PNG, JPG, WebP ou GIF
                  </p>
                </>
              )}
            </div>

            {hasResult && (
              <button
                type="button"
                onClick={onUseResultAsBase}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 transition hover:border-cyan-400/30 hover:text-cyan-200"
              >
                <RefreshCw className="size-3" />
                Usar o resultado atual como base
              </button>
            )}
          </div>

          <div className="flex flex-col">
            <Field label="Instrução de edição" htmlFor="editor-prompt">
              <textarea
                id="editor-prompt"
                rows={5}
                value={prompt}
                onChange={(event) => onPromptChange(event.target.value)}
                placeholder="Ex.: deixe a armadura azul, melhore o contorno e remova o fundo."
                className={`${inputClass} resize-y`}
              />
            </Field>

            <PrimaryButton
              onClick={onApply}
              loading={busy}
              loadingLabel={`Editando… ${formatElapsed(elapsed)}`}
              disabled={!canApply}
              icon={Wand2}
              className="mt-3"
            >
              <span className="font-mono">[ APLICAR EDIÇÃO ]</span>
            </PrimaryButton>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
              {hint}
            </p>

            {editError && (
              <Alert tone="error" className="mt-3">
                {editError}
              </Alert>
            )}

            <div className="mt-auto flex items-start gap-1.5 pt-3 text-[10px] leading-relaxed text-slate-600">
              <HelpTip
                label="Ajuda: modo editor"
                content={
                  <>
                    <p>
                      No modo editor você não precisa de referência de movimento:
                      basta a imagem e a instrução.
                    </p>
                    <p>
                      A edição é enviada como correção de uma única imagem. O
                      resultado substitui o spritesheet atual, que você pode
                      fatiar, corrigir frame a frame e exportar.
                    </p>
                  </>
                }
              />
              <span className="flex items-center gap-1">
                <ImageIcon className="size-3" />
                Mesmo modelo e chave da configuração de API acima.
              </span>
            </div>
          </div>
        </div>
      </Card>
    </section>
  )
}
