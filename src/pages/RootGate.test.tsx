import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RootGate } from './RootGate'

/**
 * The behavioural change under test: a signed-out visitor to `/` gets the
 * landing page, not the Clerk sign-in box. Sign-in is a deliberate act at
 * /sign-in — being dropped onto it was the old front door and must not
 * silently come back.
 */

let clerkState: 'signed-in' | 'signed-out' = 'signed-out'

vi.mock('@clerk/clerk-react', () => ({
  ClerkLoading: () => null,
  ClerkLoaded: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedIn: ({ children }: { children: React.ReactNode }) => (clerkState === 'signed-in' ? <>{children}</> : null),
  SignedOut: ({ children }: { children: React.ReactNode }) => (clerkState === 'signed-out' ? <>{children}</> : null),
}))

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('./Landing', () => ({ Landing: () => <div>stub landing</div> }))
vi.mock('./HouseholdGate', () => ({ HouseholdGate: () => <div>stub household gate</div> }))
vi.mock('./HomeShell', () => ({ HomeShell: () => <div>stub home shell</div> }))

function renderGate() {
  return render(
    <MemoryRouter>
      <RootGate />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_stub')
})

describe('RootGate', () => {
  it('shows the landing page to a signed-out visitor — not the sign-in box', () => {
    clerkState = 'signed-out'
    renderGate()
    expect(screen.getByText('stub landing')).toBeInTheDocument()
    expect(screen.queryByText('stub household gate')).not.toBeInTheDocument()
  })

  it('sends a signed-in visitor through the household gate, not the landing page', () => {
    clerkState = 'signed-in'
    renderGate()
    expect(screen.getByText('stub household gate')).toBeInTheDocument()
    expect(screen.queryByText('stub landing')).not.toBeInTheDocument()
  })

  it('falls back to the walking skeleton when Clerk is not configured (local dev without env)', () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '')
    renderGate()
    expect(screen.getByText('stub home shell')).toBeInTheDocument()
  })
})
