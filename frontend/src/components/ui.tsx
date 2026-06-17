import type { ButtonHTMLAttributes, ReactNode } from 'react'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }
export function Button({ variant = 'primary', className = '', ...props }: BtnProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed'
  const styles: Record<string, string> = {
    primary: 'bg-[var(--color-gold)] text-white hover:brightness-110 active:brightness-95',
    ghost: 'bg-transparent text-ink ring-1 ring-[var(--color-line)] hover:bg-[var(--color-paper)]',
  }
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />
}

export function TierBadge({ tier }: { tier: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider"
      style={{ background: `color-mix(in srgb, var(--tier-${tier}) 18%, transparent)`, color: `var(--tier-${tier})` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: `var(--tier-${tier})` }} /> {tier}
    </span>
  )
}

/** A small SVG progress ring (deterministic, no dep) for tier progress. */
export function Ring({ pct, size = 64, label }: { pct: number; size?: number; label?: string }) {
  const r = size / 2 - 5
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.max(0, Math.min(1, pct)))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(253,246,227,0.2)" strokeWidth="5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f5c542" strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      {label && <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.22} fill="#fdf6e3" fontWeight="700">{label}</text>}
    </svg>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-ink-soft text-sm" role="status">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-gold)]" />
      {label}…
    </div>
  )
}
export function EmptyState({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="card border-dashed p-10 text-center">
      <p className="font-display text-lg text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{hint}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
export function ErrorNote({ message }: { message: string }) {
  return <p className="rounded-lg bg-red-500/8 px-3 py-2 text-sm text-red-600">{message}</p>
}
