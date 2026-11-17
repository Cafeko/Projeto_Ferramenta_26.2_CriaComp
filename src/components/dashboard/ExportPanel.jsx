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
 * }} props
 */
export default function ExportPanel({
  frames,
  columns,
  onColumnsChange,
  onExportGrid,
  onExportGif,
  exporting,
}) {
  const total = frames.length
  const parsedColumns = Math.max(1, Number.parseInt(columns, 10) || 1)
  const usedColumns = total > 0 ? Math.min(parsedColumns, total) : parsedColumns
  const rowCount = total > 0 ? Math.ceil(total / usedColumns) : 0

  return (
    <Card
      title="Exportação"
      subtitle="Download direto do navegador"
      icon={Download}
      help={
        <>
          <p>
            A spritesheet sai em PNG transparente na grade de colunas escolhida,
            pronta para engines como Unity, Godot ou Aseprite.
          </p>
          <p>
            O GIF animado usa o FPS atual do modo <strong>Animação</strong>, com
            fundo transparente e loop infinito. Os dois são processados
            localmente no navegador.
          </p>
        </>
      }
    >
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
      </div>
    </Card>
  )
}
