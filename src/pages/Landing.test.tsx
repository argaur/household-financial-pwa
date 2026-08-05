import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expectStructuralA11y } from '@/test/a11y'
import { expectNoAxeViolations } from '@/test/axe'
import { PRIVACY_CLAIM } from '@/lib/privacy-note'
import { LANDING_HERO, LANDING_PRIVACY, HOW_IT_WORKS } from '@/lib/landing-content'
import { Landing } from './Landing'

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

beforeEach(() => track.mockClear())

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  )
}

describe('Landing', () => {
  it('leads with a headline that names the household, not an individual', () => {
    renderLanding()
    expect(screen.getByRole('heading', { level: 1, name: LANDING_HERO.headline })).toBeInTheDocument()
    // The whole point of the product is household-level planning; the hero
    // must say so without the visitor reading past the first heading.
    expect(`${LANDING_HERO.headline} ${LANDING_HERO.body}`).toMatch(/family|household/i)
  })

  it('hands off to sign-in as a deliberate act — CTAs link to /sign-in, no Clerk box on this page', () => {
    renderLanding()
    const primary = screen.getByRole('link', { name: LANDING_HERO.primaryCta })
    expect(primary).toHaveAttribute('href', '/sign-in?authView=sign-up')
    const signIn = screen.getByRole('link', { name: LANDING_HERO.secondaryCta })
    expect(signIn).toHaveAttribute('href', '/sign-in')
  })

  it('makes the privacy claim in exactly the words /privacy uses — the two must never drift apart', () => {
    renderLanding()
    expect(LANDING_PRIVACY.headline).toBe(PRIVACY_CLAIM.headline)
    expect(screen.getByRole('heading', { name: PRIVACY_CLAIM.headline })).toBeInTheDocument()
  })

  it('links the limits of the privacy claim, one click away (D-014: the strong claim, never a stronger one)', () => {
    renderLanding()
    const privacyLink = screen.getByRole('link', { name: new RegExp(LANDING_PRIVACY.limitLink, 'i') })
    expect(privacyLink).toHaveAttribute('href', '/privacy')
  })

  it('states the cost of the claim — a lost passphrase and recovery code means the data is gone', () => {
    renderLanding()
    expect(screen.getByText(/your data is gone/i)).toBeInTheDocument()
  })

  it('never uses the words the claim does not support', () => {
    const { container } = renderLanding()
    // D-014: "we cannot read your data", NOT "impossible to break". These
    // words would each be an overclaim; none may appear on the front door.
    expect(container.textContent).not.toMatch(/unhackable|impossible to break|zero.knowledge|military.grade|bank.grade/i)
  })

  it('shows the three-step loop so a stranger can see what the product does', () => {
    renderLanding()
    for (const step of HOW_IT_WORKS) {
      expect(screen.getByRole('heading', { name: step.heading })).toBeInTheDocument()
    }
  })

  it('lets a visitor see the product before committing — public library and reasoning are linked', () => {
    renderLanding()
    const links = screen.getAllByRole('link')
    const hrefs = links.map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/explore')
    expect(hrefs).toContain('/why')
  })

  it('says plainly that it is education, not advice', () => {
    renderLanding()
    expect(screen.getByText(/education, not advice/i)).toBeInTheDocument()
    expect(screen.getByText(/SEBI-registered/i)).toBeInTheDocument()
  })

  it('fires landing_viewed once on mount, and cta_clicked with the registered shape on the primary CTA', () => {
    renderLanding()
    expect(track).toHaveBeenCalledWith('feature_used', { feature_name: 'landing_viewed' })
    fireEvent.click(screen.getByRole('link', { name: LANDING_HERO.primaryCta }))
    expect(track).toHaveBeenCalledWith('cta_clicked', {
      cta_name: 'create_your_plan',
      surface: 'landing',
      destination: '/sign-in?authView=sign-up',
    })
  })

  it('has zero axe violations', async () => {
    const { container } = renderLanding()
    await expectNoAxeViolations(container)
  })

  it('passes structural a11y — exactly one h1, every tap target sized to 44px', () => {
    const { container } = renderLanding()
    expectStructuralA11y(container)
  })
})
