from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from .models import ArtifactRecord, FactRecord, ProposalRecord, utc_now


def _stable(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True, default=str)


@dataclass
class EvidencePacket:
    case_id: str
    facts: list[FactRecord]
    artifacts: list[ArtifactRecord]
    proposals: list[ProposalRecord]
    packet_checksum: str
    assembled_at: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "case_id": self.case_id,
            "facts": [f.model_dump() for f in self.facts],
            "artifacts": [a.model_dump() for a in self.artifacts],
            "proposals": [p.model_dump() for p in self.proposals],
            "packet_checksum": self.packet_checksum,
            "assembled_at": self.assembled_at,
            "fact_count": len(self.facts),
            "artifact_count": len(self.artifacts),
            "proposal_count": len(self.proposals),
        }


class EvidenceBuilder:
    """Assembles and checksums immutable decision packets."""

    def assemble(
        self,
        case_id: str,
        facts: list[FactRecord],
        artifacts: list[ArtifactRecord],
        proposals: list[ProposalRecord],
    ) -> EvidencePacket:
        content = {
            "case_id": case_id,
            "facts": [f.model_dump() for f in facts],
            "artifacts": [a.model_dump() for a in artifacts],
            "proposals": [p.model_dump() for p in proposals],
        }
        checksum = hashlib.sha256(_stable(content).encode()).hexdigest()
        return EvidencePacket(
            case_id=case_id,
            facts=list(facts),
            artifacts=list(artifacts),
            proposals=list(proposals),
            packet_checksum=checksum,
            assembled_at=utc_now().isoformat(),
        )
