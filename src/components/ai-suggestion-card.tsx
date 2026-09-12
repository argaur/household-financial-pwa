import { useEffect, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { projectHoldings, type ProjectionHolding } from '@/lib/projection/engine'
import type { AssetClass } from '@/lib/allocation'
import { track } from '@/lib/analytics'
import { OFFLINE_WRITE_MESSAGE } from '@/lib/use-online'

/**
 * A6 (D-024/D-025 Chunk A) — the suggestion card, rendered inline.
 *
 * Placement: in the ledger view, in the position `LedgerCompareStrip`
 * occupies (`src/components/ledger-compare-strip.tsx`), never as a toast and
 * never as a modal/portal (SPEC.md G4's "Suggestion card" row, DATA_MODEL.md's
 * "AI suggestion card" row). This component renders no `Dialog`,
 * `DialogPortal`, or toast primitive of its own — it is a plain `<section>`,
 * the same shape `LedgerCompareStrip` uses, so a host simply swaps one for
 * the other in the same slot.
 *
 * THE HARD CONSTRAINT (SPEC.md G6.5, DATA_MODEL.md note 15): no screen may
 * render a number that came from the model. `AiSuggestionAllocation` below
 * carries only `slug` and `weightPct` — there is no field a caller could
 * populate with a model-supplied rupee amount, so passing one through this
 * component's props is not a runtime discipline, it does not type-check.
 * `ai-suggestion-card.test.tsx` has a `@ts-expect-error` proving exactly
 * that: attaching a currency field to an allocation literal fails `tsc`.
 *
 * Every rupee figure this card shows is instead computed HERE, locally, by
 * Chunk E's engine (`src/lib/projection/engine.ts`): `totalValueInr` (the
 * ledger's own current total, decrypted and summed by the caller from real
 * holdings, never from the proxy response) is split across the suggested
 * weights and run through `projectHoldings` at `horizonYears: 0`, so the
 * figure beside each row is the engine's own `startValueInr`, not an inline
 * multiplication this component invented. The synthetic holdings' asset
 * class is a fixed placeholder (`INERT_ASSET_CLASS`) because at horizon zero
 * the compounding loop never runs (`engine.ts`: the growth step is gated on
 * `year > 0`), so no rate is ever applied to these rows and the placeholder
 * cannot affect what is shown.
 */

export interface AiSuggestionAllocation {
  slug: string
  weightPct: number
}

export type AiSuggestionKind = 'goal_plan' | 'counsel'

/**
 * A9: which record the suggestion was shown against. `'current'` is the
 * protected baseline ledger -- criterion 7 (METRICS_PLAN.md D-016 section)
 * filters `ai_suggestion_shown`/`ai_suggestion_applied` on exactly this
 * value, so it must be the same string the host actually renders against,
 * never assumed.
 */
export type AiSuggestionTarget = 'current' | 'ledger'

export interface AiSuggestionCardProps {
  kind: AiSuggestionKind
  target: AiSuggestionTarget
  allocations: AiSuggestionAllocation[]
  /** Model prose. Never a number the card renders as currency — see module doc. */
  reasoning: string
  /** The fixed education-not-advice line, server-attached (`server/lib/ai-suggestion-output.ts`). */
  caveat: string
  /** Display name per library slug, for the allocation rows. Catalog data, not model output. */
  instrumentNamesBySlug: Record<string, string>
  /**
   * The ledger's own current total value, in rupees. Decrypted and summed by
   * the caller from real holdings — never sourced from the proxy response.
   * The only input the local rupee-figure computation below is allowed to use.
   */
  totalValueInr: number
  /** Invoked when "Add these to the plan" is pressed. This card does not call the network itself. */
  onApply: () => void
  /** Invoked when "Dismiss" is pressed. */
  onDismiss: () => void
  submitting?: boolean
  /**
   * SPEC.md §7 — Apply is a write with no offline queue, so it must be
   * disabled rather than silently dropped. The caller (which owns `useOnline`)
   * passes this rather than the card reaching for connectivity itself, same
   * seam as `submitting`. Dismiss is never affected: it writes nothing.
   */
  offlineBlocked?: boolean
}

const currency = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
function formatInr(value: number): string {
  return `₹${currency.format(value)}`
}

/** See the module doc: inert at `horizonYears: 0`, never actually rate-bearing. */
const INERT_ASSET_CLASS: AssetClass = 'equity'

const CARD_TITLE: Record<AiSuggestionKind, string> = {
  goal_plan: 'One way to think about this goal',
  counsel: 'One way to read this plan',
}

/** COPY_DECK.md "Card allocation row": `{Instrument name} · {weight} percent`. */
function allocationLabel(name: string, weightPct: number): string {
  return `${name} · ${weightPct} percent`
}

export function AiSuggestionCard({
  kind,
  target,
  allocations,
  reasoning,
  caveat,
  instrumentNamesBySlug,
  totalValueInr,
  onApply,
  onDismiss,
  submitting = false,
  offlineBlocked = false,
}: AiSuggestionCardProps) {
  // A9 (METRICS_PLAN.md): fires exactly once per mount, never again on a
  // re-render caused by an unrelated prop change (e.g. totalValueInr ticking
  // as the caller recomputes it). A fresh suggestion is a fresh mount of this
  // component, so "once per mount" and "once per suggestion shown" coincide.
  const shownFired = useRef(false)
  useEffect(() => {
    if (shownFired.current) return
    shownFired.current = true
    track('ai_suggestion_shown', { target, kind })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleApply() {
    track('ai_suggestion_applied', { target, kind })
    onApply()
  }

  function handleDismiss() {
    track('ai_suggestion_dismissed', { target, kind })
    onDismiss()
  }

  // The only place a rupee figure is produced. Weights and the locally known
  // total go in; Chunk E's engine's own rounded `startValueInr` comes out.
  const rowValuesInr = useMemo(() => {
    const holdings: ProjectionHolding[] = allocations.map((allocation) => ({
      assetClass: INERT_ASSET_CLASS,
      currentValue: (totalValueInr * allocation.weightPct) / 100,
    }))
    const result = projectHoldings({ holdings, horizonYears: 0 })
    return result.holdings.map((holding) => holding.startValueInr)
  }, [allocations, totalValueInr])

  return (
    <section aria-labelledby="ai-suggestion-heading" className="rounded-lg border bg-card p-4 space-y-4">
      <h2 id="ai-suggestion-heading" className="text-body font-semibold">
        {CARD_TITLE[kind]}
      </h2>

      <p className="text-caption text-muted-foreground">
        This is an illustration, not advice. Every number beside it was worked out on your device from the mix
        below.
      </p>

      <ul className="space-y-2" data-testid="ai-suggestion-allocations">
        {allocations.map((allocation, index) => (
          <li key={allocation.slug} className="flex items-center justify-between gap-3 text-body">
            <span>{allocationLabel(instrumentNamesBySlug[allocation.slug] ?? allocation.slug, allocation.weightPct)}</span>
            <span className="text-muted-foreground" data-testid={`ai-suggestion-row-value-${allocation.slug}`}>
              {formatInr(rowValuesInr[index])}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-caption text-foreground">{reasoning}</p>
      <p className="text-caption text-muted-foreground">{caveat}</p>

      {offlineBlocked && <p className="text-caption text-muted-foreground">{OFFLINE_WRITE_MESSAGE}</p>}

      {/* G6.3: stacked below md, each full width, each >= 44px tall (Button's
          default size is h-11 = 44px, SPEC.md §6). Never `sm:` -- G6.1. */}
      <div className="flex flex-col gap-2 md:flex-row md:justify-end">
        <Button
          type="button"
          variant="ghost"
          onClick={handleDismiss}
          disabled={submitting}
          className="w-full md:w-auto"
        >
          Dismiss
        </Button>
        <Button
          type="button"
          onClick={handleApply}
          disabled={submitting || offlineBlocked}
          className="w-full md:w-auto"
        >
          Add these to the plan
        </Button>
      </div>
    </section>
  )
}
