import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NudgeCard } from './nudge-card'
import type { Nudge } from '@/lib/dashboard-api'

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

function renderCard(nudge: Nudge) {
  return render(
    <MemoryRouter>
      <NudgeCard nudge={nudge} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  track.mockClear()
})

describe('NudgeCard — copy (Documentation/design/COPY_DECK.md)', () => {
  it('check 1: interpolates the member name into body and CTA', () => {
    renderCard({ checkId: 'member_coverage', learnCardSlug: 'portfolio', memberName: 'Meera' })
    expect(screen.getByText(/^Meera has no holdings recorded yet\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Add a holding for Meera/ })).toBeInTheDocument()
  })

  it('check 1: falls back to neutral wording when no member name is available', () => {
    renderCard({ checkId: 'member_coverage', learnCardSlug: 'portfolio' })
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link')).toBeInTheDocument()
  })

  it('check 2: emergency fund copy, verbatim', () => {
    renderCard({ checkId: 'emergency_fund', learnCardSlug: 'debt-fixed-deposit' })
    expect(
      screen.getByText(
        "Your household has no emergency fund on record. This is the first safety net any plan needs — before any other investment.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Learn about emergency funds/ })).toBeInTheDocument()
  })

  it('check 3: interpolates the unprotected parent name', () => {
    renderCard({ checkId: 'both_parents_protected', learnCardSlug: 'protection', memberName: 'Arun' })
    expect(screen.getByText(/^Arun has no protection cover on record\./)).toBeInTheDocument()
  })

  it('check 4: singular vs plural asset class', () => {
    const { unmount } = renderCard({ checkId: 'asset_diversity', learnCardSlug: 'explore', assetClassCount: 1 })
    expect(screen.getByText(/concentrated in 1 asset class\./)).toBeInTheDocument()
    unmount()

    renderCard({ checkId: 'asset_diversity', learnCardSlug: 'explore', assetClassCount: 2 })
    expect(screen.getByText(/concentrated in 2 asset classes\./)).toBeInTheDocument()
  })

  it('check 5: stale-value copy', () => {
    renderCard({ checkId: 'no_stale_values', learnCardSlug: 'portfolio' })
    expect(screen.getByText(/don't have an up-to-date current value/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Update holdings/ })).toBeInTheDocument()
  })

  it('complete: renders an affirming card, never an empty slot', () => {
    renderCard({ checkId: 'complete', learnCardSlug: 'explore' })
    expect(screen.getByText('Next step')).toBeInTheDocument()
    expect(screen.getByRole('link')).toBeInTheDocument()
  })

  it('always renders the "Next step" section label', () => {
    for (const checkId of ['member_coverage', 'emergency_fund', 'both_parents_protected', 'asset_diversity', 'no_stale_values', 'complete'] as const) {
      const { unmount } = renderCard({ checkId, learnCardSlug: 'x' })
      expect(screen.getByText('Next step')).toBeInTheDocument()
      unmount()
    }
  })

  it('never renders a buy action — CTAs are observational only (SPEC.md §7)', () => {
    for (const checkId of ['member_coverage', 'emergency_fund', 'both_parents_protected', 'asset_diversity', 'no_stale_values', 'complete'] as const) {
      const { unmount } = renderCard({ checkId, learnCardSlug: 'x', memberName: 'Meera', assetClassCount: 1 })
      expect(screen.getByRole('link').textContent ?? '').not.toMatch(/\b(buy|invest now|purchase|apply)\b/i)
      unmount()
    }
  })
})

describe('NudgeCard — CTA destinations', () => {
  const cases: [Nudge['checkId'], string][] = [
    ['member_coverage', '/portfolio'],
    ['emergency_fund', '/explore/debt/debt-fixed-deposit'],
    ['both_parents_protected', '/profile'],
    ['asset_diversity', '/explore'],
    ['no_stale_values', '/portfolio'],
    ['complete', '/explore'],
  ]

  it.each(cases)('%s links to %s', (checkId, href) => {
    renderCard({ checkId, learnCardSlug: 'x', assetClassCount: 1 })
    expect(screen.getByRole('link')).toHaveAttribute('href', href)
  })
})

describe('NudgeCard — analytics', () => {
  it('fires learn_card_clicked with check_id and learn_card_slug on CTA click', () => {
    renderCard({ checkId: 'emergency_fund', learnCardSlug: 'debt-fixed-deposit' })
    fireEvent.click(screen.getByRole('link'))
    expect(track).toHaveBeenCalledWith('learn_card_clicked', {
      check_id: 'emergency_fund',
      learn_card_slug: 'debt-fixed-deposit',
    })
  })

  it('does not fire nudge_shown itself — the dashboard owns that once-per-load', () => {
    renderCard({ checkId: 'emergency_fund', learnCardSlug: 'debt-fixed-deposit' })
    expect(track).not.toHaveBeenCalledWith('nudge_shown', expect.anything())
  })
})
