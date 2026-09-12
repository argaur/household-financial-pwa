import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NewLedgerModal } from './new-ledger-modal'
import type { Holding } from '@/lib/holdings-api'
import type { AiSuggestionsUsage, AiSuggestionPostResult } from '@/lib/ai-suggestions-api'

/**
 * M2 (D-024/D-025 AI import) — wires Chunk G's goal step to
 * `POST /api/ai-suggestions`, `kind: "goal_plan"`.
 *
 * Consent is per-transmission and never remembered (D-025, SPEC.md §G4): the
 * only path to a POST is goal form -> consent step -> confirm, and every
 * fresh "Ask AI" attempt shows the consent step again, unremembered.
 */

const getToken = vi.fn().mockResolvedValue('test-token')
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken }),
}))

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))

const createBlankLedger = vi.fn()
const createLedgerFromCurrent = vi.fn()
vi.mock('@/lib/ledgers-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ledgers-api')>()
  return {
    ...actual,
    createBlankLedger: (...args: unknown[]) => createBlankLedger(...args),
    createLedgerFromCurrent: (...args: unknown[]) => createLedgerFromCurrent(...args),
  }
})

const postGoalPlanSuggestion = vi.fn()
vi.mock('@/lib/ai-suggestions-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai-suggestions-api')>()
  return {
    ...actual,
    postGoalPlanSuggestion: (...args: unknown[]) => postGoalPlanSuggestion(...args),
  }
})

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 'h1',
    householdId: 'house1',
    memberId: 'm1',
    instrumentId: 'equity-index-funds-etfs',
    assetClass: 'equity',
    investedAmount: '100000',
    currentValue: '120000',
    units: null,
    monthlySip: null,
    startDate: null,
    maturityDate: null,
    nominee: null,
    isEmergencyFund: false,
    notes: null,
    version: 1,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

const holdingsWithMix: Holding[] = [
  holding({ id: 'h1', assetClass: 'equity', currentValue: '120000' }),
  holding({ id: 'h2', assetClass: 'debt', currentValue: '80000' }),
]

const usage = (overrides: Partial<AiSuggestionsUsage> = {}): AiSuggestionsUsage => ({
  plansUsed: 0,
  plansCap: 2,
  editsUsed: 0,
  editsCap: 2,
  globalOpen: true,
  ...overrides,
})

const OK_RESULT: AiSuggestionPostResult = {
  status: 'ok',
  kind: 'goal_plan',
  suggestion: {
    allocations: [
      { slug: 'equity-index-funds-etfs', weightPct: 70 },
      { slug: 'debt-ppf', weightPct: 30 },
    ],
    reasoning: 'A growth-weighted mix given the horizon.',
    caveat: 'This is an illustration, not advice.',
  },
  usage: { plansUsed: 1, plansCap: 2, editsUsed: 0, editsCap: 2 },
}

function fillGoalForm() {
  fireEvent.click(screen.getByRole('radio', { name: /plan toward a goal/i }))
  fireEvent.change(screen.getByLabelText(/ledger name/i), { target: { value: 'Toward the house' } })
  fireEvent.change(screen.getByLabelText(/what are you saving for/i), { target: { value: 'A house' } })
  fireEvent.change(screen.getByLabelText(/target amount/i), { target: { value: '500000' } })
  fireEvent.change(screen.getByLabelText(/target year/i), { target: { value: '2033' } })
}

describe('goal step AI wiring — POST /api/ai-suggestions, kind: goal_plan', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-09-11T00:00:00Z'))
    getToken.mockClear()
    createBlankLedger.mockReset()
    createLedgerFromCurrent.mockReset()
    postGoalPlanSuggestion.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function renderModal(props: Partial<React.ComponentProps<typeof NewLedgerModal>> = {}) {
    return render(
      <MemoryRouter>
        <NewLedgerModal
          open
          onOpenChange={vi.fn()}
          sourceHoldings={props.sourceHoldings ?? holdingsWithMix}
          unreadableCount={props.unreadableCount ?? 0}
          onCreated={props.onCreated ?? vi.fn()}
          usage={props.usage ?? usage()}
        />
      </MemoryRouter>,
    )
  }

  it('never calls the AI proxy just from filling and validating the goal form', () => {
    renderModal()
    fillGoalForm()
    expect(postGoalPlanSuggestion).not.toHaveBeenCalled()
  })

  it('shows the consent step before transmitting, and the POST only fires after confirming', async () => {
    postGoalPlanSuggestion.mockResolvedValue(OK_RESULT)
    renderModal()
    fillGoalForm()

    fireEvent.click(screen.getByRole('button', { name: /ask ai for a suggested plan/i }))

    // Consent shown, no POST yet.
    expect(screen.getByTestId('ai-consent-counter-line')).toBeInTheDocument()
    expect(postGoalPlanSuggestion).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send this request/i }))
    })

    await waitFor(() => expect(postGoalPlanSuggestion).toHaveBeenCalledTimes(1))
    const [, body] = postGoalPlanSuggestion.mock.calls[0]
    expect(body.kind).toBe('goal_plan')
    expect(body.horizonYears).toBe(7)
    expect(body.targetAmountBandInr).toBe(500000)
    expect(body.currentMix).toEqual(
      expect.arrayContaining([
        { assetClass: 'equity', weightPct: 60 },
        { assetClass: 'debt', weightPct: 40 },
      ]),
    )
  })

  it('is impossible to reach the POST by cancelling out of consent', async () => {
    renderModal()
    fillGoalForm()
    fireEvent.click(screen.getByRole('button', { name: /ask ai for a suggested plan/i }))
    fireEvent.click(screen.getByRole('button', { name: /not now/i }))

    expect(postGoalPlanSuggestion).not.toHaveBeenCalled()
    // Back on the goal form, not stuck on a dead consent screen.
    expect(screen.getByLabelText(/what are you saving for/i)).toBeInTheDocument()
  })

  it('consent is never remembered: a second "Ask AI" attempt shows the consent step again', async () => {
    postGoalPlanSuggestion.mockResolvedValue(OK_RESULT)
    renderModal()
    fillGoalForm()

    fireEvent.click(screen.getByRole('button', { name: /ask ai for a suggested plan/i }))
    fireEvent.click(screen.getByRole('button', { name: /not now/i }))

    // Second attempt: consent must show again, not be skipped.
    fireEvent.click(screen.getByRole('button', { name: /ask ai for a suggested plan/i }))
    expect(screen.getByTestId('ai-consent-counter-line')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send this request/i }))
    })

    await waitFor(() => expect(postGoalPlanSuggestion).toHaveBeenCalledTimes(1))
  })

  it('a fresh attempt gets a fresh idempotency key; retrying the same attempt reuses it', async () => {
    postGoalPlanSuggestion.mockRejectedValueOnce(new Error('network down'))
    postGoalPlanSuggestion.mockResolvedValueOnce(OK_RESULT)
    renderModal()
    fillGoalForm()

    // Attempt 1: fails, then "Try again" retries the SAME attempt.
    fireEvent.click(screen.getByRole('button', { name: /ask ai for a suggested plan/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send this request/i }))
    })
    await screen.findByText(/couldn.t complete this request/i)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    })
    await waitFor(() => expect(postGoalPlanSuggestion).toHaveBeenCalledTimes(2))

    const firstKey = postGoalPlanSuggestion.mock.calls[0][1].idempotencyKey
    const retryKey = postGoalPlanSuggestion.mock.calls[1][1].idempotencyKey
    expect(retryKey).toBe(firstKey)

    // Back out, start a genuinely new attempt: new key.
    await screen.findByText(/a suggested plan/i)
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    postGoalPlanSuggestion.mockResolvedValueOnce(OK_RESULT)
    fireEvent.click(screen.getByRole('button', { name: /ask ai for a suggested plan/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send this request/i }))
    })
    await waitFor(() => expect(postGoalPlanSuggestion).toHaveBeenCalledTimes(3))
    const secondAttemptKey = postGoalPlanSuggestion.mock.calls[2][1].idempotencyKey
    expect(secondAttemptKey).not.toBe(firstKey)
  })

  it('renders AiCapNotice, not a generic error, for a 409 cap_reached response', async () => {
    postGoalPlanSuggestion.mockResolvedValue({ status: 'cap_reached', capType: 'plans' })
    renderModal()
    fillGoalForm()
    fireEvent.click(screen.getByRole('button', { name: /ask ai for a suggested plan/i }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send this request/i }))
    })

    const notice = await screen.findByTestId('ai-cap-notice')
    expect(notice).toHaveAttribute('data-cap-state', 'plansExhausted')
    expect(screen.getByText('You have used both of your plans')).toBeInTheDocument()
  })

  it('hides the Ask AI affordance and shows AiCapNotice up front when usage already reports the plans cap reached', () => {
    renderModal({ usage: usage({ plansUsed: 2 }) })
    fillGoalForm()

    expect(screen.queryByRole('button', { name: /ask ai for a suggested plan/i })).not.toBeInTheDocument()
    const notice = screen.getByTestId('ai-cap-notice')
    expect(notice).toHaveAttribute('data-cap-state', 'plansExhausted')
  })

  it('shows a generic error state for a provider failure, with no amount echoed anywhere in it', async () => {
    postGoalPlanSuggestion.mockResolvedValue({ status: 'failed', reason: 'provider_error', attemptCounted: true })
    renderModal()
    fillGoalForm()
    fireEvent.click(screen.getByRole('button', { name: /ask ai for a suggested plan/i }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send this request/i }))
    })

    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).not.toMatch(/500000|500,000|5,00,000/)
    expect(screen.getByText(/couldn.t complete this request/i)).toBeInTheDocument()
  })

  it('creating the ledger via the normal submit never calls the AI proxy — the two are independent', async () => {
    createBlankLedger.mockResolvedValue({ id: 'l1' })
    const onCreated = vi.fn()
    renderModal({ onCreated })
    fillGoalForm()

    fireEvent.click(screen.getByRole('button', { name: /create ledger/i }))

    await waitFor(() => expect(createBlankLedger).toHaveBeenCalled())
    expect(postGoalPlanSuggestion).not.toHaveBeenCalled()
  })
})
