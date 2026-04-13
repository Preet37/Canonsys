import { useState } from 'react'
import type { CaseRecord, CaseCreateRequest, RiskLevel } from '../types'
import { api } from '../api/client'
import { StateBadge, RiskBadge, Spinner, ErrorBanner, Input, Select } from './shared'

const RISK_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((v) => ({ value: v, label: v }))

function CreateCaseModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (c: CaseRecord) => void
}) {
  const [form, setForm] = useState<CaseCreateRequest>({
    case_type: 'HR_EXCEPTION_OFFER',
    title: '',
    requester: '',
    business_owner: '',
    jurisdiction: 'US-CA',
    risk_level: 'HIGH',
  })
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const set = (k: keyof CaseCreateRequest) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }))

  async function submit() {
    if (!form.title || !form.requester || !form.business_owner) {
      setErr('Title, requester, and business owner are required.')
      return
    }
    setLoading(true)
    setErr('')
    try {
      const res = await api.cases.create(form)
      onCreated(res.case)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-canvas/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-mono font-bold text-primary">New Case</h2>
          <button onClick={onClose} className="text-subtle hover:text-primary text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {err && <ErrorBanner msg={err} />}
          <div>
            <p className="text-xs text-subtle font-mono mb-1">Case Type</p>
            <Input value={form.case_type} onChange={set('case_type')} placeholder="HR_EXCEPTION_OFFER" />
          </div>
          <div>
            <p className="text-xs text-subtle font-mono mb-1">Title</p>
            <Input value={form.title} onChange={set('title')} placeholder="Principal engineer exception offer" />
          </div>
          <div>
            <p className="text-xs text-subtle font-mono mb-1">Requester</p>
            <Input value={form.requester} onChange={set('requester')} placeholder="manager@company.com" />
          </div>
          <div>
            <p className="text-xs text-subtle font-mono mb-1">Business Owner</p>
            <Input value={form.business_owner} onChange={set('business_owner')} placeholder="vp@company.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-subtle font-mono mb-1">Jurisdiction</p>
              <Input value={form.jurisdiction} onChange={set('jurisdiction')} placeholder="US-CA" />
            </div>
            <div>
              <p className="text-xs text-subtle font-mono mb-1">Risk Level</p>
              <Select value={form.risk_level} onChange={(v) => set('risk_level')(v)} options={RISK_OPTIONS} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-mono text-subtle hover:text-primary">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="px-4 py-1.5 text-xs font-mono bg-accent/20 hover:bg-accent/30 text-accent border border-accent/40 rounded transition-colors flex items-center gap-2 disabled:opacity-40"
          >
            {loading && <Spinner />}
            Create Case
          </button>
        </div>
      </div>
    </div>
  )
}

export function CaseList({
  cases,
  selectedId,
  onSelect,
  onRefresh,
}: {
  cases: CaseRecord[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRefresh: () => void
}) {
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-xs font-mono text-subtle uppercase tracking-widest">Cases</span>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            className="text-subtle hover:text-primary text-xs font-mono"
            title="Refresh"
          >
            ↻
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-2 py-1 text-xs font-mono bg-accent/20 hover:bg-accent/30 text-accent border border-accent/40 rounded transition-colors"
          >
            + New
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {cases.length === 0 && (
          <div className="p-4 text-center text-subtle text-xs font-mono">
            No cases yet. Create one to start.
          </div>
        )}
        {cases.map((c) => (
          <button
            key={c.case_id}
            onClick={() => onSelect(c.case_id)}
            className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-card transition-colors
              ${selectedId === c.case_id ? 'bg-card border-l-2 border-l-accent' : ''}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono text-subtle">{c.case_id.slice(0, 16)}…</span>
              <RiskBadge level={c.risk_level} />
            </div>
            <div className="text-xs font-mono text-primary truncate mb-1.5">{c.title}</div>
            <StateBadge state={c.status} />
          </button>
        ))}
      </div>

      {showCreate && (
        <CreateCaseModal
          onClose={() => setShowCreate(false)}
          onCreated={(c) => {
            setShowCreate(false)
            onRefresh()
            onSelect(c.case_id)
          }}
        />
      )}
    </div>
  )
}
