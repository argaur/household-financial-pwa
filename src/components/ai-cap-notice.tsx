import { useEffect } from 'react'
import type { AiSuggestionsUsage } from '@/lib/ai-suggestions-api'
import { track, type EventMap } from '@/lib/analytics'

/**
 * A7 (D-024/D-025 Chunk A) — the three distinct cap-exhausted states.
 *
 * DATA_MODEL.md note 13: household plans exhausted, this ledger's edits
 * exhausted, and the global monthly breaker tripped are three different
 * facts with three different implications, and collapsing them into one
 * "limit reached" message tells a user their own limit is reached when it is
 * not. Each gets its own copy, verbatim from COPY_DECK.md's "Cap states,
 * three distinct messages" table.
 *
 * This renders informational, `role="status"` (a polite live region), never
 * `role="alert"` and never a toast — SPEC.md G4's "Cap-exhausted" row: it
 * replaces the action's own affordance IN PLACE. It is the host's job to
 * swap this in for the goal-step option, the "Review this ledger" button, or
 * whichever AI-triggering control the cap applies to; this component does
 * not know which one it is standing in for.
 *
 * Manual ledger creation is a fact about the HOST, not this component: this
 * renders nothing that could disable a sibling control. `ai-cap-notice.test.tsx`
 * proves a host's manual-creation affordances stay enabled next to every one
 * of the three states.
 */

export type AiCapState = 'plansExhausted' | 'editsExhausted' | 'globalPaused'

export interface AiCapNoticeProps {
  state: AiCapState
}

interface CapCopy {
  title: string
  body: string
}

const CAP_COPY: Record<AiCapState, CapCopy> = {
  plansExhausted: {
    title: 'You have used both of your plans',
    body: 'Building and editing plans by hand stays fully available. A paid tier with more is coming.',
  },
  editsExhausted: {
    title: 'You have used both reviews for this plan',
    body: "Other plans still have their own reviews. Editing this one by hand stays fully available.",
  },
  globalPaused: {
    title: 'This feature is paused for the month',
    body: 'Vittam runs on a fixed monthly budget for this, and it has been reached. Your own limits have not been used up. Everything else works as normal.',
  },
}

/** A9: the three `AiCapState` values map 1:1 onto METRICS_PLAN.md's `cap_type` enum. */
const CAP_TYPE_BY_STATE: Record<AiCapState, EventMap['ai_cap_reached']['cap_type']> = {
  plansExhausted: 'plans',
  editsExhausted: 'edits',
  globalPaused: 'global',
}

export function AiCapNotice({ state }: AiCapNoticeProps) {
  const copy = CAP_COPY[state]

  // A9: fires once whenever this component renders a cap-exhausted state --
  // once on mount, and again if `state` genuinely changes to a different cap
  // (a re-render with the same `state` does not re-fire).
  useEffect(() => {
    track('ai_cap_reached', { cap_type: CAP_TYPE_BY_STATE[state] })
  }, [state])

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="ai-cap-notice"
      data-cap-state={state}
      className="rounded-md border border-border bg-muted/40 p-3 space-y-1"
    >
      <p className="text-body font-medium text-foreground">{copy.title}</p>
      <p className="text-caption text-muted-foreground">{copy.body}</p>
    </div>
  )
}

/**
 * Which cap (if any) blocks the goal-plan affordance ("+ New" modal's goal
 * step): the household's own plans cap first, then the global breaker.
 * `editsCap` never applies here -- that counter is per-ledger review, not
 * per-household plan creation.
 */
export function goalPlanCapState(usage: AiSuggestionsUsage): AiCapState | null {
  if (usage.plansUsed >= usage.plansCap) return 'plansExhausted'
  if (!usage.globalOpen) return 'globalPaused'
  return null
}

/**
 * Which cap (if any) blocks a single ledger's "Review this ledger" (C3)
 * affordance: this ledger's own edits cap first, then the global breaker.
 */
export function counselCapState(usage: AiSuggestionsUsage): AiCapState | null {
  if (usage.editsUsed >= usage.editsCap) return 'editsExhausted'
  if (!usage.globalOpen) return 'globalPaused'
  return null
}
