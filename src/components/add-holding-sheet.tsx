import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Link } from 'react-router-dom'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { HoldingForm } from '@/components/holding-form'
import { Unlock } from '@/pages/Unlock'
import { completeKeySetup, resolveVaultState } from '@/lib/key-setup'
import { listFamilyMembers, type FamilyMember } from '@/lib/family-members-api'
import type { HouseholdKeys } from '@/lib/household-keys-api'
import type { Holding } from '@/lib/holdings-api'
import type { Instrument } from '@/lib/instruments-api'

/**
 * The "+ Add" sheet on Explore, for one instrument.
 *
 * `/explore/*` is routed deliberately OUTSIDE `HouseholdGate`, so nothing has
 * established that this browser can read household data by the time the sheet
 * opens. A Clerk session is not the gate that matters: `listFamilyMembers` and
 * `createHolding` both call `openVault()`, which throws while the vault is
 * locked. So this component resolves vault readiness itself, mirroring the
 * gate's two layers, but rendering every outcome INLINE and never navigating
 * away from the page the user is browsing.
 *
 * Controlled by design: each entry point owns its own trigger and its own open
 * state, so the sheet renders no trigger at all.
 */
interface AddHoldingSheetProps {
  instrument: Instrument
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fired after a successful save, so the caller can mark the instrument held. */
  onAdded: (holding: Holding) => void
}

type Resolution =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; members: FamilyMember[] }
  | { status: 'no-members' }
  | { status: 'unlock'; keys: HouseholdKeys }
  | { status: 'key-setup' }
  | { status: 'unrecoverable' }
  | { status: 'predates-encryption' }
  | { status: 'error' }

export function AddHoldingSheet({ instrument, open, onOpenChange, onAdded }: AddHoldingSheetProps) {
  const { getToken, isSignedIn } = useAuth()
  const [resolution, setResolution] = useState<Resolution>({ status: 'idle' })
  const [reloadToken, setReloadToken] = useState(0)

  /** Re-run resolution after a self-heal. */
  const reload = useCallback(() => setReloadToken((n) => n + 1), [])

  useEffect(() => {
    // HARD CONSTRAINT: resolution is driven by `open`, never by mount. A
    // stranger browsing /explore must cost zero authenticated network calls,
    // so nothing below runs until the sheet is actually opened.
    if (!open) return
    // Signed out is answered from the Clerk session alone. No token, no probe,
    // no vault work: there is nothing on the server to resolve against.
    if (!isSignedIn) return

    let cancelled = false
    setResolution({ status: 'loading' })
    ;(async () => {
      try {
        const token = await getToken()
        const vaultState = await resolveVaultState(token)
        if (cancelled) return

        if (vaultState.state === 'unlock') {
          setResolution({ status: 'unlock', keys: vaultState.keys })
          return
        }
        if (vaultState.state === 'key-setup') {
          setResolution({ status: 'key-setup' })
          return
        }
        if (vaultState.state === 'unrecoverable') {
          setResolution({ status: 'unrecoverable' })
          return
        }
        if (vaultState.state === 'predates-encryption') {
          setResolution({ status: 'predates-encryption' })
          return
        }
        if (vaultState.state === 'completing-setup') {
          // Same self-heal as HouseholdGate: the household row was written, the
          // key row was not, and this browser still holds both halves. Finish
          // it silently, then resolve again. The user decides nothing here.
          await completeKeySetup(token)
          if (cancelled) return
          reload()
          return
        }

        const memberList = await listFamilyMembers(token)
        if (cancelled) return
        setResolution(
          memberList.members.length === 0 ? { status: 'no-members' } : { status: 'ready', members: memberList.members },
        )
      } catch {
        if (cancelled) return
        // Never a silent swallow: every failure becomes a visible line.
        setResolution({ status: 'error' })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, isSignedIn, getToken, reloadToken, reload])

  function handleSaved(holding: Holding) {
    onOpenChange(false)
    onAdded(holding)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add {instrument.name}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {!isSignedIn ? (
            <>
              <p className="text-body text-muted-foreground">
                Sign in to add this to your plan. Your holdings are encrypted in your browser.
              </p>
              <Link to="/sign-in" className="inline-flex min-h-11 items-center text-body underline underline-offset-4">
                Sign in
              </Link>
            </>
          ) : resolution.status === 'loading' || resolution.status === 'idle' ? (
            <>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : resolution.status === 'ready' ? (
            <HoldingForm
              members={resolution.members}
              instruments={[instrument]}
              initialInstrumentId={instrument.id}
              submitLabel="Add to plan"
              submittingLabel="Adding…"
              analyticsSurface="explore"
              /* Deliberately no ledgerId. Both Explore entry points write to
                 the baseline Current ledger by decision D-023: there is no
                 ledger picker on Explore, so `createHolding` is called with no
                 ledgerId and the holding lands in Current. */
              onSaved={handleSaved}
            />
          ) : resolution.status === 'no-members' ? (
            <>
              <p className="text-body text-muted-foreground">
                Finish setting up your household first. Add the people in it, then come back here.
              </p>
              <Link to="/dashboard" className="inline-flex min-h-11 items-center text-body underline underline-offset-4">
                Go to your dashboard
              </Link>
            </>
          ) : resolution.status === 'unlock' ? (
            /* The real unlock screen, embedded. Reused rather than reimplemented
               on purpose: it owns the one-message-per-method failure behaviour,
               which must not be duplicated and allowed to diverge. `embedded`
               changes presentation only. On success, re-run this sheet's own
               resolution so the user falls through to the form in place. */
            <Unlock keys={resolution.keys} embedded onUnlocked={reload} />
          ) : resolution.status === 'key-setup' ? (
            <>
              <p className="text-body text-muted-foreground">
                You haven't created a household yet. Set one up, then add this.
              </p>
              <Link to="/dashboard" className="inline-flex min-h-11 items-center text-body underline underline-offset-4">
                Go to your dashboard
              </Link>
            </>
          ) : resolution.status === 'unrecoverable' ? (
            <>
              <p className="text-body text-muted-foreground">
                This household can't be opened. Nothing has been changed or removed.
              </p>
              <Link to="/dashboard" className="inline-flex min-h-11 items-center text-body underline underline-offset-4">
                Go to your dashboard
              </Link>
            </>
          ) : resolution.status === 'predates-encryption' ? (
            <>
              <p className="text-body text-muted-foreground">
                This household came before encryption, so it can't be shown here yet.
              </p>
              <Link to="/dashboard" className="inline-flex min-h-11 items-center text-body underline underline-offset-4">
                Go to your dashboard
              </Link>
            </>
          ) : (
            <p className="text-body text-muted-foreground">Something went wrong. Please try again.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
