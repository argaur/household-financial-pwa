import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Portfolio } from './Portfolio'
import type { AiSuggestionsUsage } from '@/lib/ai-suggestions-api'

/**
 * M4 (D-024/D-025) — mounts "Review this ledger" (`ReviewLedgerAction`) on
 * the ledger view and wires it to the real counsel POST.
 *
 * This is the last of SPEC.md G3's four mounting gaps. M1 mounted a
 * standalone `AiCapNotice` as a deliberate placeholder for this exact
 * affordance (see `ai-cap-notice-mount.test.tsx`'s own doc); this step
 * removes that placeholder so the cap notice renders exactly once, owned by
 * `ReviewLedgerAction` itself.
 */

const getToken = vi.fn().mockResolvedValue('test-token')
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken }),
}))

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

const listFamilyMembers = vi.fn()
vi.mock('@/lib/family-members-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/family-members-api')>()
  return { ...actual, listFamilyMembers: (...args: unknown[]) => listFamilyMembers(...args) }
})

const listInstruments = vi.fn()
vi.mock('@/lib/instruments-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instruments-api')>()
  return { ...actual, listInstruments: (...args: unknown[]) => listInstruments(...args) }
})

const listHoldings = vi.fn()
vi.mock('@/lib/holdings-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/holdings-api')>()
  return {
    ...actual,
    listHoldings: (...args: unknown[]) => listHoldings(...args),
  }
})

const listLedgers = vi.fn()
vi.mock('@/lib/ledgers-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ledgers-api')>()
  return { ...actual, listLedgers: (...args: unknown[]) => listLedgers(...args) }
})

const getAiSuggestionsUsage = vi.fn()
const postCounselSuggestion = vi.fn()
vi.mock('@/lib/ai-suggestions-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai-suggestions-api')>()
  return {
    ...actual,
    getAiSuggestionsUsage: (...args: unknown[]) => getAiSuggestionsUsage(...args),
    postCounselSuggestion: (...args: unknown[]) => postCounselSuggestion(...args),
  }
})

const baselineLedger = {
  id: 'l1',
  householdId: 'h1',
  name: 'Current',
  isBaseline: true,
  origin: 'manual' as const,
  snapshotOf: null,
  createdAt: '',
  updatedAt: '',
}

const member = {
  id: 'm1',
  householdId: 'h1',
  name: 'Ananya Verma',
  relationship: 'self' as const,
  dateOfBirth: '1990-01-01',
  riskProfile: null,
  version: 1,
  createdAt: '',
  updatedAt: '',
}

const instrument = {
  id: 'i1',
  slug: 'equity-large-cap-fund',
  category: 1,
  name: 'Large Cap Index Fund',
  summary: '',
  returns: '',
  tax: '',
  liquidity: '',
  risk: '',
  eligibility: '',
  minInvestment: '',
  rateValue: null,
  rateAsOf: null,
  createdAt: '',
}

const holding = {
  id: 'hold1',
  householdId: 'h1',
  memberId: 'm1',
  instrumentId: 'i1',
  assetClass: 'equity' as const,
  investedAmount: '10000',
  currentValue: '10500',
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
}

function usage(overrides: Partial<AiSuggestionsUsage> = {}): AiSuggestionsUsage {
  return { plansUsed: 0, plansCap: 2, editsUsed: 0, editsCap: 2, globalOpen: true, ...overrides }
}

describe('Portfolio — mounting "Review this ledger" and wiring the counsel path (M4)', () => {
  beforeEach(() => {
    listFamilyMembers.mockReset()
    listInstruments.mockReset()
    listHoldings.mockReset()
    listLedgers.mockReset()
    getAiSuggestionsUsage.mockReset()
    postCounselSuggestion.mockReset()
    track.mockReset()
    listFamilyMembers.mockResolvedValue({ members: [member], unreadableCount: 0, notYetEncryptedCount: 0 })
    listInstruments.mockResolvedValue([instrument])
    listLedgers.mockResolvedValue([baselineLedger])
    listHoldings.mockResolvedValue({ holdings: [holding], unreadableCount: 0, notYetEncryptedCount: 0 })
  })

  it('renders the "Review this ledger" button when the ledger still has a review left', async () => {
    getAiSuggestionsUsage.mockResolvedValue(usage())
    render(
      <MemoryRouter>
        <Portfolio />
      </MemoryRouter>,
    )

    await screen.findByText("Ananya Verma's holdings")
    expect(await screen.findByRole('button', { name: /review this ledger/i })).toBeInTheDocument()
  })

  it('renders exactly one cap notice when a cap applies -- never the old M1 placeholder alongside the new one', async () => {
    getAiSuggestionsUsage.mockResolvedValue(usage({ editsUsed: 2, editsCap: 2 }))
    render(
      <MemoryRouter>
        <Portfolio />
      </MemoryRouter>,
    )

    await screen.findByText("Ananya Verma's holdings")
    const notices = await screen.findAllByTestId('ai-cap-notice')
    expect(notices).toHaveLength(1)
    expect(notices[0]).toHaveAttribute('data-cap-state', 'editsExhausted')
    // The button itself must not also render next to the notice.
    expect(screen.queryByRole('button', { name: /review this ledger/i })).not.toBeInTheDocument()
  })

  it('sends a real counsel POST on confirm, with this ledger\'s id, and shows the result', async () => {
    getAiSuggestionsUsage.mockResolvedValue(usage())
    postCounselSuggestion.mockResolvedValue({
      status: 'ok',
      kind: 'counsel',
      suggestion: {
        allocations: [{ slug: 'equity-large-cap-fund', weightPct: 100 }],
        reasoning: 'A simple illustration.',
        caveat: 'This is an illustration, not advice.',
      },
      usage: { plansUsed: 0, plansCap: 2, editsUsed: 1, editsCap: 2 },
    })
    render(
      <MemoryRouter>
        <Portfolio />
      </MemoryRouter>,
    )

    await screen.findByText("Ananya Verma's holdings")
    fireEvent.click(await screen.findByRole('button', { name: /review this ledger/i }))
    fireEvent.click(await screen.findByRole('button', { name: /send this request/i }))

    await waitFor(() => expect(postCounselSuggestion).toHaveBeenCalledTimes(1))
    const [, request] = postCounselSuggestion.mock.calls[0]
    expect(request.kind).toBe('counsel')
    expect(request.ledgerId).toBe('l1')
    expect(typeof request.idempotencyKey).toBe('string')
    expect(request.currentMix.length).toBeGreaterThan(0)
    expect(request.holdingSlugs).toContain('equity-large-cap-fund')

    expect(await screen.findByTestId('ai-suggestion-allocations')).toBeInTheDocument()
  })

  it('folds the response usage into aiUsage so a review that stays under cap leaves the button in place, still singular', async () => {
    getAiSuggestionsUsage.mockResolvedValue(usage({ editsUsed: 0, editsCap: 2 }))
    postCounselSuggestion.mockResolvedValue({
      status: 'ok',
      kind: 'counsel',
      suggestion: {
        allocations: [{ slug: 'equity-large-cap-fund', weightPct: 100 }],
        reasoning: 'A simple illustration.',
        caveat: 'This is an illustration, not advice.',
      },
      usage: { plansUsed: 0, plansCap: 2, editsUsed: 1, editsCap: 2 },
    })
    render(
      <MemoryRouter>
        <Portfolio />
      </MemoryRouter>,
    )

    await screen.findByText("Ananya Verma's holdings")
    fireEvent.click(await screen.findByRole('button', { name: /review this ledger/i }))
    fireEvent.click(await screen.findByRole('button', { name: /send this request/i }))
    await waitFor(() => expect(postCounselSuggestion).toHaveBeenCalledTimes(1))
    await screen.findByTestId('ai-suggestion-allocations')

    fireEvent.click(screen.getByRole('button', { name: /add these to the plan/i }))

    // Not yet capped (1 of 2 used) -- the button reappears, and never a
    // second cap notice alongside it.
    expect(screen.getByRole('button', { name: /review this ledger/i })).toBeInTheDocument()
    expect(screen.queryAllByTestId('ai-cap-notice')).toHaveLength(0)
  })

  /**
   * Flagged ambiguity (see the M4 report): when a successful review is
   * itself the one that exhausts the ledger's cap, folding the response's
   * `usage` straight into `aiUsage` makes `ReviewLedgerAction` re-render with
   * `counselCapState` now tripped. That component's own early-return
   * contract (pinned by `review-ledger-action.test.tsx`'s "cap-exhausted
   * soft register" describe block) renders `AiCapNotice` INSTEAD OF its
   * `Dialog` whenever the cap is reached, with no exception for "a dialog
   * this same usage update is currently showing a result in." The user's
   * just-fetched suggestion is swapped out from under them before they can
   * Apply or Dismiss it. `ReviewLedgerAction` is out of this step's scope
   * (see the plan), so this is not fixed here -- this test pins the actual
   * resulting behaviour (one notice, never two) rather than asserting
   * something prettier that isn't true.
   */
  it('the cap notice replaces the open result dialog, exactly once, when the review that just ran exhausts the cap', async () => {
    getAiSuggestionsUsage.mockResolvedValue(usage({ editsUsed: 1, editsCap: 2 }))
    postCounselSuggestion.mockResolvedValue({
      status: 'ok',
      kind: 'counsel',
      suggestion: {
        allocations: [{ slug: 'equity-large-cap-fund', weightPct: 100 }],
        reasoning: 'A simple illustration.',
        caveat: 'This is an illustration, not advice.',
      },
      usage: { plansUsed: 0, plansCap: 2, editsUsed: 2, editsCap: 2 },
    })
    render(
      <MemoryRouter>
        <Portfolio />
      </MemoryRouter>,
    )

    await screen.findByText("Ananya Verma's holdings")
    fireEvent.click(await screen.findByRole('button', { name: /review this ledger/i }))
    fireEvent.click(await screen.findByRole('button', { name: /send this request/i }))
    await waitFor(() => expect(postCounselSuggestion).toHaveBeenCalledTimes(1))

    const notices = await screen.findAllByTestId('ai-cap-notice')
    expect(notices).toHaveLength(1)
    expect(notices[0]).toHaveAttribute('data-cap-state', 'editsExhausted')
  })
})
