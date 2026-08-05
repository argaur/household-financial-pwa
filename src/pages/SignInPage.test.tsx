import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { expectStructuralA11y } from '@/test/a11y'
import { expectNoAxeViolations } from '@/test/axe'
import { SignInPage } from './SignInPage'

let clerkState: 'signed-in' | 'signed-out' = 'signed-out'

vi.mock('@clerk/clerk-react', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => (clerkState === 'signed-in' ? <>{children}</> : null),
  SignedOut: ({ children }: { children: React.ReactNode }) => (clerkState === 'signed-out' ? <>{children}</> : null),
  SignIn: () => <div data-testid="clerk-sign-in" />,
  SignUp: () => <div data-testid="clerk-sign-up" />,
}))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/" element={<div>stub root</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SignInPage', () => {
  it('shows the sign-in view to a signed-out visitor', () => {
    clerkState = 'signed-out'
    renderAt('/sign-in')
    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument()
    expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument()
  })

  it('opens straight onto sign-up when the landing CTA passes ?authView=sign-up', () => {
    clerkState = 'signed-out'
    renderAt('/sign-in?authView=sign-up')
    expect(screen.getByRole('heading', { name: 'Create your account.' })).toBeInTheDocument()
    expect(screen.getByTestId('clerk-sign-up')).toBeInTheDocument()
  })

  it('redirects a signed-in visitor back to /', () => {
    clerkState = 'signed-in'
    renderAt('/sign-in')
    expect(screen.getByText('stub root')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Welcome back.' })).not.toBeInTheDocument()
  })

  it('offers a way back to the landing page — sign-in must not be a dead end', () => {
    clerkState = 'signed-out'
    renderAt('/sign-in')
    const back = screen.getByRole('link', { name: /back/i })
    expect(back).toHaveAttribute('href', '/')
  })

  it('has zero axe violations and 44px tap targets', async () => {
    clerkState = 'signed-out'
    const { container } = renderAt('/sign-in')
    await expectNoAxeViolations(container)
    expectStructuralA11y(container)
  })
})
