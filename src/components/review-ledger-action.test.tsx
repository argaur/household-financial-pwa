import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { ReviewLedgerAction } from './review-ledger-action'
import type { AiSuggestionsUsage } from '@/lib/ai-suggestions-api'

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))

/**
 * C3/C4 (D-024/D-025 Chunk C) — "Review this ledger" is the counsel path's
 * host: it owns its own Dialog (unlike `AiConsentStep`, which is a body swap
 * inside a host it does not own), swapping consent -> card -> apply/dismiss.
 *
 * D-024 decision 4: this is an on-demand action, never proactive. The two
 * network-shaped things it can do (`onReview`, the counsel POST; `onApply`,
 * the ledger/holdings write) are both injected seams the component never
 * calls itself — same seam discipline as `AiConsentStep.onConfirm` and
 * `AiSuggestionCard.onApply`/`onDismiss` — so this file never makes a real
 * network call and never touches a database.
 */

const OPEN_USAGE: AiSuggestionsUsage = { plansUsed: 0, plansCap: 2, editsUsed: 0, editsCap: 2, globalOpen: true }
const EXHAUSTED_USAGE: AiSuggestionsUsage = {
  plansUsed: 0,
  plansCap: 2,
  editsUsed: 2,
  editsCap: 2,
  globalOpen: true,
}

const SUGGESTION = {
  allocations: [
    { slug: 'equity-index-funds-etfs', weightPct: 60 },
    { slug: 'debt-ppf', weightPct: 40 },
  ],
  reasoning: 'A growth weighted mix given the horizon.',
  caveat: 'This is an illustration, not advice.',
}

function renderAction(props: Partial<React.ComponentProps<typeof ReviewLedgerAction>> = {}) {
  const onReview = props.onReview ?? vi.fn().mockResolvedValue(SUGGESTION)
  const onApply = props.onApply ?? vi.fn()
  const utils = render(
    <MemoryRouter>
      <ReviewLedgerAction
        usage={props.usage ?? OPEN_USAGE}
        target={props.target ?? 'ledger'}
        instrumentNamesBySlug={props.instrumentNamesBySlug ?? { 'equity-index-funds-etfs': 'Index funds', 'debt-ppf': 'PPF' }}
        totalValueInr={props.totalValueInr ?? 100_000}
        onReview={onReview}
        onApply={onApply}
        offlineBlocked={props.offlineBlocked}
      />
    </MemoryRouter>,
  )
  return { ...utils, onReview, onApply }
}

describe('ReviewLedgerAction — on-demand only, never proactive (D-024 decision 4)', () => {
  it('calls onReview zero times on mount', () => {
    const { onReview } = renderAction()
    expect(onReview).not.toHaveBeenCalled()
  })

  it('calls onReview zero times across a re-render caused by an unrelated prop change', () => {
    const onReview = vi.fn().mockResolvedValue(SUGGESTION)
    const { rerender } = render(
      <MemoryRouter>
        <ReviewLedgerAction
          usage={OPEN_USAGE}
          target="ledger"
          instrumentNamesBySlug={{}}
          totalValueInr={100_000}
          onReview={onReview}
          onApply={vi.fn()}
        />
      </MemoryRouter>,
    )
    rerender(
      <MemoryRouter>
        <ReviewLedgerAction
          usage={OPEN_USAGE}
          target="ledger"
          instrumentNamesBySlug={{}}
          totalValueInr={200_000}
          onReview={onReview}
          onApply={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(onReview).not.toHaveBeenCalled()
  })

  it('only calls onReview after the button is clicked and consent is confirmed', async () => {
    const { onReview } = renderAction()
    expect(onReview).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /review this ledger/i }))
    expect(onReview).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /send this request/i }))
    await waitFor(() => expect(onReview).toHaveBeenCalledTimes(1))
  })
})

describe('ReviewLedgerAction — the cap-exhausted soft register (reuses A7)', () => {
  it('renders AiCapNotice editsExhausted instead of the button when the ledger has spent both reviews', () => {
    renderAction({ usage: EXHAUSTED_USAGE })
    expect(screen.queryByRole('button', { name: /review this ledger/i })).not.toBeInTheDocument()
    const notice = screen.getByTestId('ai-cap-notice')
    expect(notice).toHaveAttribute('data-cap-state', 'editsExhausted')
  })

  it('renders the button, not a notice, when the ledger still has a review left', () => {
    renderAction({ usage: OPEN_USAGE })
    expect(screen.getByRole('button', { name: /review this ledger/i })).toBeInTheDocument()
    expect(screen.queryByTestId('ai-cap-notice')).not.toBeInTheDocument()
  })

  it('renders the global-paused notice, not the button, when globalOpen is false', () => {
    renderAction({ usage: { ...OPEN_USAGE, globalOpen: false } })
    expect(screen.getByTestId('ai-cap-notice')).toHaveAttribute('data-cap-state', 'globalPaused')
  })

  it('does not write a second copy of the cap-exhausted visual treatment', () => {
    const source = readFileSync(resolve(__dirname, 'review-ledger-action.tsx'), 'utf8')
    expect(source).toMatch(/from ['"]\.\/ai-cap-notice['"]/)
    expect(source).not.toMatch(/You have used both/)
  })
})

describe('ReviewLedgerAction — the same consent step from A2, unremembered', () => {
  it('shows AiConsentStep with kind="counsel" on the first click', () => {
    renderAction({ usage: { ...OPEN_USAGE, editsUsed: 1 } })
    fireEvent.click(screen.getByRole('button', { name: /review this ledger/i }))

    expect(screen.getByRole('heading', { name: /this request leaves your device/i })).toBeInTheDocument()
    const counterLine = screen.getByTestId('ai-consent-counter-line')
    expect(counterLine).toHaveTextContent('one of your 1 remaining reviews')
    expect(counterLine).not.toHaveTextContent(/plans/)
  })

  it('shows the consent step again on a second review of the same ledger, not skipped', async () => {
    const { onReview, onApply } = renderAction()

    fireEvent.click(screen.getByRole('button', { name: /review this ledger/i }))
    fireEvent.click(screen.getByRole('button', { name: /send this request/i }))
    await waitFor(() => expect(screen.getByTestId('ai-suggestion-allocations')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /add these to the plan/i }))
    expect(onApply).toHaveBeenCalledTimes(1)

    // Dialog closes on apply (Radix keeps it mounted, not remounted).
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Second review: reopen and confirm again.
    fireEvent.click(screen.getByRole('button', { name: /review this ledger/i }))
    expect(screen.getByRole('heading', { name: /this request leaves your device/i })).toBeInTheDocument()
    expect(screen.queryByTestId('ai-suggestion-allocations')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /send this request/i }))
    await waitFor(() => expect(onReview).toHaveBeenCalledTimes(2))
  })

  it('cancelling consent does not call onReview and closes the dialog', () => {
    const { onReview } = renderAction()
    fireEvent.click(screen.getByRole('button', { name: /review this ledger/i }))
    fireEvent.click(screen.getByRole('button', { name: /not now/i }))

    expect(onReview).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('ReviewLedgerAction — the Radix reset trap: open, interact, close, reopen, clean', () => {
  it('reopening after a dismissed card lands back on the consent step, not the leftover card', async () => {
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: /review this ledger/i }))
    fireEvent.click(screen.getByRole('button', { name: /send this request/i }))
    await waitFor(() => expect(screen.getByTestId('ai-suggestion-allocations')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /review this ledger/i }))
    expect(screen.getByRole('heading', { name: /this request leaves your device/i })).toBeInTheDocument()
    expect(screen.queryByTestId('ai-suggestion-allocations')).not.toBeInTheDocument()
  })
})

describe('ReviewLedgerAction — C4, the card is A6\'s component, not a second one', () => {
  it('renders the review result through AiSuggestionCard (allocation rows, Apply/Dismiss copy)', async () => {
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: /review this ledger/i }))
    fireEvent.click(screen.getByRole('button', { name: /send this request/i }))

    await waitFor(() => expect(screen.getByTestId('ai-suggestion-allocations')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: /one way to read this plan/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add these to the plan/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
  })

  it('imports AiSuggestionCard rather than defining its own card markup', () => {
    const source = readFileSync(resolve(__dirname, 'review-ledger-action.tsx'), 'utf8')
    expect(source).toMatch(/from ['"]\.\/ai-suggestion-card['"]/)
    expect(source).not.toMatch(/ai-suggestion-allocations/)
  })

  it('no second component in src/components defines the ai-suggestion-allocations testid', () => {
    const dir = resolve(__dirname)
    const offenders = readdirSync(dir)
      .filter((name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx') && name !== 'ai-suggestion-card.tsx')
      .filter((name) => readFileSync(resolve(dir, name), 'utf8').includes('ai-suggestion-allocations'))
    expect(offenders).toEqual([])
  })
})

describe('ReviewLedgerAction — C4 telemetry, counsel kind distinguished', () => {
  beforeEach(async () => {
    const { track } = await import('@/lib/analytics')
    ;(track as ReturnType<typeof vi.fn>).mockClear()
  })

  it('fires ai_suggestion_shown with kind counsel and the given target when the card mounts', async () => {
    const { track } = await import('@/lib/analytics')
    renderAction({ target: 'current' })
    fireEvent.click(screen.getByRole('button', { name: /review this ledger/i }))
    fireEvent.click(screen.getByRole('button', { name: /send this request/i }))

    await waitFor(() =>
      expect(track).toHaveBeenCalledWith('ai_suggestion_shown', { target: 'current', kind: 'counsel' }),
    )
  })

  it('fires ai_suggestion_applied with kind counsel on Apply', async () => {
    const { track } = await import('@/lib/analytics')
    renderAction({ target: 'ledger' })
    fireEvent.click(screen.getByRole('button', { name: /review this ledger/i }))
    fireEvent.click(screen.getByRole('button', { name: /send this request/i }))
    await waitFor(() => expect(screen.getByTestId('ai-suggestion-allocations')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /add these to the plan/i }))
    expect(track).toHaveBeenCalledWith('ai_suggestion_applied', { target: 'ledger', kind: 'counsel' })
  })

  it('fires ai_suggestion_dismissed with kind counsel on Dismiss', async () => {
    const { track } = await import('@/lib/analytics')
    renderAction({ target: 'ledger' })
    fireEvent.click(screen.getByRole('button', { name: /review this ledger/i }))
    fireEvent.click(screen.getByRole('button', { name: /send this request/i }))
    await waitFor(() => expect(screen.getByTestId('ai-suggestion-allocations')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(track).toHaveBeenCalledWith('ai_suggestion_dismissed', { target: 'ledger', kind: 'counsel' })
  })

  it('fires ai_cap_reached with cap_type edits when the notice renders (AiCapNotice A9, reused as-is)', async () => {
    const { track } = await import('@/lib/analytics')
    renderAction({ usage: EXHAUSTED_USAGE })
    expect(track).toHaveBeenCalledWith('ai_cap_reached', { cap_type: 'edits' })
  })
})

describe('ReviewLedgerAction — cards are never persisted', () => {
  it('writes nothing to localStorage or sessionStorage across the whole flow', async () => {
    const localSetSpy = vi.spyOn(Storage.prototype, 'setItem')
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: /review this ledger/i }))
    fireEvent.click(screen.getByRole('button', { name: /send this request/i }))
    await waitFor(() => expect(screen.getByTestId('ai-suggestion-allocations')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /add these to the plan/i }))

    expect(localSetSpy).not.toHaveBeenCalled()
    localSetSpy.mockRestore()
  })
})

describe('ReviewLedgerAction — offline (SPEC.md §7: writes disabled, never queued)', () => {
  it('passes offlineBlocked through to the result card, disabling Apply and showing the offline message', async () => {
    renderAction({ offlineBlocked: true })
    fireEvent.click(screen.getByRole('button', { name: /review this ledger/i }))
    fireEvent.click(screen.getByRole('button', { name: /send this request/i }))
    await waitFor(() => expect(screen.getByTestId('ai-suggestion-allocations')).toBeInTheDocument())

    expect(screen.getByRole('button', { name: /add these to the plan/i })).toBeDisabled()
    expect(screen.getByText(/nothing is queued in the background/i)).toBeInTheDocument()
  })

  it('never calls onApply if Apply is clicked while offlineBlocked', async () => {
    const { onApply } = renderAction({ offlineBlocked: true })
    fireEvent.click(screen.getByRole('button', { name: /review this ledger/i }))
    fireEvent.click(screen.getByRole('button', { name: /send this request/i }))
    await waitFor(() => expect(screen.getByTestId('ai-suggestion-allocations')).toBeInTheDocument())

    screen.getByRole('button', { name: /add these to the plan/i }).click()
    expect(onApply).not.toHaveBeenCalled()
  })
})

describe('ReviewLedgerAction — a failed onReview counts the attempt but changes nothing', () => {
  it('shows the failure state and does not call onApply', async () => {
    const onReview = vi.fn().mockRejectedValue(new Error('provider_error'))
    const { onApply } = renderAction({ onReview })
    fireEvent.click(screen.getByRole('button', { name: /review this ledger/i }))
    fireEvent.click(screen.getByRole('button', { name: /send this request/i }))

    await waitFor(() => expect(screen.getByText(/couldn't complete this request/i)).toBeInTheDocument())
    expect(onApply).not.toHaveBeenCalled()
  })
})
