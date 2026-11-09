import { useEffect, useRef } from 'react'
import { Wand2, X } from 'lucide-react'

import { formatElapsed } from '../../lib/api'
import { Alert, Card, PrimaryButton, inputClass } from './ui'

/**
 * Coluna direita: correção em lote ou de um frame específico.
 *
 * @param {{
 *   prompt: string,
 *   onPromptChange: (value: string) => void,
 *   onApply: () => void,
 *   busy: boolean,
 *   disabled: boolean,
 *   editingFrame: number | null,
 *   onClearEditing: () => void,
 *   frameCount: number,
 *   error: string,
 *   elapsed: number,
 * }} props
 */
export default function CorrectionPanel({
  prompt,
  onPromptChange,
  onApply,
  busy,
  disabled,
  editingFrame,
  onClearEditing,
  frameCount,
  error,
  elapsed,
}) {
  const textareaRef = useRef(null)

  // Ao clicar em "Editar Frame", leva o foco para a instrução.
  useEffect(() => {
    if (editingFrame === null) return
    const element = textareaRef.current
    if (!element) return
    element.focus({ preventScroll: false })
    element.setSelectionRange(element.value.length, element.value.length)
  }, [editingFrame])

  const batch = editingFrame === null

  return (
    <Card
      title={batch ? 'Correção em Lote' : `Editar Frame #${editingFrame + 1}`}
      subtitle="Preserva os frames e aplica só o ajuste pedido"
      icon={Wand2}
    >
      <div className="space-y-3">
        {batch ? (
          <p className="text-[11px] leading-relaxed text-slate-500">
            A instrução é aplicada a{' '}
            <span className="font-semibold text-slate-300">
              todos os {frameCount} frame{frameCount === 1 ? '' : 's'}
            </span>{' '}
            atuais, que são enviados como contexto para a IA.
          </p>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2">
            <p className="text-[11px] font-medium text-amber-200">
              Corrigindo somente o frame #{editingFrame + 1} de {frameCount}.
            </p>
            <button
              type="button"
              onClick={onClearEditing}
              className="rounded p-1 text-amber-200 transition hover:bg-amber-400/15"
              aria-label="Cancelar edição do frame"
              title="Cancelar edição do frame"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          rows={4}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="Ex.: adicionar mais brilho na espada e corrigir a mão direita…"
          className={`${inputClass} resize-y`}
          disabled={disabled || busy}
          aria-label="Instrução de correção"
        />

        <PrimaryButton
          onClick={onApply}
          loading={busy}
          loadingLabel={`Aplicando… ${formatElapsed(elapsed)}`}
          icon={Wand2}
          disabled={disabled || !prompt.trim() || frameCount === 0}
          className="from-violet-500 to-indigo-600 shadow-indigo-950/40 hover:from-violet-400 hover:to-indigo-500"
        >
          <span className="font-mono">
            {batch ? '[ APLICAR CORREÇÃO EM LOTE ]' : `[ CORRIGIR FRAME #${editingFrame + 1} ]`}
          </span>
        </PrimaryButton>

        {!batch && (
          <button
            type="button"
            onClick={onClearEditing}
            className="w-full rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
          >
            Voltar para correção em lote
          </button>
        )}

        {error && <Alert tone="error">{error}</Alert>}

        <p className="text-[10px] leading-relaxed text-slate-500">
          Dica: descreva somente o que deve mudar. O estilo e a identidade do
          personagem vêm das referências e dos frames atuais.
        </p>
      </div>
    </Card>
  )
}
