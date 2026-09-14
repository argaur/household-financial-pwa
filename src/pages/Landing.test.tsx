import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expectStructuralA11y } from '@/test/a11y'
import { expectNoAxeViolations } from '@/test/axe'
import { PRIVACY_CLAIM } from '@/lib/privacy-note'
import * as landingContent from '@/lib/landing-content'
import {
  LANDING_HERO,
  LANDING_PRIVACY,
  HOW_IT_WORKS,
  LANDING_TRUST,
  LANDING_PROBLEM,
  LANDING_FIGURES,
  LANDING_BUILT,
  LANDING_CREDIT,
} from '@/lib/landing-content'
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

describe('Landing — guilloché rosette placement', () => {
  function motifClasses() {
    const { container } = renderLanding()
    const svg = container.querySelector('[data-testid="guilloche-motif"]')
    if (!svg) throw new Error('Landing rendered no guilloché rosette')
    return svg.getAttribute('class') ?? ''
  }

  /*
    2026-09-13, reported from a real phone: the rosette rendered "trimmed",
    not as a complete circle. Root cause is geometry, not paint order — the
    motif was a FIXED 420px box inside the hero VaultFrame, which is
    `overflow-hidden` and only 358px wide at the 390px breakpoint (390
    viewport minus the container's 1rem gutters). A 420px circle in a 358px
    clipping box loses 31px off BOTH vertical edges, so the outer hairline
    ring was sliced flat left and right.

    The folio's intent is that the plate trims the rosette at the TOP edge
    only. These tests pin that: the motif's box may never be wider than the
    frame that clips it, so only the deliberate upward offset does any
    cutting.

    WHAT THESE THREE TESTS CANNOT DO, STATED PLAINLY. They assert class names.
    jsdom performs no layout and resolves no media query, so not one of them
    measures a rendered pixel and none of them would fail if the rosette were
    visibly clipped again by some other means (a parent's width, a transform
    on an ancestor, a breakpoint that fires at the wrong width). They pin the
    INTENT — a responsive box rather than a fixed pixel size — and nothing
    more. That is the same blind spot that let the original bug ship: it was
    invisible to 2,114 green tests and obvious on a phone in one second.

    Real 390px verification needs a real device or Chrome's device toolbar and
    is a standing, separately tracked gap in this project (app/CLAUDE.md,
    "Still owed", plus D-022 and D-023 in the decisions log). Deliberately not
    papered over here with a jsdom layout-measurement test, which would report
    zeroes and pass for the wrong reason.
  */
  it('never draws a box wider than the frame that clips it (390px: frame is 358px)', () => {
    const classes = motifClasses()
    expect(classes).toContain('w-full')
    // A fixed width larger than the mobile frame is exactly the defect.
    expect(classes).not.toMatch(/(^|\s)w-\[\d+px\]/)
    expect(classes).not.toMatch(/(^|\s)h-\[\d+px\]/)
  })

  it('offsets upward proportionally, so the top-edge bleed scales with the box', () => {
    const classes = motifClasses()
    // A percentage translate is relative to the element's own size, so the
    // same fraction of the circle is trimmed at every width. A fixed -top
    // pixel value is not: it trims a different fraction at each breakpoint.
    expect(classes).toMatch(/-translate-y-\[\d+%\]/)
    expect(classes).not.toMatch(/-top-\[\d+px\]/)
  })

  it('keeps the desktop rosette at its folio size', () => {
    // md and up the frame is 672px+ wide, so the folio's 560px plate fits
    // whole and must not shrink to the mobile rule.
    expect(motifClasses()).toContain('md:w-[560px]')
  })
})

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

  it('shows the trust strip: free, built in India, and the encryption claim', () => {
    renderLanding()
    for (const item of LANDING_TRUST.items) {
      expect(screen.getAllByText(item).length).toBeGreaterThan(0)
    }
  })

  it('names the actual pain in the problem section before the figures back it up', () => {
    renderLanding()
    for (const beat of LANDING_PROBLEM) {
      expect(screen.getByRole('heading', { name: beat.heading })).toBeInTheDocument()
      expect(screen.getByText(beat.body)).toBeInTheDocument()
    }
  })

  it('shows all four figures with their labels', () => {
    renderLanding()
    for (const figure of LANDING_FIGURES) {
      expect(screen.getByText(figure.value)).toBeInTheDocument()
      expect(screen.getByText(figure.label)).toBeInTheDocument()
    }
  })

  it('names the alternative each build decision beat', () => {
    renderLanding()
    for (const decision of LANDING_BUILT) {
      expect(screen.getByRole('heading', { name: decision.heading })).toBeInTheDocument()
      expect(screen.getByText(new RegExp(`Instead of ${decision.instead}`, 'i'))).toBeInTheDocument()
    }
  })

  it('credits the sole builder in the footer', () => {
    renderLanding()
    expect(screen.getByText(LANDING_CREDIT)).toBeInTheDocument()
  })

  it('pins the style rule: no em-dash or en-dash anywhere in the landing copy', () => {
    const seen = new Set<unknown>()
    const walk = (value: unknown): void => {
      if (typeof value === 'string') {
        expect(value).not.toMatch(/[–—]/)
        return
      }
      if (value === null || typeof value !== 'object') return
      if (seen.has(value)) return
      seen.add(value)
      for (const entry of Object.values(value as Record<string, unknown>)) {
        walk(entry)
      }
    }
    walk(landingContent)
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
