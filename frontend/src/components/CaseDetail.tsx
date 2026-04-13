import { useEffect, useState, useCallback } from 'react'
import type {
  ApprovalRecord,
  AuthorityResolutionResponse,
  CaseRecord,
  EventRecord,
  ExecutionResult,
  FactRecord,
  PolicyResponse,
  ProposalRecord,
  ReleaseStatusResponse,
} from '../types'
import { api } from '../api/client'
import { StateBadge, RiskBadge, Spinner } from './shared'
import { Pipeline } from './Pipeline'
import { TransitionPanel } from './TransitionPanel'
import { FactsTab } from './FactsTab'
import { ProposalTab } from './ProposalTab'
import { PolicyTab } from './PolicyTab'
import { ApprovalsTab } from './ApprovalsTab'
import { ReleaseTab } from './ReleaseTab'
import { LedgerTab } from './LedgerTab'

type Tab = 'facts' | 'proposal' | 'policy' | 'approvals' | 'release' | 'ledger'

const TABS: { id: Tab; label: string }[] = [
  { id: 'facts', label: 'Facts' },
  { id: 'proposal', label: 'Proposal' },
  { id: 'policy', label: 'Policy' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'release', label: 'Release' },
  { id: 'ledger', label: 'Ledger' },
]

export function CaseDetail({ caseId, onRefreshList }: { caseId: string; onRefreshList: () => void }) {
  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(null)
  const [events, setEvents] = useState<EventRecord[]>([])
  const [facts, setFacts] = useState<FactRecord[]>([])
  const [proposals, setProposals] = useState<ProposalRecord[]>([])
  const [policyData, setPolicyData] = useState<PolicyResponse | null>(null)
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([])
  const [authority, setAuthority] = useState<AuthorityResolutionResponse | null>(null)
  const [release, setRelease] = useState<ReleaseStatusResponse | null>(null)
  const [execution, setExecution] = useState<ExecutionResult | null>(null)
  const [tab, setTab] = useState<Tab>('facts')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const [c, evts, fts, props, pol, apprs, auth, rel, exec] = await Promise.all([
        api.cases.get(caseId),
        api.cases.events(caseId),
        api.facts.list(caseId),
        api.proposals.list(caseId),
        api.policy.results(caseId),
        api.approvals.list(caseId),
        api.authority.resolve(caseId),
        api.release.status(caseId),
        api.execution.get(caseId),
      ])
      setCaseRecord(c)
      setEvents(evts)
      setFacts(fts)
      setProposals(props)
      setPolicyData(pol)
      setApprovals(apprs)
      setAuthority(auth)
      setRelease(rel)
      setExecution(exec)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to load case')
    } finally {
      setLoading(false)
    }
  }, [caseId])

  useEffect(() => { refresh() }, [refresh])

  if (loading && !caseRecord) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    )
  }

  if (err) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-danger text-sm font-mono">{err}</p>
      </div>
    )
  }

  if (!caseRecord) return null

  const handleRefresh = () => { refresh(); onRefreshList() }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-surface shrink-0">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-sm font-mono font-bold text-primary mb-0.5">{caseRecord.title}</h1>
            <p className="text-xs font-mono text-muted">{caseRecord.case_id}</p>
          </div>
          <div className="flex items-center gap-3">
            <RiskBadge level={caseRecord.risk_level} />
            <StateBadge state={caseRecord.status} />
            <button
              onClick={handleRefresh}
              className="text-subtle hover:text-primary text-xs font-mono px-2 py-1 border border-border rounded"
            >
              ↻ Refresh
            </button>
          </div>
        </div>
        <div className="flex gap-4 text-xs font-mono text-muted mb-3">
          <span>type: <span className="text-subtle">{caseRecord.case_type}</span></span>
          <span>requester: <span className="text-subtle">{caseRecord.requester}</span></span>
          <span>owner: <span className="text-subtle">{caseRecord.business_owner}</span></span>
          <span>jurisdiction: <span className="text-subtle">{caseRecord.jurisdiction}</span></span>
        </div>
        <Pipeline status={caseRecord.status} />
      </div>

      {/* Transition Panel */}
      <div className="px-6 py-3 border-b border-border shrink-0">
        <TransitionPanel
          caseId={caseId}
          currentState={caseRecord.status}
          onTransitioned={handleRefresh}
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-surface shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-2.5 text-xs font-mono transition-colors border-b-2 -mb-px
              ${tab === t.id
                ? 'text-accent border-accent'
                : 'text-subtle border-transparent hover:text-primary'
              }`}
          >
            {t.label}
            {t.id === 'facts' && facts.length > 0 && (
              <span className="ml-1.5 text-muted">({facts.length})</span>
            )}
            {t.id === 'approvals' && approvals.length > 0 && (
              <span className="ml-1.5 text-muted">({approvals.length})</span>
            )}
            {t.id === 'ledger' && events.length > 0 && (
              <span className="ml-1.5 text-muted">({events.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === 'facts' && (
          <FactsTab caseId={caseId} facts={facts} onRefresh={handleRefresh} />
        )}
        {tab === 'proposal' && (
          <ProposalTab caseId={caseId} proposals={proposals} onRefresh={handleRefresh} />
        )}
        {tab === 'policy' && (
          <PolicyTab caseId={caseId} policyData={policyData} onRefresh={handleRefresh} />
        )}
        {tab === 'approvals' && (
          <ApprovalsTab
            caseId={caseId}
            approvals={approvals}
            authority={authority}
            onRefresh={handleRefresh}
          />
        )}
        {tab === 'release' && (
          <ReleaseTab
            caseId={caseId}
            caseState={caseRecord.status}
            release={release}
            execution={execution}
            onRefresh={handleRefresh}
          />
        )}
        {tab === 'ledger' && <LedgerTab events={events} />}
      </div>
    </div>
  )
}
