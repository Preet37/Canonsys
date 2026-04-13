export type CaseState =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'INTAKE_VALIDATED'
  | 'FACT_REVIEW'
  | 'PROPOSAL_READY'
  | 'POLICY_REVIEW'
  | 'HUMAN_REVIEW'
  | 'APPROVAL_PENDING'
  | 'APPROVED'
  | 'DENIED'
  | 'RELEASE_COMPILED'
  | 'RELEASED'
  | 'EXECUTED'
  | 'CLOSED'
  | 'ERROR_INVESTIGATION'

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface CaseRecord {
  case_id: string
  case_type: string
  title: string
  status: CaseState
  current_stage: CaseState
  requester: string
  business_owner: string
  jurisdiction: string
  risk_level: RiskLevel
  created_at: string
  updated_at: string
}

export interface EventRecord {
  event_id: string
  case_id: string
  actor: string
  event_type: string
  payload_ref: string
  timestamp: string
  supersedes_event_id: string | null
  prev_hash: string | null
  event_hash: string
}

export interface FactRecord {
  fact_id: string
  case_id: string
  key: string
  value: unknown
  source: string
  confidence: number
  verified_flag: boolean
  verified_by: string | null
}

export interface ProposalRecord {
  proposal_id: string
  case_id: string
  model_used: string
  prompt_version: string
  summary: string
  options: string[]
  recommendation: string
  caveats: string[]
  created_at: string
}

export interface PolicyResultRecord {
  policy_result_id: string
  case_id: string
  policy_id: string
  policy_version: string
  result: 'PASS' | 'WARN' | 'DENY'
  rationale: string
  evaluated_at: string
}

export interface ApprovalRecord {
  approval_id: string
  case_id: string
  approver: string
  role: string
  authority_scope: string
  decision: 'APPROVE' | 'DENY'
  note: string | null
  timestamp: string
}

export interface ReleasePlanRecord {
  release_plan_id: string
  case_id: string
  requested_action: string
  allowed_action: string
  required_preconditions: string[]
  token_scope: Record<string, unknown>
  compiled_at: string
}

export interface ReleaseTokenRecord {
  token_id: string
  release_plan_id: string
  scope: Record<string, unknown>
  expires_at: string
  signature_metadata: Record<string, unknown>
}

export interface AuthorityResolutionResponse {
  required_roles: string[]
  self_approval_prohibited: boolean
  separation_of_duties: string[][]
  escalation_paths: string[]
  submitted_approvals_count: number
  approval_sufficient: boolean
  unmet_conditions: string[]
}

export interface PolicyResponse {
  results: PolicyResultRecord[]
  verdict: 'PASS' | 'WARN' | 'DENY' | ''
}

export interface ReleaseStatusResponse {
  allowed: boolean | null
  release_plan: ReleasePlanRecord | null
  release_token: ReleaseTokenRecord | null
  denial_reasons: string[]
  compiled: boolean
}

export interface EvidenceResponse {
  assembled: boolean
  case_id?: string
  facts?: FactRecord[]
  artifacts?: unknown[]
  proposals?: ProposalRecord[]
  packet_checksum?: string
  assembled_at?: string
  fact_count?: number
  artifact_count?: number
  proposal_count?: number
}

export interface ExecutionResult {
  executed?: boolean
  success?: boolean
  artifact_uri?: string | null
  error?: string | null
  executed_at?: string
  actor?: string
  token_id?: string
}

// ── Request shapes ────────────────────────────────────────────────────────────

export interface CaseCreateRequest {
  case_type: string
  title: string
  requester: string
  business_owner: string
  jurisdiction: string
  risk_level: RiskLevel
}

export interface FactAddRequest {
  key: string
  value: unknown
  source: string
  confidence: number
  actor?: string
}

export interface ApprovalSubmitRequest {
  approver: string
  role: string
  authority_scope: string
  decision: 'APPROVE' | 'DENY'
  note?: string
}

export interface CompileReleaseRequest {
  requested_action: string
  actor: string
}

export interface ExecuteRequest {
  actor: string
  token_id: string
}
