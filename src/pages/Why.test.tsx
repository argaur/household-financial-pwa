import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Why } from './Why'
import { WHY_SECTIONS, WHY_REPO_URL } from '@/lib/why-decisions'
import { expectNoAxeViolations } from '@/test/axe'

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

beforeEach(() => track.mockClear())

function renderWhy() {
  return render(
    <MemoryRouter>
      <Why />
    </MemoryRouter>,
  )
}

describe('Why', () => {
  it('renders both section labels', () => {
    renderWhy()
    expect(screen.getByText('Product judgment')).toBeInTheDocument()
    expect(screen.getByText('Engineering')).toBeInTheDocument()
  })

  it('renders every decision card heading from the content module', () => {
    renderWhy()
    const headings = WHY_SECTIONS.flatMap((s) => s.decisions.map((d) => d.heading))
    expect(headings.length).toBe(8)
    for (const heading of headings) {
      expect(screen.getByText(heading)).toBeInTheDocument()
    }
  })

  it('renders each card as a decision line plus one flowing "Instead of" line, no labeled dl', () => {
    renderWhy()
    // The old 3-label definition list (Decision / Instead of / Why as their
    // own all-caps mini-headers) is gone — those exact standalone labels
    // must not appear as separate text nodes anymore.
    expect(screen.queryByText('Decision')).not.toBeInTheDocument()
    expect(screen.queryByText('Why')).not.toBeInTheDocument()
    for (const section of WHY_SECTIONS) {
      for (const d of section.decisions) {
        expect(screen.getByText(d.decision)).toBeInTheDocument()
        expect(screen.getByText(`Instead of ${d.insteadOf}`)).toBeInTheDocument()
      }
    }
  })

  it('links to the public repo', () => {
    renderWhy()
    const repoLink = screen.getByRole('link', { name: /source|github|repo/i })
    expect(repoLink).toHaveAttribute('href', WHY_REPO_URL)
  })

  it('fires why_page_viewed once on mount', () => {
    renderWhy()
    expect(track).toHaveBeenCalledWith('why_page_viewed', {})
    expect(track).toHaveBeenCalledTimes(1)
  })

  // /why is one of the five screens documented at zero axe violations live
  // (see CLAUDE.md). This scan is cheap and re-proves that baseline still
  // holds — if it ever finds a real violation, that is a regression worth
  // stopping for, not weakening the assertion to get past.
  it('has zero axe violations', async () => {
    const { container } = renderWhy()
    await expectNoAxeViolations(container)
  })
})
