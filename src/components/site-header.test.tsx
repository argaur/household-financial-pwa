import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SiteHeader } from './site-header'
import { expectNoAxeViolations } from '@/test/axe'

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

let clerkState: 'signed-in' | 'signed-out' = 'signed-out'
vi.mock('@clerk/clerk-react', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) =>
    clerkState === 'signed-in' ? <>{children}</> : null,
  SignedOut: ({ children }: { children: React.ReactNode }) =>
    clerkState === 'signed-out' ? <>{children}</> : null,
}))

function renderHeader(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SiteHeader />
    </MemoryRouter>,
  )
}

describe('SiteHeader', () => {
  beforeEach(() => {
    clerkState = 'signed-out'
    document.documentElement.classList.remove('dark')
    window.localStorage.clear()
    track.mockClear()
  })

  it('signed out: shows the public nav with sign-in, no account surfaces', () => {
    renderHeader()
    expect(screen.getByRole('link', { name: 'Explore' })).toHaveAttribute('href', '/explore')
    expect(screen.getByRole('link', { name: "How it's built" })).toHaveAttribute('href', '/why')
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    expect(screen.queryByRole('link', { name: 'Your plan' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Holdings' })).not.toBeInTheDocument()
  })

  it('signed in: shows the account nav and drops sign-in', () => {
    clerkState = 'signed-in'
    renderHeader()
    expect(screen.getByRole('link', { name: 'Your plan' })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: 'Holdings' })).toHaveAttribute('href', '/portfolio')
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/profile')
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('marks the current section with aria-current', () => {
    renderHeader('/explore')
    expect(screen.getByRole('link', { name: 'Explore' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Privacy' })).not.toHaveAttribute('aria-current')
  })

  it('wordmark links home', () => {
    renderHeader('/explore')
    expect(screen.getByRole('link', { name: 'Household Financial Planning' })).toHaveAttribute('href', '/')
  })

  it('theme toggle flips the dark class, persists, and reports as feature usage', () => {
    renderHeader()
    const toggle = screen.getByRole('button', { name: 'Switch to dark theme' })
    fireEvent.click(toggle)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem('theme:preference')).toBe('dark')
    expect(track).toHaveBeenCalledWith('feature_used', { feature_name: 'theme_toggled', theme: 'dark' })

    // Button now offers the way back.
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem('theme:preference')).toBe('light')
  })

  it('contains no h1 (screens own their single h1)', () => {
    const { container } = renderHeader()
    expect(container.querySelectorAll('h1').length).toBe(0)
  })

  it('every interactive element is sized to the 44px floor', () => {
    const { container } = renderHeader()
    for (const el of container.querySelectorAll<HTMLElement>('button, a[href]')) {
      expect(
        /(^|\s)(h-11|min-h-11|h-\[44px\])(\s|$)/.test(el.getAttribute('class') ?? ''),
        `tap target not sized to 44px: ${el.textContent?.trim() || el.getAttribute('aria-label')}`,
      ).toBe(true)
    }
  })

  it('has zero axe violations in both auth states', async () => {
    const signedOut = renderHeader()
    await expectNoAxeViolations(signedOut.container)
    signedOut.unmount()

    clerkState = 'signed-in'
    const signedIn = renderHeader()
    await expectNoAxeViolations(signedIn.container)
  })
})
