import type { EventRecord } from '../types'
import { HashChip } from './shared'

const EVENT_COLOR: Record<string, string> = {
  CASE_CREATED: 'text-accent',
  STATE_TRANSITION: 'text-primary',
  FACT_ADDED: 'text-warn',
  FACT_VERIFIED: 'text-success',
  PROPOSAL_GENERATED: 'text-orange',
  POLICY_EVALUATED: 'text-accent',
  APPROVAL_SUBMITTED: 'text-success',
  EVIDENCE_ASSEMBLED: 'text-accent',
  RELEASE_COMPILED: 'text-success',
  RELEASE_DENIED: 'text-danger',
  EXECUTED: 'text-success',
  CASE_CORRECTION_SUPERSESSION: 'text-warn',
}

export function LedgerTab({ events }: { events: EventRecord[] }) {
  return (
    <div className="space-y-2">
      <div className="bg-card border border-border rounded-lg px-4 py-3">
        <p className="text-xs font-mono text-subtle mb-1">Immutable Audit Ledger</p>
        <p className="text-xs font-mono text-primary">
          Append-only, hash-chained event log. Every event incorporates the prior event's hash.
          Any tampering breaks the chain. Corrections use supersession — original records are never modified.
        </p>
      </div>

      {events.length === 0 && (
        <p className="text-subtle text-xs font-mono text-center py-8">No events yet.</p>
      )}

      <div className="space-y-0">
        {events.map((evt, i) => (
          <div key={evt.event_id} className="group relative">
            {/* Vertical chain line */}
            {i < events.length - 1 && (
              <div className="absolute left-[19px] top-8 bottom-0 w-px bg-border z-0" />
            )}
            <div className="relative z-10 flex gap-3 py-2">
              <div className="shrink-0 w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center text-xs font-mono text-subtle">
                {i + 1}
              </div>
              <div className="flex-1 bg-card border border-border rounded-lg px-3 py-2.5 group-hover:border-accent/30 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className={`text-xs font-mono font-bold ${EVENT_COLOR[evt.event_type] ?? 'text-primary'}`}>
                    {evt.event_type}
                  </span>
                  <span className="text-xs text-muted font-mono shrink-0">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-xs font-mono text-subtle mb-2">actor: <span className="text-primary">{evt.actor}</span></p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
                  <div>
                    <span className="text-muted">event_id: </span>
                    <HashChip hash={evt.event_id} />
                  </div>
                  <div>
                    <span className="text-muted">payload_ref: </span>
                    <HashChip hash={evt.payload_ref} />
                  </div>
                  <div>
                    <span className="text-muted">prev_hash: </span>
                    <HashChip hash={evt.prev_hash} />
                  </div>
                  <div>
                    <span className="text-muted">event_hash: </span>
                    <span className="text-xs font-mono text-accent" title={evt.event_hash ?? ''}>
                      {evt.event_hash ? evt.event_hash.slice(0, 12) + '…' : '—'}
                    </span>
                  </div>
                </div>
                {evt.supersedes_event_id && (
                  <p className="text-xs font-mono text-warn mt-1">
                    ↩ supersedes: {evt.supersedes_event_id}
                  </p>
                )}
                {i > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <p className="text-xs font-mono text-muted">
                      Chain: prev_hash matches event[{i - 1}].event_hash{' '}
                      {evt.prev_hash === events[i - 1]?.event_hash ? (
                        <span className="text-success">✓ valid</span>
                      ) : (
                        <span className="text-danger">✕ BROKEN</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
