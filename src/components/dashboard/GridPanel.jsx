import { Grid3X3, Loader2 } from 'lucide-react'

import { Card, inputClass, labelClass } from './ui'

/**
 * Grade usada apenas para recortar a referência e o resultado em frames.
 *
 * A quantidade de frames desenhada pela IA vem de "Frames a Gerar" (coluna
 * esquerda) e é independente destes campos.
 *
 * @param {{
 *   referenceGrid: { columns: number, rows: number, total?: number },
 *   generationColumns: string,
 *   generationRows: string,
 *   columns: string,
 *   rows: string,
 *   autoSlice: boolean,
 *   slicing: boolean,
 *   frameCount: number,
 *   onColumnsChange: (value: string) => void,
 *   onRowsChange: (value: string) => void,
 *   onAutoSliceChange: (value: boolean) => void,
 * }} props
 */
export default function GridPanel({
  referenceGrid,
  generationColumns,
  generationRows,
  columns,
  rows,
  autoSlice,
  slicing,
  frameCount,
  onColumnsChange,
  onRowsChange,
  onAutoSliceChange,
}) {
  const requestedColumns = Math.max(
    1,
    Math.min(64, Number.parseInt(generationColumns, 10) || 1),
  )
  const requestedRows = Math.max(
    1,
    Math.min(64, Number.parseInt(generationRows, 10) || 1),
  )
  const requestedTotal = requestedColumns * requestedRows

  return (
    <Card
      title="Grade de Recorte"
      subtitle="Recorta a referência e o resultado"
      icon={Grid3X3}
      bodyClassName="p-3"
      help={
        <>
          <p>
            Esta grade serve apenas para recortar a referência e o resultado em
            Colunas × Linhas. Ela não altera quantos frames a IA desenha.
          </p>
          <p>
            A quantidade desenhada vem de <strong>Frames a Gerar</strong>, na
            coluna esquerda. Ative <strong>Auto-fatiar</strong> para aplicar a
            grade à exibição; desligado, a folha é tratada como imagem única.
          </p>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[10px] text-slate-500">
          IA:{' '}
          <strong className="text-slate-300">
            {requestedColumns}×{requestedRows} = {requestedTotal}
          </strong>{' '}
          · recorte:{' '}
          <strong className="text-slate-300">
            {referenceGrid.columns}×{referenceGrid.rows}
          </strong>
        </p>

        <label className="flex cursor-pointer items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
            <Grid3X3 className="size-3.5 text-cyan-400" />
            Auto-fatiar grid (exibição)
          </span>
          <input
            type="checkbox"
            checked={autoSlice}
            onChange={(event) => onAutoSliceChange(event.target.checked)}
            className="size-4 accent-cyan-400"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={`${labelClass} mb-1`} htmlFor="grid-columns">
              Colunas
            </label>
            <input
              id="grid-columns"
              type="number"
              min={1}
              max={64}
              value={columns}
              disabled={!autoSlice}
              onChange={(event) => onColumnsChange(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={`${labelClass} mb-1`} htmlFor="grid-rows">
              Linhas
            </label>
            <input
              id="grid-rows"
              type="number"
              min={1}
              max={64}
              value={rows}
              disabled={!autoSlice}
              onChange={(event) => onRowsChange(event.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
          <span className="text-slate-500">
            {slicing ? (
              <span className="inline-flex items-center gap-1.5 text-cyan-300">
                <Loader2 className="size-3 animate-spin" />
                aplicando grade…
              </span>
            ) : (
              `${frameCount} frame${frameCount === 1 ? '' : 's'}`
            )}
          </span>
          {!autoSlice && (
            <span className="text-amber-300 text-[10px]">
              Grade de recorte desativada
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}
