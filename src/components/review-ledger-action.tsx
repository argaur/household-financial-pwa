import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { AiConsentStep } from './ai-consent-step'
import { AiCapNotice, counselCapState } from './ai-cap-notice'
import { AiSuggestionCard, type AiSuggestionAllocation, type AiSuggestionTarget } from './ai-suggestion-card'
import type { AiSuggestionsUsage } from '@/lib/ai-suggestions-api'

/**
 * C3/C4 (D-024/D-025 Chunk C) — the "Review this ledger" action.
 *
 * **On-demand only, never proactive, never a background call (D-024 decision
 * 4).** This component makes no fetch, no timer and no effect that calls
 * `onReview` on mount or on a re-render — the only thing that can trigger it
 * is the "Send this request" click inside the consent step, exactly as A2's
 * own module doc requires of its `onConfirm` seam. `onReview` and `onApply`
 * are both injected the same way `AiConsentStep.onConfirm` and
 * `AiSuggestionCard.onApply`/`onDismiss` are: this component does not know
 * about `POST /api/ai-suggestions`, does not know about the encrypted
 * holdings write an apply becomes, and calls neither the network nor a
 * database itself. A host wires `onReview` to the real counsel call and
 * `onApply` to the real ledger/holdings write.
 *
 * **The cap-exhausted state is A7's, not a second copy of it.** `usage` is a
 * prop, computed and passed in by the caller (this component never fetches
 * it), and `counselCapState` — the same helper `ai-cap-notice.tsx` exports —
 * decides whether the button or `AiCapNotice` renders. There is no second
 * "you have used both reviews" string anywhere in this file.
 *
 * **The consent step is A2's, shown unremembered.** Every open of this
 * component's own `Dialog` resets to the consent step on the open transition
 * (the Radix reset trap this project has paid for twice already, D-016 and
 * D-021/A2's own test): the dialog stays mounted between opens, so state has
 * to be reset explicitly rather than relying on a fresh mount.
 *
 * **The result card is A6's `AiSuggestionCard`, not a second component.**
 * This file imports it rather than rendering its own allocation rows, so a
 * counsel suggestion cannot come to read as a different product from a
 * goal-plan one. `kind="counsel"` is passed through to both the consent step
 * (C3's noun fix) and the card (C4), and `target` is the caller's to supply —
 * a review can run against the protected "Current" ledger or a scratch one,
 * and METRICS_PLAN.md's criterion 7 depends on that distinction being real.
 *
 * **Cards are never persisted.** There is no `localStorage`, `sessionStorage`
 * or database write anywhere in this file. Apply hands the suggestion's
 * allocations to `onApply` and closes; Dismiss closes and discards — in both
 * cases the only state this component held (`result`) is gone the moment the
 * dialog next opens, per the reset above.
 */

export interface ReviewLedgerSuggestion {
  allocations: AiSuggestionAllocation[]
  reasoning: string
  caveat: string
}

export interface ReviewLedgerActionProps {
  /** Computed by the caller from `GET /api/ai-suggestions`. Never fetched here. */
  usage: AiSuggestionsUsage
  /** Which ledger this review is against — METRICS_PLAN.md criterion 7 depends on this being accurate. */
  target: AiSuggestionTarget
  instrumentNamesBySlug: Record<string, string>
  totalValueInr: number
  /**
   * The send seam. Invoked exactly once per confirmed consent, never on
   * mount, never on a re-render. Performs the real `POST
   * /api/ai-suggestions` counsel call; this component does not.
   */
  onReview: () => Promise<ReviewLedgerSuggestion>
  /**
   * Invoked with the card's allocations when "Add these to the plan" is
   * pressed. Commits as a normal ledger/holdings write; this component does
   * not touch the network or a database.
   */
  onApply: (allocations: AiSuggestionAllocation[]) => void
}

type Step = 'consent' | 'result' | 'error'

export function ReviewLedgerAction({
  usage,
  target,
  instrumentNamesBySlug,
  totalValueInr,
  onReview,
  onApply,
}: ReviewLedgerActionProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('consent')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ReviewLedgerSuggestion | null>(null)

  // The Radix reset trap: the Dialog stays mounted between opens, so "shown
  // unremembered" (A2) has to be an explicit reset on the open transition,
  // never an assumption that a fresh open means a fresh mount.
  useEffect(() => {
    if (open) {
      setStep('consent')
      setResult(null)
      setSubmitting(false)
    }
  }, [open])

  const capState = counselCapState(usage)
  const remaining = usage.editsCap - usage.editsUsed

  async function handleConfirm() {
    setSubmitting(true)
    try {
      const suggestion = await onReview()
      setResult(suggestion)
      setStep('result')
    } catch {
      setStep('error')
    } finally {
      setSubmitting(false)
    }
  }

  function handleApply(allocations: AiSuggestionAllocation[]) {
    onApply(allocations)
    setOpen(false)
  }

  function handleDismiss() {
    setOpen(false)
  }

  if (capState) {
    return <AiCapNotice state={capState} />
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="w-full md:w-auto">
        Review this ledger
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {step === 'consent' && (
            <AiConsentStep
              remaining={remaining}
              kind="counsel"
              submitting={submitting}
              onConfirm={handleConfirm}
              onCancel={() => setOpen(false)}
            />
          )}

          {step === 'result' && result && (
            <>
              <DialogHeader>
                <DialogTitle className="sr-only">Ledger review result</DialogTitle>
                <DialogDescription className="sr-only">The result of reviewing this ledger.</DialogDescription>
              </DialogHeader>
              <AiSuggestionCard
                kind="counsel"
                target={target}
                allocations={result.allocations}
                reasoning={result.reasoning}
                caveat={result.caveat}
                instrumentNamesBySlug={instrumentNamesBySlug}
                totalValueInr={totalValueInr}
                onApply={() => handleApply(result.allocations)}
                onDismiss={handleDismiss}
              />
            </>
          )}

          {step === 'error' && (
            <>
              <DialogHeader>
                <DialogTitle>Couldn&apos;t complete this request</DialogTitle>
                <DialogDescription>Nothing was changed, and this attempt was counted.</DialogDescription>
              </DialogHeader>
              <p className="text-caption text-muted-foreground">You have {remaining} left.</p>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="w-full md:w-auto">
                  Not now
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
