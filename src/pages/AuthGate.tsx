import { useState } from 'react'
import { SignIn, SignUp } from '@clerk/clerk-react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'

type View = 'sign-in' | 'sign-up'

/**
 * Clerk's prebuilt <SignIn>/<SignUp> (virtual routing, no dedicated routes)
 * handle credential validation, error display, and OAuth — safer and less
 * code than a hand-rolled form. Trade-off: Clerk doesn't expose a failure
 * callback from these components, so signup_failed/login_failed (listed in
 * METRICS_PLAN.md) aren't instrumented this slice — logged as a deliberate
 * scope trim, not a silent gap (see Documentation/plan/PROGRESS.md).
 * *_completed fires via the fallbackRedirectUrl signal, read in App.tsx.
 */
export function AuthGate() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<View>(searchParams.get('authView') === 'sign-up' ? 'sign-up' : 'sign-in')

  function toggleView() {
    const next: View = view === 'sign-in' ? 'sign-up' : 'sign-in'
    setView(next)
    setSearchParams(next === 'sign-up' ? { authView: 'sign-up' } : {}, { replace: true })
  }

  return (
    <main className="min-h-screen bg-background text-foreground font-sans flex flex-col items-center justify-center gap-6 px-4 py-12">
      <header className="text-center space-y-1">
        <p className="section-label">Household Financial Planning</p>
        <h1 className="font-display text-display">{view === 'sign-in' ? 'Welcome back.' : 'Create your account.'}</h1>
      </header>

      {view === 'sign-in' ? (
        <SignIn routing="virtual" fallbackRedirectUrl="/?auth=login" />
      ) : (
        <SignUp routing="virtual" fallbackRedirectUrl="/?auth=signup" />
      )}

      <Button variant="link" onClick={toggleView}>
        {view === 'sign-in' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
      </Button>
    </main>
  )
}
