# CanonSys (Phase 1 Baseline)

This repository starts CanonSys as specified in the architect brief:

- Agents propose; system certifies; denied by default
- Fail-closed transitions
- Authority explicit (placeholder in Phase 1)
- Evidence immutable with supersession support

## What is implemented

Phase 1 deliverables:

1. Canonical core schemas (`Case`, `Event`, and supporting entities)
2. Strict 15-state case lifecycle machine
3. Append-only event ledger with per-case SHA-256 hash chaining
4. Manual transition API for walkthrough demos

## Project structure

```text
app/
  main.py          # FastAPI app and endpoints
  models.py        # Canonical data models
  state_machine.py # Transition rules
  ledger.py        # Hash-chained append-only events
  store.py         # In-memory case engine for Phase 1
```

## Run locally

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Phase 1 demo flow

1. Create a case with `POST /cases`
2. Transition through lifecycle stages with `POST /cases/{case_id}/transitions`
3. Inspect immutable ledger chain with `GET /cases/{case_id}/events`

## Next steps

- Phase 2: deterministic policy engine + authority matrix resolver
- Phase 3: advisory proposal layer + evidence packet assembly
- Phase 4: release compiler + scoped release tokens + fail-closed gate
- Phase 5: reviewer/admin UI + first execution connector (PDF generator)
