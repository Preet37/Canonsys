from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from typing import Any

from .models import EventRecord, EventType, new_id, utc_now


def _stable_json(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True, default=str)


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class HashChainedLedger:
    """Append-only event ledger with per-case hash chaining."""

    def __init__(self) -> None:
        self._events_by_case: dict[str, list[EventRecord]] = defaultdict(list)

    def append_event(
        self,
        *,
        case_id: str,
        actor: str,
        event_type: EventType,
        payload: dict[str, Any],
        supersedes_event_id: str | None = None,
    ) -> EventRecord:
        events = self._events_by_case[case_id]
        prev_hash = events[-1].event_hash if events else None
        payload_ref = _sha256(_stable_json(payload))
        timestamp = utc_now()
        event_id = new_id("evt")

        hashed_material = _stable_json(
            {
                "event_id": event_id,
                "case_id": case_id,
                "actor": actor,
                "event_type": event_type.value,
                "payload_ref": payload_ref,
                "timestamp": timestamp.isoformat(),
                "supersedes_event_id": supersedes_event_id,
                "prev_hash": prev_hash,
            }
        )
        event_hash = _sha256(hashed_material)

        event = EventRecord(
            event_id=event_id,
            case_id=case_id,
            actor=actor,
            event_type=event_type,
            payload_ref=payload_ref,
            timestamp=timestamp,
            supersedes_event_id=supersedes_event_id,
            prev_hash=prev_hash,
            event_hash=event_hash,
        )
        events.append(event)
        return event

    def list_events(self, case_id: str) -> list[EventRecord]:
        return list(self._events_by_case[case_id])
