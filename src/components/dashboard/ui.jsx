import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react'

/** Classes compartilhadas pelos campos de formulário. */
export const inputClass =
  'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 ' +
  'placeholder:text-slate-600 transition focus:border-cyan-400/60 focus:ring-2 ' +
  'focus:ring-cyan-400/15 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50'

export const selectClass = `${inputClass} cursor-pointer pr-8`

export const labelClass =
  'mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase'

/**
 * Card com cabeçalho opcional.
 *
 * @param {{
 *   title?: string,
 *   subtitle?: string,
 *   icon?: import('lucide-react').LucideIcon,
 *   badge?: import('react').ReactNode,
 *   children: import('react').ReactNode,
 *   className?: string,
 *   bodyClassName?: string,
 * }} props
 */
export function Card({
  title,
  subtitle,
  icon: Icon,
  badge,
  children,
  className = '',
  bodyClassName = 'p-4',
}) {
  return (
    <section
      className={`rounded-xl border border-white/10 bg-surface/85 shadow-lg shadow-black/25 backdrop-blur ${className}`}
    >
      {(title || Icon) && (
        <header className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="size-4 shrink-0 text-cyan-400" />}
            <div className="min-w-0">
              <h2 className="truncate text-[13px] font-semibold tracking-tight text-slate-100">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-0.5 truncate text-[11px] text-slate-500">{subtitle}</p>
              )}
            </div>
          </div>
          {badge}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

/**
 * Rótulo + conteúdo de um campo.
 *
 * @param {{
 *   label: string,
 *   icon?: import('lucide-react').LucideIcon,
 *   hint?: import('react').ReactNode,
 *   htmlFor?: string,
 *   children: import('react').ReactNode,
 *   className?: string,
 * }} props
 */
export function Field({ label, icon: Icon, hint, htmlFor, children, className = '' }) {
  return (
    <div className={className}>
      <label className={labelClass} htmlFor={htmlFor}>
        {Icon && <Icon className="size-3.5" />}
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{hint}</p>}
    </div>
  )
}

const ALERT_TONES = {
  error: {
    icon: XCircle,
    box: 'border-rose-500/25 bg-rose-500/10 text-rose-200',
  },
  warning: {
    icon: AlertTriangle,
    box: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
  },
  success: {
    icon: CheckCircle2,
    box: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
  },
  info: {
    icon: Info,
    box: 'border-sky-400/25 bg-sky-400/10 text-sky-200',
  },
}

/**
 * Mensagem de erro/aviso/sucesso.
 *
 * @param {{
 *   tone?: keyof typeof ALERT_TONES,
 *   title?: string,
 *   children?: import('react').ReactNode,
 *   className?: string,
 * }} props
 */
export function Alert({ tone = 'error', title, children, className = '' }) {
  const toneUi = ALERT_TONES[tone] ?? ALERT_TONES.info
  const Icon = toneUi.icon
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] leading-relaxed ${toneUi.box} ${className}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
      </div>
    </div>
  )
}

/**
 * Botão primário com estado de carregamento.
 *
 * @param {{
 *   children: import('react').ReactNode,
 *   loading?: boolean,
 *   loadingLabel?: string,
 *   icon?: import('lucide-react').LucideIcon,
 *   className?: string,
 * } & import('react').ButtonHTMLAttributes<HTMLButtonElement>} props
 */
export function PrimaryButton({
  children,
  loading = false,
  loadingLabel,
  icon: Icon,
  className = '',
  disabled,
  ...rest
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2.5 text-[12px] font-bold tracking-wide text-white uppercase shadow-lg shadow-blue-950/40 transition hover:from-sky-400 hover:to-blue-500 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none ${className}`}
      {...rest}
    >
      {loading ? (
        <Loader2 className="size-4 shrink-0 animate-spin" />
      ) : (
        Icon && <Icon className="size-4 shrink-0" />
      )}
      <span className="truncate">{loading ? loadingLabel || 'Processando…' : children}</span>
    </button>
  )
}

/**
 * Botão secundário (contorno).
 *
 * @param {{
 *   children: import('react').ReactNode,
 *   icon?: import('lucide-react').LucideIcon,
 *   loading?: boolean,
 *   className?: string,
 * } & import('react').ButtonHTMLAttributes<HTMLButtonElement>} props
 */
export function SecondaryButton({
  children,
  icon: Icon,
  loading = false,
  className = '',
  disabled,
  ...rest
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[12px] font-semibold text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...rest}
    >
      {loading ? (
        <Loader2 className="size-4 shrink-0 animate-spin" />
      ) : (
        Icon && <Icon className="size-4 shrink-0" />
      )}
      <span className="truncate">{children}</span>
    </button>
  )
}

/**
 * Selo compacto usado nos cabeçalhos.
 *
 * @param {{ children: import('react').ReactNode, tone?: 'neutral' | 'cyan' | 'green' | 'amber' | 'violet' }} props
 */
export function Pill({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'border-white/10 bg-white/[0.04] text-slate-400',
    cyan: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-300',
    green: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
    amber: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
    violet: 'border-violet-400/25 bg-violet-400/10 text-violet-300',
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  )
}
