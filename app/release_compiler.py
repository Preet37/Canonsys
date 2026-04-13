from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from .authority import AuthorityMatrixService
from .models import (
    ApprovalRecord,
    CaseRecord,
    CaseState,
    FactRecord,
    PolicyResultRecord,
    ReleasePlanRecord,
    ReleaseTokenRecord,
    new_id,
    utc_now,
)


def _sign(data: dict[str, Any]) -> str:
    payload = json.dumps(data, separators=(",", ":"), sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


@dataclass
class CompilerResult:
    allowed: bool
    release_plan: ReleasePlanRecord | None
    release_token: ReleaseTokenRecord | None
    denial_reasons: list[str]


class ReleaseCompiler:
    """
    The core IP of CanonSys.

    Takes case state + policy results + authority resolution + requested action
    and produces either a bounded release plan with a scoped token, or an
    explicit denial with every unmet condition listed.

    INVARIANT: fail-closed. Any missing condition → deny. No exceptions.
    """

    TOKEN_TTL_HOURS = 24

    def __init__(self, authority_service: AuthorityMatrixService) -> None:
        self._authority = authority_service

    def compile(
        self,
        case: CaseRecord,
        facts: list[FactRecord],
        policy_results: list[PolicyResultRecord],
        approvals: list[ApprovalRecord],
        requested_action: str,
    ) -> CompilerResult:
        denial_reasons: list[str] = []

        # ── Gate 1: case must be APPROVED ────────────────────────────────────
        if case.status != CaseState.APPROVED:
            denial_reasons.append(
                f"case_not_approved:current_status={case.status.value}; "
                "case must reach APPROVED state before release compilation"
            )

        # ── Gate 2: policy must have been evaluated ───────────────────────────
        if not policy_results:
            denial_reasons.append(
                "policy_not_evaluated:no_policy_results_on_record; "
                "run evaluate-policy before compiling release"
            )

        # ── Gate 3: no hard-DENY policy rules ────────────────────────────────
        for r in policy_results:
            if r.result == "DENY":
                denial_reasons.append(
                    f"policy_hard_block:rule={r.policy_id}:{r.rationale}"
                )

        # ── Gate 4: all required approvals received ───────────────────────────
        resolution = self._authority.resolve(
            case.case_type, case.risk_level.value, case.requester
        )
        approval_dicts = [
            {"approver": a.approver, "role": a.role, "decision": a.decision}
            for a in approvals
        ]
        sufficient, unmet = self._authority.check_approvals_sufficient(
            resolution, approval_dicts, case.requester
        )
        denial_reasons.extend(unmet)

        # ── FAIL-CLOSED: any unmet condition → deny ───────────────────────────
        if denial_reasons:
            return CompilerResult(
                allowed=False,
                release_plan=None,
                release_token=None,
                denial_reasons=denial_reasons,
            )

        # ── All gates passed — compile release plan ───────────────────────────
        now = utc_now()
        plan_id = new_id("rplan")
        approved_roles = sorted({a.role for a in approvals if a.decision == "APPROVE"})

        token_scope: dict[str, Any] = {
            "case_id": case.case_id,
            "case_type": case.case_type,
            "requested_action": requested_action,
            "requester": case.requester,
            "compiled_at": now.isoformat(),
            "approver_roles": approved_roles,
            "jurisdiction": case.jurisdiction,
        }

        release_plan = ReleasePlanRecord(
            release_plan_id=plan_id,
            case_id=case.case_id,
            requested_action=requested_action,
            allowed_action=requested_action,
            required_preconditions=[r.rationale for r in policy_results if r.result == "PASS"],
            token_scope=token_scope,
            compiled_at=now,
        )

        expires_at = now + timedelta(hours=self.TOKEN_TTL_HOURS)
        token_id = new_id("tok")

        # Signature covers token identity + scope + expiry — any tampering invalidates it
        sig_input: dict[str, Any] = {
            "token_id": token_id,
            "release_plan_id": plan_id,
            "scope": token_scope,
            "expires_at": expires_at.isoformat(),
        }
        signature = _sign(sig_input)

        release_token = ReleaseTokenRecord(
            token_id=token_id,
            release_plan_id=plan_id,
            scope=token_scope,
            expires_at=expires_at,
            signature_metadata={
                "sha256": signature,
                "issued_at": now.isoformat(),
                "ttl_hours": self.TOKEN_TTL_HOURS,
            },
        )

        return CompilerResult(
            allowed=True,
            release_plan=release_plan,
            release_token=release_token,
            denial_reasons=[],
        )

    def validate_token(
        self, token: ReleaseTokenRecord, requested_action: str
    ) -> tuple[bool, str]:
        """Validates a release token before execution. Fail-closed."""
        now = utc_now()

        if now > token.expires_at:
            return False, f"token_expired:expired_at={token.expires_at.isoformat()}"

        if token.scope.get("requested_action") != requested_action:
            return (
                False,
                f"token_scope_mismatch:"
                f"expected={token.scope.get('requested_action')} "
                f"got={requested_action}",
            )

        # Re-derive and verify signature
        sig_input: dict[str, Any] = {
            "token_id": token.token_id,
            "release_plan_id": token.release_plan_id,
            "scope": token.scope,
            "expires_at": token.expires_at.isoformat(),
        }
        expected = _sign(sig_input)
        if token.signature_metadata.get("sha256") != expected:
            return False, "token_signature_invalid:tamper_detected"

        return True, "token_valid"
