import { useState } from 'react'
import type { ApprovalRecord, AuthorityResolutionResponse } from '../types'
import { api } from '../api/client'
import { SectionCard, ActionButton, ErrorBanner, Input, Select } from './shared'

export function ApprovalsTab({
  caseId,
  approvals,
  authority,
  onRefresh,
}: {
  caseId: string
  approvals: ApprovalRecord[]
  authority: AuthorityResolutionResponse | null
  onRefresh: () => void
}) {
  const [approver, setApprover] = useState('')
  const [role, setRole] = useState(authority?.required_roles[0] ?? '')
  const [scope, setScope] = useState('HR_EXCEPTION_OFFER')
  const [decision, setDecision] = useState<'APPROVE' | 'DENY'>('APPROVE')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!approver || !role) { setErr('Approver and role are required.'); return }
    setLoading(true); setErr('')
    try {
      await api.approvals.submit(caseId, { approver, role, authority_scope: scope, decision, note: note || undefined })
      setApprover(''); setNote('')
      onRefresh()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Error') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      {authority && (
        <SectionCard title="Authority Resolution">
          <div className="space-y-3">
            <div>
              <p className="text-xs text-subtle font-mono mb-2">Required Roles</p>
              <div className="flex flex-wrap gap-2">
                {authority.required_roles.map((r) => {
                  const filled = approvals.some((a) => a.role === r && a.decision === 'APPROVE')
                  return (
                    <span
                      key={r}
                      className={`px-2 py-1 rounded border text-xs font-mono ${
                        filled ? 'border-success/40 bg-success/10 text-success' : 'border-orange/40 bg-orange/10 text-orange'
                      }`}
                    >
                      {filled ? '✓' : '○'} {r}
                    </span>
                  )
                })}
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className={authority.approval_sufficient ? 'text-success' : 'text-orange'}>
                {authority.approval_sufficient ? '✓ Approval chain satisfied' : '○ Approval chain incomplete'}
              </span>
              {authority.self_approval_prohibited && (
                <span className="text-subtle">· Self-approval prohibited</span>
              )}
            </div>
            {authority.unmet_conditions.length > 0 && (
              <div className="space-y-1">
                {authority.unmet_conditions.map((c, i) => (
                  <p key={i} className="text-xs font-mono text-danger">✕ {c}</p>
                ))}
              </div>
            )}
            {authority.escalation_paths.length > 0 && (
              <p className="text-xs font-mono text-subtle">
                Escalation paths: {authority.escalation_paths.join(' → ')}
              </p>
            )}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Submit Approval / Denial">
        {err && <ErrorBanner msg={err} />}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-subtle font-mono mb-1">Approver</p>
              <Input value={approver} onChange={setApprover} placeholder="vp@company.com" />
            </div>
            <div>
              <p className="text-xs text-subtle font-mono mb-1">Role</p>
              <Input value={role} onChange={setRole} placeholder="VP_ENGINEERING" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-subtle font-mono mb-1">Authority Scope</p>
              <Input value={scope} onChange={setScope} placeholder="HR_EXCEPTION_OFFER" />
            </div>
            <div>
              <p className="text-xs text-subtle font-mono mb-1">Decision</p>
              <Select
                value={decision}
                onChange={(v) => setDecision(v as 'APPROVE' | 'DENY')}
                options={[{ value: 'APPROVE', label: 'APPROVE' }, { value: 'DENY', label: 'DENY' }]}
              />
            </div>
          </div>
          <div>
            <p className="text-xs text-subtle font-mono mb-1">Note (optional)</p>
            <Input value={note} onChange={setNote} placeholder="Approved based on market data review..." />
          </div>
          {authority && (
            <div className="flex flex-wrap gap-2">
              <p className="text-xs text-subtle font-mono w-full">Quick-fill required roles:</p>
              {authority.required_roles.map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className="px-2 py-1 text-xs font-mono bg-surface border border-border rounded hover:border-accent/50 text-subtle hover:text-primary transition-colors"
                >
                  {r}
                </button>
              ))}
            </div>
          )}
          <ActionButton
            onClick={submit}
            loading={loading}
            variant={decision === 'APPROVE' ? 'success' : 'danger'}
          >
            Submit {decision}
          </ActionButton>
        </div>
      </SectionCard>

      <SectionCard title={`Submitted Approvals (${approvals.length})`}>
        {approvals.length === 0 ? (
          <p className="text-subtle text-xs font-mono">No approvals submitted yet.</p>
        ) : (
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-subtle border-b border-border">
                <th className="text-left pb-2 pr-3">Approver</th>
                <th className="text-left pb-2 pr-3">Role</th>
                <th className="text-left pb-2 pr-3">Decision</th>
                <th className="text-left pb-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((a) => (
                <tr key={a.approval_id} className="border-b border-border/40">
                  <td className="py-2 pr-3 text-primary">{a.approver}</td>
                  <td className="py-2 pr-3 text-accent">{a.role}</td>
                  <td className={`py-2 pr-3 font-bold ${a.decision === 'APPROVE' ? 'text-success' : 'text-danger'}`}>
                    {a.decision === 'APPROVE' ? '✓' : '✕'} {a.decision}
                  </td>
                  <td className="py-2 text-subtle">{a.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  )
}
