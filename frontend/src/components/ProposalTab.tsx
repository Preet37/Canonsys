import { useState } from 'react'
import type { ProposalRecord } from '../types'
import { api } from '../api/client'
import { SectionCard, ActionButton, ErrorBanner } from './shared'

export function ProposalTab({
  caseId,
  proposals,
  onRefresh,
}: {
  caseId: string
  proposals: ProposalRecord[]
  onRefresh: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [context, setContext] = useState('')

  async function generate() {
    setLoading(true); setErr('')
    try {
      await api.proposals.generate(caseId, 'llama-3.3-70b-versatile', context || undefined)
      onRefresh()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Error') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-warn/10 border border-warn/30 rounded-lg px-4 py-3">
        <p className="text-warn text-xs font-mono font-bold mb-1">⚠ ADVISORY LAYER — ZERO EXECUTION AUTHORITY</p>
        <p className="text-subtle text-xs font-mono">
          AI-generated proposals are strictly non-binding. They enter the case as advisory content only.
          No proposal has write access to any system of record. Human approval required for all actions.
        </p>
      </div>

      <SectionCard title="Generate Advisory Proposal">
        {err && <ErrorBanner msg={err} />}
        <div className="space-y-3">
          <div>
            <p className="text-xs text-subtle font-mono mb-1">Additional Context (optional)</p>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Any extra context for the AI analysis..."
              className="w-full bg-canvas border border-border rounded px-3 py-2 text-sm font-mono text-primary
                placeholder:text-muted focus:outline-none focus:border-accent transition-colors resize-none h-20"
            />
          </div>
          <ActionButton onClick={generate} loading={loading}>
            ✦ Generate Advisory Proposal
          </ActionButton>
        </div>
      </SectionCard>

      {proposals.map((p, i) => (
        <SectionCard key={p.proposal_id} title={`Proposal ${i + 1} — ${p.model_used} · ${p.prompt_version}`}>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-subtle font-mono mb-2">Summary</p>
              <p className="text-sm font-mono text-primary bg-canvas rounded p-3 border border-border">{p.summary}</p>
            </div>
            <div>
              <p className="text-xs text-subtle font-mono mb-2">Options</p>
              <ul className="space-y-1.5">
                {p.options.map((opt, j) => (
                  <li key={j} className="flex gap-2 text-sm font-mono text-primary">
                    <span className="text-accent">{j + 1}.</span> {opt}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs text-subtle font-mono mb-2">Recommendation</p>
              <p className="text-sm font-mono text-success bg-success/5 border border-success/20 rounded p-3">
                {p.recommendation}
              </p>
            </div>
            <div>
              <p className="text-xs text-subtle font-mono mb-2">Caveats</p>
              <ul className="space-y-1">
                {p.caveats.map((c, j) => (
                  <li key={j} className="text-xs font-mono text-warn flex gap-2">
                    <span>⚠</span>{c}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-muted font-mono">ID: {p.proposal_id} · {new Date(p.created_at).toLocaleString()}</p>
          </div>
        </SectionCard>
      ))}

      {proposals.length === 0 && (
        <p className="text-subtle text-xs font-mono text-center py-4">
          No proposals generated yet. Add facts first for better analysis.
        </p>
      )}
    </div>
  )
}
