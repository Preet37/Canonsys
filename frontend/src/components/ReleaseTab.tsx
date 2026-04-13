import { useState } from 'react'
import type { ReleaseStatusResponse, ExecutionResult } from '../types'
import { api } from '../api/client'
import { SectionCard, ActionButton, ErrorBanner } from './shared'

export function ReleaseTab({
  caseId,
  caseState,
  release,
  execution,
  onRefresh,
}: {
  caseId: string
  caseState: string
  release: ReleaseStatusResponse | null
  execution: ExecutionResult | null
  onRefresh: () => void
}) {
  const [action, setAction] = useState('GENERATE_OFFER_LETTER')
  const [actor, setActor] = useState('system_release_compiler')
  const [compiling, setCompiling] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [err, setErr] = useState('')

  async function compile() {
    setCompiling(true); setErr('')
    try { await api.release.compile(caseId, { requested_action: action, actor }); onRefresh() }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Error') }
    finally { setCompiling(false) }
  }

  async function execute() {
    if (!release?.release_token) { setErr('No release token available.'); return }
    setExecuting(true); setErr('')
    try {
      await api.execution.execute(caseId, { actor, token_id: release.release_token.token_id })
      onRefresh()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Error') }
    finally { setExecuting(false) }
  }

  const token = release?.release_token
  const notApproved = caseState !== 'APPROVED'

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg px-4 py-3">
        <p className="text-xs font-mono text-subtle mb-1">Release Compiler — Core IP</p>
        <p className="text-xs font-mono text-primary">
          Compiles case state + policy results + authority resolution into a deterministic execution plan.
          <span className="text-danger font-bold"> Fail-closed:</span> any unmet condition → explicit denial.
          No AI inference. No ambiguity.
        </p>
      </div>

      {notApproved && (
        <div className="bg-warn/10 border border-warn/30 rounded-lg px-4 py-3 space-y-1">
          <p className="text-xs font-mono text-warn font-bold">⚠ Case must be in APPROVED state to compile release</p>
          <p className="text-xs font-mono text-muted">
            Current state: <span className="text-warn font-bold">{caseState}</span>.
            Walk the lifecycle: DRAFT → SUBMITTED → INTAKE_VALIDATED → FACT_REVIEW → PROPOSAL_READY → POLICY_REVIEW → HUMAN_REVIEW → APPROVAL_PENDING → <span className="text-success font-bold">APPROVED</span>
          </p>
          <p className="text-xs font-mono text-subtle mt-1">
            Use the <span className="text-accent">Manual Transition</span> panel above to advance the case state step by step.
          </p>
        </div>
      )}

      {err && <ErrorBanner msg={err} />}

      <SectionCard title="Compile Release">
        <div className="space-y-3">
          <div>
            <p className="text-xs text-subtle font-mono mb-1">Requested Action</p>
            <input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full bg-canvas border border-border rounded px-3 py-1.5 text-sm font-mono text-primary focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <p className="text-xs text-subtle font-mono mb-1">Actor</p>
            <input
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              className="w-full bg-canvas border border-border rounded px-3 py-1.5 text-sm font-mono text-primary focus:outline-none focus:border-accent"
            />
          </div>
          <ActionButton onClick={compile} loading={compiling}>⚙ Compile Release</ActionButton>
        </div>
      </SectionCard>

      {release && !release.compiled && release.denial_reasons.length > 0 && (
        <SectionCard title="Denial Reasons">
          <div className="space-y-2">
            {release.denial_reasons.map((r, i) => (
              <div key={i} className="flex gap-2 text-xs font-mono text-danger">
                <span className="shrink-0">✕</span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {release?.compiled && token && (
        <>
          <SectionCard title="✓ Release Plan — Authorized">
            <div className="space-y-3 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-subtle mb-1">Plan ID</p>
                  <p className="text-primary">{release.release_plan?.release_plan_id}</p>
                </div>
                <div>
                  <p className="text-subtle mb-1">Allowed Action</p>
                  <p className="text-success font-bold">{release.release_plan?.allowed_action}</p>
                </div>
              </div>
              {(release.release_plan?.required_preconditions ?? []).length > 0 && (
                <div>
                  <p className="text-subtle mb-1">Satisfied Preconditions</p>
                  <ul className="space-y-1">
                    {release.release_plan!.required_preconditions.map((p, i) => (
                      <li key={i} className="text-success flex gap-2"><span>✓</span>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Release Token">
            <div className="space-y-3 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-subtle mb-1">Token ID</p>
                  <p className="text-accent">{token.token_id}</p>
                </div>
                <div>
                  <p className="text-subtle mb-1">Expires</p>
                  <p className="text-primary">{new Date(token.expires_at).toLocaleString()}</p>
                </div>
              </div>
              <div>
                <p className="text-subtle mb-1">SHA-256 Signature</p>
                <p className="text-muted break-all bg-canvas rounded p-2 border border-border">
                  {String(token.signature_metadata.sha256 ?? '—')}
                </p>
              </div>
              <div>
                <p className="text-subtle mb-1">Approver Roles in Scope</p>
                <div className="flex flex-wrap gap-2">
                  {(token.scope.approver_roles as string[] ?? []).map((r) => (
                    <span key={r} className="px-2 py-0.5 bg-success/10 border border-success/30 text-success rounded">✓ {r}</span>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          <ActionButton
            onClick={execute}
            loading={executing}
            variant="success"
          >
            ⚡ Execute — Generate Offer Document
          </ActionButton>
        </>
      )}

      {execution && execution.executed !== false && (
        <SectionCard title="Execution Result">
          <div className="space-y-2 text-xs font-mono">
            <p className={execution.success ? 'text-success' : 'text-danger'}>
              {execution.success ? '✓ Execution successful' : '✕ Execution failed'}
            </p>
            {execution.artifact_uri && (
              <p className="text-primary">Artifact: <span className="text-accent">{execution.artifact_uri}</span></p>
            )}
            {execution.error && <p className="text-danger">{execution.error}</p>}
            <p className="text-muted">Executed: {execution.executed_at}</p>
          </div>
        </SectionCard>
      )}
    </div>
  )
}
