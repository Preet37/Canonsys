import { useState } from 'react'
import type { FactRecord } from '../types'
import { api } from '../api/client'
import { SectionCard, ActionButton, ErrorBanner, Input, Spinner } from './shared'

const REQUIRED_FACTS = [
  { key: 'business_justification', value: 'Candidate holds competing offer from direct competitor. Loss risk high.', source: 'hiring_manager', hint: 'Text description — required for policy gate' },
  { key: 'salary_to_band_ratio', value: '1.4', source: 'comp_team', hint: 'Number. ≤1.5 = PASS, ≤2.0 = WARN, >2.0 = DENY' },
  { key: 'competing_offer_documented', value: 'true', source: 'recruiter', hint: 'true/false — required if ratio > 1.2x' },
  { key: 'role_level', value: 'Principal Engineer (L6)', source: 'hiring_manager', hint: 'Used for comp band lookup' },
]

const OPTIONAL_FACTS = [
  { key: 'candidate_name', value: 'Alex Chen', source: 'recruiter', hint: 'Optional' },
  { key: 'base_salary_ask', value: '350000', source: 'candidate', hint: 'Optional — numeric USD' },
]

export function FactsTab({ caseId, facts, onRefresh }: { caseId: string; facts: FactRecord[]; onRefresh: () => void }) {
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [source, setSource] = useState('')
  const [confidence, setConfidence] = useState('1.0')
  const [actor, setActor] = useState('intake_system')
  const [loading, setLoading] = useState(false)
  const [addingAll, setAddingAll] = useState(false)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const existingKeys = new Set(facts.map((f) => f.key))

  const allKnownKeys = new Set([...REQUIRED_FACTS, ...OPTIONAL_FACTS].map((f) => f.key))
  const keyIsUnknown = key.length > 0 && !allKnownKeys.has(key)

  async function addFact() {
    if (!key || !value || !source) { setErr('Key, value, and source are required.'); return }
    setLoading(true); setErr('')
    try {
      await api.facts.add(caseId, { key, value, source, confidence: parseFloat(confidence), actor })
      setKey(''); setValue(''); setSource('')
      onRefresh()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Error') }
    finally { setLoading(false) }
  }

  async function addAllRequired() {
    setAddingAll(true); setErr('')
    try {
      for (const f of REQUIRED_FACTS) {
        if (!existingKeys.has(f.key)) {
          await api.facts.add(caseId, { key: f.key, value: f.value, source: f.source, confidence: 1.0 })
        }
      }
      onRefresh()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Error') }
    finally { setAddingAll(false) }
  }

  async function verify(factId: string) {
    setVerifyingId(factId)
    try { await api.facts.verify(caseId, factId, 'human_reviewer'); onRefresh() }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Error') }
    finally { setVerifyingId(null) }
  }

  const missingRequired = REQUIRED_FACTS.filter((f) => !existingKeys.has(f.key))
  const allRequiredPresent = missingRequired.length === 0

  return (
    <div className="space-y-4">

      {/* Required Facts Checklist */}
      <div className={`border rounded-lg px-4 py-3 space-y-2 ${allRequiredPresent ? 'border-success/30 bg-success/5' : 'border-warn/30 bg-warn/5'}`}>
        <div className="flex items-center justify-between">
          <p className={`text-xs font-mono font-bold ${allRequiredPresent ? 'text-success' : 'text-warn'}`}>
            {allRequiredPresent ? '✓ All required facts present' : `⚠ ${missingRequired.length} required fact(s) missing for policy evaluation`}
          </p>
          {!allRequiredPresent && (
            <ActionButton onClick={addAllRequired} loading={addingAll} variant="warn">
              ⚡ Add All Required Facts
            </ActionButton>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {REQUIRED_FACTS.map((f) => {
            const present = existingKeys.has(f.key)
            return (
              <div key={f.key} className="flex items-start gap-1.5 text-xs font-mono">
                <span className={present ? 'text-success mt-0.5' : 'text-warn mt-0.5'}>{present ? '✓' : '○'}</span>
                <div>
                  <button
                    onClick={() => { setKey(f.key); setValue(f.value); setSource(f.source) }}
                    className={`${present ? 'text-subtle line-through' : 'text-accent hover:text-primary'} transition-colors`}
                  >
                    {f.key}
                  </button>
                  <p className="text-muted text-[10px]">{f.hint}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <SectionCard title="Add Fact">
        <div className="space-y-3">
          {err && <ErrorBanner msg={err} />}
          {keyIsUnknown && (
            <div className="text-xs font-mono text-warn bg-warn/10 border border-warn/20 rounded px-3 py-1.5">
              ⚠ Key <span className="font-bold">"{key}"</span> is not a recognized policy key — check spelling.
              Known keys: {[...REQUIRED_FACTS, ...OPTIONAL_FACTS].map((f) => f.key).join(', ')}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-subtle font-mono mb-1">Key</p>
              <Input value={key} onChange={setKey} placeholder="salary_to_band_ratio" />
            </div>
            <div>
              <p className="text-xs text-subtle font-mono mb-1">Value</p>
              <Input value={value} onChange={setValue} placeholder="1.4" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-subtle font-mono mb-1">Source</p>
              <Input value={source} onChange={setSource} placeholder="hiring_manager" />
            </div>
            <div>
              <p className="text-xs text-subtle font-mono mb-1">Confidence (0–1)</p>
              <Input value={confidence} onChange={setConfidence} placeholder="1.0" type="number" />
            </div>
          </div>
          <div>
            <p className="text-xs text-subtle font-mono mb-1">Actor</p>
            <Input value={actor} onChange={setActor} placeholder="intake_system" />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <ActionButton onClick={addFact} loading={loading}>+ Add Fact</ActionButton>
            <div className="flex flex-wrap gap-1.5">
              {[...REQUIRED_FACTS, ...OPTIONAL_FACTS].filter(f => !existingKeys.has(f.key)).map((preset) => (
                <button
                  key={preset.key}
                  onClick={() => { setKey(preset.key); setValue(preset.value); setSource(preset.source) }}
                  className="px-2 py-1 text-xs font-mono bg-surface border border-border rounded hover:border-accent/50 text-subtle hover:text-primary transition-colors"
                >
                  {preset.key}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={`Facts (${facts.length})`}>
        {facts.length === 0 ? (
          <p className="text-subtle text-xs font-mono">No facts added yet. Use the checklist above to add required facts.</p>
        ) : (
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-subtle border-b border-border">
                <th className="text-left pb-2 pr-3">Key</th>
                <th className="text-left pb-2 pr-3">Value</th>
                <th className="text-left pb-2 pr-3">Source</th>
                <th className="text-left pb-2 pr-3">Conf</th>
                <th className="text-left pb-2">Verified</th>
              </tr>
            </thead>
            <tbody>
              {facts.map((f) => {
                const isUnknownKey = !allKnownKeys.has(f.key)
                return (
                  <tr key={f.fact_id} className="border-b border-border/40 hover:bg-surface/50">
                    <td className="py-2 pr-3">
                      <span className={isUnknownKey ? 'text-warn' : 'text-accent'}>{f.key}</span>
                      {isUnknownKey && <span className="ml-1 text-warn text-[10px]">⚠ unknown key</span>}
                    </td>
                    <td className="py-2 pr-3 text-primary">{String(f.value)}</td>
                    <td className="py-2 pr-3 text-subtle">{f.source}</td>
                    <td className="py-2 pr-3 text-subtle">{(f.confidence * 100).toFixed(0)}%</td>
                    <td className="py-2">
                      {f.verified_flag ? (
                        <span className="text-success">✓ {f.verified_by}</span>
                      ) : (
                        <button
                          onClick={() => verify(f.fact_id)}
                          disabled={verifyingId === f.fact_id}
                          className="text-warn hover:text-success transition-colors flex items-center gap-1"
                        >
                          {verifyingId === f.fact_id ? <Spinner /> : '○ Verify'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  )
}
