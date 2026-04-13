import { useState, useEffect } from 'react'
import type { CaseState } from '../types'
import { api } from '../api/client'
import { ActionButton, ErrorBanner } from './shared'

const VALID_NEXT: Partial<Record<CaseState, CaseState[]>> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['INTAKE_VALIDATED', 'ERROR_INVESTIGATION'],
  INTAKE_VALIDATED: ['FACT_REVIEW', 'ERROR_INVESTIGATION'],
  FACT_REVIEW: ['PROPOSAL_READY', 'HUMAN_REVIEW', 'ERROR_INVESTIGATION'],
  PROPOSAL_READY: ['POLICY_REVIEW', 'ERROR_INVESTIGATION'],
  POLICY_REVIEW: ['HUMAN_REVIEW', 'APPROVAL_PENDING', 'DENIED', 'ERROR_INVESTIGATION'],
  HUMAN_REVIEW: ['FACT_REVIEW', 'APPROVAL_PENDING', 'DENIED', 'ERROR_INVESTIGATION'],
  APPROVAL_PENDING: ['APPROVED', 'DENIED', 'ERROR_INVESTIGATION'],
  APPROVED: ['RELEASE_COMPILED', 'DENIED', 'ERROR_INVESTIGATION'],
  RELEASE_COMPILED: ['RELEASED', 'DENIED', 'ERROR_INVESTIGATION'],
  RELEASED: ['EXECUTED', 'ERROR_INVESTIGATION'],
  EXECUTED: ['CLOSED', 'ERROR_INVESTIGATION'],
  ERROR_INVESTIGATION: ['HUMAN_REVIEW', 'DENIED'],
}

const STATE_HINTS: Partial<Record<CaseState, string>> = {
  DRAFT: '① Add all required facts in the Facts tab first, then advance.',
  SUBMITTED: '② Case received. Advance to validate intake information.',
  INTAKE_VALIDATED: '③ Intake validated. Advance to begin fact review.',
  FACT_REVIEW: '④ Optionally generate an AI proposal (Proposal tab), then advance.',
  PROPOSAL_READY: '⑤ Proposal ready. Advance to run policy evaluation.',
  POLICY_REVIEW: '⑥ Run Policy Evaluation (Policy tab), then advance to human review.',
  HUMAN_REVIEW: '⑦ Reviewed by committee. Advance to collect formal approvals.',
  APPROVAL_PENDING: '⑧ Submit all required approvals (Approvals tab), then advance to APPROVED.',
  APPROVED: '⑨ Case approved. Go to Release tab → Compile Release → Execute.',
  RELEASE_COMPILED: '⑩ Token issued. Advance to RELEASED, then EXECUTED, then CLOSED.',
  RELEASED: '⑪ Advance to EXECUTED after the action is performed.',
  EXECUTED: '⑫ Final step — close the case.',
  CLOSED: '✓ Case is closed. Terminal state.',
  DENIED: '✕ Case denied. Terminal state.',
}

export function TransitionPanel({
  caseId,
  currentState,
  onTransitioned,
}: {
  caseId: string
  currentState: CaseState
  onTransitioned: () => void
}) {
  const validTargets = VALID_NEXT[currentState] ?? []
  const [target, setTarget] = useState<CaseState>(validTargets[0] ?? currentState)
  const [actor, setActor] = useState('operator')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const next = VALID_NEXT[currentState]?.[0]
    if (next) setTarget(next)
  }, [currentState])

  const isTerminal = validTargets.length === 0
  const hint = STATE_HINTS[currentState]

  async function doTransition() {
    setLoading(true); setErr('')
    try {
      await api.cases.transition(caseId, target, actor, note || undefined)
      onTransitioned()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Error') }
    finally { setLoading(false) }
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-3 space-y-2">
      {hint && (
        <p className="text-xs font-mono text-accent bg-accent/5 border border-accent/20 rounded px-3 py-1.5">
          {hint}
        </p>
      )}
      {err && <ErrorBanner msg={err} />}
      {isTerminal ? (
        <p className="text-xs font-mono text-muted">
          Current: <span className="text-primary font-bold">{currentState}</span> — terminal state, no further transitions.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2 items-end">
          <div className="shrink-0">
            <p className="text-xs text-muted font-mono mb-1">
              Current: <span className="text-primary font-bold">{currentState}</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {validTargets.map((s) => (
                <button
                  key={s}
                  onClick={() => setTarget(s)}
                  className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors
                    ${target === s
                      ? 'bg-accent text-canvas border-accent'
                      : 'bg-canvas text-subtle border-border hover:text-primary hover:border-accent/50'
                    }`}
                >
                  → {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-w-[140px]">
            <p className="text-xs text-muted font-mono mb-1">Actor</p>
            <input
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              className="w-full bg-canvas border border-border rounded px-2.5 py-1.5 text-xs font-mono text-primary focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <p className="text-xs text-muted font-mono mb-1">Note (optional)</p>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-canvas border border-border rounded px-2.5 py-1.5 text-xs font-mono text-primary focus:outline-none focus:border-accent"
            />
          </div>
          <ActionButton onClick={doTransition} loading={loading}>
            → Advance to {target}
          </ActionButton>
        </div>
      )}
    </div>
  )
}
