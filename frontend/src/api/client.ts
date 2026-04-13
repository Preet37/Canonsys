import type {
  ApprovalRecord,
  ApprovalSubmitRequest,
  AuthorityResolutionResponse,
  CaseCreateRequest,
  CaseRecord,
  CompileReleaseRequest,
  EventRecord,
  EvidenceResponse,
  ExecuteRequest,
  ExecutionResult,
  FactAddRequest,
  FactRecord,
  PolicyResponse,
  ProposalRecord,
  ReleaseStatusResponse,
} from '../types'

const BASE = 'http://localhost:8000'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
    throw new Error(typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail))
  }
  return res.json() as Promise<T>
}

const json = (body: unknown) => JSON.stringify(body)

export const api = {
  health: () => req<{ status: string }>('/health'),

  cases: {
    list: () => req<CaseRecord[]>('/cases'),
    create: (data: CaseCreateRequest) =>
      req<{ case: CaseRecord; event: EventRecord }>('/cases', { method: 'POST', body: json(data) }),
    get: (id: string) => req<CaseRecord>(`/cases/${id}`),
    transition: (id: string, target_state: string, actor: string, note?: string) =>
      req<{ case: CaseRecord; event: EventRecord }>(`/cases/${id}/transitions`, {
        method: 'POST',
        body: json({ target_state, actor, note }),
      }),
    events: (id: string) => req<EventRecord[]>(`/cases/${id}/events`),
  },

  facts: {
    list: (caseId: string) => req<FactRecord[]>(`/cases/${caseId}/facts`),
    add: (caseId: string, data: FactAddRequest) =>
      req<FactRecord>(`/cases/${caseId}/facts`, { method: 'POST', body: json(data) }),
    verify: (caseId: string, factId: string, verified_by: string) =>
      req<FactRecord>(`/cases/${caseId}/facts/${factId}/verify`, {
        method: 'PATCH',
        body: json({ verified_by }),
      }),
  },

  proposals: {
    list: (caseId: string) => req<ProposalRecord[]>(`/cases/${caseId}/proposals`),
    generate: (caseId: string, model?: string, additional_context?: string) =>
      req<ProposalRecord>(`/cases/${caseId}/proposal`, {
        method: 'POST',
        body: json({ model: model ?? 'llama-3.3-70b-versatile', additional_context }),
      }),
  },

  policy: {
    results: (caseId: string) => req<PolicyResponse>(`/cases/${caseId}/policy-results`),
    evaluate: (caseId: string) =>
      req<PolicyResponse>(`/cases/${caseId}/evaluate-policy`, { method: 'POST', body: json({}) }),
  },

  authority: {
    resolve: (caseId: string) =>
      req<AuthorityResolutionResponse>(`/cases/${caseId}/required-approvers`),
  },

  approvals: {
    list: (caseId: string) => req<ApprovalRecord[]>(`/cases/${caseId}/approvals`),
    submit: (caseId: string, data: ApprovalSubmitRequest) =>
      req<ApprovalRecord>(`/cases/${caseId}/approvals`, { method: 'POST', body: json(data) }),
  },

  evidence: {
    get: (caseId: string) => req<EvidenceResponse>(`/cases/${caseId}/evidence`),
    assemble: (caseId: string) =>
      req<EvidenceResponse>(`/cases/${caseId}/evidence`, { method: 'POST', body: json({}) }),
  },

  release: {
    status: (caseId: string) => req<ReleaseStatusResponse>(`/cases/${caseId}/release`),
    compile: (caseId: string, data: CompileReleaseRequest) =>
      req<ReleaseStatusResponse>(`/cases/${caseId}/compile-release`, {
        method: 'POST',
        body: json(data),
      }),
  },

  execution: {
    get: (caseId: string) => req<ExecutionResult>(`/cases/${caseId}/execution`),
    execute: (caseId: string, data: ExecuteRequest) =>
      req<ExecutionResult>(`/cases/${caseId}/execute`, { method: 'POST', body: json(data) }),
  },
}
