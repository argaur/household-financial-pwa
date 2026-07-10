import { useEffect, useRef, useState } from 'react'
import { useAuth, useClerk } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { track } from '@/lib/analytics'
import { fetchHousehold, HouseholdApiError, type Household } from '@/lib/household-api'
import { OnboardingStep1 } from './OnboardingStep1'

type State = 'loading' | 'no-household' | 'has-household' | 'error' | 'session-expired'

/**
 * Resolves whether the signed-in user already has a household. Steps 2/3
 * (family members, holdings) ship in later slices — a household with no
 * further onboarding UI yet is deliberately shown as a plain confirmation,
 * not a full dashboard (that's Slice 6).
 */
export function HouseholdGate() {
  const { getToken } = useAuth()
  const { signOut } = useClerk()
  const [state, setState] = useState<State>('loading')
  const [household, setHousehold] = useState<Household | null>(null)
  const onboardingStartedFired = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const token = await getToken()
      try {
        const result = await fetchHousehold(token)
        if (cancelled) return
        if (result) {
          setHousehold(result)
          setState('has-household')
        } else {
          setState('no-household')
        }
      } catch (err) {
        if (cancelled) return
        setState(err instanceof HouseholdApiError && err.status === 401 ? 'session-expired' : 'error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [getToken])

  useEffect(() => {
    if (state === 'no-household' && !onboardingStartedFired.current) {
      onboardingStartedFired.current = true
      track('onboarding_started', { step: 'household' })
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

  if (state === 'no-household') {
    return (
      <OnboardingStep1
        onHouseholdCreated={(h) => {
          setHousehold(h)
          setState('has-household')
        }}
      />
    )
  }

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg py-12 space-y-4">
        <header className="space-y-1">
          <p className="section-label">Household Financial Planning</p>
          <h1 className="font-display text-display">{household?.name}</h1>
        </header>
        <Separator />
        <p className="text-body text-muted-foreground">
          Your household is set up. Adding family members and holdings comes next — that part of onboarding ships
          in an upcoming slice.
        </p>
      </div>
    </main>
  )
}
