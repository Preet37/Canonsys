import unittest

from app.evidence import EvidenceBuilder
from app.models import (
    ArtifactRecord,
    CaseCreateRequest,
    FactRecord,
    ProposalRecord,
    RiskLevel,
    utc_now,
)
from app.proposal import ProposalLayer
from app.store import CaseEngine


class EvidenceBuilderTests(unittest.TestCase):
    def _make_fact(self, key: str, value: object) -> FactRecord:
        return FactRecord(
            fact_id=f"fact_{key}",
            case_id="case_001",
            key=key,
            value=value,
            source="test",
            confidence=1.0,
        )

    def test_assembles_packet_with_checksum(self) -> None:
        builder = EvidenceBuilder()
        facts = [self._make_fact("salary", 300000), self._make_fact("role", "L6")]
        packet = builder.assemble("case_001", facts, [], [])
        self.assertIsNotNone(packet.packet_checksum)
        self.assertEqual(len(packet.packet_checksum), 64)
        self.assertEqual(packet.fact_count if hasattr(packet, "fact_count") else len(packet.facts), 2)

    def test_same_input_same_checksum(self) -> None:
        builder = EvidenceBuilder()
        facts = [self._make_fact("key", "value")]
        p1 = builder.assemble("case_001", facts, [], [])
        p2 = builder.assemble("case_001", facts, [], [])
        self.assertEqual(p1.packet_checksum, p2.packet_checksum)

    def test_different_facts_different_checksum(self) -> None:
        builder = EvidenceBuilder()
        p1 = builder.assemble("case_001", [self._make_fact("a", 1)], [], [])
        p2 = builder.assemble("case_001", [self._make_fact("a", 2)], [], [])
        self.assertNotEqual(p1.packet_checksum, p2.packet_checksum)


class ProposalLayerTests(unittest.TestCase):
    def test_mock_mode_returns_proposal(self) -> None:
        layer = ProposalLayer()
        proposal = layer.generate(
            case_id="case_001",
            case_type="HR_EXCEPTION_OFFER",
            facts={"salary": 300000, "role": "L6"},
            prompt_version="v1.0",
        )
        self.assertEqual(proposal.case_id, "case_001")
        self.assertIn("ADVISORY ONLY", proposal.caveats[-1].upper())
        self.assertIsNotNone(proposal.summary)
        self.assertIsNotNone(proposal.recommendation)

    def test_model_used_is_mock_when_no_api_key(self) -> None:
        layer = ProposalLayer()
        proposal = layer.generate("case_001", "HR_EXCEPTION_OFFER", {})
        self.assertEqual(proposal.model_used, "MOCK_MODE")


class CaseEnginePhase3Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.ce = CaseEngine()
        self.case, _ = self.ce.create_case(
            CaseCreateRequest(
                case_type="HR_EXCEPTION_OFFER",
                title="Phase 3 test",
                requester="req@company.com",
                business_owner="owner@company.com",
                jurisdiction="US-CA",
                risk_level=RiskLevel.MEDIUM,
            ),
            actor="req@company.com",
        )

    def test_add_and_retrieve_facts(self) -> None:
        self.ce.add_fact(self.case.case_id, "salary", 300000, "recruiter", 0.9, "recruiter")
        facts = self.ce.list_facts(self.case.case_id)
        self.assertEqual(len(facts), 1)
        self.assertEqual(facts[0].key, "salary")
        self.assertEqual(facts[0].value, 300000)

    def test_verify_fact(self) -> None:
        self.ce.add_fact(self.case.case_id, "salary", 300000, "recruiter", 0.9, "recruiter")
        fact = self.ce.list_facts(self.case.case_id)[0]
        self.assertFalse(fact.verified_flag)
        verified = self.ce.verify_fact(self.case.case_id, fact.fact_id, "hr_reviewer")
        self.assertTrue(verified.verified_flag)
        self.assertEqual(verified.verified_by, "hr_reviewer")

    def test_generate_proposal_writes_ledger(self) -> None:
        self.ce.add_fact(self.case.case_id, "role", "L5", "recruiter", 1.0, "recruiter")
        proposal = self.ce.generate_proposal(self.case.case_id)
        events = self.ce.list_case_events(self.case.case_id)
        self.assertTrue(any(e.event_type.value == "PROPOSAL_GENERATED" for e in events))
        self.assertIn("ADVISORY ONLY", proposal.caveats[-1].upper())

    def test_assemble_evidence(self) -> None:
        self.ce.add_fact(self.case.case_id, "salary", 300000, "recruiter", 1.0, "recruiter")
        self.ce.generate_proposal(self.case.case_id)
        packet = self.ce.assemble_evidence(self.case.case_id)
        self.assertEqual(len(packet.facts), 1)
        self.assertEqual(len(packet.proposals), 1)
        self.assertIsNotNone(packet.packet_checksum)
        events = self.ce.list_case_events(self.case.case_id)
        self.assertTrue(any(e.event_type.value == "EVIDENCE_ASSEMBLED" for e in events))


if __name__ == "__main__":
    unittest.main()
