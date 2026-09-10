import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AiSuggestionCard, type AiSuggestionAllocation, type AiSuggestionCardProps } from './ai-suggestion-card'

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

const baseAllocations: AiSuggestionAllocation[] = [
  { slug: 'nifty-index-fund', weightPct: 60 },
  { slug: 'gilt-fund', weightPct: 40 },
]

const baseProps: AiSuggestionCardProps = {
  kind: 'goal_plan',
  target: 'ledger',
  allocations: baseAllocations,
  reasoning: 'A simple two-fund mix weighted toward equity for a long horizon.',
  caveat:
    'This is education, not advice. It shows what a mix could look like, based on what you told us. It is not a recommendation to buy anything, and Vittam does not know your full situation.',
  instrumentNamesBySlug: {
    'nifty-index-fund': 'Nifty 50 Index Fund',
    'gilt-fund': 'Gilt Fund',
  },
  totalValueInr: 100000,
  onApply: vi.fn(),
  onDismiss: vi.fn(),
}

beforeEach(() => {
  track.mockReset()
})

function renderCard(overrides: Partial<AiSuggestionCardProps> = {}) {
  const onApply = overrides.onApply ?? vi.fn()
  const onDismiss = overrides.onDismiss ?? vi.fn()
  const utils = render(<AiSuggestionCard {...baseProps} {...overrides} onApply={onApply} onDismiss={onDismiss} />)
  return { ...utils, onApply, onDismiss }
}

describe('AiSuggestionCard', () => {
  it('renders inline as a plain section, never a dialog or toast', () => {
    renderCard()
    // No Radix dialog, no alertdialog, no toast/status-as-error role anywhere.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const heading = screen.getByRole('heading', { name: /one way to think about this goal/i })
    expect(heading.closest('section')).toBeInTheDocument()
  })

  it('renders in the DOM tree where it is mounted, never portaled elsewhere', () => {
    const { container } = renderCard()
    // A Radix portal teleports to a node outside the render container; a
    // plain section stays a descendant of it.
    expect(container.querySelector('section')).not.toBeNull()
  })

  it('Apply and Dismiss are the only two actions on the card', () => {
    renderCard()
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
    expect(screen.getByRole('button', { name: /add these to the plan/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^dismiss$/i })).toBeInTheDocument()
  })

  it('Apply and Dismiss stack full width, and never use the sm: breakpoint', () => {
    renderCard()
    const apply = screen.getByRole('button', { name: /add these to the plan/i })
    const dismiss = screen.getByRole('button', { name: /^dismiss$/i })
    for (const button of [apply, dismiss]) {
      expect(button.className).toMatch(/\bw-full\b/)
      expect(button.className).toMatch(/\bmd:w-auto\b/)
      expect(button.className).not.toMatch(/\bsm:/)
    }
  })

  it('Apply and Dismiss are each at least 44px tall (the shared Button default size, h-11)', () => {
    renderCard()
    // ButtonProps defaults size to 'default', which is h-11 (44px, SPEC.md
    // §6) — neither call site here overrides size, so both buttons carry it.
    const apply = screen.getByRole('button', { name: /add these to the plan/i })
    const dismiss = screen.getByRole('button', { name: /^dismiss$/i })
    expect(apply.className).toMatch(/\bh-11\b/)
    expect(dismiss.className).toMatch(/\bh-11\b/)
  })

  it('invokes onApply and onDismiss exactly once each, and never the other one', () => {
    const { onApply, onDismiss } = renderCard()
    screen.getByRole('button', { name: /add these to the plan/i }).click()
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onDismiss).not.toHaveBeenCalled()

    screen.getByRole('button', { name: /^dismiss$/i }).click()
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('renders each allocation as "{name} · {weight} percent"', () => {
    renderCard()
    const list = screen.getByTestId('ai-suggestion-allocations')
    expect(list).toHaveTextContent('Nifty 50 Index Fund · 60 percent')
    expect(list).toHaveTextContent('Gilt Fund · 40 percent')
  })

  it('falls back to the raw slug when no display name is known for it', () => {
    renderCard({ instrumentNamesBySlug: {} })
    const list = screen.getByTestId('ai-suggestion-allocations')
    expect(list).toHaveTextContent('nifty-index-fund · 60 percent')
  })

  it('shows the model reasoning and the server-attached caveat verbatim', () => {
    renderCard()
    expect(screen.getByText(baseProps.reasoning)).toBeInTheDocument()
    expect(screen.getByText(baseProps.caveat)).toBeInTheDocument()
  })

  it('titles the card for a goal plan vs a counsel review differently, per COPY_DECK.md', () => {
    renderCard({ kind: 'goal_plan' })
    expect(screen.getByRole('heading', { name: /one way to think about this goal/i })).toBeInTheDocument()

    renderCard({ kind: 'counsel' })
    expect(screen.getByRole('heading', { name: /one way to read this plan/i })).toBeInTheDocument()
  })

  it('contains zero em-dashes and en-dashes anywhere in its rendered copy', () => {
    const { container } = renderCard()
    const text = container.textContent ?? ''
    expect(text).not.toContain('—')
    expect(text).not.toContain('–')
  })

  describe('rupee figures beside each weight', () => {
    it('computes each row from Chunk E\'s engine, not from an inline multiplication', () => {
      // ₹100,000 total split 60/40 -- the engine rounds each holding's
      // startValueInr from the exact split, which is what the row must show.
      renderCard({ totalValueInr: 100000, allocations: baseAllocations })
      expect(screen.getByTestId('ai-suggestion-row-value-nifty-index-fund')).toHaveTextContent('₹60,000')
      expect(screen.getByTestId('ai-suggestion-row-value-gilt-fund')).toHaveTextContent('₹40,000')
    })

    it('recomputes when the total or the weights change, never a stale figure', () => {
      const { rerender } = render(<AiSuggestionCard {...baseProps} totalValueInr={100000} />)
      expect(screen.getByTestId('ai-suggestion-row-value-nifty-index-fund')).toHaveTextContent('₹60,000')

      rerender(<AiSuggestionCard {...baseProps} totalValueInr={200000} />)
      expect(screen.getByTestId('ai-suggestion-row-value-nifty-index-fund')).toHaveTextContent('₹1,20,000')
    })

    it('is proven to come from the engine: mocking projectHoldings changes what the card shows', async () => {
      vi.resetModules()
      vi.doMock('@/lib/projection/engine', () => ({
        projectHoldings: vi.fn(() => ({
          points: [],
          holdings: [
            { assetClass: 'equity', startValueInr: 111, rate: { annualRatePct: 0, source: 'class-default', basis: '' }, contributionWeight: 0.6, finalValueInr: 111 },
            { assetClass: 'equity', startValueInr: 222, rate: { annualRatePct: 0, source: 'class-default', basis: '' }, contributionWeight: 0.4, finalValueInr: 222 },
          ],
          totalStartValueInr: 333,
          totalContributedInr: 0,
          finalValueInr: 333,
        })),
      }))
      const { AiSuggestionCard: MockedCard } = await import('./ai-suggestion-card')
      render(<MockedCard {...baseProps} />)
      expect(screen.getByTestId('ai-suggestion-row-value-nifty-index-fund')).toHaveTextContent('₹111')
      expect(screen.getByTestId('ai-suggestion-row-value-gilt-fund')).toHaveTextContent('₹222')
      vi.doUnmock('@/lib/projection/engine')
      vi.resetModules()
    })
  })

  describe('telemetry (A9, METRICS_PLAN.md)', () => {
    it('fires ai_suggestion_shown once on mount with target and kind, no other property', () => {
      renderCard({ kind: 'goal_plan', target: 'ledger' })
      const shownCalls = track.mock.calls.filter(([event]) => event === 'ai_suggestion_shown')
      expect(shownCalls).toHaveLength(1)
      expect(shownCalls[0][1]).toEqual({ target: 'ledger', kind: 'goal_plan' })
    })

    it('reflects target=current and kind=counsel exactly as given, never hardcoded', () => {
      renderCard({ kind: 'counsel', target: 'current' })
      expect(track).toHaveBeenCalledWith('ai_suggestion_shown', { target: 'current', kind: 'counsel' })
    })

    it('does not re-fire ai_suggestion_shown on a re-render caused by an unrelated prop change', () => {
      const { rerender } = render(<AiSuggestionCard {...baseProps} totalValueInr={100000} />)
      expect(track.mock.calls.filter(([event]) => event === 'ai_suggestion_shown')).toHaveLength(1)

      rerender(<AiSuggestionCard {...baseProps} totalValueInr={200000} />)
      expect(track.mock.calls.filter(([event]) => event === 'ai_suggestion_shown')).toHaveLength(1)
    })

    it('fires ai_suggestion_applied with target and kind exactly once when Apply is pressed', () => {
      renderCard({ kind: 'goal_plan', target: 'current' })
      track.mockClear()
      screen.getByRole('button', { name: /add these to the plan/i }).click()

      const applied = track.mock.calls.filter(([event]) => event === 'ai_suggestion_applied')
      expect(applied).toHaveLength(1)
      expect(applied[0][1]).toEqual({ target: 'current', kind: 'goal_plan' })
      expect(track.mock.calls.some(([event]) => event === 'ai_suggestion_dismissed')).toBe(false)
    })

    it('fires ai_suggestion_dismissed with target and kind exactly once when Dismiss is pressed', () => {
      renderCard({ kind: 'counsel', target: 'ledger' })
      track.mockClear()
      screen.getByRole('button', { name: /^dismiss$/i }).click()

      const dismissed = track.mock.calls.filter(([event]) => event === 'ai_suggestion_dismissed')
      expect(dismissed).toHaveLength(1)
      expect(dismissed[0][1]).toEqual({ target: 'ledger', kind: 'counsel' })
      expect(track.mock.calls.some(([event]) => event === 'ai_suggestion_applied')).toBe(false)
    })

    it('still invokes the caller-provided onApply/onDismiss callbacks alongside telemetry', () => {
      const { onApply } = renderCard({ onApply: vi.fn() })
      screen.getByRole('button', { name: /add these to the plan/i }).click()
      expect(onApply).toHaveBeenCalledTimes(1)
    })

    it('no event payload carries a rupee amount, an instrument slug, a weight, or a member', () => {
      renderCard({ kind: 'goal_plan', target: 'current' })
      screen.getByRole('button', { name: /add these to the plan/i }).click()
      renderCard({ kind: 'goal_plan', target: 'current' })
      screen.getAllByRole('button', { name: /^dismiss$/i })[0].click()

      for (const [, payload] of track.mock.calls) {
        expect(Object.keys(payload as object).sort()).toEqual(['kind', 'target'])
      }
    })
  })

  describe('the model-supplied-currency type barrier (SPEC.md §G6.5)', () => {
    it('has no field on an allocation that could carry a model-supplied rupee amount', () => {
      // Runtime witness of the compile-time proof below: the type has
      // exactly these two keys, nothing a model output could smuggle an
      // amount through.
      const allocation: AiSuggestionAllocation = { slug: 'nifty-index-fund', weightPct: 60 }
      expect(Object.keys(allocation).sort()).toEqual(['slug', 'weightPct'])
    })

    it('the naive implementation (a per-allocation currency field) fails to compile', () => {
      // Discriminating test: this must fail `tsc` if AiSuggestionAllocation
      // is ever widened to accept a model-supplied amount. Object literal
      // excess-property checking is what makes this a real compile error and
      // not just a convention.
      // @ts-expect-error -- amountInr is not part of AiSuggestionAllocation; a
      // model-supplied currency figure is structurally unrepresentable here.
      const badAllocations: AiSuggestionAllocation[] = [{ slug: 'nifty-index-fund', weightPct: 60, amountInr: 999999 }]
      expect(badAllocations).toHaveLength(1)
    })
  })
})
