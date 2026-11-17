import { useEffect, useState } from 'react'
import {
  Database,
  Settings as SettingsIcon,
  Trash2,
  X,
} from 'lucide-react'

import { HelpTip } from './ui'

function Switch({ checked, onChange, title, description }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
        checked
          ? 'border-cyan-400/30 bg-cyan-400/[0.06] hover:bg-cyan-400/10'
          : 'border-white/10 bg-black/20 hover:bg-white/[0.03]'
      }`}
    >
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold text-slate-200">
          {title}
        </span>
        {description && (
          <span className="mt-0.5 block text-[10px] leading-relaxed text-slate-500">
            {description}
          </span>
        )}
      </span>
      <span
        className={`mt-0.5 grid h-5 w-9 shrink-0 place-items-center rounded-full border transition ${
          checked
            ? 'border-cyan-300/40 bg-cyan-400/30'
            : 'border-white/10 bg-white/5'
        }`}
      >
        <span
          className={`size-3.5 rounded-full transition ${
            checked ? 'translate-x-2 bg-cyan-300' : '-translate-x-2 bg-slate-500'
          }`}
        />
      </span>
    </button>
  )
}

const SAVED_ITEMS = [
  'Imagens de referência (movimento, aparência e estilo)',
  'Textos de aparência e estilo',
  'Chaves de API (quando “Salvar chave” está marcado)',
  'Imagem gerada',
]

/**
 * Menu de configurações: persistência da sessão, modo da interface e métricas.
 *
 * @param {{
 *   open: boolean,
 *   settings: { saveSession: boolean, mode: 'advanced' | 'simple' | 'editor', showMetrics: boolean },
 *   onChange: (patch: {
 *     saveSession?: boolean,
 *     mode?: 'advanced' | 'simple' | 'editor',
 *     showMetrics?: boolean,
 *   }) => void,
 *   onClearSession: () => void | Promise<void>,
 *   onClose: () => void,
 *   clearing?: boolean,
 * }} props
 */
export default function SettingsModal({
  open,
  settings,
  onChange,
  onClearSession,
  onClose,
  clearing = false,
}) {
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      // Uma ajuda (?) aberta fecha só ela, não o menu inteiro.
      if (document.querySelector('[role="dialog"][aria-label^="Ajuda"]')) return
      if (confirming) setConfirming(false)
      else onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, confirming, onClose])

  useEffect(() => {
    if (!open) setConfirming(false)
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[130] grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-xl rounded-xl border border-white/10 bg-[#0b111c] shadow-2xl shadow-black/60"
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/5 px-4 py-3">
          <div className="min-w-0">
            <h2
              id="settings-title"
              className="flex items-center gap-2 text-[13px] font-semibold text-slate-100"
            >
              <SettingsIcon className="size-4 text-cyan-400" />
              Configurações
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Preferências deste navegador. Nada é enviado ao servidor.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar configurações"
            className="grid size-7 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-4 py-4">
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                <Database className="size-3" />
                Sessão neste dispositivo
              </h3>
              <HelpTip
                label="Ajuda: o que é salvo"
                content={
                  <>
                    <p>Fica salvo neste navegador:</p>
                    <ul className="list-disc space-y-0.5 pl-4">
                      {SAVED_ITEMS.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <p>
                      Ao remover qualquer item manualmente (imagem, texto ou
                      chave), ele deixa de ser restaurado.
                    </p>
                    <p>
                      Os logs de requisições são separados e só são apagados na
                      página de logs.
                    </p>
                  </>
                }
              />
            </div>

            <Switch
              checked={settings.saveSession}
              onChange={(value) => onChange({ saveSession: value })}
              title="Salvar e restaurar a sessão"
              description={
                settings.saveSession
                  ? 'Ao abrir o app, referências, textos, chaves e o último resultado voltam como estavam.'
                  : 'Nada novo será salvo nem restaurado ao reabrir. O que já está salvo continua até limpar abaixo.'
              }
            />

            {confirming ? (
              <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5">
                <p className="text-[11px] font-semibold text-rose-200">
                  Apagar os dados salvos da sessão?
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-rose-200/80">
                  Referências, textos, chaves e a imagem gerada salvos neste
                  dispositivo serão apagados. Os logs de requisições são
                  mantidos. Esta ação não pode ser desfeita.
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:bg-white/5"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await onClearSession?.()
                      setConfirming(false)
                    }}
                    disabled={clearing}
                    className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/20 px-2.5 py-1.5 text-[11px] font-semibold text-rose-100 transition hover:bg-rose-500/30 disabled:opacity-50"
                  >
                    <Trash2 className="size-3" />
                    {clearing ? 'Apagando…' : 'Apagar dados salvos'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 transition hover:border-rose-400/30 hover:bg-rose-400/5 hover:text-rose-300"
              >
                <Trash2 className="size-3" />
                Limpar dados salvos
              </button>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              Interface
            </h3>

            <div className="grid gap-2 sm:grid-cols-3">
              {[
                {
                  id: 'advanced',
                  label: 'Modo avançado',
                  hint: 'Todos os painéis.',
                },
                {
                  id: 'editor',
                  label: 'Modo editor',
                  hint: 'Edita uma imagem enviada.',
                },
                {
                  id: 'simple',
                  label: 'Modo simples',
                  hint: 'Em desenvolvimento.',
                },
              ].map((option) => {
                const active = settings.mode === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChange({ mode: option.id })}
                    className={`rounded-lg border px-3 py-2 text-left transition ${
                      active
                        ? 'border-cyan-400/40 bg-cyan-400/10'
                        : 'border-white/10 bg-black/20 hover:bg-white/[0.03]'
                    }`}
                  >
                    <span
                      className={`block text-[12px] font-semibold ${
                        active ? 'text-cyan-200' : 'text-slate-200'
                      }`}
                    >
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-slate-500">
                      {option.hint}
                    </span>
                  </button>
                )
              })}
            </div>

            {settings.mode === 'simple' && (
              <p className="mt-2 rounded-md border border-amber-400/20 bg-amber-400/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-200">
                O modo simples ainda está sendo construído. Por enquanto a
                interface avançada continua sendo usada.
              </p>
            )}

            <div className="mt-2">
              <Switch
                checked={settings.showMetrics}
                onChange={(value) => onChange({ showMetrics: value })}
                title="Mostrar métricas no final"
                description="Exibe o painel de métricas (totais, imagem mais recente e qualidade) no rodapé do gerador."
              />
            </div>
          </section>
        </div>

        <footer className="flex justify-end border-t border-white/5 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:bg-white/5"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>
  )
}
