import { useRef, useState } from 'react'
import { ImagePlus, PencilLine, Upload, X } from 'lucide-react'

import ApiConfigPanel from './ApiConfigPanel'
import { Card, HelpTip } from './ui'

/**
 * Modo editor: o topo serve apenas para carregar a imagem que será editada.
 * Depois de carregada, ela entra na pipeline (grade, frames, correção em lote
 * ou por frame, visualização e exportação) exatamente como no modo avançado.
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
        subtitle="Carregue a imagem; a edição acontece abaixo"
        icon={PencilLine}
        help={
          <>
            <p>
              Aqui você apenas carrega a imagem que quer editar (frame, sprite
              ou arte). Ela entra na pipeline como o spritesheet atual.
            </p>
            <p>
              Use <strong>Grade de Recorte</strong> para dividir os frames,{' '}
              <strong>Correção em Lote</strong> para ajustar a folha inteira ou{' '}
              <strong>[ Editar ]</strong> em cada frame. A visualização e a
              exportação funcionam como no modo avançado.
            </p>
            <p>
              Não há comparação com uma referência original: a imagem carregada é
              a base da edição.
            </p>
          </>
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
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              const file = event.dataTransfer?.files?.[0]
              if (file) onFileSelected(file)
            }}
            className={`bg-checkerboard flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center transition focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:outline-none ${
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
                  className="pixelated max-h-52 max-w-full object-contain"
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

          <div className="mt-2.5 flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-500">
            <HelpTip
              label="Ajuda: modo editor"
              content={
                <>
                  <p>
                    O topo serve só para carregar a imagem. Depois disso, o
                    spritesheet atual aparece abaixo.
                  </p>
                  <p>
                    Edite em lote (folha inteira) ou por frame. Na correção em
                    lote você escolhe se mantém a versão atual ou a editada
                    antes de aplicar.
                  </p>
                </>
              }
            />
            <span>
              Depois de carregar, use a <strong>Correção em Lote</strong> ou{' '}
              <strong>[ Editar ]</strong> em cada frame abaixo.
            </span>
          </div>
        </div>
      </Card>
    </section>
  )
}
