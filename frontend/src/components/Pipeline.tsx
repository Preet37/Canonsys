import type { CaseState } from '../types'
import { STATE_ORDER } from './shared'

const STATE_ICON: Partial<Record<CaseState, string>> = {
  DRAFT: '○',
  SUBMITTED: '→',
  INTAKE_VALIDATED: '✓',
  FACT_REVIEW: '◎',
  PROPOSAL_READY: '✦',
  POLICY_REVIEW: '⚖',
  HUMAN_REVIEW: '👁',
  APPROVAL_PENDING: '⏳',
  APPROVED: '✅',
  DENIED: '✕',
  RELEASE_COMPILED: '⚙',
  RELEASED: '🔓',
  EXECUTED: '⚡',
  CLOSED: '■',
  ERROR_INVESTIGATION: '⚠',
}

export function Pipeline({ status }: { status: CaseState }) {
  const currentIdx = STATE_ORDER.indexOf(status)
  const isDenied = status === 'DENIED'
  const isError = status === 'ERROR_INVESTIGATION'

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center gap-0 min-w-max py-2">
        {STATE_ORDER.map((state, idx) => {
          const isActive = state === status
          const isPast = currentIdx > idx && !isDenied && !isError
          const isFuture = !isActive && !isPast

          let dotColor = 'bg-muted'
          let textColor = 'text-muted'
          let lineColor = 'bg-muted/30'

          if (isActive) {
            dotColor = isDenied ? 'bg-danger' : isError ? 'bg-danger' : 'bg-accent'
            textColor = isDenied ? 'text-danger' : isError ? 'text-danger' : 'text-accent'
          } else if (isPast) {
            dotColor = 'bg-success'
            textColor = 'text-success'
            lineColor = 'bg-success/50'
          }

          return (
            <div key={state} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs
                    border-2 transition-all
                    ${isActive ? `${dotColor} border-current shadow-lg shadow-accent/20` : `${dotColor} border-transparent`}
                    ${isPast ? 'ring-1 ring-success/30' : ''}
                  `}
                  title={state}
                >
                  <span className={`text-xs ${textColor}`}>
                    {isPast ? '✓' : STATE_ICON[state] ?? '·'}
                  </span>
                </div>
                <span className={`text-[9px] font-mono max-w-[56px] text-center leading-tight ${textColor}`}>
                  {state.replace(/_/g, ' ')}
                </span>
              </div>
              {idx < STATE_ORDER.length - 1 && (
                <div className={`h-[2px] w-4 mx-1 mt-[-16px] ${lineColor} transition-colors`} />
              )}
            </div>
          )
        })}
        {(isDenied || isError) && (
          <>
            <div className="h-[2px] w-4 mx-1 mt-[-16px] bg-danger/30" />
            <div className="flex flex-col items-center gap-1">
              <div className="w-6 h-6 rounded-full bg-danger border-2 border-danger flex items-center justify-center shadow-lg shadow-danger/20">
                <span className="text-xs text-white">{STATE_ICON[status]}</span>
              </div>
              <span className="text-[9px] font-mono text-danger text-center">
                {status.replace(/_/g, ' ')}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
