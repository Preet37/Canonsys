from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:10]}"


class CaseState(str, Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    INTAKE_VALIDATED = "INTAKE_VALIDATED"
    FACT_REVIEW = "FACT_REVIEW"
    PROPOSAL_READY = "PROPOSAL_READY"
    POLICY_REVIEW = "POLICY_REVIEW"
    HUMAN_REVIEW = "HUMAN_REVIEW"
    APPROVAL_PENDING = "APPROVAL_PENDING"
    APPROVED = "APPROVED"
    DENIED = "DENIED"
    RELEASE_COMPILED = "RELEASE_COMPILED"
    RELEASED = "RELEASED"
    EXECUTED = "EXECUTED"
    CLOSED = "CLOSED"
    ERROR_INVESTIGATION = "ERROR_INVESTIGATION"


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class CaseBase(BaseModel):
    case_type: str = Field(..., examples=["HR_EXCEPTION_OFFER"])
    title: str = Field(..., min_length=3, max_length=200)
    requester: str = Field(..., examples=["hiring_manager@company.com"])
    business_owner: str = Field(..., examples=["vp_eng@company.com"])
    jurisdiction: str = Field(..., examples=["US-CA"])
    risk_level: RiskLevel


class CaseCreateRequest(CaseBase):
    pass


class CaseRecord(CaseBase):
    case_id: str
    status: CaseState
    current_stage: CaseState
    created_at: datetime
    updated_at: datetime


class FactRecord(BaseModel):
    fact_id: str
    case_id: str
    key: str
    value: Any
    source: str
    confidence: float = Field(ge=0.0, le=1.0)
    verified_flag: bool = False
    verified_by: str | None = None


class ArtifactRecord(BaseModel):
    artifact_id: str
    case_id: str
    artifact_type: str
    uri: str
    source_system: str
    checksum: str
    created_by: str
    created_at: datetime


class ProposalRecord(BaseModel):
    proposal_id: str
    case_id: str
    model_used: str
    prompt_version: str
    summary: str
    options: list[str] = Field(default_factory=list)
    recommendation: str
    caveats: list[str] = Field(default_factory=list)
    created_at: datetime


class PolicyResultRecord(BaseModel):
    policy_result_id: str
    case_id: str
    policy_id: str
    policy_version: str
    result: str  # PASS | WARN | DENY
    rationale: str
    evaluated_at: datetime


class ApprovalRecord(BaseModel):
    approval_id: str
    case_id: str
    approver: str
    role: str
    authority_scope: str
    decision: str  # APPROVE | DENY
    note: str | None = None
    timestamp: datetime


class ReleasePlanRecord(BaseModel):
    release_plan_id: str
    case_id: str
    requested_action: str
    allowed_action: str
    required_preconditions: list[str]
    token_scope: dict[str, Any]
    compiled_at: datetime


class ReleaseTokenRecord(BaseModel):
    token_id: str
    release_plan_id: str
    scope: dict[str, Any]
    expires_at: datetime
    signature_metadata: dict[str, Any] = Field(default_factory=dict)


class EventType(str, Enum):
    CASE_CREATED = "CASE_CREATED"
    STATE_TRANSITION = "STATE_TRANSITION"
    CASE_CORRECTION_SUPERSESSION = "CASE_CORRECTION_SUPERSESSION"
    FACT_ADDED = "FACT_ADDED"
    FACT_VERIFIED = "FACT_VERIFIED"
    PROPOSAL_GENERATED = "PROPOSAL_GENERATED"
    POLICY_EVALUATED = "POLICY_EVALUATED"
    APPROVAL_SUBMITTED = "APPROVAL_SUBMITTED"
    EVIDENCE_ASSEMBLED = "EVIDENCE_ASSEMBLED"
    RELEASE_COMPILED = "RELEASE_COMPILED"
    RELEASE_DENIED = "RELEASE_DENIED"
    EXECUTED = "EXECUTED"


class EventRecord(BaseModel):
    event_id: str
    case_id: str
    actor: str
    event_type: EventType
    payload_ref: str
    timestamp: datetime
    supersedes_event_id: str | None = None
    prev_hash: str | None = None
    event_hash: str


class TransitionRequest(BaseModel):
    target_state: CaseState
    actor: str
    note: str | None = None
    supersedes_event_id: str | None = None


class TransitionResult(BaseModel):
    case: CaseRecord
    event: EventRecord


# ── Phase 2-4 request models ──────────────────────────────────────────────────

class FactAddRequest(BaseModel):
    key: str
    value: Any
    source: str
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    actor: str = "system"


class ProposalGenerateRequest(BaseModel):
    model: str = "llama-3.3-70b-versatile"
    prompt_version: str = "v1.0"
    additional_context: str | None = None
    actor: str = "system_proposal_layer"


class ApprovalSubmitRequest(BaseModel):
    approver: str
    role: str
    authority_scope: str
    decision: Literal["APPROVE", "DENY"]
    note: str | None = None


class CompileReleaseRequest(BaseModel):
    requested_action: str
    actor: str


class ExecuteRequest(BaseModel):
    actor: str
    token_id: str


class VerifyFactRequest(BaseModel):
    verified_by: str
