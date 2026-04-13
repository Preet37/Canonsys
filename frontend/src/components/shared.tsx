import type { CaseState, RiskLevel } from '../types'

export const STATE_ORDER: CaseState[] = [
  'DRAFT', 'SUBMITTED', 'INTAKE_VALIDATED', 'FACT_REVIEW', 'PROPOSAL_READY',
  'POLICY_REVIEW', 'HUMAN_REVIEW', 'APPROVAL_PENDING', 'APPROVED',
  'RELEASE_COMPILED', 'RELEASED', 'EXECUTED', 'CLOSED',
]

const STATE_COLOR: Record<CaseState, string> = {
  DRAFT: 'bg-muted text-primary',
  SUBMITTED: 'bg-accent/20 text-accent',
  INTAKE_VALIDATED: 'bg-accent/20 text-accent',
  FACT_REVIEW: 'bg-warn/20 text-warn',
  PROPOSAL_READY: 'bg-warn/20 text-warn',
  POLICY_REVIEW: 'bg-orange/20 text-orange',
  HUMAN_REVIEW: 'bg-orange/20 text-orange',
  APPROVAL_PENDING: 'bg-orange/30 text-orange',
  APPROVED: 'bg-success/20 text-success',
  DENIED: 'bg-danger/20 text-danger',
  RELEASE_COMPILED: 'bg-accent/30 text-accent',
  RELEASED: 'bg-accent/40 text-accent',
  EXECUTED: 'bg-success/30 text-success',
  CLOSED: 'bg-muted/20 text-subtle',
  ERROR_INVESTIGATION: 'bg-danger/30 text-danger',
}

const RISK_COLOR: Record<RiskLevel, string> = {
  LOW: 'text-success',
  MEDIUM: 'text-warn',
  HIGH: 'text-orange',
  CRITICAL: 'text-danger',
}

export function StateBadge({ state }: { state: CaseState }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${STATE_COLOR[state] ?? 'bg-muted text-primary'}`}>
      {state}
    </span>
  )
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`text-xs font-mono font-bold ${RISK_COLOR[level]}`}>{level}</span>
  )
}

export function Spinner() {
  return (
    <div className="animate-spin h-4 w-4 border-2 border-accent border-t-transparent rounded-full inline-block" />
  )
}

export function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="bg-danger/10 border border-danger/40 rounded px-3 py-2 text-danger text-sm font-mono">
      ✕ {msg}
    </div>
  )
}

export function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-surface text-subtle text-xs font-mono uppercase tracking-widest">
        {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

export function ActionButton({
  onClick,
  disabled,
  loading,
  children,
  variant = 'primary',
}: {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  children: React.ReactNode
  variant?: 'primary' | 'success' | 'danger' | 'ghost' | 'warn'
}) {
  const colors = {
    primary: 'bg-accent/20 hover:bg-accent/30 text-accent border-accent/40',
    success: 'bg-success/20 hover:bg-success/30 text-success border-success/40',
    danger: 'bg-danger/20 hover:bg-danger/30 text-danger border-danger/40',
    ghost: 'bg-transparent hover:bg-surface text-subtle border-border',
    warn: 'bg-warn/20 hover:bg-warn/30 text-warn border-warn/40',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`px-3 py-1.5 rounded border text-xs font-mono transition-colors flex items-center gap-2
        ${colors[variant]}
        disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

export function HashChip({ hash }: { hash: string | null }) {
  if (!hash) return <span className="text-muted text-xs font-mono">—</span>
  return (
    <span className="text-xs font-mono text-muted" title={hash}>
      {hash.slice(0, 12)}…
    </span>
  )
}

export function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-subtle font-mono mb-1">{children}</p>
}

export function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-canvas border border-border rounded px-3 py-1.5 text-sm font-mono text-primary
        placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
    />
  )
}

export function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-canvas border border-border rounded px-3 py-1.5 text-sm font-mono text-primary
        focus:outline-none focus:border-accent transition-colors"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
