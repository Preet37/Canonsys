from __future__ import annotations

import json
import operator as op_module
from pathlib import Path
from typing import Any

from .models import PolicyResultRecord, new_id, utc_now

_OPS: dict[str, Any] = {
    "eq": op_module.eq,
    "ne": op_module.ne,
    "gt": op_module.gt,
    "gte": op_module.ge,
    "lt": op_module.lt,
    "lte": op_module.le,
}


def _evaluate(fact_value: Any, operator: str, threshold: Any) -> bool:
    if operator in _OPS:
        try:
            return _OPS[operator](fact_value, threshold)
        except TypeError:
            return False
    if operator == "in":
        return fact_value in (threshold or [])
    if operator == "not_in":
        return fact_value not in (threshold or [])
    if operator == "contains":
        return str(threshold) in str(fact_value or "")
    if operator == "not_contains":
        return str(threshold) not in str(fact_value or "")
    if operator == "exists":
        return fact_value is not None
    if operator == "not_exists":
        return fact_value is None
    raise ValueError(f"unknown_operator:{operator}")


class DeterministicPolicyEngine:
    """Evaluates JSON-defined rules with zero LLM inference."""

    def __init__(self, policies_dir: Path) -> None:
        self._policies: dict[str, dict] = {}
        self._load(policies_dir)

    def _load(self, policies_dir: Path) -> None:
        if not policies_dir.exists():
            return
        for path in sorted(policies_dir.glob("*.json")):
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            self._policies[data["policy_id"]] = data

    def get_policy_for_workflow(self, workflow_scope: str) -> dict | None:
        return next(
            (p for p in self._policies.values() if p["workflow_scope"] == workflow_scope),
            None,
        )

    def evaluate(
        self,
        case_id: str,
        workflow_scope: str,
        facts: dict[str, Any],
    ) -> list[PolicyResultRecord]:
        policy = self.get_policy_for_workflow(workflow_scope)
        if policy is None:
            return [
                PolicyResultRecord(
                    policy_result_id=new_id("pres"),
                    case_id=case_id,
                    policy_id="NO_POLICY",
                    policy_version="0",
                    result="WARN",
                    rationale=f"No policy defined for workflow: {workflow_scope}",
                    evaluated_at=utc_now(),
                )
            ]

        results: list[PolicyResultRecord] = []
        for rule in policy.get("rules", []):
            fact_value = facts.get(rule["fact_key"])
            try:
                passed = _evaluate(fact_value, rule["operator"], rule.get("threshold"))
            except Exception:
                passed = False

            result = rule.get("on_pass", "PASS") if passed else rule.get("on_fail", "WARN")
            rationale = rule["rationale_pass"] if passed else rule["rationale_fail"]

            results.append(
                PolicyResultRecord(
                    policy_result_id=new_id("pres"),
                    case_id=case_id,
                    policy_id=policy["policy_id"],
                    policy_version=policy["version"],
                    result=result,
                    rationale=rationale,
                    evaluated_at=utc_now(),
                )
            )
        return results

    def overall_verdict(self, results: list[PolicyResultRecord]) -> str:
        if any(r.result == "DENY" for r in results):
            return "DENY"
        if any(r.result == "WARN" for r in results):
            return "WARN"
        return "PASS"
