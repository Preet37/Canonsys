"""
SQLite persistence layer for CanonSys.

Uses a JSON-blob storage strategy: each entity is stored as a JSON string
so it maps 1-to-1 with the Pydantic models with no field mapping complexity.
Relational columns for the entities that need server-side filtering (cases).
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "canonsys.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    conn = get_connection()
    with conn:
        conn.executescript("""
            -- Cases: relational columns for filtering, full data as JSON
            CREATE TABLE IF NOT EXISTS cases (
                case_id    TEXT PRIMARY KEY,
                status     TEXT NOT NULL,
                risk_level TEXT NOT NULL,
                case_type  TEXT NOT NULL,
                requester  TEXT NOT NULL,
                created_at TEXT NOT NULL,
                data       TEXT NOT NULL
            );

            -- Everything else: case_id + entity_id + JSON blob
            CREATE TABLE IF NOT EXISTS facts (
                fact_id  TEXT PRIMARY KEY,
                case_id  TEXT NOT NULL,
                sealed   INTEGER NOT NULL DEFAULT 0,
                data     TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS events (
                event_id   TEXT PRIMARY KEY,
                case_id    TEXT NOT NULL,
                timestamp  TEXT NOT NULL,
                data       TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS proposals (
                proposal_id TEXT PRIMARY KEY,
                case_id     TEXT NOT NULL,
                data        TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS policy_results (
                result_id TEXT PRIMARY KEY,
                case_id   TEXT NOT NULL,
                data      TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS approvals (
                approval_id TEXT PRIMARY KEY,
                case_id     TEXT NOT NULL,
                data        TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS release_plans (
                plan_id TEXT PRIMARY KEY,
                case_id TEXT NOT NULL,
                data    TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS release_tokens (
                token_id TEXT PRIMARY KEY,
                case_id  TEXT NOT NULL,
                used     INTEGER NOT NULL DEFAULT 0,
                data     TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS executions (
                execution_id TEXT PRIMARY KEY,
                case_id      TEXT NOT NULL,
                data         TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_facts_case    ON facts(case_id);
            CREATE INDEX IF NOT EXISTS idx_events_case   ON events(case_id);
            CREATE INDEX IF NOT EXISTS idx_events_ts     ON events(case_id, timestamp);
            CREATE INDEX IF NOT EXISTS idx_proposals_case ON proposals(case_id);
            CREATE INDEX IF NOT EXISTS idx_policy_case   ON policy_results(case_id);
            CREATE INDEX IF NOT EXISTS idx_approvals_case ON approvals(case_id);
            CREATE INDEX IF NOT EXISTS idx_cases_status  ON cases(status);
            CREATE INDEX IF NOT EXISTS idx_cases_risk    ON cases(risk_level);
        """)
    conn.close()
