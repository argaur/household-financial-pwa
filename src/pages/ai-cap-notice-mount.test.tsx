import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Portfolio } from './Portfolio'
import type { AiSuggestionsUsage } from '@/lib/ai-suggestions-api'

/**
 * M1 (D-024/D-025) — mounts the cap-exhausted states on the ledger view.
 *
 * This is the plan's lowest-stakes unmounted piece deliberately: no live
 * provider dependency, no consent copy, no "Review this ledger" button
 * (that's M4). This step only proves the usage fetch and the `AiCapNotice`
 * swap-in work on the real page, so nothing about the not-yet-mounted
 * counsel entry point is asserted here beyond the notice itself.
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
vi.mock('@/lib/ai-suggestions-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai-suggestions-api')>()
  return { ...actual, getAiSuggestionsUsage: (...args: unknown[]) => getAiSuggestionsUsage(...args) }
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

describe('Portfolio — mounting the AI cap-exhausted states (M1)', () => {
  beforeEach(() => {
    listFamilyMembers.mockReset()
    listInstruments.mockReset()
    listHoldings.mockReset()
    listLedgers.mockReset()
    getAiSuggestionsUsage.mockReset()
    track.mockReset()
    listFamilyMembers.mockResolvedValue({ members: [member], unreadableCount: 0, notYetEncryptedCount: 0 })
    listInstruments.mockResolvedValue([instrument])
    listLedgers.mockResolvedValue([baselineLedger])
    listHoldings.mockResolvedValue({ holdings: [holding], unreadableCount: 0, notYetEncryptedCount: 0 })
  })

  it('renders the editsExhausted notice for the active ledger when both reviews are spent', async () => {
    getAiSuggestionsUsage.mockResolvedValue(usage({ editsUsed: 2, editsCap: 2 }))
    render(<Portfolio />)

    await screen.findByText("Ananya Verma's holdings")
    const notice = await screen.findByTestId('ai-cap-notice')
    expect(notice).toHaveAttribute('data-cap-state', 'editsExhausted')
  })

  it('renders the globalPaused notice when the global breaker is tripped', async () => {
    getAiSuggestionsUsage.mockResolvedValue(usage({ globalOpen: false }))
    render(<Portfolio />)

    await screen.findByText("Ananya Verma's holdings")
    const notice = await screen.findByTestId('ai-cap-notice')
    expect(notice).toHaveAttribute('data-cap-state', 'globalPaused')
  })

  it('renders no cap notice when the ledger still has a review left', async () => {
    getAiSuggestionsUsage.mockResolvedValue(usage())
    render(<Portfolio />)

    await screen.findByText("Ananya Verma's holdings")
    await waitFor(() => expect(getAiSuggestionsUsage).toHaveBeenCalled())
    expect(screen.queryByTestId('ai-cap-notice')).not.toBeInTheDocument()
  })

  it('keeps manual, non-AI controls fully enabled next to every cap state', async () => {
    for (const overrides of [{ editsUsed: 2, editsCap: 2 }, { globalOpen: false }, {}]) {
      getAiSuggestionsUsage.mockReset()
      getAiSuggestionsUsage.mockResolvedValue(usage(overrides))
      const { unmount } = render(<Portfolio />)

      await screen.findByText("Ananya Verma's holdings")
      // Create ledger ("+ New") stays enabled.
      const newLedgerButton = await screen.findByRole('button', { name: /\+ new/i })
      expect(newLedgerButton).toBeEnabled()
      // Add-holding FAB stays enabled.
      expect(screen.getByRole('button', { name: /record a holding/i })).toBeEnabled()
      // Edit-holding affordance (the holding card) stays enabled.
      expect(screen.getByRole('button', { name: /large cap index fund/i })).toBeEnabled()

      unmount()
    }
  })

  it('keeps the ledger view working when the usage fetch fails', async () => {
    getAiSuggestionsUsage.mockRejectedValue(new Error('network error'))
    render(<Portfolio />)

    await screen.findByText("Ananya Verma's holdings")
    expect(screen.getByText('Large Cap Index Fund')).toBeInTheDocument()
    expect(screen.queryByTestId('ai-cap-notice')).not.toBeInTheDocument()
    // No uncaught rejection surfaces as the page's own error state.
    expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument()
  })
})
