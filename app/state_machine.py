from __future__ import annotations

from dataclasses import dataclass

from .models import CaseState


@dataclass(frozen=True)
class TransitionDecision:
    allowed: bool
    reason: str


class CaseStateMachine:
    """Strict transition graph for Phase 1 lifecycle control."""

    _allowed: dict[CaseState, set[CaseState]] = {
        CaseState.DRAFT: {CaseState.SUBMITTED},
        CaseState.SUBMITTED: {CaseState.INTAKE_VALIDATED, CaseState.ERROR_INVESTIGATION},
        CaseState.INTAKE_VALIDATED: {CaseState.FACT_REVIEW, CaseState.ERROR_INVESTIGATION},
        CaseState.FACT_REVIEW: {
            CaseState.PROPOSAL_READY,
            CaseState.HUMAN_REVIEW,
            CaseState.ERROR_INVESTIGATION,
        },
        CaseState.PROPOSAL_READY: {CaseState.POLICY_REVIEW, CaseState.ERROR_INVESTIGATION},
        CaseState.POLICY_REVIEW: {
            CaseState.HUMAN_REVIEW,
            CaseState.APPROVAL_PENDING,
            CaseState.DENIED,
            CaseState.ERROR_INVESTIGATION,
        },
        CaseState.HUMAN_REVIEW: {
            CaseState.FACT_REVIEW,
            CaseState.APPROVAL_PENDING,
            CaseState.DENIED,
            CaseState.ERROR_INVESTIGATION,
        },
        CaseState.APPROVAL_PENDING: {
            CaseState.APPROVED,
            CaseState.DENIED,
            CaseState.ERROR_INVESTIGATION,
        },
        CaseState.APPROVED: {CaseState.RELEASE_COMPILED, CaseState.DENIED, CaseState.ERROR_INVESTIGATION},
        CaseState.DENIED: set(),
        CaseState.RELEASE_COMPILED: {
            CaseState.RELEASED,
            CaseState.DENIED,
            CaseState.ERROR_INVESTIGATION,
        },
        CaseState.RELEASED: {CaseState.EXECUTED, CaseState.ERROR_INVESTIGATION},
        CaseState.EXECUTED: {CaseState.CLOSED, CaseState.ERROR_INVESTIGATION},
        CaseState.CLOSED: set(),
        CaseState.ERROR_INVESTIGATION: {CaseState.HUMAN_REVIEW, CaseState.DENIED},
    }

    def evaluate(self, current: CaseState, target: CaseState) -> TransitionDecision:
        allowed_targets = self._allowed[current]
        if target in allowed_targets:
            return TransitionDecision(allowed=True, reason="transition_allowed")

        if current in {CaseState.DENIED, CaseState.CLOSED}:
            return TransitionDecision(
                allowed=False,
                reason=(
                    "terminal_state_reached; reopen requires new case version "
                    "under explicit governance"
                ),
            )

        return TransitionDecision(
            allowed=False,
            reason=f"invalid_transition:{current.value}->{target.value}",
        )
