from __future__ import annotations

import hashlib
import json
import os
from typing import Any

from .models import ProposalRecord, new_id, utc_now

try:
    from groq import Groq
    _GROQ_OK = True
except ImportError:
    _GROQ_OK = False

_MOCK_CONTENT = {
    "summary": (
        "Advisory analysis generated in mock mode. "
        "Connect GROQ_API_KEY to enable live LLM analysis."
    ),
    "options": [
        "Approve at 90% of candidate's ask — aligns with P75 market data",
        "Counter at 80% — within current comp band, lower precedent risk",
        "Defer until Q3 budget cycle with written commitment to re-engage",
    ],
    "recommendation": (
        "Option 1: Approve at 90% of ask. Candidate holds a competing offer "
        "from a direct competitor. Market data (P75) supports the request. "
        "Risk of loss outweighs salary exception cost over 24-month horizon."
    ),
    "caveats": [
        "Market data confidence: MEDIUM — limited sample for this geography/level combination",
        "Competing offer not independently verified — documentation required",
        "All figures subject to current HRIS compensation band confirmation",
    ],
}


class ProposalLayer:
    """Advisory-only AI proposal generation. Has zero write access to any system of record."""

    def __init__(self) -> None:
        self._client = None
        if _GROQ_OK and os.getenv("GROQ_API_KEY"):
            self._client = Groq(api_key=os.getenv("GROQ_API_KEY"))

    def generate(
        self,
        case_id: str,
        case_type: str,
        facts: dict[str, Any],
        prompt_version: str = "v1.0",
        model: str = "llama-3.3-70b-versatile",
        additional_context: str | None = None,
    ) -> ProposalRecord:
        content = self._call_llm(case_type, facts, model, additional_context) if self._client else _MOCK_CONTENT.copy()

        return ProposalRecord(
            proposal_id=new_id("prop"),
            case_id=case_id,
            model_used=model if self._client else "MOCK_MODE",
            prompt_version=prompt_version,
            summary=content["summary"],
            options=content.get("options", []),
            recommendation=content["recommendation"],
            caveats=content.get("caveats", []) + [
                "[ADVISORY ONLY — zero execution authority; human approval required]"
            ],
            created_at=utc_now(),
        )

    def _call_llm(
        self,
        case_type: str,
        facts: dict[str, Any],
        model: str,
        additional_context: str | None,
    ) -> dict[str, Any]:
        assert self._client is not None
        system = (
            "You are a strictly advisory enterprise governance analyst. "
            "You generate NON-BINDING analysis only. You have zero execution authority. "
            "Always respond with valid JSON containing exactly these keys: "
            "summary (string), options (list of strings), recommendation (string), caveats (list of strings). "
            "Every response must include a caveat that it is advisory only and requires explicit human approval."
        )
        user = (
            f"Case type: {case_type}\n"
            f"Facts: {json.dumps(facts, default=str)}\n"
        )
        if additional_context:
            user += f"Additional context: {additional_context}\n"
        user += "Produce advisory analysis as JSON."

        response = self._client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
