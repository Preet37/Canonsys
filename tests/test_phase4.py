import unittest
from datetime import timedelta

from app.models import CaseCreateRequest, CaseState, RiskLevel, TransitionRequest
from app.release_compiler import ReleaseCompiler
from app.store import CaseEngine, GovernanceError


def _make_high_risk_approved_case(ce: CaseEngine):
    """Helper: create a case with facts, policy eval, approvals, and APPROVED state."""
    case, _ = ce.create_case(
        CaseCreateRequest(
            case_type="HR_EXCEPTION_OFFER",
            title="Full pipeline test",
            requester="manager@company.com",
            business_owner="vp@company.com",
            jurisdiction="US-CA",
            risk_level=RiskLevel.HIGH,
        ),
        actor="manager@company.com",
    )
    cid = case.case_id

    # Add passing facts
    ce.add_fact(cid, "business_justification", "Strong case", "manager", 1.0, "manager")
    ce.add_fact(cid, "salary_to_band_ratio", 1.4, "comp_team", 1.0, "comp_team")
    ce.add_fact(cid, "competing_offer_documented", True, "recruiter", 1.0, "recruiter")
    ce.add_fact(cid, "role_level", "L6", "manager", 1.0, "manager")

    # Move to APPROVED via transitions
    for target in [
        CaseState.SUBMITTED,
        CaseState.INTAKE_VALIDATED,
        CaseState.FACT_REVIEW,
        CaseState.PROPOSAL_READY,
        CaseState.POLICY_REVIEW,
        CaseState.HUMAN_REVIEW,
        CaseState.APPROVAL_PENDING,
        CaseState.APPROVED,
    ]:
        ce.transition_case(cid, TransitionRequest(target_state=target, actor="operator"))

    # Evaluate policy
    ce.evaluate_policy(cid)

    # Submit all required approvals for HIGH risk (VP_ENGINEERING, HR_DIRECTOR, FINANCE_VP)
    ce.submit_approval(cid, "vp@company.com", "VP_ENGINEERING", "HR_EXCEPTION_OFFER", "APPROVE")
    ce.submit_approval(cid, "hr@company.com", "HR_DIRECTOR", "HR_EXCEPTION_OFFER", "APPROVE")
    ce.submit_approval(cid, "fin@company.com", "FINANCE_VP", "HR_EXCEPTION_OFFER", "APPROVE")

    return case


class ReleaseCompilerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.ce = CaseEngine()

    def test_full_happy_path_compiles_release(self) -> None:
        case = _make_high_risk_approved_case(self.ce)
        result = self.ce.compile_release(case.case_id, "GENERATE_OFFER_LETTER", "release_compiler")
        self.assertTrue(result.allowed)
        self.assertIsNotNone(result.release_plan)
        self.assertIsNotNone(result.release_token)
        self.assertEqual(result.denial_reasons, [])

    def test_fail_closed_case_not_approved(self) -> None:
        """Compiler must deny when case is not in APPROVED state."""
        case, _ = self.ce.create_case(
            CaseCreateRequest(
                case_type="HR_EXCEPTION_OFFER",
                title="Not approved",
                requester="m@c.com",
                business_owner="o@c.com",
                jurisdiction="US-CA",
                risk_level=RiskLevel.LOW,
            ),
            actor="m@c.com",
        )
        result = self.ce.compile_release(case.case_id, "GENERATE_OFFER_LETTER", "compiler")
        self.assertFalse(result.allowed)
        self.assertTrue(any("case_not_approved" in r for r in result.denial_reasons))

    def test_fail_closed_policy_not_evaluated(self) -> None:
        """Compiler must deny when policy has not been evaluated."""
        case = _make_high_risk_approved_case(self.ce)
        # Reset policy results
        self.ce._policy_results[case.case_id] = []
        result = self.ce.compile_release(case.case_id, "GENERATE_OFFER_LETTER", "compiler")
        self.assertFalse(result.allowed)
        self.assertTrue(any("policy_not_evaluated" in r for r in result.denial_reasons))

    def test_fail_closed_hard_deny_policy(self) -> None:
        """Compiler must deny when any policy rule returned DENY."""
        from app.models import PolicyResultRecord, utc_now
        case = _make_high_risk_approved_case(self.ce)
        # Inject a DENY policy result
        self.ce._policy_results[case.case_id].append(
            PolicyResultRecord(
                policy_result_id="pres_injected",
                case_id=case.case_id,
                policy_id="hr_exc_001",
                policy_version="1.0.0",
                result="DENY",
                rationale="Salary exceeds 2x band maximum",
                evaluated_at=utc_now(),
            )
        )
        result = self.ce.compile_release(case.case_id, "GENERATE_OFFER_LETTER", "compiler")
        self.assertFalse(result.allowed)
        self.assertTrue(any("policy_hard_block" in r for r in result.denial_reasons))

    def test_fail_closed_missing_approval(self) -> None:
        """Compiler must deny when required approvals are incomplete."""
        case = _make_high_risk_approved_case(self.ce)
        # Remove FINANCE_VP approval
        self.ce._approvals[case.case_id] = [
            a for a in self.ce._approvals[case.case_id] if a.role != "FINANCE_VP"
        ]
        result = self.ce.compile_release(case.case_id, "GENERATE_OFFER_LETTER", "compiler")
        self.assertFalse(result.allowed)
        self.assertTrue(any("FINANCE_VP" in r for r in result.denial_reasons))

    def test_release_token_signature_validates(self) -> None:
        case = _make_high_risk_approved_case(self.ce)
        result = self.ce.compile_release(case.case_id, "GENERATE_OFFER_LETTER", "compiler")
        self.assertTrue(result.allowed)
        valid, reason = self.ce._release_compiler.validate_token(
            result.release_token, "GENERATE_OFFER_LETTER"
        )
        self.assertTrue(valid)
        self.assertEqual(reason, "token_valid")

    def test_token_scope_mismatch_rejected(self) -> None:
        case = _make_high_risk_approved_case(self.ce)
        result = self.ce.compile_release(case.case_id, "GENERATE_OFFER_LETTER", "compiler")
        valid, reason = self.ce._release_compiler.validate_token(
            result.release_token, "DIFFERENT_ACTION"
        )
        self.assertFalse(valid)
        self.assertIn("scope_mismatch", reason)

    def test_tampered_token_signature_rejected(self) -> None:
        case = _make_high_risk_approved_case(self.ce)
        result = self.ce.compile_release(case.case_id, "GENERATE_OFFER_LETTER", "compiler")
        # Tamper with the signature
        result.release_token.signature_metadata["sha256"] = "0" * 64
        valid, reason = self.ce._release_compiler.validate_token(
            result.release_token, "GENERATE_OFFER_LETTER"
        )
        self.assertFalse(valid)
        self.assertIn("signature_invalid", reason)

    def test_expired_token_rejected(self) -> None:
        from app.models import utc_now
        case = _make_high_risk_approved_case(self.ce)
        result = self.ce.compile_release(case.case_id, "GENERATE_OFFER_LETTER", "compiler")
        # Back-date the expiry
        result.release_token.expires_at = utc_now() - timedelta(hours=1)
        valid, reason = self.ce._release_compiler.validate_token(
            result.release_token, "GENERATE_OFFER_LETTER"
        )
        self.assertFalse(valid)
        self.assertIn("expired", reason)

    def test_execute_requires_valid_token(self) -> None:
        case = _make_high_risk_approved_case(self.ce)
        with self.assertRaises(GovernanceError):
            self.ce.execute(case.case_id, "nonexistent_token", "actor")

    def test_execute_success_with_valid_token(self) -> None:
        case = _make_high_risk_approved_case(self.ce)
        result = self.ce.compile_release(case.case_id, "GENERATE_OFFER_LETTER", "compiler")
        self.assertTrue(result.allowed)
        outcome = self.ce.execute(case.case_id, result.release_token.token_id, "operator")
        self.assertTrue(outcome["success"])
        self.assertIsNotNone(outcome["artifact_uri"])
        events = self.ce.list_case_events(case.case_id)
        self.assertTrue(any(e.event_type.value == "EXECUTED" for e in events))

    def test_full_hash_chain_integrity(self) -> None:
        case = _make_high_risk_approved_case(self.ce)
        events = self.ce.list_case_events(case.case_id)
        for i in range(1, len(events)):
            self.assertEqual(
                events[i].prev_hash,
                events[i - 1].event_hash,
                f"Chain broken between event {i - 1} and {i}",
            )


if __name__ == "__main__":
    unittest.main()
