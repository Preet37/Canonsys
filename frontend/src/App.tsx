import { useEffect, useState, useCallback } from 'react'
import type { CaseRecord } from './types'
import { api } from './api/client'
import { CaseList } from './components/CaseList'
import { CaseDetail } from './components/CaseDetail'
import { ScenariosPanel } from './components/ScenariosPanel'

export default function App() {
  const [cases, setCases] = useState<CaseRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [backendOk, setBackendOk] = useState<boolean | null>(null)
  const [showScenarios, setShowScenarios] = useState(false)

  const fetchCases = useCallback(async () => {
    try {
      const data = await api.cases.list()
      setCases(data)
    } catch {
      // silently fail; backend may not be ready
    }
  }, [])

  useEffect(() => {
    api.health()
      .then(() => { setBackendOk(true); fetchCases() })
      .catch(() => setBackendOk(false))
  }, [fetchCases])

  if (backendOk === false) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-canvas">
        <div className="text-danger text-4xl">✕</div>
        <h1 className="text-primary font-mono text-lg font-bold">Backend Unreachable</h1>
        <p className="text-subtle font-mono text-sm">
          Start the backend: <code className="text-accent bg-surface px-2 py-0.5 rounded">uvicorn app.main:app --reload --port 8000</code>
        </p>
        <button
          onClick={() => { setBackendOk(null); api.health().then(() => { setBackendOk(true); fetchCases() }).catch(() => setBackendOk(false)) }}
          className="mt-2 px-4 py-2 text-xs font-mono bg-accent/20 hover:bg-accent/30 text-accent border border-accent/40 rounded transition-colors"
        >
          ↻ Retry
        </button>
      </div>
    )
  }

  if (backendOk === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-canvas">
        <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-canvas overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-full bg-danger/70" />
            <div className="w-3 h-3 rounded-full bg-warn/70" />
            <div className="w-3 h-3 rounded-full bg-success/70" />
          </div>
          <h1 className="text-sm font-mono font-bold text-primary">
            CanonSys <span className="text-muted font-normal">/ Decision Governance Console</span>
          </h1>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-success">● backend connected</span>
          <span className="text-muted">{cases.length} case{cases.length !== 1 ? 's' : ''}</span>
          <button
            onClick={() => setShowScenarios(true)}
            className="px-3 py-1 text-xs font-mono bg-accent/20 hover:bg-accent/30 text-accent border border-accent/40 rounded transition-colors flex items-center gap-1.5"
          >
            ▶ Run Scenarios
          </button>
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noreferrer"
            className="text-subtle hover:text-accent transition-colors"
          >
            API docs ↗
          </a>
        </div>
      </div>

      {showScenarios && (
        <ScenariosPanel
          onClose={() => setShowScenarios(false)}
          onCaseCreated={(id) => { setSelectedId(id); fetchCases() }}
        />
      )}

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-border bg-surface flex flex-col shrink-0">
          <CaseList
            cases={cases}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRefresh={fetchCases}
          />
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-hidden">
          {selectedId ? (
            <CaseDetail caseId={selectedId} onRefreshList={fetchCases} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-4">
              <div className="text-6xl text-muted/20">⚖</div>
              <h2 className="text-primary font-mono font-bold">CanonSys</h2>
              <p className="text-subtle font-mono text-sm text-center max-w-sm">
                Agents propose. System certifies. Denied by default.
                <br />
                Select a case or create one to begin.
              </p>
              <div className="grid grid-cols-3 gap-3 mt-4 text-xs font-mono text-muted text-center max-w-md">
                <div className="bg-card border border-border rounded p-3">
                  <div className="text-success text-lg mb-1">⊘</div>
                  Fail-Closed
                </div>
                <div className="bg-card border border-border rounded p-3">
                  <div className="text-accent text-lg mb-1">✓</div>
                  Authority Explicit
                </div>
                <div className="bg-card border border-border rounded p-3">
                  <div className="text-warn text-lg mb-1">◈</div>
                  Evidence Immutable
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
