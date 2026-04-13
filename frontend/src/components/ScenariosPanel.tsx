import { useState } from 'react'
import type { Step, ScenarioResult } from '../scenarios/runner'
import {
  runHappyHighRisk,
  runDenySalaryTooHigh,
  runDenyMissingApproval,
  runHappyLowRisk,
  runSelfApprovalBlocked,
} from '../scenarios/runner'

const SCENARIOS = [
  {
    id: 'happy_high',
    name: 'Happy Path — HIGH Risk',
    tag: 'PASS',
    tagColor: 'text-success border-success/40 bg-success/10',
    description:
      'Full pipeline: 4 facts pass policy, 3 required approvals (VP_ENGINEERING + HR_DIRECTOR + FINANCE_VP), release compiled, PDF offer letter generated.',
    fn: runHappyHighRisk,
  },
  {
    id: 'happy_low',
    name: 'Happy Path — LOW Risk',
    tag: 'PASS',
    tagColor: 'text-success border-success/40 bg-success/10',
    description:
      'LOW risk path only needs HR_MANAGER approval. Faster pipeline, same governance guarantees.',
    fn: runHappyLowRisk,
  },
  {
    id: 'deny_salary',
    name: 'DENY — Salary Exceeds 2× Band',
    tag: 'BLOCKED',
    tagColor: 'text-danger border-danger/40 bg-danger/10',
    description:
      'salary_to_band_ratio = 2.5 triggers a hard policy DENY. Even with all approvals present, the release compiler blocks execution.',
    fn: runDenySalaryTooHigh,
  },
  {
    id: 'deny_approvals',
    name: 'DENY — Missing FINANCE_VP Approval',
    tag: 'BLOCKED',
    tagColor: 'text-danger border-danger/40 bg-danger/10',
    description:
      'Policy passes but only 2 of 3 required approvals are submitted. Release compiler explicitly lists the missing role and denies.',
    fn: runDenyMissingApproval,
  },
  {
    id: 'deny_self',
    name: 'DENY — Self-Approval Violation',
    tag: 'BLOCKED',
    tagColor: 'text-danger border-danger/40 bg-danger/10',
    description:
      'The requester tries to approve their own case as VP_ENGINEERING. Separation-of-duties enforcement blocks the release gate.',
    fn: runSelfApprovalBlocked,
  },
]

const STEP_ICON: Record<Step['status'], string> = {
  pending: '○',
  running: '◌',
  done: '✓',
  failed: '✕',
  skipped: '—',
}

const STEP_COLOR: Record<Step['status'], string> = {
  pending: 'text-muted',
  running: 'text-accent animate-pulse',
  done: 'text-success',
  failed: 'text-danger',
  skipped: 'text-muted',
}

interface RunState {
  scenarioId: string
  steps: Step[]
  result: ScenarioResult | null
  running: boolean
}

export function ScenariosPanel({
  onClose,
  onCaseCreated,
}: {
  onClose: () => void
  onCaseCreated: (caseId: string) => void
}) {
  const [runState, setRunState] = useState<RunState | null>(null)
  const [history, setHistory] = useState<ScenarioResult[]>([])

  async function runScenario(id: string, fn: (update: (steps: Step[]) => void) => Promise<ScenarioResult>) {
    setRunState({ scenarioId: id, steps: [], result: null, running: true })

    const result = await fn((steps) => {
      setRunState((prev) => prev ? { ...prev, steps } : null)
    })

    setRunState((prev) => prev ? { ...prev, result, running: false } : null)
    setHistory((h) => [result, ...h])

    if (result.caseId) {
      onCaseCreated(result.caseId)
    }
  }

  const activeScenario = runState
    ? SCENARIOS.find((s) => s.id === runState.scenarioId)
    : null

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-canvas/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-xl h-full bg-surface border-l border-border flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-mono font-bold text-primary">Agent Scenarios</h2>
            <p className="text-xs font-mono text-muted mt-0.5">
              Click Run — agent drives the full pipeline automatically
            </p>
          </div>
          <button onClick={onClose} className="text-subtle hover:text-primary text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Active run */}
          {runState && (
            <div className="border-b border-border p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className={`text-xs font-mono font-bold ${runState.running ? 'text-accent' : runState.result?.success ? 'text-success' : 'text-danger'}`}>
                  {runState.running ? '▶ RUNNING' : runState.result?.success ? '✓ COMPLETE' : '✕ FAILED'}
                </div>
                <span className="text-xs font-mono text-muted">{activeScenario?.name}</span>
              </div>

              {/* Steps */}
              <div className="space-y-1.5 mb-3">
                {runState.steps.map((step) => (
                  <div key={step.id} className="flex items-start gap-2">
                    <span className={`text-xs font-mono shrink-0 mt-0.5 ${STEP_COLOR[step.status]}`}>
                      {step.status === 'running' ? '◌' : STEP_ICON[step.status]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-mono ${STEP_COLOR[step.status]}`}>{step.label}</span>
                      {step.detail && (
                        <p className="text-xs font-mono text-muted truncate" title={step.detail}>
                          {step.detail}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {runState.result && (
                <div className={`rounded-lg border px-3 py-2.5 text-xs font-mono mt-3 ${
                  runState.result.success
                    ? 'border-success/40 bg-success/10 text-success'
                    : 'border-danger/40 bg-danger/10 text-danger'
                }`}>
                  <p className="font-bold mb-1">{runState.result.success ? '✓ ' : '✕ '}{runState.result.summary}</p>
                  {runState.result.caseId && (
                    <p className="text-muted">
                      Case: <button
                        onClick={() => { onCaseCreated(runState.result!.caseId); onClose() }}
                        className="text-accent hover:underline"
                      >
                        {runState.result.caseId}
                      </button>
                      {' '}(click to open)
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Scenario list */}
          <div className="p-5 space-y-3">
            <p className="text-xs font-mono text-subtle uppercase tracking-widest mb-4">Available Scenarios</p>
            {SCENARIOS.map((scenario) => {
              const isRunning = runState?.running && runState.scenarioId === scenario.id

              return (
                <div
                  key={scenario.id}
                  className="bg-card border border-border rounded-xl p-4 hover:border-accent/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-mono border rounded px-1.5 py-0.5 ${scenario.tagColor}`}>
                          {scenario.tag}
                        </span>
                        <h3 className="text-xs font-mono font-bold text-primary">{scenario.name}</h3>
                      </div>
                      <p className="text-xs font-mono text-subtle leading-relaxed">{scenario.description}</p>
                    </div>
                    <button
                      onClick={() => runScenario(scenario.id, scenario.fn)}
                      disabled={runState?.running ?? false}
                      className={`shrink-0 px-3 py-1.5 text-xs font-mono rounded border transition-colors flex items-center gap-1.5
                        ${isRunning
                          ? 'border-accent/40 bg-accent/10 text-accent'
                          : 'border-border hover:border-accent/50 text-subtle hover:text-accent'
                        }
                        disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {isRunning ? (
                        <><span className="animate-spin">◌</span> Running…</>
                      ) : (
                        <>▶ Run</>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="px-5 pb-5">
              <p className="text-xs font-mono text-subtle uppercase tracking-widest mb-3">Run History</p>
              <div className="space-y-2">
                {history.map((result, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between px-3 py-2 rounded border text-xs font-mono
                      ${result.success
                        ? 'border-success/20 bg-success/5 text-success'
                        : 'border-danger/20 bg-danger/5 text-danger'
                      }`}
                  >
                    <span>{result.success ? '✓' : '✕'} {result.summary}</span>
                    {result.caseId && (
                      <button
                        onClick={() => { onCaseCreated(result.caseId); onClose() }}
                        className="text-accent hover:underline ml-3 shrink-0"
                      >
                        Open →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
