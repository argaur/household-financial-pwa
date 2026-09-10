import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

/**
 * D-024/D-025 Chunk A, step A2 — the per-transmission consent step.
 *
 * Copy is verbatim from `Documentation/design/COPY_DECK.md`'s "Consent step,
 * shown before every call" section. It is a body swap, not a second surface:
 * this component renders no `Dialog`/`DialogContent`/`DialogPortal` of its
 * own, exactly the way `NewLedgerModal`'s goal step (D-024 G2,
 * `src/components/new-ledger-modal.tsx`) is a plain JSX block a host modal
 * swaps into an already-open `DialogContent` by step state. Whatever modal
 * triggers a goal-plan or counsel request owns the `Dialog`; this is only its
 * body for one step.
 *
 * ALWAYS SHOWN, NEVER REMEMBERED: per SPEC.md G4, per-transmission means per
 * transmission. This component holds no state of its own — no "don't show
 * again" checkbox, no localStorage, no effect that could suppress a second
 * showing — so there is nothing here that could persist across renders. The
 * host is responsible for mounting this step again on every request, which
 * it does for free simply by rendering it again; there is no acknowledgement
 * to record.
 *
 * THE SEAM FOR A3: `onConfirm` is invoked when "Send this request" is
 * clicked, and is the only thing this step does on confirm — it does not
 * call the proxy, does not touch the network, and does not know about
 * `POST /api/ai-suggestions`. A3 wires `onConfirm` to the actual request
 * (and, per SPEC.md G7, must count the reservation before the Anthropic call
 * so a failed attempt still consumes it, matching the copy below). `onCancel`
 * is invoked when "Not now" is clicked and must not invoke `onConfirm`.
 */
export interface AiConsentStepProps {
  /**
   * The remaining count from `GET /api/ai-suggestions` (`plansCap -
   * plansUsed` for a goal plan, `editsCap - editsUsed` for a counsel review —
   * the caller computes which, this component only renders the number it is
   * given). Never hardcoded here.
   */
  remaining: number
  /** Invoked exactly once when the user confirms. This is the send seam — see the module doc. */
  onConfirm: () => void
  /** Invoked when the user backs out. Must not also invoke `onConfirm`. */
  onCancel: () => void
  /** True while a request triggered by a previous confirm is still in flight. */
  submitting?: boolean
}

export function AiConsentStep({ remaining, onConfirm, onCancel, submitting = false }: AiConsentStepProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>This request leaves your device</DialogTitle>
        <DialogDescription>
          Your holdings are encrypted on your device and Vittam's servers cannot read them. This one request is the
          exception.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <p data-testid="ai-consent-what-is-sent" className="text-body text-foreground">
          What is sent: your asset mix as percentages, rounded totals, your goal name, and the instruments in your
          plan.
        </p>
        <p data-testid="ai-consent-what-is-not-sent" className="text-body text-foreground">
          What is not sent: your family members' names, nominees, exact amounts, or anything from your profile.
        </p>
        <p className="text-caption text-muted-foreground">
          The request goes to Anthropic, which processes it under its own API policy and may retain it for a period
          under that policy. Vittam's database does not store any of it.
        </p>
        {/* The before-the-call disclosure P2 decision 2 requires: this line renders
            unconditionally, above the confirm action, every time this step mounts. */}
        <p data-testid="ai-consent-counter-line" className="text-caption font-medium text-foreground">
          This uses one of your {remaining} remaining plans. It is counted when the request is sent, even if it
          fails.
        </p>
        <Link to="/privacy" className="inline-block text-caption underline underline-offset-4">
          How Vittam handles your data
        </Link>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Not now
        </Button>
        <Button type="button" onClick={onConfirm} disabled={submitting} className="w-full md:w-auto">
          Send this request
        </Button>
      </DialogFooter>
    </>
  )
}
