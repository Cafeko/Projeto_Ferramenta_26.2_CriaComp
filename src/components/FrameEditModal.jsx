import { useCallback } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Play,
  RefreshCw,
  Scan,
  X,
  Zap,
} from 'lucide-react'

import { Alert, Card, PrimaryButton, SecondaryButton, inputClass } from './dashboard/ui'

/**
 * Modal de edição de frame isolado com comparador triplo.
 *
 * Exibe lado a lado: Pose Original (referência), Frame Atual (com defeito) e
 * Preview da Correção. Permite aplicar a correção apenas no frame corrente ou
 * propagar a instrução para toda a sequência.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   frameIndex: number,
 *   originalFrame: string,
 *   currentFrame: string,
 *   previewFrame: string | null,
 *   candidateFrame: string | null,
 *   correctionPrompt: string,
 *   onPromptChange: (value: string) => void,
 *   onApplySingle: () => void,
 *   onApplyAll: () => void,
 *   onUseCandidate: () => void,
 *   onDiscardCandidate: () => void,
 *   applyingSingle: boolean,
 *   applyingAll: boolean,
 * }} props
 */
export default function FrameEditModal({
  open,
  onClose,
  frameIndex,
  originalFrame,
  currentFrame,
  previewFrame,
  candidateFrame,
  correctionPrompt,
  onPromptChange,
  onApplySingle,
  onApplyAll,
  onUseCandidate,
  onDiscardCandidate,
  applyingSingle,
  applyingAll,
}) {
  if (!open) return null

  const hasPreview = Boolean(previewFrame)
  const hasCandidate = Boolean(candidateFrame)
  const isCorrecting = applyingSingle || applyingAll

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Edição de frame isolado"
    >
      {/* Backdrop com fechamento ao clicar fora */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Conteúdo do modal */}
      <div className="relative flex min-h-full items-center justify-center p-3 sm:p-6">
        <div
          className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/10 bg-surface p-4 shadow-2xl shadow-black/60 animate-in fade-in zoom-in duration-200 sm:p-6"
        >
        <header className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-lg font-semibold text-white">
            Editar Frame <span className="text-cyan-400 font-mono">#{frameIndex + 1}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white"
            aria-label="Fechar editor de frame"
          >
            <X className="size-5" />
          </button>
        </header>

        {/* ------------------------------------ Comparador Triplo ------------------------------------ */}
        <Card
          title="Comparador Triplo"
          subtitle="Pose original · Frame atual com defeito · Preview da correção"
          icon={Zap}
          bodyClassName="p-3"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Coluna 1: Pose Original */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase flex items-center gap-1.5">
                <Scan className="size-3.5 text-slate-500" />
                Pose Original
              </p>
              <div className="bg-checkerboard h-36 sm:h-44 rounded-lg border border-white/10 overflow-hidden relative group">
                {originalFrame ? (
                  <img
                    src={originalFrame}
                    alt="Pose original de referência"
                    className="pixelated h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-slate-600">
                    <ImageIcon className="size-8 opacity-50" />
                    <p className="mt-2 text-[11px]">Sem referência</p>
                  </div>
                )}
                <span className="absolute top-1 left-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-[9px] font-semibold text-slate-300 border border-white/10">
                  REFERÊNCIA
                </span>
              </div>
            </div>

            {/* Coluna 2: Frame Atual (com defeito) */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold tracking-wide text-amber-400 uppercase flex items-center gap-1.5">
                <AlertTriangle className="size-3.5" />
                Frame Atual
              </p>
              <div className="bg-checkerboard h-36 sm:h-44 rounded-lg border border-white/10 overflow-hidden relative group">
                <img
                  src={currentFrame}
                  alt="Frame gerado atual"
                  className="pixelated h-full w-full object-contain"
                />
                <span className="absolute top-1 right-1 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-200 border border-rose-500/30">
                  DEFEITO
                </span>
              </div>
            </div>

            {/* Coluna 3: Preview da Correção */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold tracking-wide text-cyan-400 uppercase flex items-center gap-1.5">
                <RefreshCw className="size-3.5" />
                Preview da Correção
              </p>
              <div className="bg-checkerboard h-36 sm:h-44 rounded-lg border border-white/10 overflow-hidden relative flex flex-col items-center justify-center">
                {hasPreview && previewFrame ? (
                  <img
                    src={previewFrame}
                    alt="Preview do frame corrigido"
                    className="pixelated h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-slate-500">
                    <Play className="size-8 opacity-40" />
                    <p className="mt-2 text-[11px]">
                      Aplique a correção para visualizar o resultado aqui
                    </p>
                  </div>
                )}
                {hasCandidate && (
                  <span className="absolute top-1 right-1 z-10 rounded bg-amber-400/90 px-1.5 py-0.5 text-[9px] font-bold text-slate-950">
                    CANDIDATO
                  </span>
                )}
                {isCorrecting && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-canvas/70 backdrop-blur-sm z-10">
                    <Loader2 className="size-5 animate-spin text-cyan-300" />
                    <p className="text-[10px] font-medium text-cyan-200">
                      {applyingSingle ? 'Corrigindo frame…' : 'Propagando correção…'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {hasCandidate && (
          <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] p-3">
            <p className="text-[11px] font-semibold text-amber-200">
              Correção pronta — escolha qual frame manter:
            </p>
            <p className="mt-0.5 text-[10px] text-slate-400">
              O frame atual ainda não foi alterado. Nada é substituído até você
              escolher.
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <SecondaryButton
                onClick={onDiscardCandidate}
                icon={X}
                className="justify-center"
              >
                <span className="font-mono text-[11px] leading-none">
                  [ MANTER FRAME ATUAL ]
                </span>
              </SecondaryButton>
              <PrimaryButton
                onClick={onUseCandidate}
                icon={CheckCircle2}
                className="justify-center"
              >
                <span className="font-mono text-[11px] leading-none">
                  [ USAR FRAME CORRIGIDO ]
                </span>
              </PrimaryButton>
            </div>
          </div>
        )}

        {/* ------------------------------------ Instrução de Correção ------------------------------------ */}
        <Card
          title="Instrução de Correção Pontual"
          subtitle="Descreva o ajuste desejado para este quadro"
          icon={ImageIcon}
          bodyClassName="p-3"
        >
          <div className="space-y-2">
            <textarea
              value={correctionPrompt}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder="Ex.: elevar o braço esquerdo em 15 graus, ajustar o brilho da espada…"
              rows={3}
              disabled={isCorrecting}
              className={`${inputClass} resize-y`}
              aria-label="Instrução de correção para o frame"
            />
            <p className="text-[11px] leading-relaxed text-slate-500">
              A instrução é enviada ao modelo junto com o frame como contexto
              de correção (feedback loop).
            </p>
          </div>
        </Card>

        {/* ------------------------------------ Botões de Ação ------------------------------------ */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PrimaryButton
            onClick={onApplySingle}
            loading={applyingSingle}
            loadingLabel={`Aplicando no frame #${frameIndex + 1}…`}
            disabled={
              !correctionPrompt.trim() || isCorrecting
            }
            icon={Zap}
            className="from-rose-500 to-orange-600 shadow-rose-950/40 hover:from-rose-400 hover:to-orange-500"
          >
            <span className="font-mono text-[11px] leading-none">
              [ APLICAR CORREÇÃO APENAS NO FRAME #{frameIndex + 1} ]
            </span>
          </PrimaryButton>

          <PrimaryButton
            onClick={onApplyAll}
            loading={applyingAll}
            loadingLabel="Propagando para todos os frames…"
            disabled={
              !correctionPrompt.trim() || isCorrecting
            }
            icon={RefreshCw}
            className="from-violet-500 to-indigo-600 shadow-indigo-950/40 hover:from-violet-400 hover:to-indigo-500"
          >
            <span className="font-mono text-[11px] leading-none">
              [ APLICAR ESTA CORREÇÃO A TODOS OS FRAMES ]
            </span>
          </PrimaryButton>
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-[10px] text-slate-500">
          <CheckCircle2 className="size-3" />
          A correção individual fica guardada como candidata. Ao escolher “usar
          frame corrigido”, a spritesheet é remontada automaticamente.
        </p>
        </div>
      </div>
    </div>
  )
}
