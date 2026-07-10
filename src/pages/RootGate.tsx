import { useEffect, useRef } from 'react'
import { ClerkLoaded, ClerkLoading, SignedIn, SignedOut } from '@clerk/clerk-react'
import { useSearchParams } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { track } from '@/lib/analytics'
import { AuthGate } from './AuthGate'
import { HouseholdGate } from './HouseholdGate'
import { HomeShell } from './HomeShell'

/**
 * Fires signup_completed/login_completed exactly once after Clerk redirects
 * back with ?auth=signup|login (set via fallbackRedirectUrl in AuthGate),
 * then strips the param so a refresh doesn't refire it.
 */
function useAuthCompletionTracking() {
  const [searchParams, setSearchParams] = useSearchParams()
  const fired = useRef(false)

  useEffect(() => {
    const auth = searchParams.get('auth')
    if (!auth || fired.current) return
    fired.current = true

    if (auth === 'signup') track('signup_completed', { method: 'email', source: 'onboarding' })
    else if (auth === 'login') track('login_completed', { method: 'email' })

    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])
}

export function RootGate() {
  useAuthCompletionTracking()

  useEffect(() => {
    track('page_viewed', { path: '/', referrer: document.referrer })
  }, [])

  const clerkConfigured = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)
  if (!clerkConfigured) return <HomeShell />

  return (
    <>
      <ClerkLoading>
        <main className="min-h-screen bg-background flex items-center justify-center">
          <Skeleton className="h-8 w-48" />
        </main>
      </ClerkLoading>
      <ClerkLoaded>
        <SignedOut>
          <AuthGate />
        </SignedOut>
        <SignedIn>
          <HouseholdGate />
        </SignedIn>
      </ClerkLoaded>
    </>
  )
}
