import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { HoldingForm } from '@/components/holding-form'
import { LedgerTabStrip } from '@/components/ledger-tab-strip'
import { LedgerCompareStrip } from '@/components/ledger-compare-strip'
import { track } from '@/lib/analytics'
import { listFamilyMembers, type FamilyMember } from '@/lib/family-members-api'
import { listInstruments, type Instrument } from '@/lib/instruments-api'
import { listHoldings, type Holding } from '@/lib/holdings-api'
import { listLedgers, type Ledger } from '@/lib/ledgers-api'

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
    setActiveLedgerId(id)
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

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg md:max-w-2xl lg:max-w-4xl py-12 md:py-16 space-y-6 pb-28">
        <header className="space-y-1">
          <h1 className="font-display text-display">Your holdings</h1>
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

        {/* Never on the Current tab (DATA_MODEL.md:348-349) — only once the
            selected ledger's own holdings have actually loaded, so the strip
            never renders against a moment-ago ledger's stale numbers. */}
        {state === 'loaded' && !isBaselineActive && activeLedger && ledgerHoldingsState === 'loaded' && (
          <LedgerCompareStrip ledger={activeLedger} ledgerHoldings={ledgerHoldings} baselineHoldings={holdings} />
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
          <div className="rounded-lg border border-dashed p-8 text-center space-y-4">
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
                  {/* Two columns from 768px (2026-08-05 rework) — a member's
                      holdings read as a group of cards, not a tall list. */}
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
              onSaved={handleSaved}
              onDeleted={handleDeleted}
            />
          </div>
        </SheetContent>
      </Sheet>
    </main>
  )
}
