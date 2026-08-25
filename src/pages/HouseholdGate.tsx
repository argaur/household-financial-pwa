import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth, useClerk } from '@clerk/clerk-react'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { track } from '@/lib/analytics'
import { fetchHousehold, HouseholdApiError } from '@/lib/household-api'
import { listFamilyMembers, type FamilyMember } from '@/lib/family-members-api'
import { listHoldings } from '@/lib/holdings-api'
import { completeKeySetup, resolveVaultState } from '@/lib/key-setup'
import type { HouseholdKeys } from '@/lib/household-keys-api'
import { KeySetup } from './KeySetup'
import { Unlock } from './Unlock'
import { OnboardingStep1 } from './OnboardingStep1'
import { OnboardingStep2 } from './OnboardingStep2'
import { OnboardingStep3 } from './OnboardingStep3'

type State =
  | 'loading'
  | 'key-setup'
  | 'unlock'
  | 'unrecoverable'
  | 'predates-encryption'
  | 'household-unreadable'
  | 'household-not-yet-encrypted'
  | 'no-household'
  | 'onboarding-members'
  | 'onboarding-holdings'
  | 'has-household'
  | 'error'
  | 'session-expired'

/**
 * Resolves the signed-in user's position purely from data, in two layers.
 *
 * First the **encryption** layer: is there key material, and can this browser
 * open it? `resolveVaultState` answers that, including every state an
 * interrupted setup can leave behind — none of which is an "error", and none of
 * which may be repaired by deleting anything.
 *
 * Then the **onboarding** layer, unchanged: no household -> Step 1; household
 * but no family members yet -> Step 2; members but no holdings yet -> Step 3;
 * household with >=1 holding -> onboarded, redirected to /dashboard.
 *
 * `/explore` and `/why` are routed outside this gate and stay open with no
 * account at all.
 */
export function HouseholdGate() {
  const { getToken } = useAuth()
  const { signOut } = useClerk()
  const [state, setState] = useState<State>('loading')
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [householdKeys, setHouseholdKeys] = useState<HouseholdKeys | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const onboardingStartedFired = useRef(new Set<'household' | 'members' | 'holdings'>())

  /** Re-run the whole resolution — after an unlock, or after a self-heal. */
  const reload = useCallback(() => setReloadToken((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const token = await getToken()
      try {
        const vaultState = await resolveVaultState(token)
        if (cancelled) return

        if (vaultState.state === 'key-setup') {
          setState('key-setup')
          return
        }
        if (vaultState.state === 'unlock') {
          setHouseholdKeys(vaultState.keys)
          setState('unlock')
          return
        }
        if (vaultState.state === 'unrecoverable') {
          setState('unrecoverable')
          return
        }
        // Must return here rather than fall through: `fetchHousehold` below
        // opens the vault, and this user has no key at all — reaching it would
        // throw and show a generic error over data that is perfectly intact.
        if (vaultState.state === 'predates-encryption') {
          setState('predates-encryption')
          return
        }
        if (vaultState.state === 'completing-setup') {
          // The common interruption: the household row was written, the key row
          // was not, and this browser still holds both halves. Finish it here,
          // silently — the user did nothing wrong and has nothing to decide.
          // A 409 means the row is already there; either way the next pass
          // resolves normally, and neither outcome is ever retried with force.
          await completeKeySetup(token)
          if (cancelled) return
          reload()
          return
        }

        const result = await fetchHousehold(token)
        if (cancelled) return
        if (result.state === 'absent') {
          setState('no-household')
          return
        }
        // Neither of these is "no household" (which would offer to create a
        // second one) and neither is a generic error: one means the row predates
        // encryption, the other that the key in this browser cannot open it.
        if (result.state === 'not-yet-encrypted') {
          setState('household-not-yet-encrypted')
          return
        }
        if (result.state === 'unreadable') {
          setState('household-unreadable')
          return
        }

        const memberList = await listFamilyMembers(token)
        if (cancelled) return
        if (memberList.members.length === 0) {
          setState('onboarding-members')
          return
        }
        setMembers(memberList.members)
        const holdings = await listHoldings(token)
        if (cancelled) return
        setState(holdings.holdings.length === 0 ? 'onboarding-holdings' : 'has-household')
      } catch (err) {
        if (cancelled) return
        setState(err instanceof HouseholdApiError && err.status === 401 ? 'session-expired' : 'error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [getToken, reloadToken, reload])

  useEffect(() => {
    if (state === 'no-household' && !onboardingStartedFired.current.has('household')) {
      onboardingStartedFired.current.add('household')
      track('onboarding_started', { step: 'household' })
    }
    if (state === 'onboarding-members' && !onboardingStartedFired.current.has('members')) {
      onboardingStartedFired.current.add('members')
      track('onboarding_started', { step: 'members' })
    }
    if (state === 'onboarding-holdings' && !onboardingStartedFired.current.has('holdings')) {
      onboardingStartedFired.current.add('holdings')
      track('onboarding_started', { step: 'holdings' })
    }
  }, [state])

  if (state === 'loading') {
    return (
      <main className="min-h-screen bg-background text-foreground font-sans">
        <div className="container max-w-lg py-12 space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24 w-full" />
        </div>
      </main>
    )
  }

  if (state === 'error') {
    return (
      <main className="min-h-screen bg-background text-foreground font-sans">
        <div className="container max-w-lg py-12 space-y-2">
          <h1 className="text-title">Something went wrong</h1>
          <p className="text-body text-muted-foreground">
            We couldn't load your household. Refresh the page to try again.
          </p>
        </div>
      </main>
    )
  }

  if (state === 'session-expired') {
    return (
      <main className="min-h-screen bg-background text-foreground font-sans">
        <div className="container max-w-lg py-12 space-y-4">
          <h1 className="text-title">Your session has ended.</h1>
          <p className="text-body text-muted-foreground">Sign in to continue.</p>
          <Button onClick={() => signOut()}>Sign in</Button>
        </div>
      </main>
    )
  }

  if (state === 'key-setup') {
    return (
      <KeySetup
        onReady={() => {
          // The vault is open under a brand-new household id; the household row
          // itself does not exist yet, so Step 1 comes next and the key material
          // is posted the moment it does.
          setState('no-household')
        }}
      />
    )
  }

  if (state === 'unlock' && householdKeys) {
    return <Unlock keys={householdKeys} onUnlocked={reload} />
  }

  if (state === 'unrecoverable') {
    return (
      <main className="min-h-screen bg-background text-foreground font-sans">
        <div className="container max-w-lg py-12 space-y-4">
          <h1 className="font-serif text-display">This household can't be opened.</h1>
          <p className="text-body text-muted-foreground">
            Your household was created, but the encrypted key that opens it was never saved. The setup was interrupted
            before that last step, and the only copy lived in a browser that no longer has it. We are not able to read
            this data and neither is anyone else: it cannot be recovered, by us or by you.
          </p>
          <p className="text-body text-muted-foreground">
            Nothing has been changed or removed. If you want to start again, you can delete the account and everything
            in it from your profile. That is a deliberate, confirmed step, and we will not take it for you.
          </p>
          <a
            href="/profile"
            className="inline-flex min-h-11 items-center text-body text-destructive underline underline-offset-4"
          >
            Go to your profile to delete this account
          </a>
        </div>
      </main>
    )
  }

  if (state === 'predates-encryption') {
    return (
      <main className="min-h-screen bg-background text-foreground font-sans">
        <div className="container max-w-lg py-12 space-y-4">
          <h1 className="font-serif text-display">This household came before encryption.</h1>
          <p className="text-body text-muted-foreground">
            It was created before your data was encrypted, so there is nothing sealed here to open. Your information is
            stored exactly as it was. Nothing has been changed, and nothing has been lost.
          </p>
          <p className="text-body text-muted-foreground">
            This version of the app cannot show it yet, and it will not delete or overwrite anything while it waits.
          </p>
        </div>
      </main>
    )
  }

  if (state === 'household-unreadable') {
    return (
      <main className="min-h-screen bg-background text-foreground font-sans">
        <div className="container max-w-lg py-12 space-y-4">
          <h1 className="font-serif text-display">We couldn't read your household.</h1>
          <p className="text-body text-muted-foreground">
            The key in this browser doesn't match the data stored for this household. Nothing has been changed. Unlock
            again with your passphrase or your recovery code. If the right one opens it, your data is intact.
          </p>
          <Button onClick={reload}>Try unlocking again</Button>
        </div>
      </main>
    )
  }

  if (state === 'household-not-yet-encrypted') {
    return (
      <main className="min-h-screen bg-background text-foreground font-sans">
        <div className="container max-w-lg py-12 space-y-4">
          <h1 className="font-serif text-display">Your household needs its name again.</h1>
          <p className="text-body text-muted-foreground">
            This household was created before your data was encrypted, so its name was never sealed with your key.
            Nothing else is affected. Set the name again from your profile and everything reconnects.
          </p>
          <a
            href="/profile"
            className="inline-flex min-h-11 items-center text-body underline underline-offset-4"
          >
            Go to your profile
          </a>
        </div>
      </main>
    )
  }

  if (state === 'no-household') {
    return (
      <OnboardingStep1
        onHouseholdCreated={async () => {
          const token = await getToken()
          // The household row now exists, so its key material finally has a
          // foreign key to hang off. This is step 3 of the setup ordering; if
          // it fails here, `resolveVaultState` picks it up on the next load.
          await completeKeySetup(token)
          setState('onboarding-members')
        }}
      />
    )
  }

  if (state === 'onboarding-members') {
    return (
      <OnboardingStep2
        onContinue={async () => {
          const token = await getToken()
          const memberList = await listFamilyMembers(token)
          setMembers(memberList.members)
          setState('onboarding-holdings')
        }}
      />
    )
  }

  if (state === 'onboarding-holdings') {
    return <OnboardingStep3 members={members} onContinue={() => setState('has-household')} />
  }

  return <Navigate to="/dashboard" replace />
}
