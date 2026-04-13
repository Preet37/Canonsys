from __future__ import annotations

from typing import Annotated, Any

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .models import (
    ApprovalRecord,
    ApprovalSubmitRequest,
    CaseCreateRequest,
    CaseRecord,
    CompileReleaseRequest,
    EventRecord,
    ExecuteRequest,
    FactAddRequest,
    FactRecord,
    PolicyResultRecord,
    ProposalGenerateRequest,
    ProposalRecord,
    ReleasePlanRecord,
    ReleaseTokenRecord,
    TransitionRequest,
    TransitionResult,
    VerifyFactRequest,
)
from .store import CaseEngine, CaseNotFoundError, GovernanceError, InvalidTransitionError

app = FastAPI(
    title="CanonSys API",
    description="Decision governance infrastructure — agents propose, system certifies, denied by default.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = CaseEngine()


def _case_or_404(case_id: str) -> CaseRecord:
    try:
        return engine.get_case(case_id)
    except CaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"case_not_found:{exc}") from exc


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok", "version": "1.0.0"}


# ── Cases ─────────────────────────────────────────────────────────────────────

class CaseCreateResponse(BaseModel):
    case: CaseRecord
    event: EventRecord


@app.get("/cases", response_model=list[CaseRecord], tags=["cases"])
def list_cases() -> list[CaseRecord]:
    return engine.list_cases()


@app.post("/cases", response_model=CaseCreateResponse, status_code=201, tags=["cases"])
def create_case(
    request: CaseCreateRequest,
    x_actor: Annotated[str | None, Header()] = None,
) -> CaseCreateResponse:
    actor = x_actor or request.requester
    case, event = engine.create_case(request, actor=actor)
    return CaseCreateResponse(case=case, event=event)


@app.get("/cases/{case_id}", response_model=CaseRecord, tags=["cases"])
def get_case(case_id: str) -> CaseRecord:
    return _case_or_404(case_id)


@app.post("/cases/{case_id}/transitions", response_model=TransitionResult, tags=["cases"])
def transition_case(case_id: str, request: TransitionRequest) -> TransitionResult:
    _case_or_404(case_id)
    try:
        return engine.transition_case(case_id, request)
    except InvalidTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/cases/{case_id}/events", response_model=list[EventRecord], tags=["cases"])
def list_events(case_id: str) -> list[EventRecord]:
    _case_or_404(case_id)
    return engine.list_case_events(case_id)


# ── Facts ─────────────────────────────────────────────────────────────────────

@app.get("/cases/{case_id}/facts", response_model=list[FactRecord], tags=["facts"])
def list_facts(case_id: str) -> list[FactRecord]:
    _case_or_404(case_id)
    return engine.list_facts(case_id)


@app.post("/cases/{case_id}/facts", response_model=FactRecord, status_code=201, tags=["facts"])
def add_fact(case_id: str, request: FactAddRequest) -> FactRecord:
    _case_or_404(case_id)
    return engine.add_fact(
        case_id=case_id,
        key=request.key,
        value=request.value,
        source=request.source,
        confidence=request.confidence,
        actor=request.actor,
    )


@app.patch("/cases/{case_id}/facts/{fact_id}/verify", response_model=FactRecord, tags=["facts"])
def verify_fact(case_id: str, fact_id: str, request: VerifyFactRequest) -> FactRecord:
    _case_or_404(case_id)
    try:
        return engine.verify_fact(case_id, fact_id, request.verified_by)
    except CaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ── Proposals ─────────────────────────────────────────────────────────────────

@app.get("/cases/{case_id}/proposals", response_model=list[ProposalRecord], tags=["proposals"])
def list_proposals(case_id: str) -> list[ProposalRecord]:
    _case_or_404(case_id)
    return engine.list_proposals(case_id)


@app.post("/cases/{case_id}/proposal", response_model=ProposalRecord, status_code=201, tags=["proposals"])
def generate_proposal(case_id: str, request: ProposalGenerateRequest) -> ProposalRecord:
    _case_or_404(case_id)
    return engine.generate_proposal(
        case_id=case_id,
        model=request.model,
        prompt_version=request.prompt_version,
        additional_context=request.additional_context,
        actor=request.actor,
    )


# ── Policy ────────────────────────────────────────────────────────────────────

class PolicyEvaluateRequest(BaseModel):
    actor: str = "system_policy_engine"


class PolicyResponse(BaseModel):
    results: list[PolicyResultRecord]
    verdict: str


@app.get("/cases/{case_id}/policy-results", response_model=PolicyResponse, tags=["policy"])
def get_policy_results(case_id: str) -> PolicyResponse:
    _case_or_404(case_id)
    results = engine.get_policy_results(case_id)
    return PolicyResponse(results=results, verdict=engine.get_policy_verdict(case_id))


@app.post("/cases/{case_id}/evaluate-policy", response_model=PolicyResponse, tags=["policy"])
def evaluate_policy(case_id: str, request: PolicyEvaluateRequest) -> PolicyResponse:
    _case_or_404(case_id)
    results = engine.evaluate_policy(case_id, actor=request.actor)
    return PolicyResponse(results=results, verdict=engine.get_policy_verdict(case_id))


# ── Authority ─────────────────────────────────────────────────────────────────

class AuthorityResolutionResponse(BaseModel):
    required_roles: list[str]
    self_approval_prohibited: bool
    separation_of_duties: list[list[str]]
    escalation_paths: list[str]
    submitted_approvals_count: int
    approval_sufficient: bool
    unmet_conditions: list[str]


@app.get("/cases/{case_id}/required-approvers", response_model=AuthorityResolutionResponse, tags=["authority"])
def get_required_approvers(case_id: str) -> AuthorityResolutionResponse:
    _case_or_404(case_id)
    resolution = engine.resolve_authority(case_id)
    approvals = engine.list_approvals(case_id)
    case = engine.get_case(case_id)
    approval_dicts = [
        {"approver": a.approver, "role": a.role, "decision": a.decision} for a in approvals
    ]
    sufficient, unmet = engine.authority_service.check_approvals_sufficient(
        resolution, approval_dicts, case.requester
    )
    return AuthorityResolutionResponse(
        required_roles=resolution.required_roles,
        self_approval_prohibited=resolution.self_approval_prohibited,
        separation_of_duties=resolution.separation_of_duties,
        escalation_paths=resolution.escalation_paths,
        submitted_approvals_count=len(approvals),
        approval_sufficient=sufficient,
        unmet_conditions=unmet,
    )


# ── Approvals ─────────────────────────────────────────────────────────────────

@app.get("/cases/{case_id}/approvals", response_model=list[ApprovalRecord], tags=["approvals"])
def list_approvals(case_id: str) -> list[ApprovalRecord]:
    _case_or_404(case_id)
    return engine.list_approvals(case_id)


@app.post("/cases/{case_id}/approvals", response_model=ApprovalRecord, status_code=201, tags=["approvals"])
def submit_approval(case_id: str, request: ApprovalSubmitRequest) -> ApprovalRecord:
    _case_or_404(case_id)
    return engine.submit_approval(
        case_id=case_id,
        approver=request.approver,
        role=request.role,
        authority_scope=request.authority_scope,
        decision=request.decision,
        note=request.note,
    )


# ── Evidence ──────────────────────────────────────────────────────────────────

@app.get("/cases/{case_id}/evidence", tags=["evidence"])
def get_evidence(case_id: str) -> dict[str, Any]:
    _case_or_404(case_id)
    packet = engine.get_evidence(case_id)
    if packet is None:
        return {"assembled": False}
    return {"assembled": True, **packet.to_dict()}


@app.post("/cases/{case_id}/evidence", status_code=201, tags=["evidence"])
def assemble_evidence(case_id: str) -> dict[str, Any]:
    _case_or_404(case_id)
    packet = engine.assemble_evidence(case_id)
    return {"assembled": True, **packet.to_dict()}


# ── Release ───────────────────────────────────────────────────────────────────

class ReleaseStatusResponse(BaseModel):
    allowed: bool | None = None
    release_plan: ReleasePlanRecord | None = None
    release_token: ReleaseTokenRecord | None = None
    denial_reasons: list[str] = []
    compiled: bool = False


@app.get("/cases/{case_id}/release", response_model=ReleaseStatusResponse, tags=["release"])
def get_release_status(case_id: str) -> ReleaseStatusResponse:
    _case_or_404(case_id)
    plan = engine.get_release_plan(case_id)
    token = engine.get_release_token_for_case(case_id)
    if plan is None:
        return ReleaseStatusResponse(compiled=False)
    return ReleaseStatusResponse(
        allowed=True,
        release_plan=plan,
        release_token=token,
        denial_reasons=[],
        compiled=True,
    )


@app.post("/cases/{case_id}/compile-release", response_model=ReleaseStatusResponse, tags=["release"])
def compile_release(case_id: str, request: CompileReleaseRequest) -> ReleaseStatusResponse:
    _case_or_404(case_id)
    result = engine.compile_release(
        case_id=case_id,
        requested_action=request.requested_action,
        actor=request.actor,
    )
    return ReleaseStatusResponse(
        allowed=result.allowed,
        release_plan=result.release_plan,
        release_token=result.release_token,
        denial_reasons=result.denial_reasons,
        compiled=result.allowed,
    )


# ── Execution ─────────────────────────────────────────────────────────────────

@app.get("/cases/{case_id}/execution", tags=["execution"])
def get_execution(case_id: str) -> dict[str, Any]:
    _case_or_404(case_id)
    result = engine.get_execution_result(case_id)
    return result or {"executed": False}


@app.post("/cases/{case_id}/execute", status_code=201, tags=["execution"])
def execute_case(case_id: str, request: ExecuteRequest) -> dict[str, Any]:
    _case_or_404(case_id)
    try:
        return engine.execute(case_id=case_id, token_id=request.token_id, actor=request.actor)
    except GovernanceError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
