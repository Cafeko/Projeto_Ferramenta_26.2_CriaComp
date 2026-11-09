import { Download, Film, Grid3X3 } from 'lucide-react'

import { Card, SecondaryButton, inputClass, labelClass } from './ui'

/**
 * Coluna direita: exportação local da spritesheet e do GIF.
 *
 * @param {{
 *   frames: string[],
 *   columns: string,
 *   onColumnsChange: (value: string) => void,
 *   onExportGrid: () => void,
 *   onExportGif: () => void,
 *   exporting: 'grid' | 'gif' | null,
 *   fps: number,
 * }} props
 */
export default function ExportPanel({
  frames,
  columns,
  onColumnsChange,
  onExportGrid,
  onExportGif,
  exporting,
  fps,
}) {
  const total = frames.length
  const parsedColumns = Math.max(1, Number.parseInt(columns, 10) || 1)
  const usedColumns = total > 0 ? Math.min(parsedColumns, total) : parsedColumns
  const rowCount = total > 0 ? Math.ceil(total / usedColumns) : 0

  return (
    <Card title="Exportação" subtitle="Download direto do navegador" icon={Download}>
      <div className="space-y-3">
        <div>
          <label className={labelClass} htmlFor="export-columns">
            <Grid3X3 className="size-3.5" />
            Colunas da grade
          </label>
          <input
            id="export-columns"
            type="number"
            min={1}
            max={Math.max(1, total)}
            value={columns}
            onChange={(event) => onColumnsChange(event.target.value)}
            className={inputClass}
            disabled={total === 0}
          />
          <p className="mt-1.5 text-[11px] text-slate-500">
            {total > 0
              ? `${usedColumns} coluna${usedColumns === 1 ? '' : 's'} × ${rowCount} linha${rowCount === 1 ? '' : 's'} · ${total} frames`
              : 'Gere frames para habilitar a exportação.'}
          </p>
        </div>

        <SecondaryButton
          onClick={onExportGrid}
          loading={exporting === 'grid'}
          icon={Grid3X3}
          disabled={total === 0 || Boolean(exporting)}
        >
          <span className="font-mono text-[11px]">
            [ EXPORTAR SPRITESHEET PNG (GRID) ]
          </span>
        </SecondaryButton>

        <SecondaryButton
          onClick={onExportGif}
          loading={exporting === 'gif'}
          icon={Film}
          disabled={total === 0 || Boolean(exporting)}
        >
          <span className="font-mono text-[11px]">[ EXPORTAR GIF ANIMADO ]</span>
        </SecondaryButton>

        <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
          <p>
            GIF gerado a <span className="font-mono text-slate-300">{fps} FPS</span>,
            com fundo transparente e loop infinito.
          </p>
          <p className="mt-1">
            A spritesheet sai em PNG transparente, pronta para engines como
            Unity, Godot ou Aseprite.
          </p>
        </div>
      </div>
    </Card>
  )
}
