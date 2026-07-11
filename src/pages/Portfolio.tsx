import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { HoldingForm } from '@/components/holding-form'
import { listFamilyMembers, type FamilyMember } from '@/lib/family-members-api'
import { listInstruments, type Instrument } from '@/lib/instruments-api'
import { listHoldings, type Holding } from '@/lib/holdings-api'

type State = 'loading' | 'loaded' | 'error'

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
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = await getToken()
        const [holdingsResult, membersResult, instrumentsResult] = await Promise.all([
          listHoldings(token),
          listFamilyMembers(token),
          listInstruments(),
        ])
        if (cancelled) return
        setHoldings(holdingsResult)
        setMembers(membersResult)
        setInstruments(instrumentsResult)
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

  function handleSaved(holding: Holding) {
    setHoldings((prev) => {
      const exists = prev.some((h) => h.id === holding.id)
      return exists ? prev.map((h) => (h.id === holding.id ? holding : h)) : [...prev, holding]
    })
    setSheetOpen(false)
    setEditingHolding(null)
  }

  function openAddSheet() {
    setEditingHolding(null)
    setSheetOpen(true)
  }

  function openEditSheet(holding: Holding) {
    setEditingHolding(holding)
    setSheetOpen(true)
  }

  const totalCurrentValue = holdings.reduce((sum, h) => sum + Number(h.currentValue), 0)
  const groupedByMember = members
    .map((member) => ({ member, memberHoldings: holdings.filter((h) => h.memberId === member.id) }))
    .filter((group) => group.memberHoldings.length > 0)

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg py-12 space-y-6 pb-28">
        <header className="space-y-1">
          <h1 className="font-display text-display">Your holdings</h1>
          {state === 'loaded' && holdings.length > 0 && (
            <p className="text-caption text-muted-foreground">
              {holdings.length} holding{holdings.length === 1 ? '' : 's'} · {formatInr(String(totalCurrentValue))}
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

        {state === 'loaded' && holdings.length === 0 && (
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

        {state === 'loaded' && holdings.length > 0 && (
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
                  {memberHoldings.map((holding) => {
                    const instrument = instruments.find((i) => i.id === holding.instrumentId)
                    return (
                      <button
                        key={holding.id}
                        type="button"
                        onClick={() => openEditSheet(holding)}
                        className="w-full rounded-lg border p-4 text-left"
                      >
                        <p className="text-body font-medium">{instrument?.name ?? 'Holding'}</p>
                        <p className="text-caption text-muted-foreground capitalize">
                          {holding.assetClass} · {formatInr(holding.currentValue)} current
                        </p>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {state === 'loaded' && holdings.length > 0 && (
        <Button
          onClick={openAddSheet}
          size="icon"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg"
          aria-label="Record a holding"
        >
          +
        </Button>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
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
              onSaved={handleSaved}
            />
          </div>
        </SheetContent>
      </Sheet>
    </main>
  )
}
