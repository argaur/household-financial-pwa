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

  it('shows the Decision / Instead of / Why structure on each card', () => {
    renderWhy()
    // One label per card, so 8 of each.
    expect(screen.getAllByText('Decision')).toHaveLength(8)
    expect(screen.getAllByText('Instead of')).toHaveLength(8)
    expect(screen.getAllByText('Why')).toHaveLength(8)
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
