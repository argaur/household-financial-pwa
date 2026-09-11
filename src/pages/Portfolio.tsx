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
  type AiSuggestionKind,
  type AiSuggestionTarget,
} from '@/components/ai-suggestion-card'
import { track } from '@/lib/analytics'
import { listFamilyMembers, type FamilyMember } from '@/lib/family-members-api'
import { listInstruments, type Instrument } from '@/lib/instruments-api'
import { listHoldings, type Holding } from '@/lib/holdings-api'
import { listLedgers, type Ledger } from '@/lib/ledgers-api'
import { getAiSuggestionsUsage, type AiSuggestionsUsage, type AiSuggestion } from '@/lib/ai-suggestions-api'
import { AiCapNotice, counselCapState } from '@/components/ai-cap-notice'

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
}: AiSuggestionSlotProps) {
  if (suggestion) {
    return (
      <AiSuggestionCard
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
    setActiveLedgerId(id)
  }

  /**
   * M3 — the minimum honest behaviour for both of the card's actions.
   *
   * No mutation of holdings is wired here. `onApply`'s write semantics
   * (rewrite allocations? open a confirm? create a ledger?) are not
   * specified in SPEC.md or DECISIONS_LOG.md anywhere this session could
   * find -- see the M3 report. What IS settled (D-024 decision 3: "nothing
   * changes until Apply is tapped") is that a tap must not be silently
   * inert, so both actions clear the suggestion and return the slot to the
   * compare strip; a later step defines what, if anything, Apply writes.
   * `AiSuggestionCard` fires its own `ai_suggestion_applied` /
   * `ai_suggestion_dismissed` analytics -- nothing duplicates that here.
   */
  function handleApplySuggestion() {
    setActiveSuggestion(null)
  }

  function handleDismissSuggestion() {
    setActiveSuggestion(null)
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

  // M1 — this ledger's own edits cap first, then the global breaker
  // (`counselCapState`'s own contract), null while usage hasn't loaded or
  // failed to load, in which case no notice renders at all.
  const counselCap = aiUsage ? counselCapState(aiUsage) : null

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
            onApply={handleApplySuggestion}
            onDismiss={handleDismissSuggestion}
          />
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

        {/* M1 (D-024/D-025) — stands in for the not-yet-mounted "Review this
            ledger" affordance (M4) IN PLACE, per SPEC.md G4's "Cap-exhausted"
            row: never in addition to it, never a toast. Applies to any
            ledger, baseline included, same scope as the projection panel
            above. */}
        {state === 'loaded' && activeLedgerId && counselCap && <AiCapNotice state={counselCap} />}

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
