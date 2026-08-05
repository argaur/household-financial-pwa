import { Navigate } from 'react-router-dom'
import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { AuthGate } from './AuthGate'

/**
 * Dedicated /sign-in route. The landing page at `/` hands off here, so
 * signing in is a deliberate act rather than the front door itself.
 * A signed-in visitor has nothing to do here and goes back to `/`, where
 * RootGate routes them through the household gate.
 */
export function SignInPage() {
  return (
    <>
      <SignedIn>
        <Navigate to="/" replace />
      </SignedIn>
      <SignedOut>
        <AuthGate />
      </SignedOut>
    </>
  )
}
