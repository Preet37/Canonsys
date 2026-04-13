import unittest

from app.models import CaseCreateRequest, CaseState, RiskLevel, TransitionRequest
from app.store import CaseEngine as InMemoryCaseStore, InvalidTransitionError


class Phase1Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = InMemoryCaseStore()
        self.case, _ = self.store.create_case(
            CaseCreateRequest(
                case_type="HR_EXCEPTION_OFFER",
                title="Principal engineer exception offer",
                requester="manager@example.com",
                business_owner="vp@example.com",
                jurisdiction="US-CA",
                risk_level=RiskLevel.HIGH,
            ),
            actor="manager@example.com",
        )

    def test_valid_transition_path(self) -> None:
        result = self.store.transition_case(
            self.case.case_id,
            TransitionRequest(target_state=CaseState.SUBMITTED, actor="manager@example.com"),
        )
        self.assertEqual(result.case.status, CaseState.SUBMITTED)

    def test_invalid_transition_is_blocked(self) -> None:
        with self.assertRaises(InvalidTransitionError):
            self.store.transition_case(
                self.case.case_id,
                TransitionRequest(target_state=CaseState.RELEASED, actor="manager@example.com"),
            )

    def test_hash_chain_links_events(self) -> None:
        self.store.transition_case(
            self.case.case_id,
            TransitionRequest(target_state=CaseState.SUBMITTED, actor="manager@example.com"),
        )
        self.store.transition_case(
            self.case.case_id,
            TransitionRequest(target_state=CaseState.INTAKE_VALIDATED, actor="ops@example.com"),
        )
        events = self.store.list_case_events(self.case.case_id)
        self.assertEqual(events[1].prev_hash, events[0].event_hash)
        self.assertEqual(events[2].prev_hash, events[1].event_hash)


if __name__ == "__main__":
    unittest.main()
