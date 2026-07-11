import { useEffect, useRef, useState } from 'react'
import { useAuth, useClerk } from '@clerk/clerk-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { track } from '@/lib/analytics'
import { fetchHousehold, HouseholdApiError, type Household } from '@/lib/household-api'
import { listFamilyMembers, type FamilyMember } from '@/lib/family-members-api'
import { listHoldings } from '@/lib/holdings-api'
import { OnboardingStep1 } from './OnboardingStep1'
import { OnboardingStep2 } from './OnboardingStep2'
import { OnboardingStep3 } from './OnboardingStep3'

type State =
  | 'loading'
  | 'no-household'
  | 'onboarding-members'
  | 'onboarding-holdings'
  | 'has-household'
  | 'error'
  | 'session-expired'

/**
 * Resolves the signed-in user's onboarding position purely from data (no
 * separate "current step" flag persisted): no household -> Step 1; household
 * but no family members yet -> Step 2; members but no holdings yet -> Step 3;
 * household with >=1 holding -> onboarded. A fully onboarded household is
 * deliberately shown as a plain confirmation, not a full dashboard (that's
 * Slice 6).
 */
export function HouseholdGate() {
  const { getToken } = useAuth()
  const { signOut } = useClerk()
  const [state, setState] = useState<State>('loading')
  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const onboardingStartedFired = useRef(new Set<'household' | 'members' | 'holdings'>())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const token = await getToken()
      try {
        const result = await fetchHousehold(token)
        if (cancelled) return
        if (!result) {
          setState('no-household')
          return
        }
        setHousehold(result)
        const memberList = await listFamilyMembers(token)
        if (cancelled) return
        if (memberList.length === 0) {
          setState('onboarding-members')
          return
        }
        setMembers(memberList)
        const holdings = await listHoldings(token)
        if (cancelled) return
        setState(holdings.length === 0 ? 'onboarding-holdings' : 'has-household')
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

  if (state === 'no-household') {
    return (
      <OnboardingStep1
        onHouseholdCreated={(h) => {
          setHousehold(h)
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
          setMembers(memberList)
          setState('onboarding-holdings')
        }}
      />
    )
  }

  if (state === 'onboarding-holdings') {
    return <OnboardingStep3 members={members} onContinue={() => setState('has-household')} />
  }

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg py-12 space-y-4">
        <header className="space-y-1">
          <p className="section-label">Household Financial Planning</p>
          <h1 className="font-display text-display">{household?.name}</h1>
        </header>
        <Separator />
        <p className="text-body text-muted-foreground">Your plan is set up with its first holding recorded.</p>
        <Link to="/portfolio" className="text-body underline">
          View your holdings →
        </Link>
        <Link to="/explore" className="text-body underline">
          Explore what you can invest in →
        </Link>
      </div>
    </main>
  )
}
