import { useRef, useState } from 'react'
import {
  Download,
  Image as ImageIcon,
  ImagePlus,
  PencilLine,
  Sparkles,
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
  Pill,
  PrimaryButton,
  inputClass,
} from './ui'

function ImageBox({ src, alt, emptyLabel }) {
  return (
    <div className="bg-checkerboard relative grid max-h-[340px] min-h-[220px] place-items-center overflow-hidden rounded-lg border border-white/10 p-2">
      {src ? (
        <img
          src={src}
          alt={alt}
          className="pixelated max-h-[320px] max-w-full object-contain"
        />
      ) : (
        <div className="flex max-w-[80%] flex-col items-center gap-2 text-center">
          <ImageIcon className="size-6 text-slate-600" />
          <p className="text-[11px] leading-relaxed text-slate-500">
            {emptyLabel}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Modo editor: recebe uma imagem pronta e aplica uma instrução, devolvendo o
 * resultado como novo frame — sem passar pelo fluxo de geração por referência.
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
 *   sourceError?: string,
 *   prompt: string,
 *   onPromptChange: (value: string) => void,
 *   onApply: () => void,
 *   busy: boolean,
 *   elapsed: number,
 *   result: string | null,
 *   error: string,
 *   onDownloadResult: () => void,
 *   onUseResultAsSource: () => void,
 *   onClearResult: () => void,
 *   canApply: boolean,
 *   hint: string,
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
  sourceError = '',
  prompt,
  onPromptChange,
  onApply,
  busy,
  elapsed,
  result,
  error: editError,
  onDownloadResult,
  onUseResultAsSource,
  onClearResult,
  canApply,
  hint,
}) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const openPicker = () => inputRef.current?.click()

  return (
    <div className="space-y-4">
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
          subtitle="Envie a imagem que vira o novo frame"
          icon={PencilLine}
          help={
            <>
              <p>
                Envie qualquer imagem (frame, sprite ou arte) e descreva a
                edição. O resultado é tratado como <strong>novo frame</strong>.
              </p>
              <p>
                A imagem enviada é a fonte de verdade: o modelo deve alterar
                apenas o que a instrução pedir.
              </p>
              <p>
                Você pode baixar o resultado ou usá-lo como base para uma nova
                edição.
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

              {sourceError && (
                <Alert tone="error" className="mt-2">
                  {sourceError}
                </Alert>
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
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Original"
          subtitle="Imagem enviada para edição"
          icon={ImageIcon}
          bodyClassName="p-3"
        >
          <ImageBox
            src={source?.dataUrl}
            alt="Imagem original"
            emptyLabel="Envie uma imagem para começar."
          />
        </Card>

        <Card
          title="Novo frame"
          subtitle="Resultado da edição"
          icon={Sparkles}
          badge={result ? <Pill tone="cyan">Editado</Pill> : null}
          bodyClassName="p-3"
          help={
            <>
              <p>
                O resultado usa a mesma resolução da imagem enviada e pode ser
                baixado como PNG.
              </p>
              <p>
                <strong>Usar como base</strong> coloca o resultado como nova
                imagem de entrada, para edições em sequência.
              </p>
            </>
          }
        >
          <ImageBox
            src={result}
            alt="Novo frame editado"
            emptyLabel={
              busy
                ? 'Aplicando a edição…'
                : 'O resultado da edição aparece aqui.'
            }
          />

          {editError && (
            <Alert tone="error" className="mt-3">
              {editError}
            </Alert>
          )}

          {result && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onDownloadResult}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-cyan-400/30 hover:text-cyan-200"
              >
                <Download className="size-3" />
                Baixar PNG
              </button>
              <button
                type="button"
                onClick={onUseResultAsSource}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-cyan-400/30 hover:text-cyan-200"
              >
                <Sparkles className="size-3" />
                Usar como base
              </button>
              <button
                type="button"
                onClick={onClearResult}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 transition hover:border-rose-400/30 hover:text-rose-300"
              >
                <X className="size-3" />
                Limpar resultado
              </button>
            </div>
          )}
        </Card>
      </section>

      <div className="flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-600">
        <HelpTip
          label="Ajuda: modo editor"
          content={
            <>
              <p>
                No modo editor você não precisa de referência de movimento nem
                de grade: basta a imagem e a instrução.
              </p>
              <p>
                A edição é enviada como correção de uma única imagem. O
                resultado não altera a imagem gerada no modo avançado.
              </p>
            </>
          }
        />
        <span>
          O modo editor usa o mesmo modelo e a mesma chave da configuração de
          API acima.
        </span>
      </div>
    </div>
  )
}
