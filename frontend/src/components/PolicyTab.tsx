import { useState } from 'react'
import type { PolicyResponse } from '../types'
import { api } from '../api/client'
import { SectionCard, ActionButton, ErrorBanner } from './shared'

const VERDICT_STYLE: Record<string, string> = {
  PASS: 'text-success bg-success/10 border-success/30',
  WARN: 'text-warn bg-warn/10 border-warn/30',
  DENY: 'text-danger bg-danger/10 border-danger/30',
}

const RESULT_ICON: Record<string, string> = {
  PASS: '✓',
  WARN: '⚠',
  DENY: '✕',
}

export function PolicyTab({
  caseId,
  policyData,
  onRefresh,
}: {
  caseId: string
  policyData: PolicyResponse | null
  onRefresh: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function evaluate() {
    setLoading(true); setErr('')
    try {
      await api.policy.evaluate(caseId)
      onRefresh()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Error') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg px-4 py-3">
        <p className="text-xs font-mono text-subtle mb-1">Policy Engine</p>
        <p className="text-xs font-mono text-primary">
          Deterministic rule evaluation — no LLM inference. Rules are defined in{' '}
          <code className="text-accent bg-canvas px-1 rounded">policies/hr_exception_offer.json</code>.
          Policy evaluates against case facts. DENY results block release compilation.
        </p>
      </div>

      {err && <ErrorBanner msg={err} />}

      <div className="flex items-center gap-3">
        <ActionButton onClick={evaluate} loading={loading}>⚖ Run Policy Evaluation</ActionButton>
        {policyData && (
          <div className={`px-3 py-1.5 rounded border text-xs font-mono font-bold ${VERDICT_STYLE[policyData.verdict] ?? 'text-subtle'}`}>
            VERDICT: {policyData.verdict}
          </div>
        )}
      </div>

      {policyData && policyData.results.length > 0 && (
        <SectionCard title={`Rule Results (${policyData.results.length})`}>
          <div className="space-y-3">
            {policyData.results.map((r, i) => (
              <div
                key={r.policy_result_id}
                className={`border rounded-lg px-4 py-3 ${VERDICT_STYLE[r.result] ?? 'border-border'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono font-bold">
                    {RESULT_ICON[r.result]} Rule {i + 1}
                  </span>
                  <span className={`text-xs font-mono font-bold ${r.result === 'PASS' ? 'text-success' : r.result === 'WARN' ? 'text-warn' : 'text-danger'}`}>
                    {r.result}
                  </span>
                </div>
                <p className="text-xs font-mono">{r.rationale}</p>
                <p className="text-xs text-muted font-mono mt-1">
                  Policy: {r.policy_id} v{r.policy_version} · {new Date(r.evaluated_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {(!policyData || policyData.results.length === 0) && (
        <p className="text-subtle text-xs font-mono text-center py-4">
          Policy not evaluated yet. Click "Run Policy Evaluation" above.
        </p>
      )}
    </div>
  )
}
