import { Check, Undo2, X } from 'lucide-react'

/**
 * Confirmação da correção em lote: compara a folha atual com a editada e deixa
 * o usuário escolher qual manter (mesmo fluxo da correção por frame).
 *
 * @param {{
 *   open: boolean,
 *   previous: string | null,
 *   candidate: string | null,
 *   onUseCandidate: () => void,
 *   onKeepCurrent: () => void,
 * }} props
 */
export default function BatchEditModal({
  open,
  previous,
  candidate,
  onUseCandidate,
  onKeepCurrent,
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onKeepCurrent}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-edit-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-3xl rounded-xl border border-white/10 bg-[#0b111c] p-4 shadow-2xl shadow-black/60"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2
              id="batch-edit-title"
              className="text-[13px] font-semibold text-slate-100"
            >
              Correção em lote concluída
            </h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
              Escolha qual versão manter. Nada muda até você confirmar.
            </p>
          </div>
          <button
            type="button"
            onClick={onKeepCurrent}
            aria-label="Fechar"
            className="grid size-7 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              Antes (atual)
            </p>
            <div className="bg-checkerboard grid min-h-[180px] place-items-center overflow-hidden rounded-lg border border-white/10 p-2">
              {previous ? (
                <img
                  src={previous}
                  alt="Versão atual"
                  className="pixelated max-h-[280px] max-w-full object-contain"
                />
              ) : (
                <span className="text-[11px] text-slate-500">Sem imagem</span>
              )}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-semibold tracking-wider text-cyan-300 uppercase">
              Depois (editada)
            </p>
            <div className="bg-checkerboard grid min-h-[180px] place-items-center overflow-hidden rounded-lg border border-cyan-400/30 p-2">
              {candidate ? (
                <img
                  src={candidate}
                  alt="Versão editada"
                  className="pixelated max-h-[280px] max-w-full object-contain"
                />
              ) : (
                <span className="text-[11px] text-slate-500">Sem imagem</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onKeepCurrent}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[11px] font-semibold text-slate-300 transition hover:bg-white/5"
          >
            <Undo2 className="size-3.5" />
            [ MANTER ATUAL ]
          </button>
          <button
            type="button"
            onClick={onUseCandidate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
          >
            <Check className="size-3.5" />
            [ USAR EDITADA ]
          </button>
        </div>
      </div>
    </div>
  )
}
