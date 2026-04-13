import unittest
from pathlib import Path

from app.authority import AuthorityMatrixService
from app.models import CaseCreateRequest, CaseState, RiskLevel, TransitionRequest
from app.policy_engine import DeterministicPolicyEngine
from app.store import CaseEngine, InvalidTransitionError


class PolicyEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = DeterministicPolicyEngine(Path("policies"))

    def test_pass_when_all_facts_present(self) -> None:
        facts = {
            "business_justification": "Strong business case",
            "salary_to_band_ratio": 1.4,
            "competing_offer_documented": True,
            "role_level": "L6",
        }
        results = self.engine.evaluate("case_001", "HR_EXCEPTION_OFFER", facts)
        verdict = self.engine.overall_verdict(results)
        self.assertEqual(verdict, "PASS")
        self.assertTrue(all(r.result in ("PASS", "WARN") for r in results))

    def test_deny_when_salary_ratio_too_high(self) -> None:
        facts = {
            "business_justification": "Strong business case",
            "salary_to_band_ratio": 2.5,
            "competing_offer_documented": True,
            "role_level": "L6",
        }
        results = self.engine.evaluate("case_002", "HR_EXCEPTION_OFFER", facts)
        verdict = self.engine.overall_verdict(results)
        self.assertEqual(verdict, "DENY")

    def test_deny_when_justification_missing(self) -> None:
        facts = {
            "salary_to_band_ratio": 1.2,
            "competing_offer_documented": True,
        }
        results = self.engine.evaluate("case_003", "HR_EXCEPTION_OFFER", facts)
        verdict = self.engine.overall_verdict(results)
        self.assertEqual(verdict, "DENY")

    def test_warn_when_competing_offer_missing(self) -> None:
        facts = {
            "business_justification": "Good reason",
            "salary_to_band_ratio": 1.3,
            "competing_offer_documented": False,
            "role_level": "L5",
        }
        results = self.engine.evaluate("case_004", "HR_EXCEPTION_OFFER", facts)
        verdict = self.engine.overall_verdict(results)
        # WARN, not DENY (no hard block triggered)
        self.assertNotEqual(verdict, "DENY")

    def test_no_policy_for_unknown_workflow_returns_warn(self) -> None:
        results = self.engine.evaluate("case_005", "UNKNOWN_WORKFLOW", {})
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].result, "WARN")


class AuthorityMatrixTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = AuthorityMatrixService(Path("authority"))

    def test_high_risk_requires_three_roles(self) -> None:
        resolution = self.service.resolve("HR_EXCEPTION_OFFER", "HIGH", "manager@company.com")
        self.assertIn("VP_ENGINEERING", resolution.required_roles)
        self.assertIn("HR_DIRECTOR", resolution.required_roles)
        self.assertIn("FINANCE_VP", resolution.required_roles)

    def test_self_approval_blocked(self) -> None:
        resolution = self.service.resolve("HR_EXCEPTION_OFFER", "HIGH", "manager@company.com")
        sufficient, unmet = self.service.check_approvals_sufficient(
            resolution,
            [{"approver": "manager@company.com", "role": "VP_ENGINEERING", "decision": "APPROVE"}],
            requester="manager@company.com",
        )
        self.assertFalse(sufficient)
        self.assertTrue(any("self_approval" in u for u in unmet))

    def test_all_roles_satisfied(self) -> None:
        resolution = self.service.resolve("HR_EXCEPTION_OFFER", "HIGH", "manager@company.com")
        approvals = [
            {"approver": "vp@company.com", "role": "VP_ENGINEERING", "decision": "APPROVE"},
            {"approver": "hr@company.com", "role": "HR_DIRECTOR", "decision": "APPROVE"},
            {"approver": "fin@company.com", "role": "FINANCE_VP", "decision": "APPROVE"},
        ]
        sufficient, unmet = self.service.check_approvals_sufficient(
            resolution, approvals, requester="manager@company.com"
        )
        self.assertTrue(sufficient)
        self.assertEqual(unmet, [])

    def test_empty_approvals_is_not_sufficient(self) -> None:
        resolution = self.service.resolve("HR_EXCEPTION_OFFER", "LOW", "manager@company.com")
        sufficient, unmet = self.service.check_approvals_sufficient(
            resolution, [], requester="manager@company.com"
        )
        self.assertFalse(sufficient)

    def test_unknown_case_type_returns_default(self) -> None:
        resolution = self.service.resolve("UNKNOWN_CASE", "HIGH", "manager@company.com")
        self.assertIn("SYSTEM_ADMIN", resolution.required_roles)


class CaseEnginePhase2Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.ce = CaseEngine()
        self.case, _ = self.ce.create_case(
            CaseCreateRequest(
                case_type="HR_EXCEPTION_OFFER",
                title="Test case",
                requester="manager@company.com",
                business_owner="vp@company.com",
                jurisdiction="US-CA",
                risk_level=RiskLevel.HIGH,
            ),
            actor="manager@company.com",
        )

    def test_policy_evaluation_writes_to_ledger(self) -> None:
        self.ce.add_fact(self.case.case_id, "business_justification", "Good reason", "manager", 1.0, "manager@company.com")
        self.ce.add_fact(self.case.case_id, "salary_to_band_ratio", 1.3, "comp_team", 1.0, "comp_team")
        results = self.ce.evaluate_policy(self.case.case_id)
        events = self.ce.list_case_events(self.case.case_id)
        self.assertTrue(any(e.event_type.value == "POLICY_EVALUATED" for e in events))
        self.assertGreater(len(results), 0)

    def test_authority_resolution_works(self) -> None:
        resolution = self.ce.resolve_authority(self.case.case_id)
        self.assertIn("VP_ENGINEERING", resolution.required_roles)

    def test_approval_submission_writes_to_ledger(self) -> None:
        self.ce.submit_approval(
            self.case.case_id, "vp@company.com", "VP_ENGINEERING", "HR_EXCEPTION_OFFER", "APPROVE"
        )
        events = self.ce.list_case_events(self.case.case_id)
        self.assertTrue(any(e.event_type.value == "APPROVAL_SUBMITTED" for e in events))


if __name__ == "__main__":
    unittest.main()
