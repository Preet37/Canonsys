"""
Persistent data access layer backed by SQLite.

All Pydantic models are serialized to JSON for storage and deserialized
on read. The store is a drop-in complement to CaseEngine -- CaseEngine
calls these functions to persist its in-memory state.
"""
from __future__ import annotations

import json
from typing import Any

from .database import get_connection


def _dumps(obj: Any) -> str:
    """Serialize a Pydantic model or plain dict to JSON."""
    if hasattr(obj, 'model_dump'):
        return json.dumps(obj.model_dump(mode='json'), default=str)
    return json.dumps(obj, default=str)


def _loads(s: str) -> dict:
    return json.loads(s)


# ── Cases ──────────────────────────────────────────────────────────────────────

def upsert_case(case) -> None:
    conn = get_connection()
    with conn:
        conn.execute("""
            INSERT INTO cases (case_id, status, risk_level, case_type, requester, created_at, data)
            VALUES (?,?,?,?,?,?,?)
            ON CONFLICT(case_id) DO UPDATE SET
                status=excluded.status,
                data=excluded.data
        """, (
            case.case_id,
            case.status.value if hasattr(case.status, 'value') else str(case.status),
            case.risk_level.value if hasattr(case.risk_level, 'value') else str(case.risk_level),
            case.case_type,
            case.requester,
            str(case.created_at),
            _dumps(case),
        ))
    conn.close()


def load_case_data(case_id: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT data FROM cases WHERE case_id=?", (case_id,)).fetchone()
    conn.close()
    return _loads(row['data']) if row else None


def load_all_case_data(
    status: str | None = None,
    risk_level: str | None = None,
    case_type: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[dict]:
    conditions, params = [], []
    if status:
        conditions.append("status=?"); params.append(status)
    if risk_level:
        conditions.append("risk_level=?"); params.append(risk_level)
    if case_type:
        conditions.append("case_type=?"); params.append(case_type)
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    params += [limit, offset]
    conn = get_connection()
    rows = conn.execute(
        f"SELECT data FROM cases {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        params
    ).fetchall()
    conn.close()
    return [_loads(r['data']) for r in rows]


# ── Facts ──────────────────────────────────────────────────────────────────────

def upsert_fact(fact) -> None:
    conn = get_connection()
    with conn:
        conn.execute("""
            INSERT INTO facts (fact_id, case_id, sealed, data)
            VALUES (?,?,?,?)
            ON CONFLICT(fact_id) DO UPDATE SET data=excluded.data, sealed=excluded.sealed
        """, (
            fact.fact_id, fact.case_id,
            1 if getattr(fact, 'sealed', False) else 0,
            _dumps(fact),
        ))
    conn.close()


def load_facts(case_id: str) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT data FROM facts WHERE case_id=? ORDER BY rowid", (case_id,)
    ).fetchall()
    conn.close()
    return [_loads(r['data']) for r in rows]


def seal_facts(case_id: str) -> None:
    """Lock facts at policy evaluation time — no new facts can alter the policy snapshot."""
    conn = get_connection()
    with conn:
        conn.execute("UPDATE facts SET sealed=1 WHERE case_id=?", (case_id,))
    conn.close()


def facts_are_sealed(case_id: str) -> bool:
    conn = get_connection()
    row = conn.execute(
        "SELECT COUNT(*) as c FROM facts WHERE case_id=? AND sealed=0", (case_id,)
    ).fetchone()
    conn.close()
    return row['c'] == 0


# ── Events ─────────────────────────────────────────────────────────────────────

def insert_event(event) -> None:
    conn = get_connection()
    with conn:
        conn.execute("""
            INSERT OR IGNORE INTO events (event_id, case_id, timestamp, data)
            VALUES (?,?,?,?)
        """, (event.event_id, event.case_id, event.timestamp, _dumps(event)))
    conn.close()


def load_events(case_id: str) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT data FROM events WHERE case_id=? ORDER BY timestamp, rowid", (case_id,)
    ).fetchall()
    conn.close()
    return [_loads(r['data']) for r in rows]


# ── Proposals ──────────────────────────────────────────────────────────────────

def insert_proposal(proposal) -> None:
    conn = get_connection()
    with conn:
        conn.execute("""
            INSERT OR IGNORE INTO proposals (proposal_id, case_id, data)
            VALUES (?,?,?)
        """, (proposal.proposal_id, proposal.case_id, _dumps(proposal)))
    conn.close()


def load_proposals(case_id: str) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT data FROM proposals WHERE case_id=? ORDER BY rowid", (case_id,)
    ).fetchall()
    conn.close()
    return [_loads(r['data']) for r in rows]


# ── Policy Results ─────────────────────────────────────────────────────────────

def insert_policy_result(result) -> None:
    conn = get_connection()
    rid = getattr(result, 'policy_result_id', getattr(result, 'result_id', result.case_id + '_pol'))
    with conn:
        conn.execute("""
            INSERT OR IGNORE INTO policy_results (result_id, case_id, data)
            VALUES (?,?,?)
        """, (rid, result.case_id, _dumps(result)))
    conn.close()


def insert_policy_results(results: list, case_id: str) -> None:
    conn = get_connection()
    with conn:
        conn.execute("DELETE FROM policy_results WHERE case_id=?", (case_id,))
        for i, r in enumerate(results):
            rid = getattr(r, 'policy_result_id', getattr(r, 'result_id', f"{case_id}_pol_{i}"))
            conn.execute("""
                INSERT OR IGNORE INTO policy_results (result_id, case_id, data)
                VALUES (?,?,?)
            """, (rid, case_id, _dumps(r)))
    conn.close()


def load_policy_results(case_id: str) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT data FROM policy_results WHERE case_id=? ORDER BY rowid", (case_id,)
    ).fetchall()
    conn.close()
    return [_loads(r['data']) for r in rows]


# ── Approvals ──────────────────────────────────────────────────────────────────

def insert_approval(approval) -> None:
    conn = get_connection()
    with conn:
        conn.execute("""
            INSERT OR IGNORE INTO approvals (approval_id, case_id, data)
            VALUES (?,?,?)
        """, (approval.approval_id, approval.case_id, _dumps(approval)))
    conn.close()


def load_approvals(case_id: str) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT data FROM approvals WHERE case_id=? ORDER BY rowid", (case_id,)
    ).fetchall()
    conn.close()
    return [_loads(r['data']) for r in rows]


# ── Release Plans & Tokens ─────────────────────────────────────────────────────

def upsert_release_plan(plan) -> None:
    conn = get_connection()
    with conn:
        conn.execute("""
            INSERT INTO release_plans (plan_id, case_id, data)
            VALUES (?,?,?)
            ON CONFLICT(plan_id) DO UPDATE SET data=excluded.data
        """, (plan.release_plan_id, plan.case_id, _dumps(plan)))
    conn.close()


def load_release_plan(case_id: str) -> dict | None:
    conn = get_connection()
    row = conn.execute(
        "SELECT data FROM release_plans WHERE case_id=? ORDER BY rowid DESC LIMIT 1",
        (case_id,)
    ).fetchone()
    conn.close()
    return _loads(row['data']) if row else None


def upsert_release_token(token, case_id: str = '') -> None:
    conn = get_connection()
    cid = case_id or getattr(token, 'case_id', '')
    with conn:
        conn.execute("""
            INSERT INTO release_tokens (token_id, case_id, used, data)
            VALUES (?,?,?,?)
            ON CONFLICT(token_id) DO UPDATE SET used=excluded.used, data=excluded.data
        """, (token.token_id, cid, 1 if getattr(token, 'used', False) else 0, _dumps(token)))
    conn.close()


def load_release_token(case_id: str) -> dict | None:
    conn = get_connection()
    row = conn.execute(
        "SELECT data FROM release_tokens WHERE case_id=? AND used=0 ORDER BY rowid DESC LIMIT 1",
        (case_id,)
    ).fetchone()
    conn.close()
    return _loads(row['data']) if row else None


def mark_token_used(token_id: str) -> None:
    """One-time-use enforcement — prevents replay attacks."""
    conn = get_connection()
    with conn:
        conn.execute("UPDATE release_tokens SET used=1 WHERE token_id=?", (token_id,))
    conn.close()


def is_token_used(token_id: str) -> bool:
    conn = get_connection()
    row = conn.execute(
        "SELECT used FROM release_tokens WHERE token_id=?", (token_id,)
    ).fetchone()
    conn.close()
    return bool(row['used']) if row else True


# ── Executions ─────────────────────────────────────────────────────────────────

def insert_execution(execution) -> None:
    conn = get_connection()
    eid = getattr(execution, 'execution_id', getattr(execution, 'case_id', 'exec') + '_exec')
    cid = getattr(execution, 'case_id', '')
    with conn:
        conn.execute("""
            INSERT OR IGNORE INTO executions (execution_id, case_id, data)
            VALUES (?,?,?)
        """, (eid, cid, _dumps(execution)))
    conn.close()


def save_execution_dict(case_id: str, execution_id: str, data: dict) -> None:
    conn = get_connection()
    with conn:
        conn.execute("""
            INSERT OR REPLACE INTO executions (execution_id, case_id, data)
            VALUES (?,?,?)
        """, (execution_id, case_id, json.dumps({**data, 'case_id': case_id, 'execution_id': execution_id}, default=str)))
    conn.close()


def load_execution(case_id: str) -> dict | None:
    conn = get_connection()
    row = conn.execute(
        "SELECT data FROM executions WHERE case_id=? ORDER BY rowid DESC LIMIT 1",
        (case_id,)
    ).fetchone()
    conn.close()
    return _loads(row['data']) if row else None
