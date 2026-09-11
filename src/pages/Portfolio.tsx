import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { HoldingForm } from '@/components/holding-form'
import { LedgerTabStrip } from '@/components/ledger-tab-strip'
import { LedgerCompareStrip } from '@/components/ledger-compare-strip'
import { ProjectionPanel, type ProjectionPanelState } from '@/components/projection-panel'
import { LedgerTable } from '@/components/ledger-table'
import {
  AiSuggestionCard,
  type AiSuggestionAllocation,
  type AiSuggestionKind,
  type AiSuggestionTarget,
} from '@/components/ai-suggestion-card'
import { track } from '@/lib/analytics'
import { listFamilyMembers, type FamilyMember } from '@/lib/family-members-api'
import { listInstruments, type Instrument } from '@/lib/instruments-api'
import { listHoldings, type Holding } from '@/lib/holdings-api'
import { createSuggestionLedger, listLedgers, MAX_LEDGER_NAME_CHARS, type Ledger } from '@/lib/ledgers-api'
import { describeCreateError } from '@/lib/ledger-create-error'
import {
  getAiSuggestionsUsage,
  postCounselSuggestion,
  type AiSuggestionsUsage,
  type AiSuggestion,
} from '@/lib/ai-suggestions-api'
import { ReviewLedgerAction, type ReviewLedgerSuggestion } from '@/components/review-ledger-action'
import { computeAllocation } from '@/lib/allocation'

/**
 * M3 (D-024/D-025) — the state shape M4 (the "Review this ledger" counsel
 * call) feeds. It wraps `AiSuggestion` verbatim, the exact shape
 * `postGoalPlanSuggestion`/its counsel counterpart return on `status: 'ok'`
 * (`ai-suggestions-api.ts`), plus `kind`/`target` — the two fields that
 * outcome doesn't carry but `AiSuggestionCard` needs. M4 can set this
 * straight from a POST response with no reshaping: `{ kind, target,
 * suggestion: response.suggestion }`.
 */
export interface ActiveAiSuggestion {
  kind: AiSuggestionKind
  target: AiSuggestionTarget
  suggestion: AiSuggestion
}

interface AiSuggestionSlotProps {
  suggestion: ActiveAiSuggestion | null
  ledger: Ledger | null
  ledgerHoldings: Holding[]
  baselineHoldings: Holding[]
  isBaselineActive: boolean
  ledgerHoldingsReady: boolean
  instrumentNamesBySlug: Record<string, string>
  totalValueInr: number
  onApply: () => void
  onDismiss: () => void
  /** True while M3c's Apply is creating the new ledger, so the card's own buttons lock. */
  applying?: boolean
}

/**
 * M3 — the compare-strip position (`ai-suggestion-card.tsx`'s module doc,
 * SPEC.md G4's "Suggestion card" row): `AiSuggestionCard` and
 * `LedgerCompareStrip` share this one slot and must never render together.
 * A suggestion, once present, takes the slot outright, regardless of which
 * ledger it was raised against (D-024 decision 3 lets a suggestion target
 * Current, not only a non-baseline ledger); otherwise the slot falls back to
 * the compare strip's own pre-existing gating (non-baseline ledger, that
 * ledger's holdings loaded), unchanged from before this step.
 *
 * Exported as a named export, separate from the default-exported page, so
 * the exclusivity contract is testable directly against real child
 * components without needing a way to force Portfolio's internal state from
 * outside it (nothing populates `suggestion` yet — that is M4).
 */
export function AiSuggestionSlot({
  suggestion,
  ledger,
  ledgerHoldings,
  baselineHoldings,
  isBaselineActive,
  ledgerHoldingsReady,
  instrumentNamesBySlug,
  totalValueInr,
  onApply,
  onDismiss,
  applying = false,
}: AiSuggestionSlotProps) {
  if (suggestion) {
    return (
      <AiSuggestionCard
        submitting={applying}
        kind={suggestion.kind}
        target={suggestion.target}
        allocations={suggestion.suggestion.allocations}
        reasoning={suggestion.suggestion.reasoning}
        caveat={suggestion.suggestion.caveat}
        instrumentNamesBySlug={instrumentNamesBySlug}
        totalValueInr={totalValueInr}
        onApply={onApply}
        onDismiss={onDismiss}
      />
    )
  }

  if (!isBaselineActive && ledger && ledgerHoldingsReady) {
    return <LedgerCompareStrip ledger={ledger} ledgerHoldings={ledgerHoldings} baselineHoldings={baselineHoldings} />
  }

  return null
}

type State = 'loading' | 'loaded' | 'error'

/** Insert-or-replace by id — shared by the Current and per-ledger holding lists. */
function upsertHolding(prev: Holding[], holding: Holding): Holding[] {
  const exists = prev.some((h) => h.id === holding.id)
  return exists ? prev.map((h) => (h.id === holding.id ? holding : h)) : [...prev, holding]
}

const currency = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
function formatInr(value: string): string {
  return `₹${currency.format(Number(value))}`
}

/**
 * M3c — the outcome of the last Apply, shown on the page rather than in a
 * toast or a dialog. `ReviewLedgerAction` closes its own dialog the moment
 * Apply is pressed, so by the time the create resolves there is nowhere else
 * for a message to live.
 */
type ApplyNotice = { status: 'created'; ledgerName: string } | { status: 'failed'; message: string }

/** What a ledger created by Apply is called. Short, dated, and 60 characters is plenty. */
const SUGGESTION_LEDGER_LABEL: Record<AiSuggestionKind, string> = {
  goal_plan: 'AI plan',
  counsel: 'AI review',
}

function suggestionLedgerName(kind: AiSuggestionKind, now: Date = new Date()): string {
  const date = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${SUGGESTION_LEDGER_LABEL[kind]}, ${date}`.slice(0, MAX_LEDGER_NAME_CHARS)
}

/** COPY_DECK.md "Card allocation row", reused so the mix reads the same before and after Apply. */
function allocationLabel(name: string, weightPct: number): string {
  return `${name} · ${weightPct} percent`
}

// Copy: Documentation/design/COPY_DECK.md — "Portfolio Tab". Layout:
// Documentation/design/WIREFRAMES.md — 4a/4b. No bottom tab bar yet (ships in
// a later slice, same as Explore's plain-link precedent from Slice 3) — a
// fixed "+" FAB opens the same HoldingForm used by Onboarding Step 3.
export function Portfolio() {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>('loading')
  // Current's holdings only. Used for the Current tab, as the compare
  // baseline for every non-baseline ledger, and as the copy-modal source —
  // never repurposed to hold another ledger's rows.
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [unreadableHoldingsCount, setUnreadableHoldingsCount] = useState(0)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [activeLedgerId, setActiveLedgerId] = useState<string | null>(null)
  // The selected non-baseline ledger's holdings, fetched separately from
  // Current. Idle while the Current tab is active.
  const [ledgerHoldings, setLedgerHoldings] = useState<Holding[]>([])
  const [ledgerHoldingsState, setLedgerHoldingsState] = useState<State | 'idle'>('idle')
  // M1 (D-024/D-025) — the active ledger's AI usage counters, so the
  // cap-exhausted notice can stand in for the not-yet-mounted "Review this
  // ledger" affordance (M4). A failed fetch must never break the ledger view
  // -- it just means no cap applies as far as this page can tell, so it
  // falls back to null rather than surfacing an error state of its own.
  const [aiUsage, setAiUsage] = useState<AiSuggestionsUsage | null>(null)
  // M3 — the suggestion currently occupying the compare-strip slot, if any.
  // Nothing sets this yet: the counsel call that produces a suggestion is
  // M4 ("Review this ledger"). Reset to null on Apply and on Dismiss (see
  // AiSuggestionSlot's callers below) -- there is no "already applied" or
  // "already dismissed" memory beyond that, matching the consent step's own
  // never-remembered discipline (D-025, SPEC.md G4).
  const [activeSuggestion, setActiveSuggestion] = useState<ActiveAiSuggestion | null>(null)
  // M3c — Apply's own write state. `applyNotice` is the only thing on the page
  // that reports what Apply did, success or failure.
  const [applying, setApplying] = useState(false)
  const [applyNotice, setApplyNotice] = useState<ApplyNotice | null>(null)
  // The last suggestion a counsel review returned, kept so a FAILED apply can
  // put the card back. `ReviewLedgerAction` holds the suggestion in its own
  // state and closes its dialog on Apply, so without this a create that failed
  // would drop the user's suggestion on the floor with nothing to retry from.
  const lastReviewSuggestionRef = useRef<ActiveAiSuggestion | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null)
  // Sheet content is position:fixed and taller than the viewport; some mobile
  // browsers scroll the underlying document (not the fixed sheet) to bring a
  // focused field into view above the keyboard. That leaves window scroll
  // sitting wherever the tall sheet reached, so closing it strands the user
  // below the (often much shorter) holdings list. Captured on open, restored
  // on close — see BUG_LOG.md B-002.
  const scrollPositionRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = await getToken()
        const [holdingsResult, membersResult, instrumentsResult, ledgersResult] = await Promise.all([
          listHoldings(token),
          listFamilyMembers(token),
          listInstruments(),
          listLedgers(token),
        ])
        if (cancelled) return
        setHoldings(holdingsResult.holdings)
        setUnreadableHoldingsCount(holdingsResult.unreadableCount)
        setMembers(membersResult.members)
        setInstruments(instrumentsResult)
        setLedgers(ledgersResult)
        setActiveLedgerId((prev) => prev ?? ledgersResult.find((l) => l.isBaseline)?.id ?? ledgersResult[0]?.id ?? null)
        setState('loaded')
      } catch {
        if (cancelled) return
        setState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [getToken])

  const activeLedger = ledgers.find((l) => l.id === activeLedgerId) ?? null
  // Defaults true while ledgers haven't loaded yet, so nothing tries to fetch
  // a non-baseline ledger's holdings before the tab strip itself exists.
  const isBaselineActive = activeLedger?.isBaseline ?? true

  // Fetches the selected non-baseline ledger's holdings whenever the active
  // tab changes to one. Guarded against the stale-response race the same way
  // as the effect above: a slow fetch for a ledger the user has since tabbed
  // away from must not overwrite what the newer tab already loaded.
  useEffect(() => {
    if (!activeLedgerId || isBaselineActive) {
      setLedgerHoldings([])
      setLedgerHoldingsState('idle')
      return
    }
    let cancelled = false
    setLedgerHoldingsState('loading')
    ;(async () => {
      try {
        const token = await getToken()
        const result = await listHoldings(token, activeLedgerId)
        if (cancelled) return
        setLedgerHoldings(result.holdings)
        setLedgerHoldingsState('loaded')
      } catch {
        if (cancelled) return
        setLedgerHoldingsState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeLedgerId, isBaselineActive, getToken])

  // M1 — refetches the counters whenever the active ledger changes, since
  // `editsCap`/`editsUsed` are per-ledger (DATA_MODEL.md). Same
  // cancelled-guard pattern as the effects above: a slow response for a
  // ledger the user has since tabbed away from must not land. A rejection is
  // swallowed to null rather than an error state -- this counter is
  // advisory only and must never be able to break the ledger view.
  useEffect(() => {
    if (!activeLedgerId) {
      setAiUsage(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const token = await getToken()
        const usage = await getAiSuggestionsUsage(token, activeLedgerId)
        if (cancelled) return
        setAiUsage(usage)
      } catch {
        if (cancelled) return
        setAiUsage(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeLedgerId, getToken])

  function closeSheet() {
    setSheetOpen(false)
    setEditingHolding(null)
    window.scrollTo({ top: scrollPositionRef.current, behavior: 'auto' })
  }

  function handleLedgerCreated(ledger: Ledger) {
    setLedgers((prev) => [...prev, ledger])
  }

  function handleLedgerDeleted(id: string) {
    const baselineId = ledgers.find((l) => l.isBaseline)?.id ?? null
    setLedgers((prev) => prev.filter((l) => l.id !== id))
    setActiveLedgerId((prev) => (prev === id ? baselineId : prev))
  }

  /** Only fires for a user-initiated change — the initial-mount assignment above sets activeLedgerId directly, never through here. */
  function handleSelectLedger(id: string) {
    if (id === activeLedgerId) return
    track('ledger_switched', {})
    // A suggestion is scoped to the ledger it was raised against (`target`,
    // ai-suggestion-card.tsx's module doc); switching tabs must not carry it
    // over onto a different ledger's compare-strip slot.
    setActiveSuggestion(null)
    setApplyNotice(null)
    setActiveLedgerId(id)
  }

  /**
   * M3c — what Apply writes: ONE NEW LEDGER, EMPTY OF HOLDINGS, with the
   * suggested mix sealed onto it as context (`createSuggestionLedger`).
   *
   * Current is never touched, and neither is any other existing ledger. No
   * holding is created, by decision rather than omission: an allocation is
   * `{ slug, weightPct }` with no member on it, and picking one would silently
   * attribute the rest of the household's money to that person. See
   * `createSuggestionLedger`'s own doc.
   *
   * The 4-ledger cap is not re-implemented here. `ledgers-api.ts` raises
   * `LedgerCapReachedError` on the route's 409, and `describeCreateError`
   * (`src/lib/ledger-create-error.ts`) is the same function the manual
   * "+ New ledger" modal uses, so the cap reads identically either way.
   *
   * `AiSuggestionCard` fires its own `ai_suggestion_applied`; `ledger_created`
   * is tracked here because a ledger genuinely was created, with `source:
   * 'blank'`, which is what it is.
   */
  async function applySuggestion(kind: AiSuggestionKind, allocations: AiSuggestionAllocation[]) {
    if (applying) return
    setApplying(true)
    setApplyNotice(null)
    const name = suggestionLedgerName(kind)
    try {
      const token = await getToken()
      const ledger = await createSuggestionLedger(token, name, { kind, allocations })
      track('ledger_created', { source: 'blank' })
      setLedgers((prev) => [...prev, ledger])
      // Set directly rather than through handleSelectLedger: this is not a tab
      // click, so it must not fire `ledger_switched`.
      setActiveLedgerId(ledger.id)
      setActiveSuggestion(null)
      setApplyNotice({ status: 'created', ledgerName: ledger.name ?? name })
    } catch (err) {
      // Nothing was created, so the suggestion must come back rather than
      // vanish with the dialog that raised it.
      setActiveSuggestion((prev) => prev ?? lastReviewSuggestionRef.current)
      setApplyNotice({ status: 'failed', message: describeCreateError(err) })
    } finally {
      setApplying(false)
    }
  }

  function handleDismissSuggestion() {
    setActiveSuggestion(null)
    setApplyNotice(null)
  }

  /**
   * M4 — `ReviewLedgerAction`'s `onReview` seam: the real counsel POST.
   * Builds the same two request pieces `NewLedgerModal`'s goal step already
   * builds for `goal_plan` (`currentMix` via `computeAllocation`, reused
   * rather than a second allocation loop), plus `holdingSlugs` — the
   * deduplicated library slugs behind the active ledger's own holdings,
   * looked up the same way the card grid below already resolves a holding's
   * instrument.
   *
   * A non-`'ok'` status (cap_reached/duplicate/failed) throws, same contract
   * `ReviewLedgerAction` already expects of this seam (its own module doc):
   * it catches into its generic, amount-free error state. On success, the
   * response's own `usage` is folded into `aiUsage` in place so the
   * remaining-reviews count doesn't go stale until the next ledger switch
   * refetches it for real.
   */
  async function handleReviewLedger(): Promise<ReviewLedgerSuggestion> {
    if (!activeLedgerId) throw new Error('no active ledger')
    const token = await getToken()
    const currentMix = computeAllocation(displayedHoldings).allocation.map((slice) => ({
      assetClass: slice.assetClass,
      weightPct: slice.percentage,
    }))
    const holdingSlugs = Array.from(
      new Set(
        displayedHoldings
          .map((h) => instruments.find((i) => i.id === h.instrumentId)?.slug)
          .filter((slug): slug is string => Boolean(slug)),
      ),
    )
    const response = await postCounselSuggestion(token, {
      kind: 'counsel',
      idempotencyKey: crypto.randomUUID(),
      ledgerId: activeLedgerId,
      currentMix,
      holdingSlugs,
    })
    if (response.status !== 'ok') {
      throw new Error(response.status)
    }
    setAiUsage((prev) => (prev ? { ...prev, ...response.usage } : prev))
    // M3c — kept so a failed Apply can put this card back on the page (see
    // `lastReviewSuggestionRef`). Browser state only, never persisted.
    lastReviewSuggestionRef.current = {
      kind: 'counsel',
      target: isBaselineActive ? 'current' : 'ledger',
      suggestion: response.suggestion,
    }
    return response.suggestion
  }

  function handleSaved(holding: Holding) {
    if (isBaselineActive) {
      setHoldings((prev) => upsertHolding(prev, holding))
    } else {
      setLedgerHoldings((prev) => upsertHolding(prev, holding))
    }
    closeSheet()
  }

  function handleDeleted(id: string) {
    if (isBaselineActive) {
      setHoldings((prev) => prev.filter((h) => h.id !== id))
    } else {
      setLedgerHoldings((prev) => prev.filter((h) => h.id !== id))
    }
    closeSheet()
  }

  function openAddSheet() {
    scrollPositionRef.current = window.scrollY
    setEditingHolding(null)
    setSheetOpen(true)
  }

  function openEditSheet(holding: Holding) {
    scrollPositionRef.current = window.scrollY
    setEditingHolding(holding)
    setSheetOpen(true)
  }

  // The Current tab's own state is used verbatim (byte-identical to before
  // this chunk); a non-baseline tab substitutes its own fetch and state.
  const displayedHoldings = isBaselineActive ? holdings : ledgerHoldings
  const displayedReady = state === 'loaded' && (isBaselineActive || ledgerHoldingsState === 'loaded')
  const displayedLoading = state === 'loaded' && !isBaselineActive && ledgerHoldingsState === 'loading'
  const displayedError = state === 'loaded' && !isBaselineActive && ledgerHoldingsState === 'error'

  const totalCurrentValue = displayedHoldings.reduce((sum, h) => sum + Number(h.currentValue), 0)
  const groupedByMember = members
    .map((member) => ({ member, memberHoldings: displayedHoldings.filter((h) => h.memberId === member.id) }))
    .filter((group) => group.memberHoldings.length > 0)

  // M3 — catalog data, not model output (ai-suggestion-card.tsx's own prop
  // doc): display names for whichever slugs the active suggestion names.
  const instrumentNamesBySlug = useMemo(
    () => Object.fromEntries(instruments.map((instrument) => [instrument.slug, instrument.name])),
    [instruments],
  )

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg md:max-w-2xl lg:max-w-4xl py-12 md:py-16 space-y-6 pb-28">
        <header className="space-y-1">
          <h1 className="font-serif text-display">Your holdings</h1>
          {displayedReady && displayedHoldings.length > 0 && (
            <p className="text-caption text-muted-foreground">
              {displayedHoldings.length} holding{displayedHoldings.length === 1 ? '' : 's'} ·{' '}
              {formatInr(String(totalCurrentValue))}
            </p>
          )}
        </header>

        {state === 'loading' && (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {state === 'error' && (
          <p className="text-caption text-destructive">We couldn't load your holdings. Refresh to try again.</p>
        )}

        {state === 'loaded' && activeLedgerId && (
          <LedgerTabStrip
            ledgers={ledgers}
            activeLedgerId={activeLedgerId}
            onSelect={handleSelectLedger}
            sourceHoldings={holdings}
            unreadableCount={unreadableHoldingsCount}
            onLedgerCreated={handleLedgerCreated}
            onLedgerDeleted={handleLedgerDeleted}
          />
        )}

        {/* M3 (D-024/D-025) — the compare-strip slot. A suggestion, once
            present, takes it outright; otherwise this falls back to the
            pre-existing compare-strip gating (never on the Current tab,
            DATA_MODEL.md:348-349, and only once the selected ledger's own
            holdings have actually loaded, so it never renders against a
            moment-ago ledger's stale numbers) -- unchanged from before this
            step. See AiSuggestionSlot's own doc for the exclusivity rule. */}
        {state === 'loaded' && activeLedgerId && (
          <AiSuggestionSlot
            suggestion={activeSuggestion}
            ledger={activeLedger}
            ledgerHoldings={ledgerHoldings}
            baselineHoldings={holdings}
            isBaselineActive={isBaselineActive}
            ledgerHoldingsReady={ledgerHoldingsState === 'loaded'}
            instrumentNamesBySlug={instrumentNamesBySlug}
            totalValueInr={totalCurrentValue}
            applying={applying}
            onApply={() => {
              if (activeSuggestion) {
                void applySuggestion(activeSuggestion.kind, activeSuggestion.suggestion.allocations)
              }
            }}
            onDismiss={handleDismissSuggestion}
          />
        )}

        {/* M3c — what Apply actually did. Plain text on the page, never a
            toast: the dialog a suggestion was applied from has already closed
            by the time the create resolves. The success copy has one job, to
            stop a user opening an empty ledger and concluding the feature is
            broken, so it says the plan is empty in as many words. */}
        {applyNotice && (
          <div
            data-testid="apply-suggestion-notice"
            role="status"
            className={`rounded-lg border p-4 space-y-1 ${
              applyNotice.status === 'created' ? 'border-brass-soft bg-brass/5' : 'border-destructive/40'
            }`}
          >
            {applyNotice.status === 'created' ? (
              <>
                <p className="text-body font-medium">New plan created: "{applyNotice.ledgerName}".</p>
                <p className="text-caption text-muted-foreground">
                  It is empty. Nothing was added to Current, and nothing was added here.
                </p>
                <p className="text-caption text-muted-foreground">
                  The suggested mix is saved with this plan, so you can see what it proposed.
                </p>
                <p className="text-caption text-muted-foreground">
                  Add the holdings yourself, and pick who each one belongs to.
                </p>
              </>
            ) : (
              <>
                <p className="text-body text-destructive">{applyNotice.message}</p>
                <p className="text-caption text-muted-foreground">
                  Nothing was created. Your suggestion is still on this page.
                </p>
              </>
            )}
          </div>
        )}

        {/* M3c — the mix an applied suggestion left on this ledger. Slugs and
            weights only, never a rupee figure (SPEC.md G6.5): the names come
            from the instrument catalog and the percentages are what the user
            chose to act on. It is shown because a plan that says a suggestion
            is "saved with it" and then shows nothing is indistinguishable from
            a broken one. */}
        {state === 'loaded' && activeLedger?.suggestion && (
          <section
            data-testid="ledger-suggestion-note"
            aria-labelledby="ledger-suggestion-heading"
            className="rounded-lg border bg-card p-4 space-y-2"
          >
            <h2 id="ledger-suggestion-heading" className="text-body font-semibold">
              The mix this plan came from
            </h2>
            <p className="text-caption text-muted-foreground">
              This is what the suggestion proposed. Nothing here was recorded for you.
            </p>
            <ul className="space-y-1">
              {activeLedger.suggestion.allocations.map((allocation) => (
                <li key={allocation.slug} className="text-caption text-foreground">
                  {allocationLabel(instrumentNamesBySlug[allocation.slug] ?? allocation.slug, allocation.weightPct)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* E6 (D-024) shell — lives in the ledger view, below the compare
            strip and above the ledger table (see projection-panel.tsx's
            module doc for why not "below the allocation donut" as
            SPEC.md §G4 literally says: no donut exists in this view).
            Applies to any ledger, baseline included, per DATA_MODEL.md's
            "Projection panel (any ledger)" row. */}
        {state === 'loaded' && activeLedgerId && (
          <ProjectionPanel
            state={
              (displayedLoading ? 'loading' : displayedError ? 'error' : 'ready') satisfies ProjectionPanelState
            }
            holdings={displayedHoldings}
            instruments={instruments}
            ledgerId={activeLedgerId}
          />
        )}

        {/* M4 (D-024/D-025) — "Review this ledger". `ReviewLedgerAction` owns
            its own cap-exhausted notice (SPEC.md G4's "Cap-exhausted" row:
            IN PLACE of the button, never in addition to it, never a toast),
            so this is the only render of that notice on the page -- M1's
            standalone placeholder line is gone. Applies to any ledger,
            baseline included, same scope as the projection panel above.
            Waits on `aiUsage` itself (not just `state`/`activeLedgerId`):
            the component requires a real usage prop, never fetches its own. */}
        {state === 'loaded' && activeLedgerId && aiUsage && (
          <ReviewLedgerAction
            usage={aiUsage}
            target={isBaselineActive ? 'current' : 'ledger'}
            instrumentNamesBySlug={instrumentNamesBySlug}
            totalValueInr={totalCurrentValue}
            onReview={handleReviewLedger}
            onApply={(allocations) => void applySuggestion('counsel', allocations)}
          />
        )}

        {displayedLoading && (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {displayedError && (
          <p className="text-caption text-destructive">We couldn't load this ledger's holdings. Refresh to try again.</p>
        )}

        {displayedReady && displayedHoldings.length === 0 && (
          <div className="rounded-xl border border-dashed border-brass-soft bg-brass/5 p-8 text-center space-y-4 transition-colors hover:border-brass">
            <p className="text-body font-medium">Nothing recorded yet.</p>
            <p className="text-body text-muted-foreground">
              Add your investments, savings, insurance, and assets to see your complete household picture.
            </p>
            <Button variant="ghost" onClick={openAddSheet}>
              Record your first holding
            </Button>
          </div>
        )}

        {displayedReady && displayedHoldings.length > 0 && (
          <div className="space-y-6">
            {groupedByMember.map(({ member, memberHoldings }) => {
              const memberTotal = memberHoldings.reduce((sum, h) => sum + Number(h.currentValue), 0)
              return (
                <div key={member.id} className="space-y-3">
                  <div>
                    <p className="text-body font-semibold">{member.name}'s holdings</p>
                    <p className="text-caption text-muted-foreground">
                      {memberHoldings.length} holding{memberHoldings.length === 1 ? '' : 's'} · {formatInr(String(memberTotal))}
                    </p>
                  </div>
                  {isBaselineActive ? (
                    // Current/baseline: the existing card-grid list, byte-identical
                    // to before this chunk. Two columns from 768px (2026-08-05
                    // rework) — a member's holdings read as a group of cards, not
                    // a tall list.
                    <div className="grid gap-3 md:grid-cols-2">
                      {memberHoldings.map((holding) => {
                        const instrument = instruments.find((i) => i.id === holding.instrumentId)
                        return (
                          <button
                            key={holding.id}
                            type="button"
                            onClick={() => openEditSheet(holding)}
                            className="w-full rounded-lg border bg-card p-4 text-left shadow-card transition-colors hover:bg-accent/50"
                          >
                            <p className="text-body font-medium">{instrument?.name ?? 'Holding'}</p>
                            <p className="text-caption text-muted-foreground capitalize">
                              {holding.assetClass} · {formatInr(holding.currentValue)} current
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    // Non-baseline ledger: the new LedgerTable (D-016 Slice 5,
                    // COMPONENT_SHOWCASE.md's LedgerTable entry). Weighed against
                    // the whole ledger's total, not just this member's slice.
                    <LedgerTable
                      holdings={memberHoldings}
                      instruments={instruments}
                      ledgerTotalValue={totalCurrentValue}
                      onSelect={openEditSheet}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {displayedReady && displayedHoldings.length > 0 && (
        <Button
          onClick={openAddSheet}
          size="icon"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg"
          aria-label="Record a holding"
        >
          +
        </Button>
      )}

      <Sheet open={sheetOpen} onOpenChange={(open) => (open ? setSheetOpen(true) : closeSheet())}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingHolding ? 'Update holding' : 'Record a holding'}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <HoldingForm
              members={members}
              instruments={instruments}
              initialHolding={editingHolding ?? undefined}
              submitLabel={editingHolding ? 'Save changes' : 'Add to plan'}
              submittingLabel={editingHolding ? 'Saving…' : 'Adding…'}
              analyticsSurface="portfolio"
              ledgerId={isBaselineActive ? undefined : (activeLedgerId ?? undefined)}
              /* Falls back to "this ledger", never "Current" — a null name
                 here would mean an active non-baseline ledger's name failed
                 to decrypt, and claiming it's Current would be actively
                 wrong, not just generic. */
              ledgerName={isBaselineActive ? 'Current' : (activeLedger?.name ?? 'this ledger')}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
            />
          </div>
        </SheetContent>
      </Sheet>
    </main>
  )
}
