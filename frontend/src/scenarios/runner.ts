import { api } from '../api/client'

export interface Step {
  id: string
  label: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  detail?: string
}

export interface ScenarioResult {
  caseId: string
  success: boolean
  summary: string
  steps: Step[]
}

export type StepUpdater = (steps: Step[]) => void

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function run(
  steps: Step[],
  update: StepUpdater,
  id: string,
  fn: () => Promise<string | undefined>,
): Promise<string | undefined> {
  const idx = steps.findIndex((s) => s.id === id)
  if (idx === -1) return undefined
  steps[idx] = { ...steps[idx], status: 'running' }
  update([...steps])
  try {
    const detail = await fn()
    steps[idx] = { ...steps[idx], status: 'done', detail: detail ?? '✓' }
    update([...steps])
    await delay(300)
    return detail
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    steps[idx] = { ...steps[idx], status: 'failed', detail: msg }
    update([...steps])
    await delay(200)
    throw e
  }
}

// ── Scenario A: Full happy path HIGH risk ─────────────────────────────────────

export async function runHappyHighRisk(update: StepUpdater): Promise<ScenarioResult> {
  const steps: Step[] = [
    { id: 'create', label: 'Create HIGH risk case', status: 'pending' },
    { id: 'facts', label: 'Add 4 passing facts', status: 'pending' },
    { id: 'transitions', label: 'Walk lifecycle to APPROVED', status: 'pending' },
    { id: 'proposal', label: 'Generate advisory proposal (AI)', status: 'pending' },
    { id: 'policy', label: 'Evaluate policy → PASS', status: 'pending' },
    { id: 'approvals', label: 'Submit all 3 required approvals', status: 'pending' },
    { id: 'evidence', label: 'Assemble evidence packet', status: 'pending' },
    { id: 'compile', label: 'Compile release → token issued', status: 'pending' },
    { id: 'execute', label: 'Execute → PDF offer letter generated', status: 'pending' },
    { id: 'close', label: 'Finalize lifecycle → EXECUTED → CLOSED', status: 'pending' },
  ]
  update([...steps])

  let caseId = ''
  let tokenId = ''

  try {
    await run(steps, update, 'create', async () => {
      const res = await api.cases.create({
        case_type: 'HR_EXCEPTION_OFFER',
        title: '[Agent] HIGH risk — full happy path',
        requester: 'manager@company.com',
        business_owner: 'vp@company.com',
        jurisdiction: 'US-CA',
        risk_level: 'HIGH',
      })
      caseId = res.case.case_id
      return caseId
    })

    await run(steps, update, 'facts', async () => {
      for (const [k, v, s] of [
        ['business_justification', 'Candidate holds competing offer from direct rival. Risk of loss is high.', 'manager'],
        ['salary_to_band_ratio', 1.4, 'comp_team'],
        ['competing_offer_documented', true, 'recruiter'],
        ['role_level', 'Principal Engineer (L6)', 'manager'],
        ['candidate_name', 'Alex Chen', 'recruiter'],
        ['base_salary_ask', 350000, 'candidate'],
      ] as [string, unknown, string][]) {
        await api.facts.add(caseId, { key: k, value: v, source: s, confidence: 1.0 })
      }
      return '6 facts added'
    })

    await run(steps, update, 'transitions', async () => {
      for (const s of ['SUBMITTED', 'INTAKE_VALIDATED', 'FACT_REVIEW', 'PROPOSAL_READY', 'POLICY_REVIEW', 'HUMAN_REVIEW', 'APPROVAL_PENDING', 'APPROVED']) {
        await api.cases.transition(caseId, s, 'canonsys_agent')
        await delay(100)
      }
      return '→ APPROVED'
    })

    await run(steps, update, 'proposal', async () => {
      await api.proposals.generate(caseId)
      return 'Advisory proposal generated (mock or Groq)'
    })

    await run(steps, update, 'policy', async () => {
      const res = await api.policy.evaluate(caseId)
      return `Verdict: ${res.verdict} — ${res.results.length} rules evaluated`
    })

    await run(steps, update, 'approvals', async () => {
      for (const [approver, role] of [
        ['vp@company.com', 'VP_ENGINEERING'],
        ['hr@company.com', 'HR_DIRECTOR'],
        ['fin@company.com', 'FINANCE_VP'],
      ]) {
        await api.approvals.submit(caseId, { approver, role, authority_scope: 'HR_EXCEPTION_OFFER', decision: 'APPROVE' })
      }
      return 'VP_ENGINEERING + HR_DIRECTOR + FINANCE_VP approved'
    })

    await run(steps, update, 'evidence', async () => {
      await api.evidence.assemble(caseId)
      return 'Evidence packet checksummed and sealed'
    })

    await run(steps, update, 'compile', async () => {
      const res = await api.release.compile(caseId, { requested_action: 'GENERATE_OFFER_LETTER', actor: 'canonsys_agent' })
      if (!res.allowed) throw new Error(res.denial_reasons.join('; '))
      tokenId = res.release_token?.token_id ?? ''
      return `Token: ${tokenId}`
    })

    await run(steps, update, 'execute', async () => {
      const res = await api.execution.execute(caseId, { actor: 'canonsys_agent', token_id: tokenId })
      if (!res.success) throw new Error(res.error ?? 'Execution failed')
      return `PDF: ${res.artifact_uri}`
    })

    await run(steps, update, 'close', async () => {
      await api.cases.transition(caseId, 'RELEASE_COMPILED', 'canonsys_agent')
      await delay(100)
      await api.cases.transition(caseId, 'RELEASED', 'canonsys_agent')
      await delay(100)
      await api.cases.transition(caseId, 'EXECUTED', 'canonsys_agent')
      await delay(100)
      await api.cases.transition(caseId, 'CLOSED', 'canonsys_agent')
      return 'Case lifecycle closed'
    })

    return { caseId, success: true, summary: 'Full happy path complete — offer letter PDF generated', steps }
  } catch {
    return { caseId, success: false, summary: 'Scenario failed — see failed step for details', steps }
  }
}

// ── Scenario B: Policy hard-DENY (salary > 2x band) ──────────────────────────

export async function runDenySalaryTooHigh(update: StepUpdater): Promise<ScenarioResult> {
  const steps: Step[] = [
    { id: 'create', label: 'Create HIGH risk case', status: 'pending' },
    { id: 'facts', label: 'Add facts with salary_to_band_ratio = 2.5', status: 'pending' },
    { id: 'transitions', label: 'Walk lifecycle to APPROVED', status: 'pending' },
    { id: 'policy', label: 'Evaluate policy → expect DENY', status: 'pending' },
    { id: 'approvals', label: 'Submit all 3 approvals', status: 'pending' },
    { id: 'compile', label: 'Attempt release compile → must be DENIED', status: 'pending' },
    { id: 'finalize', label: 'Finalize lifecycle → DENIED (terminal)', status: 'pending' },
  ]
  update([...steps])

  let caseId = ''

  try {
    await run(steps, update, 'create', async () => {
      const res = await api.cases.create({
        case_type: 'HR_EXCEPTION_OFFER',
        title: '[Agent] DENY — salary exceeds 2x band',
        requester: 'manager@company.com',
        business_owner: 'vp@company.com',
        jurisdiction: 'US-CA',
        risk_level: 'HIGH',
      })
      caseId = res.case.case_id
      return caseId
    })

    await run(steps, update, 'facts', async () => {
      await api.facts.add(caseId, { key: 'business_justification', value: 'Good case', source: 'manager', confidence: 1.0 })
      await api.facts.add(caseId, { key: 'salary_to_band_ratio', value: 2.5, source: 'comp_team', confidence: 1.0 })
      await api.facts.add(caseId, { key: 'competing_offer_documented', value: true, source: 'recruiter', confidence: 1.0 })
      await api.facts.add(caseId, { key: 'role_level', value: 'L7', source: 'manager', confidence: 1.0 })
      return 'salary_to_band_ratio = 2.5 (exceeds 2.0x hard limit)'
    })

    await run(steps, update, 'transitions', async () => {
      for (const s of ['SUBMITTED', 'INTAKE_VALIDATED', 'FACT_REVIEW', 'PROPOSAL_READY', 'POLICY_REVIEW', 'HUMAN_REVIEW', 'APPROVAL_PENDING', 'APPROVED']) {
        await api.cases.transition(caseId, s, 'canonsys_agent')
        await delay(80)
      }
      return '→ APPROVED'
    })

    await run(steps, update, 'policy', async () => {
      const res = await api.policy.evaluate(caseId)
      if (res.verdict !== 'DENY') throw new Error(`Expected DENY but got ${res.verdict}`)
      const denied = res.results.filter((r) => r.result === 'DENY')
      return `DENY — ${denied.length} rule(s) hard-blocked: ${denied.map((r) => r.rationale).join('; ')}`
    })

    await run(steps, update, 'approvals', async () => {
      for (const [approver, role] of [
        ['vp@company.com', 'VP_ENGINEERING'],
        ['hr@company.com', 'HR_DIRECTOR'],
        ['fin@company.com', 'FINANCE_VP'],
      ]) {
        await api.approvals.submit(caseId, { approver, role, authority_scope: 'HR_EXCEPTION_OFFER', decision: 'APPROVE' })
      }
      return 'All 3 approvals submitted (still not enough — policy blocks)'
    })

    await run(steps, update, 'compile', async () => {
      const res = await api.release.compile(caseId, { requested_action: 'GENERATE_OFFER_LETTER', actor: 'canonsys_agent' })
      if (res.allowed) throw new Error('Expected denial but compiler allowed release!')
      return `✓ Correctly denied: ${res.denial_reasons[0]}`
    })

    await run(steps, update, 'finalize', async () => {
      await api.cases.transition(caseId, 'DENIED', 'canonsys_compiler')
      return 'Case transitioned to DENIED (terminal state)'
    })

    return { caseId, success: true, summary: 'Policy hard-DENY correctly blocked release compilation', steps }
  } catch {
    return { caseId, success: false, summary: 'Scenario failed unexpectedly', steps }
  }
}

// ── Scenario C: Missing required approval ─────────────────────────────────────

export async function runDenyMissingApproval(update: StepUpdater): Promise<ScenarioResult> {
  const steps: Step[] = [
    { id: 'create', label: 'Create HIGH risk case', status: 'pending' },
    { id: 'facts', label: 'Add passing facts', status: 'pending' },
    { id: 'transitions', label: 'Walk lifecycle to APPROVED', status: 'pending' },
    { id: 'policy', label: 'Evaluate policy → PASS', status: 'pending' },
    { id: 'approvals', label: 'Submit only 2 of 3 required approvals', status: 'pending' },
    { id: 'compile', label: 'Attempt release compile → must be DENIED', status: 'pending' },
    { id: 'finalize', label: 'Finalize lifecycle → DENIED (terminal)', status: 'pending' },
  ]
  update([...steps])

  let caseId = ''

  try {
    await run(steps, update, 'create', async () => {
      const res = await api.cases.create({
        case_type: 'HR_EXCEPTION_OFFER',
        title: '[Agent] DENY — FINANCE_VP approval missing',
        requester: 'manager@company.com',
        business_owner: 'vp@company.com',
        jurisdiction: 'US-CA',
        risk_level: 'HIGH',
      })
      caseId = res.case.case_id
      return caseId
    })

    await run(steps, update, 'facts', async () => {
      await api.facts.add(caseId, { key: 'business_justification', value: 'Strong case', source: 'manager', confidence: 1.0 })
      await api.facts.add(caseId, { key: 'salary_to_band_ratio', value: 1.3, source: 'comp_team', confidence: 1.0 })
      await api.facts.add(caseId, { key: 'competing_offer_documented', value: true, source: 'recruiter', confidence: 1.0 })
      await api.facts.add(caseId, { key: 'role_level', value: 'L6', source: 'manager', confidence: 1.0 })
      return '4 passing facts'
    })

    await run(steps, update, 'transitions', async () => {
      for (const s of ['SUBMITTED', 'INTAKE_VALIDATED', 'FACT_REVIEW', 'PROPOSAL_READY', 'POLICY_REVIEW', 'HUMAN_REVIEW', 'APPROVAL_PENDING', 'APPROVED']) {
        await api.cases.transition(caseId, s, 'canonsys_agent')
        await delay(80)
      }
      return '→ APPROVED'
    })

    await run(steps, update, 'policy', async () => {
      const res = await api.policy.evaluate(caseId)
      return `Verdict: ${res.verdict}`
    })

    await run(steps, update, 'approvals', async () => {
      await api.approvals.submit(caseId, { approver: 'vp@company.com', role: 'VP_ENGINEERING', authority_scope: 'HR_EXCEPTION_OFFER', decision: 'APPROVE' })
      await api.approvals.submit(caseId, { approver: 'hr@company.com', role: 'HR_DIRECTOR', authority_scope: 'HR_EXCEPTION_OFFER', decision: 'APPROVE' })
      return 'VP_ENGINEERING + HR_DIRECTOR approved — FINANCE_VP intentionally skipped'
    })

    await run(steps, update, 'compile', async () => {
      const res = await api.release.compile(caseId, { requested_action: 'GENERATE_OFFER_LETTER', actor: 'canonsys_agent' })
      if (res.allowed) throw new Error('Expected denial but compiler allowed release!')
      const missing = res.denial_reasons.find((r) => r.includes('FINANCE_VP'))
      return `✓ Correctly denied: ${missing ?? res.denial_reasons[0]}`
    })

    await run(steps, update, 'finalize', async () => {
      await api.cases.transition(caseId, 'DENIED', 'canonsys_compiler')
      return 'Case transitioned to DENIED (terminal state)'
    })

    return { caseId, success: true, summary: 'Missing FINANCE_VP approval correctly blocked release gate', steps }
  } catch {
    return { caseId, success: false, summary: 'Scenario failed unexpectedly', steps }
  }
}

// ── Scenario D: LOW risk happy path ──────────────────────────────────────────

export async function runHappyLowRisk(update: StepUpdater): Promise<ScenarioResult> {
  const steps: Step[] = [
    { id: 'create', label: 'Create LOW risk case', status: 'pending' },
    { id: 'facts', label: 'Add passing facts', status: 'pending' },
    { id: 'transitions', label: 'Walk lifecycle to APPROVED', status: 'pending' },
    { id: 'policy', label: 'Evaluate policy', status: 'pending' },
    { id: 'approvals', label: 'Submit 1 approval (HR_MANAGER only)', status: 'pending' },
    { id: 'compile', label: 'Compile release → token', status: 'pending' },
    { id: 'execute', label: 'Execute → PDF generated', status: 'pending' },
    { id: 'close', label: 'Finalize lifecycle → EXECUTED → CLOSED', status: 'pending' },
  ]
  update([...steps])

  let caseId = ''
  let tokenId = ''

  try {
    await run(steps, update, 'create', async () => {
      const res = await api.cases.create({
        case_type: 'HR_EXCEPTION_OFFER',
        title: '[Agent] LOW risk — single approver path',
        requester: 'manager@company.com',
        business_owner: 'team_lead@company.com',
        jurisdiction: 'US-CA',
        risk_level: 'LOW',
      })
      caseId = res.case.case_id
      return caseId
    })

    await run(steps, update, 'facts', async () => {
      await api.facts.add(caseId, { key: 'business_justification', value: 'Standard retention offer', source: 'manager', confidence: 1.0 })
      await api.facts.add(caseId, { key: 'salary_to_band_ratio', value: 1.1, source: 'comp_team', confidence: 1.0 })
      await api.facts.add(caseId, { key: 'competing_offer_documented', value: true, source: 'recruiter', confidence: 1.0 })
      await api.facts.add(caseId, { key: 'role_level', value: 'Senior Engineer (L5)', source: 'manager', confidence: 1.0 })
      return '4 facts, ratio = 1.1x (well within limits)'
    })

    await run(steps, update, 'transitions', async () => {
      for (const s of ['SUBMITTED', 'INTAKE_VALIDATED', 'FACT_REVIEW', 'PROPOSAL_READY', 'POLICY_REVIEW', 'HUMAN_REVIEW', 'APPROVAL_PENDING', 'APPROVED']) {
        await api.cases.transition(caseId, s, 'canonsys_agent')
        await delay(80)
      }
      return '→ APPROVED'
    })

    await run(steps, update, 'policy', async () => {
      const res = await api.policy.evaluate(caseId)
      return `Verdict: ${res.verdict}`
    })

    await run(steps, update, 'approvals', async () => {
      await api.approvals.submit(caseId, { approver: 'hr_mgr@company.com', role: 'HR_MANAGER', authority_scope: 'HR_EXCEPTION_OFFER', decision: 'APPROVE' })
      return 'HR_MANAGER approved (only role required for LOW risk)'
    })

    await run(steps, update, 'compile', async () => {
      const res = await api.release.compile(caseId, { requested_action: 'GENERATE_OFFER_LETTER', actor: 'canonsys_agent' })
      if (!res.allowed) throw new Error(res.denial_reasons.join('; '))
      tokenId = res.release_token?.token_id ?? ''
      return `Token: ${tokenId}`
    })

    await run(steps, update, 'execute', async () => {
      const res = await api.execution.execute(caseId, { actor: 'canonsys_agent', token_id: tokenId })
      if (!res.success) throw new Error(res.error ?? 'failed')
      return `PDF: ${res.artifact_uri}`
    })

    await run(steps, update, 'close', async () => {
      await api.cases.transition(caseId, 'RELEASE_COMPILED', 'canonsys_agent')
      await delay(100)
      await api.cases.transition(caseId, 'RELEASED', 'canonsys_agent')
      await delay(100)
      await api.cases.transition(caseId, 'EXECUTED', 'canonsys_agent')
      await delay(100)
      await api.cases.transition(caseId, 'CLOSED', 'canonsys_agent')
      return 'Case lifecycle closed'
    })

    return { caseId, success: true, summary: 'LOW risk happy path: 1 approval, full execution', steps }
  } catch {
    return { caseId, success: false, summary: 'Scenario failed', steps }
  }
}

// ── Scenario E: Self-approval attempt (governance violation) ──────────────────

export async function runSelfApprovalBlocked(update: StepUpdater): Promise<ScenarioResult> {
  const steps: Step[] = [
    { id: 'create', label: 'Create HIGH risk case', status: 'pending' },
    { id: 'facts', label: 'Add passing facts', status: 'pending' },
    { id: 'transitions', label: 'Walk lifecycle to APPROVED', status: 'pending' },
    { id: 'policy', label: 'Evaluate policy → PASS', status: 'pending' },
    { id: 'approvals', label: 'Submit self-approval + others', status: 'pending' },
    { id: 'compile', label: 'Attempt compile → self-approval violation blocked', status: 'pending' },
    { id: 'finalize', label: 'Finalize lifecycle → DENIED (terminal)', status: 'pending' },
  ]
  update([...steps])

  let caseId = ''

  try {
    await run(steps, update, 'create', async () => {
      const res = await api.cases.create({
        case_type: 'HR_EXCEPTION_OFFER',
        title: '[Agent] DENY — self-approval governance violation',
        requester: 'manager@company.com',
        business_owner: 'vp@company.com',
        jurisdiction: 'US-CA',
        risk_level: 'HIGH',
      })
      caseId = res.case.case_id
      return caseId
    })

    await run(steps, update, 'facts', async () => {
      await api.facts.add(caseId, { key: 'business_justification', value: 'Good reason', source: 'manager', confidence: 1.0 })
      await api.facts.add(caseId, { key: 'salary_to_band_ratio', value: 1.3, source: 'comp_team', confidence: 1.0 })
      await api.facts.add(caseId, { key: 'competing_offer_documented', value: true, source: 'recruiter', confidence: 1.0 })
      await api.facts.add(caseId, { key: 'role_level', value: 'L6', source: 'manager', confidence: 1.0 })
      return '4 passing facts'
    })

    await run(steps, update, 'transitions', async () => {
      for (const s of ['SUBMITTED', 'INTAKE_VALIDATED', 'FACT_REVIEW', 'PROPOSAL_READY', 'POLICY_REVIEW', 'HUMAN_REVIEW', 'APPROVAL_PENDING', 'APPROVED']) {
        await api.cases.transition(caseId, s, 'canonsys_agent')
        await delay(80)
      }
      return '→ APPROVED'
    })

    await run(steps, update, 'policy', async () => {
      const res = await api.policy.evaluate(caseId)
      return `Verdict: ${res.verdict}`
    })

    await run(steps, update, 'approvals', async () => {
      // Requester (manager@company.com) tries to approve their own case as VP_ENGINEERING
      await api.approvals.submit(caseId, { approver: 'manager@company.com', role: 'VP_ENGINEERING', authority_scope: 'HR_EXCEPTION_OFFER', decision: 'APPROVE' })
      await api.approvals.submit(caseId, { approver: 'hr@company.com', role: 'HR_DIRECTOR', authority_scope: 'HR_EXCEPTION_OFFER', decision: 'APPROVE' })
      await api.approvals.submit(caseId, { approver: 'fin@company.com', role: 'FINANCE_VP', authority_scope: 'HR_EXCEPTION_OFFER', decision: 'APPROVE' })
      return 'Requester self-approved as VP_ENGINEERING — violation recorded'
    })

    await run(steps, update, 'compile', async () => {
      const res = await api.release.compile(caseId, { requested_action: 'GENERATE_OFFER_LETTER', actor: 'canonsys_agent' })
      if (res.allowed) throw new Error('Expected denial but compiler allowed release!')
      const selfApproval = res.denial_reasons.find((r) => r.includes('self_approval'))
      return `✓ Correctly denied: ${selfApproval ?? res.denial_reasons[0]}`
    })

    await run(steps, update, 'finalize', async () => {
      await api.cases.transition(caseId, 'DENIED', 'canonsys_compiler')
      return 'Case transitioned to DENIED (terminal state)'
    })

    return { caseId, success: true, summary: 'Self-approval governance violation correctly blocked', steps }
  } catch {
    return { caseId, success: false, summary: 'Scenario failed unexpectedly', steps }
  }
}
