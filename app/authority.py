from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class AuthorityResolution:
    required_roles: list[str]
    self_approval_prohibited: bool
    separation_of_duties: list[list[str]]
    escalation_paths: list[str] = field(default_factory=list)


class AuthorityMatrixService:
    """Resolves who can approve what from explicit JSON matrices. No inference."""

    def __init__(self, authority_dir: Path) -> None:
        self._matrices: list[dict] = []
        self._load(authority_dir)

    def _load(self, authority_dir: Path) -> None:
        if not authority_dir.exists():
            return
        for path in sorted(authority_dir.glob("*.json")):
            with open(path, encoding="utf-8") as f:
                self._matrices.append(json.load(f))

    def resolve(self, case_type: str, risk_level: str, requester: str) -> AuthorityResolution:
        for matrix in self._matrices:
            for entry in matrix.get("entries", []):
                if entry["case_type"] == case_type and entry["risk_level"] == risk_level:
                    return AuthorityResolution(
                        required_roles=entry["required_roles"],
                        self_approval_prohibited=entry.get("self_approval_prohibited", True),
                        separation_of_duties=entry.get("separation_of_duties", []),
                        escalation_paths=entry.get("escalation_paths", []),
                    )
        # Default: require SYSTEM_ADMIN — never silently allow
        return AuthorityResolution(
            required_roles=["SYSTEM_ADMIN"],
            self_approval_prohibited=True,
            separation_of_duties=[],
        )

    def check_approvals_sufficient(
        self,
        resolution: AuthorityResolution,
        submitted_approvals: list[dict],
        requester: str,
    ) -> tuple[bool, list[str]]:
        """Returns (sufficient, unmet_conditions). Fail-closed: empty results → not sufficient."""
        if not submitted_approvals:
            return False, [f"missing_approval_from_role:{r}" for r in resolution.required_roles]

        approved_roles = {a["role"] for a in submitted_approvals if a.get("decision") == "APPROVE"}
        unmet: list[str] = []

        for required_role in resolution.required_roles:
            if required_role not in approved_roles:
                unmet.append(f"missing_approval_from_role:{required_role}")

        if resolution.self_approval_prohibited:
            for approval in submitted_approvals:
                if approval.get("approver") == requester and approval.get("decision") == "APPROVE":
                    unmet.append(f"self_approval_prohibited:approver={requester}")

        for pair in resolution.separation_of_duties:
            if len(pair) == 2:
                actor_a, role_b = pair
                resolved_actor = requester if actor_a == "requester" else actor_a
                for approval in submitted_approvals:
                    if (
                        approval.get("approver") == resolved_actor
                        and approval.get("role") == role_b
                        and approval.get("decision") == "APPROVE"
                    ):
                        unmet.append(f"separation_of_duties_violation:{resolved_actor}=={role_b}")

        return len(unmet) == 0, unmet
