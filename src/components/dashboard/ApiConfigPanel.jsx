import { useState } from 'react'
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Layers3,
  Loader2,
  ShieldCheck,
} from 'lucide-react'

import { PROVIDERS } from '../../lib/api'
import { Alert, Card, Field, Pill, inputClass, selectClass } from './ui'

/**
 * Card BYOK: provedor, chave, validação e seleção de modelo.
 *
 * @param {{
 *   provider: string,
 *   onProviderChange: (provider: string) => void,
 *   apiKey: string,
 *   onApiKeyChange: (value: string) => void,
 *   onValidate: () => void,
 *   status: 'idle' | 'validating' | 'valid' | 'error',
 *   error: string,
 *   models: Array<{ id: string, name: string, description?: string | null, supports_reference_images?: boolean }>,
 *   modelId: string,
 *   onModelChange: (value: string) => void,
 *   modelsWarning?: string | null,
 *   rememberKey?: boolean,
 *   onRememberKeyChange?: (value: boolean) => void,
 *   onClearKey?: () => void,
 * }} props
 */
export default function ApiConfigPanel({
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
  modelsWarning = null,
  rememberKey = true,
  onRememberKeyChange,
  onClearKey,
}) {
  const [showKey, setShowKey] = useState(false)
  const providerMeta = PROVIDERS.find((item) => item.id === provider) ?? PROVIDERS[0]
  const validating = status === 'validating'
  const selectedModel = models.find((model) => model.id === modelId) ?? null
  const keyFilled = Boolean(apiKey.trim())

  return (
    <Card
      title="Configuração da API"
      subtitle={
        rememberKey
          ? 'BYOK · chave salva neste navegador'
          : 'BYOK · a chave fica só na memória da aba'
      }
      icon={KeyRound}
      help={
        <>
          <p>
            Escolha o provedor, cole a chave e clique em <strong>Validar</strong>{' '}
            para carregar os modelos de imagem.
          </p>
          <p>
            A chave fica só no seu navegador; desmarque “Salvar chave neste
            navegador” para mantê-la apenas na memória da aba.
          </p>
          <p>O modelo escolhido define qual IA gera as imagens.</p>
        </>
      }
      badge={
        status === 'valid' ? (
          <Pill tone="green">
            <CheckCircle2 className="size-3" />
            validada
          </Pill>
        ) : (
          <Pill tone="cyan">
            <ShieldCheck className="size-3" />
            BYOK
          </Pill>
        )
      }
    >
      <div className="space-y-3">
        <Field label="Provedor" htmlFor="provider-select">
          <select
            id="provider-select"
            value={provider}
            onChange={(event) => onProviderChange(event.target.value)}
            className={selectClass}
          >
            {PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] text-slate-500">{providerMeta.hint}</p>
        </Field>

        <Field label="API Key" htmlFor="api-key-input">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <input
                id="api-key-input"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(event) => onApiKeyChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onValidate()
                  }
                }}
                placeholder="cole sua chave aqui"
                autoComplete="off"
                spellCheck={false}
                className={`${inputClass} pr-9 font-mono text-xs`}
              />
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                className="absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
                aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'}
                title={showKey ? 'Ocultar chave' : 'Mostrar chave'}
              >
                {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>

            <button
              type="button"
              onClick={onValidate}
              disabled={!keyFilled || validating}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-[12px] font-semibold text-cyan-200 transition hover:bg-cyan-400/20 focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              {validating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="size-3.5" />
              )}
              {validating ? 'Validando' : 'Validar'}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-400 select-none">
              <input
                type="checkbox"
                checked={rememberKey}
                onChange={(event) => onRememberKeyChange?.(event.target.checked)}
                className="size-3.5 accent-cyan-400"
              />
              Salvar chave neste navegador
            </label>
            {keyFilled && onClearKey && (
              <button
                type="button"
                onClick={onClearKey}
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 transition hover:bg-white/5 hover:text-rose-300"
              >
                Limpar chave
              </button>
            )}
          </div>
        </Field>

        {status === 'valid' && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[12px] text-emerald-200">
            <CheckCircle2 className="size-3.5 shrink-0" />
            Chave válida · {models.length} modelo{models.length === 1 ? '' : 's'}{' '}
            disponíve{models.length === 1 ? 'l' : 'is'}
          </div>
        )}

        {status === 'valid' && models.length === 0 && (
          <Alert tone="warning">
            A chave foi aceita, mas o provedor não listou modelos de imagem.
            Verifique se a conta tem acesso a modelos de imagem ou use outra
            chave.
          </Alert>
        )}

        {status === 'error' && error && <Alert tone="error">{error}</Alert>}

        <Field
          label="Modelo"
          icon={Layers3}
          htmlFor="model-select"
          hint={
            models.length === 0
              ? status === 'valid'
                ? 'Nenhum modelo de imagem foi listado para esta chave. Use outra chave ou confira o acesso da conta no provedor.'
                : 'Valide a chave para carregar os modelos de imagem disponíveis.'
              : selectedModel?.supports_reference_images === false
                ? 'Este modelo pode não aceitar imagens de referência.'
                : undefined
          }
        >
          <select
            id="model-select"
            value={modelId}
            onChange={(event) => onModelChange(event.target.value)}
            disabled={models.length === 0}
            className={selectClass}
          >
            {models.length === 0 ? (
              <option value="">Nenhum modelo carregado</option>
            ) : (
              models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name || model.id}
                </option>
              ))
            )}
          </select>
        </Field>

        {selectedModel?.description && (
          <p className="text-[11px] leading-relaxed text-slate-500">
            {selectedModel.description}
          </p>
        )}

        {modelsWarning && <Alert tone="warning">{modelsWarning}</Alert>}

        <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-3">
          <span className="text-[11px] text-slate-500">Não tem uma chave?</span>
          <a
            href={providerMeta.keyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300 transition hover:text-cyan-200"
          >
            Obter chave no {providerMeta.keyLabel}
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>
    </Card>
  )
}
