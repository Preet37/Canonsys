from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .authority import AuthorityMatrixService, AuthorityResolution
from .evidence import EvidenceBuilder, EvidencePacket
from .ledger import HashChainedLedger
from .models import (
    ApprovalRecord,
    ArtifactRecord,
    CaseCreateRequest,
    CaseRecord,
    CaseState,
    EventRecord,
    EventType,
    FactRecord,
    PolicyResultRecord,
    ProposalRecord,
    ReleasePlanRecord,
    ReleaseTokenRecord,
    TransitionRequest,
    TransitionResult,
    new_id,
    utc_now,
)
from .policy_engine import DeterministicPolicyEngine
from .proposal import ProposalLayer
from .release_compiler import CompilerResult, ReleaseCompiler
from .state_machine import CaseStateMachine


class CaseNotFoundError(KeyError):
    pass


class InvalidTransitionError(ValueError):
    pass


class GovernanceError(ValueError):
    pass


@dataclass
class CaseEngine:
    """Single source of truth for all CanonSys lifecycle operations (Phases 1-4)."""

    state_machine: CaseStateMachine = field(default_factory=CaseStateMachine)
    ledger: HashChainedLedger = field(default_factory=HashChainedLedger)
    policy_engine: DeterministicPolicyEngine = field(
        default_factory=lambda: DeterministicPolicyEngine(Path("policies"))
    )
    authority_service: AuthorityMatrixService = field(
        default_factory=lambda: AuthorityMatrixService(Path("authority"))
    )
    proposal_layer: ProposalLayer = field(default_factory=ProposalLayer)
    evidence_builder: EvidenceBuilder = field(default_factory=EvidenceBuilder)

    _cases: dict[str, CaseRecord] = field(default_factory=dict)
    _facts: dict[str, list[FactRecord]] = field(default_factory=dict)
    _artifacts: dict[str, list[ArtifactRecord]] = field(default_factory=dict)
    _proposals: dict[str, list[ProposalRecord]] = field(default_factory=dict)
    _policy_results: dict[str, list[PolicyResultRecord]] = field(default_factory=dict)
    _approvals: dict[str, list[ApprovalRecord]] = field(default_factory=dict)
    _evidence_packets: dict[str, EvidencePacket] = field(default_factory=dict)
    _release_plans: dict[str, ReleasePlanRecord] = field(default_factory=dict)
    _tokens: dict[str, ReleaseTokenRecord] = field(default_factory=dict)
    _case_token_map: dict[str, str] = field(default_factory=dict)  # case_id → token_id
    _execution_results: dict[str, dict[str, Any]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self._release_compiler = ReleaseCompiler(self.authority_service)

    # ── Case lifecycle ────────────────────────────────────────────────────────

    def create_case(self, request: CaseCreateRequest, actor: str) -> tuple[CaseRecord, EventRecord]:
        case_id = new_id("case")
        now = utc_now()
        case = CaseRecord(
            case_id=case_id,
            case_type=request.case_type,
            title=request.title,
            status=CaseState.DRAFT,
            requester=request.requester,
            business_owner=request.business_owner,
            jurisdiction=request.jurisdiction,
            risk_level=request.risk_level,
            current_stage=CaseState.DRAFT,
            created_at=now,
            updated_at=now,
        )
        self._cases[case_id] = case
        self._facts[case_id] = []
        self._artifacts[case_id] = []
        self._proposals[case_id] = []
        self._policy_results[case_id] = []
        self._approvals[case_id] = []

        event = self.ledger.append_event(
            case_id=case_id,
            actor=actor,
            event_type=EventType.CASE_CREATED,
            payload={
                "case_id": case_id,
                "status": CaseState.DRAFT.value,
                "risk_level": request.risk_level.value,
                "case_type": request.case_type,
            },
        )
        return case, event

    def get_case(self, case_id: str) -> CaseRecord:
        case = self._cases.get(case_id)
        if case is None:
            raise CaseNotFoundError(case_id)
        return case

    def list_cases(self) -> list[CaseRecord]:
        return sorted(self._cases.values(), key=lambda c: c.created_at, reverse=True)

    def transition_case(self, case_id: str, request: TransitionRequest) -> TransitionResult:
        case = self.get_case(case_id)
        decision = self.state_machine.evaluate(case.status, request.target_state)
        if not decision.allowed:
            raise InvalidTransitionError(decision.reason)

        prev = case.status
        now = utc_now()
        case.status = request.target_state
        case.current_stage = request.target_state
        case.updated_at = now

        event = self.ledger.append_event(
            case_id=case_id,
            actor=request.actor,
            event_type=EventType.STATE_TRANSITION,
            payload={
                "from_state": prev.value,
                "to_state": request.target_state.value,
                "note": request.note,
            },
            supersedes_event_id=request.supersedes_event_id,
        )
        return TransitionResult(case=case, event=event)

    def list_case_events(self, case_id: str) -> list[EventRecord]:
        self.get_case(case_id)
        return self.ledger.list_events(case_id)

    # ── Facts ─────────────────────────────────────────────────────────────────

    def add_fact(
        self,
        case_id: str,
        key: str,
        value: Any,
        source: str,
        confidence: float,
        actor: str,
    ) -> FactRecord:
        self.get_case(case_id)
        fact = FactRecord(
            fact_id=new_id("fact"),
            case_id=case_id,
            key=key,
            value=value,
            source=source,
            confidence=confidence,
        )
        self._facts[case_id].append(fact)
        self.ledger.append_event(
            case_id=case_id,
            actor=actor,
            event_type=EventType.FACT_ADDED,
            payload={"fact_id": fact.fact_id, "key": key, "source": source},
        )
        return fact

    def list_facts(self, case_id: str) -> list[FactRecord]:
        self.get_case(case_id)
        return list(self._facts[case_id])

    def verify_fact(self, case_id: str, fact_id: str, verified_by: str) -> FactRecord:
        self.get_case(case_id)
        for fact in self._facts[case_id]:
            if fact.fact_id == fact_id:
                fact.verified_flag = True
                fact.verified_by = verified_by
                self.ledger.append_event(
                    case_id=case_id,
                    actor=verified_by,
                    event_type=EventType.FACT_VERIFIED,
                    payload={"fact_id": fact_id},
                )
                return fact
        raise CaseNotFoundError(f"fact_id:{fact_id}")

    def get_facts_dict(self, case_id: str) -> dict[str, Any]:
        return {f.key: f.value for f in self._facts.get(case_id, [])}

    # ── Proposals ─────────────────────────────────────────────────────────────

    def generate_proposal(
        self,
        case_id: str,
        model: str = "llama-3.3-70b-versatile",
        prompt_version: str = "v1.0",
        additional_context: str | None = None,
        actor: str = "system_proposal_layer",
    ) -> ProposalRecord:
        case = self.get_case(case_id)
        facts_dict = self.get_facts_dict(case_id)
        proposal = self.proposal_layer.generate(
            case_id=case_id,
            case_type=case.case_type,
            facts=facts_dict,
            prompt_version=prompt_version,
            model=model,
            additional_context=additional_context,
        )
        self._proposals[case_id].append(proposal)
        self.ledger.append_event(
            case_id=case_id,
            actor=actor,
            event_type=EventType.PROPOSAL_GENERATED,
            payload={
                "proposal_id": proposal.proposal_id,
                "model": proposal.model_used,
                "prompt_version": proposal.prompt_version,
                "advisory_only": True,
            },
        )
        return proposal

    def list_proposals(self, case_id: str) -> list[ProposalRecord]:
        self.get_case(case_id)
        return list(self._proposals[case_id])

    # ── Policy ────────────────────────────────────────────────────────────────

    def evaluate_policy(
        self, case_id: str, actor: str = "system_policy_engine"
    ) -> list[PolicyResultRecord]:
        case = self.get_case(case_id)
        facts_dict = self.get_facts_dict(case_id)
        results = self.policy_engine.evaluate(case_id, case.case_type, facts_dict)
        self._policy_results[case_id] = results
        verdict = self.policy_engine.overall_verdict(results)
        self.ledger.append_event(
            case_id=case_id,
            actor=actor,
            event_type=EventType.POLICY_EVALUATED,
            payload={"verdict": verdict, "rule_count": len(results)},
        )
        return results

    def get_policy_results(self, case_id: str) -> list[PolicyResultRecord]:
        self.get_case(case_id)
        return list(self._policy_results.get(case_id, []))

    def get_policy_verdict(self, case_id: str) -> str:
        return self.policy_engine.overall_verdict(self.get_policy_results(case_id))

    # ── Authority ─────────────────────────────────────────────────────────────

    def resolve_authority(self, case_id: str) -> AuthorityResolution:
        case = self.get_case(case_id)
        return self.authority_service.resolve(
            case.case_type, case.risk_level.value, case.requester
        )

    # ── Approvals ─────────────────────────────────────────────────────────────

    def submit_approval(
        self,
        case_id: str,
        approver: str,
        role: str,
        authority_scope: str,
        decision: str,
        note: str | None = None,
    ) -> ApprovalRecord:
        self.get_case(case_id)
        approval = ApprovalRecord(
            approval_id=new_id("appr"),
            case_id=case_id,
            approver=approver,
            role=role,
            authority_scope=authority_scope,
            decision=decision,
            note=note,
            timestamp=utc_now(),
        )
        self._approvals[case_id].append(approval)
        self.ledger.append_event(
            case_id=case_id,
            actor=approver,
            event_type=EventType.APPROVAL_SUBMITTED,
            payload={
                "approval_id": approval.approval_id,
                "decision": decision,
                "role": role,
            },
        )
        return approval

    def list_approvals(self, case_id: str) -> list[ApprovalRecord]:
        self.get_case(case_id)
        return list(self._approvals.get(case_id, []))

    # ── Evidence ──────────────────────────────────────────────────────────────

    def assemble_evidence(
        self, case_id: str, actor: str = "system_evidence_builder"
    ) -> EvidencePacket:
        self.get_case(case_id)
        packet = self.evidence_builder.assemble(
            case_id=case_id,
            facts=self._facts[case_id],
            artifacts=self._artifacts.get(case_id, []),
            proposals=self._proposals[case_id],
        )
        self._evidence_packets[case_id] = packet
        self.ledger.append_event(
            case_id=case_id,
            actor=actor,
            event_type=EventType.EVIDENCE_ASSEMBLED,
            payload={
                "checksum": packet.packet_checksum,
                "fact_count": len(packet.facts),
                "proposal_count": len(packet.proposals),
            },
        )
        return packet

    def get_evidence(self, case_id: str) -> EvidencePacket | None:
        self.get_case(case_id)
        return self._evidence_packets.get(case_id)

    # ── Release Compilation ───────────────────────────────────────────────────

    def compile_release(
        self, case_id: str, requested_action: str, actor: str
    ) -> CompilerResult:
        case = self.get_case(case_id)
        result = self._release_compiler.compile(
            case=case,
            facts=self._facts.get(case_id, []),
            policy_results=self._policy_results.get(case_id, []),
            approvals=self._approvals.get(case_id, []),
            requested_action=requested_action,
        )

        if result.allowed and result.release_plan and result.release_token:
            self._release_plans[case_id] = result.release_plan
            self._tokens[result.release_token.token_id] = result.release_token
            self._case_token_map[case_id] = result.release_token.token_id
            self.ledger.append_event(
                case_id=case_id,
                actor=actor,
                event_type=EventType.RELEASE_COMPILED,
                payload={
                    "release_plan_id": result.release_plan.release_plan_id,
                    "token_id": result.release_token.token_id,
                    "allowed": True,
                },
            )
        else:
            self.ledger.append_event(
                case_id=case_id,
                actor=actor,
                event_type=EventType.RELEASE_DENIED,
                payload={"allowed": False, "reasons": result.denial_reasons},
            )
        return result

    def get_release_plan(self, case_id: str) -> ReleasePlanRecord | None:
        self.get_case(case_id)
        return self._release_plans.get(case_id)

    def get_release_token_for_case(self, case_id: str) -> ReleaseTokenRecord | None:
        self.get_case(case_id)
        token_id = self._case_token_map.get(case_id)
        return self._tokens.get(token_id) if token_id else None

    def get_token_by_id(self, token_id: str) -> ReleaseTokenRecord | None:
        return self._tokens.get(token_id)

    # ── Execution ─────────────────────────────────────────────────────────────

    def execute(
        self, case_id: str, token_id: str, actor: str
    ) -> dict[str, Any]:
        from .connectors.pdf import generate_offer_letter

        case = self.get_case(case_id)
        token = self.get_token_by_id(token_id)
        if token is None:
            raise GovernanceError(f"token_not_found:{token_id}")

        requested_action = token.scope.get("requested_action", "")
        valid, reason = self._release_compiler.validate_token(token, requested_action)
        if not valid:
            raise GovernanceError(f"token_invalid:{reason}")

        facts_dict = self.get_facts_dict(case_id)
        result = generate_offer_letter(case, token, facts_dict)

        outcome: dict[str, Any] = {
            "success": result.success,
            "artifact_uri": result.artifact_uri,
            "error": result.error,
            "executed_at": result.executed_at,
            "actor": actor,
            "token_id": token_id,
        }
        self._execution_results[case_id] = outcome
        self.ledger.append_event(
            case_id=case_id,
            actor=actor,
            event_type=EventType.EXECUTED,
            payload={
                "success": result.success,
                "artifact_uri": result.artifact_uri,
                "token_id": token_id,
            },
        )
        return outcome

    def get_execution_result(self, case_id: str) -> dict[str, Any] | None:
        self.get_case(case_id)
        return self._execution_results.get(case_id)
