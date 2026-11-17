import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Download,
  Search,
  Trash2,
  X,
} from 'lucide-react'

import { PROVIDERS, formatDuration, formatUsd } from '../../lib/api'
import { qualityGrade } from '../../utils/qualityMetrics'
import { HelpTip, Pill } from './ui'

const KIND_LABELS = {
  generation: 'Geração',
  single: 'Correção individual',
  batch: 'Correção em lote',
  edit: 'Edição',
}

const PROVIDER_LABELS = Object.fromEntries(
  PROVIDERS.map((provider) => [provider.id, provider.label]),
)

const RANGE_OPTIONS = [
  { id: 'all', label: 'Todo o período' },
  { id: '24h', label: 'Últimas 24 h' },
  { id: '7d', label: 'Últimos 7 dias' },
  { id: '30d', label: 'Últimos 30 dias' },
]

function statusOf(entry) {
  return entry.status === 'error' ? 'error' : 'success'
}

function statusLabel(entry) {
  return statusOf(entry) === 'error' ? 'Erro' : 'Sucesso'
}

function formatTokens(value) {
  if (typeof value !== 'number') return '—'
  return value.toLocaleString('pt-BR')
}

function formatDateTime(value) {
  if (typeof value !== 'number') return '—'
  return new Date(value).toLocaleString('pt-BR')
}

function providerLabel(provider) {
  return PROVIDER_LABELS[provider] || provider || '—'
}

function qualityText(quality) {
  if (!quality || typeof quality.score !== 'number') return '—'
  return `${quality.score}/100 · ${qualityGrade(quality.score).label}`
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(entries) {
  const header = [
    'Data/hora',
    'Status',
    'Tipo',
    'Provedor/API',
    'Modelo',
    'Duração (ms)',
    'Tempo no servidor (ms)',
    'Tokens entrada',
    'Tokens saída',
    'Tokens total',
    'Imagens',
    'Custo (USD)',
    'Fonte do custo',
    'Qualidade (0-100)',
    'Pose',
    'Consistência',
    'Pixel art',
    'Código do erro',
    'Mensagem de erro',
  ]

  const rows = entries.map((entry) => [
    formatDateTime(entry.at),
    statusLabel(entry),
    KIND_LABELS[entry.kind] || entry.kind || '',
    providerLabel(entry.provider),
    entry.modelId || '',
    entry.usage?.clientElapsedMs ?? '',
    entry.usage?.serverElapsedMs ?? '',
    entry.usage?.inputTokens ?? '',
    entry.usage?.outputTokens ?? '',
    entry.usage?.totalTokens ?? '',
    entry.usage?.imageCount ?? '',
    typeof entry.usage?.costUsd === 'number'
      ? entry.usage.costUsd.toFixed(6).replace('.', ',')
      : '',
    entry.usage?.costSource || '',
    entry.quality?.score ?? '',
    entry.quality?.pose ?? '',
    entry.quality?.consistency ?? '',
    entry.quality?.pixelArt ?? '',
    entry.errorCode || '',
    entry.errorMessage || '',
  ])

  const csv = `\uFEFF${[header, ...rows]
    .map((row) => row.map(csvCell).join(';'))
    .join('\r\n')}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  link.href = url
  link.download = `spritetransfer-logs-${stamp}.csv`
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
}

function Detail({ label, value }) {
  return (
    <div className="rounded-md border border-white/5 bg-black/20 px-2 py-1.5">
      <p className="text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
        {label}
      </p>
      <p className="mt-0.5 break-words text-[11px] text-slate-300">{value || '—'}</p>
    </div>
  )
}

/**
 * Página de logs de requisições de IA.
 *
 * O histórico é local (localStorage), sem imagens: apenas métricas, status,
 * modelo/API e a nota de qualidade de cada chamada.
 *
 * @param {{
 *   open: boolean,
 *   history: Array<Record<string, any>>,
 *   onClose: () => void,
 *   onClear: () => void,
 * }} props
 */
export default function LogsPage({ open, history, onClose, onClear }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [provider, setProvider] = useState('all')
  const [kind, setKind] = useState('all')
  const [range, setRange] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      // Uma ajuda (?) aberta fecha só ela, não a página inteira.
      if (document.querySelector('[role="dialog"][aria-label^="Ajuda"]')) return
      if (confirmClear) setConfirmClear(false)
      else onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, confirmClear, onClose])

  const providers = useMemo(() => {
    const found = new Set(history.map((entry) => entry.provider).filter(Boolean))
    return Array.from(found)
  }, [history])

  const filtered = useMemo(() => {
    const cutoff =
      range === '24h'
        ? Date.now() - 24 * 60 * 60 * 1000
        : range === '7d'
          ? Date.now() - 7 * 24 * 60 * 60 * 1000
          : range === '30d'
            ? Date.now() - 30 * 24 * 60 * 60 * 1000
            : null
    const needle = query.trim().toLowerCase()

    return [...history]
      .reverse()
      .filter((entry) => {
        if (cutoff !== null && entry.at < cutoff) return false
        if (status !== 'all' && statusOf(entry) !== status) return false
        if (provider !== 'all' && entry.provider !== provider) return false
        if (kind !== 'all' && entry.kind !== kind) return false
        if (!needle) return true
        const text = [
          entry.modelId,
          providerLabel(entry.provider),
          entry.errorCode,
          entry.errorMessage,
          KIND_LABELS[entry.kind],
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return text.includes(needle)
      })
  }, [history, query, status, provider, kind, range])

  if (!open) return null

  const hasFilters =
    query !== '' ||
    status !== 'all' ||
    provider !== 'all' ||
    kind !== 'all' ||
    range !== 'all'

  const resetFilters = () => {
    setQuery('')
    setStatus('all')
    setProvider('all')
    setKind('all')
    setRange('all')
  }

  return (
    <div className="fixed inset-0 z-[130] overflow-y-auto bg-[#070b12]">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
              <Activity className="size-3" />
              Atividade / Logs
            </p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-100">
              Logs de requisições
            </h1>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-slate-500">
              Cada chamada de geração ou correção, mais recente primeiro. As
              últimas 100 ficam salvas neste dispositivo; as imagens não são
              armazenadas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <HelpTip
              label="Ajuda: Logs"
              content={
                <>
                  <p>
                    O histórico guarda status, data/hora, duração, tokens, custo,
                    modelo/API e a nota de qualidade de cada requisição.
                  </p>
                  <p>
                    As imagens não são salvas. O histórico fica no{' '}
                    <code>localStorage</code> deste navegador e é limitado às
                    últimas 100 chamadas.
                  </p>
                  <p>
                    Use os filtros para localizar chamadas e “Exportar CSV” para
                    abrir a tabela no Excel.
                  </p>
                </>
              }
            />
            <button
              type="button"
              onClick={() => downloadCsv(filtered)}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] font-semibold text-slate-300 transition hover:border-cyan-400/30 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="size-3.5" />
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              disabled={history.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] font-semibold text-slate-400 transition hover:border-rose-400/30 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="size-3.5" />
              Limpar histórico
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] font-semibold text-slate-300 transition hover:bg-white/5"
            >
              <X className="size-3.5" />
              Voltar
            </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="relative min-w-[220px] flex-1">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por modelo, API ou erro…"
              className="w-full rounded-lg border border-white/10 bg-black/30 py-2 pr-3 pl-8 text-[11px] text-slate-100 placeholder:text-slate-600 focus:border-cyan-400/60 focus:outline-none"
            />
          </label>

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-[11px] text-slate-200 focus:border-cyan-400/60 focus:outline-none"
            aria-label="Filtrar por status"
          >
            <option value="all">Status: todos</option>
            <option value="success">Sucesso</option>
            <option value="error">Erro</option>
          </select>

          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-[11px] text-slate-200 focus:border-cyan-400/60 focus:outline-none"
            aria-label="Filtrar por provedor"
          >
            <option value="all">API: todas</option>
            {providers.map((id) => (
              <option key={id} value={id}>
                {providerLabel(id)}
              </option>
            ))}
          </select>

          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-[11px] text-slate-200 focus:border-cyan-400/60 focus:outline-none"
            aria-label="Filtrar por tipo"
          >
            <option value="all">Tipo: todos</option>
            <option value="generation">Geração</option>
            <option value="single">Correção individual</option>
            <option value="batch">Correção em lote</option>
            <option value="edit">Edição (modo editor)</option>
          </select>

          <select
            value={range}
            onChange={(event) => setRange(event.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-[11px] text-slate-200 focus:border-cyan-400/60 focus:outline-none"
            aria-label="Filtrar por período"
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>

          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg px-2 py-2 text-[11px] font-semibold text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
            >
              Limpar filtros
            </button>
          )}

          <span className="ml-auto text-[10px] text-slate-500">
            {filtered.length} de {history.length} requisição
            {history.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10 bg-surface/60">
          <table className="min-w-full text-left text-[11px]">
            <thead className="bg-white/[0.03] text-[10px] tracking-wider text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Data/hora</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Tipo</th>
                <th className="px-3 py-2.5 font-semibold">Modelo / API</th>
                <th className="px-3 py-2.5 font-semibold">Duração</th>
                <th className="px-3 py-2.5 font-semibold">Tokens</th>
                <th className="px-3 py-2.5 font-semibold">Custo</th>
                <th className="px-3 py-2.5 font-semibold">Qualidade</th>
                <th className="w-8 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const isExpanded = expandedId === entry.id
                return (
                  <Fragment key={entry.id}>
                    <tr
                      className="border-t border-white/5 align-top hover:bg-white/[0.02]"
                    >
                      <td className="px-3 py-2.5 font-mono text-[10px] whitespace-nowrap text-slate-400">
                        {formatDateTime(entry.at)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Pill
                          tone={statusOf(entry) === 'error' ? 'red' : 'green'}
                        >
                          <span
                            className={`size-1.5 rounded-full ${
                              statusOf(entry) === 'error'
                                ? 'bg-rose-400'
                                : 'bg-emerald-400'
                            }`}
                          />
                          {statusLabel(entry)}
                        </Pill>
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">
                        {KIND_LABELS[entry.kind] || entry.kind || '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-200">
                          {entry.modelId || '—'}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {providerLabel(entry.provider)}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-300">
                        {formatDuration(entry.usage?.clientElapsedMs)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-300">
                        {formatTokens(entry.usage?.totalTokens)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-300">
                        {formatUsd(entry.usage?.costUsd)}
                      </td>
                      <td className="px-3 py-2.5">
                        {entry.quality ? (
                          <div>
                            <p className="font-mono text-slate-300">
                              {entry.quality.score}/100
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {qualityGrade(entry.quality.score).label}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : entry.id)
                          }
                          aria-label={
                            isExpanded ? 'Ocultar detalhes' : 'Ver detalhes'
                          }
                          className="grid size-6 place-items-center rounded text-slate-500 transition hover:bg-white/5 hover:text-slate-200"
                        >
                          {isExpanded ? (
                            <ChevronUp className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr
                        key={`${entry.id}-details`}
                        className="border-t border-white/5 bg-black/20"
                      >
                        <td colSpan={9} className="px-3 py-3">
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <Detail
                              label="Tempo no servidor"
                              value={formatDuration(entry.usage?.serverElapsedMs)}
                            />
                            <Detail
                              label="Tokens entrada"
                              value={formatTokens(entry.usage?.inputTokens)}
                            />
                            <Detail
                              label="Tokens saída"
                              value={formatTokens(entry.usage?.outputTokens)}
                            />
                            <Detail
                              label="Imagens"
                              value={entry.usage?.imageCount ?? '—'}
                            />
                            <Detail
                              label="Fonte do custo"
                              value={
                                entry.usage?.costNote ||
                                entry.usage?.costSource ||
                                '—'
                              }
                            />
                            <Detail
                              label="Qualidade"
                              value={qualityText(entry.quality)}
                            />
                            <Detail
                              label="Pose"
                              value={
                                entry.quality?.pose === null ||
                                entry.quality?.pose === undefined
                                  ? '—'
                                  : `${entry.quality.pose}/100`
                              }
                            />
                            <Detail
                              label="Consistência"
                              value={
                                entry.quality?.consistency === null ||
                                entry.quality?.consistency === undefined
                                  ? '—'
                                  : `${entry.quality.consistency}/100`
                              }
                            />
                            <Detail
                              label="Pixel art"
                              value={
                                entry.quality?.pixelArt === null ||
                                entry.quality?.pixelArt === undefined
                                  ? '—'
                                  : `${entry.quality.pixelArt}/100`
                              }
                            />
                            {statusOf(entry) === 'error' && (
                              <Detail
                                label="Erro"
                                value={`${entry.errorCode || 'request_failed'}${
                                  entry.errorMessage
                                    ? ` — ${entry.errorMessage}`
                                    : ''
                                }`}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <p className="px-4 py-10 text-center text-[11px] text-slate-500">
              {history.length === 0
                ? 'Nenhuma requisição registrada ainda.'
                : 'Nenhuma requisição corresponde aos filtros.'}
            </p>
          )}
        </div>

        <p className="mt-3 text-[10px] text-slate-600">
          Histórico local · sem imagens · últimas 100 requisições
        </p>
      </div>

      {confirmClear && (
        <div
          className="fixed inset-0 z-[140] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setConfirmClear(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-logs-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-white/10 bg-[#0b111c] p-4 shadow-2xl shadow-black/60"
          >
            <h2
              id="clear-logs-title"
              className="text-[13px] font-semibold text-slate-100"
            >
              Limpar todo o histórico?
            </h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
              Todas as requisições registradas serão apagadas deste dispositivo.
              Esta ação não pode ser desfeita.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onClear?.()
                  setConfirmClear(false)
                  setExpandedId(null)
                }}
                className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-[11px] font-semibold text-rose-200 transition hover:bg-rose-500/25"
              >
                Limpar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
