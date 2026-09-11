import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Portfolio, AiSuggestionSlot } from './Portfolio'
import type { AiSuggestion } from '@/lib/ai-suggestions-api'

/**
 * M3 (D-024/D-025) — mounts `AiSuggestionCard` in the ledger view's
 * compare-strip position.
 *
 * `AiSuggestionSlot` is the pure branch Portfolio.tsx renders in that
 * position (suggestion present -> the card; otherwise -> the existing
 * compare strip, unchanged). Nothing in production code populates a
 * suggestion yet — that is M4's counsel call — so the exclusivity contract
 * is proven directly against the slot, with real `AiSuggestionCard` and
 * `LedgerCompareStrip` components (no stubbing), rather than by finding a
 * way to force Portfolio's internal state from outside it. The full
 * `<Portfolio />` tests below prove the no-suggestion path (today's only
 * reachable path) renders exactly as before this change.
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
  return { ...actual, listHoldings: (...args: unknown[]) => listHoldings(...args) }
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

const ledger = {
  id: 'l2',
  householdId: 'h1',
  name: 'Aggressive growth',
  ciphertext: null,
  iv: null,
  alg: null,
  version: 1,
  isBaseline: false,
  origin: 'manual' as const,
  snapshotOf: 'l1',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const suggestion: AiSuggestion = {
  allocations: [{ slug: 'equity-large-cap-fund', weightPct: 60 }],
  reasoning: 'A sample tilt toward large-cap equity.',
  caveat: 'This is an illustration, not advice.',
}

const baseSlotProps = {
  ledger,
  ledgerHoldings: [],
  baselineHoldings: [],
  isBaselineActive: false,
  ledgerHoldingsReady: true,
  instrumentNamesBySlug: { 'equity-large-cap-fund': 'Large Cap Index Fund' },
  totalValueInr: 100000,
}

describe('AiSuggestionSlot — the compare-strip position (M3)', () => {
  it('renders the compare strip when there is no active suggestion', () => {
    render(
      <AiSuggestionSlot {...baseSlotProps} suggestion={null} onApply={vi.fn()} onDismiss={vi.fn()} />,
    )
    expect(screen.getByText('Compared to Current')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /one way to/i })).not.toBeInTheDocument()
  })

  it('renders the suggestion card instead of the compare strip when a suggestion is active, never both', () => {
    render(
      <AiSuggestionSlot
        {...baseSlotProps}
        suggestion={{ kind: 'counsel', target: 'ledger', suggestion }}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText('One way to read this plan')).toBeInTheDocument()
    expect(screen.queryByText('Compared to Current')).not.toBeInTheDocument()
  })

  it('wires onDismiss to the card, so dismissing it is the caller\'s job (the slot itself holds no state)', () => {
    const onDismiss = vi.fn()
    render(
      <AiSuggestionSlot
        {...baseSlotProps}
        suggestion={{ kind: 'counsel', target: 'ledger', suggestion }}
        onApply={vi.fn()}
        onDismiss={onDismiss}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('wires onApply to the card\'s "Add these to the plan" action', () => {
    const onApply = vi.fn()
    render(
      <AiSuggestionSlot
        {...baseSlotProps}
        suggestion={{ kind: 'counsel', target: 'ledger', suggestion }}
        onApply={onApply}
        onDismiss={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /add these to the plan/i }))
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('never renders the compare strip on a baseline ledger even with no suggestion (unchanged behaviour)', () => {
    render(
      <AiSuggestionSlot {...baseSlotProps} isBaselineActive suggestion={null} onApply={vi.fn()} onDismiss={vi.fn()} />,
    )
    expect(screen.queryByText('Compared to Current')).not.toBeInTheDocument()
  })
})

describe('Portfolio — the compare-strip position stays regression-safe with no suggestion active (M3)', () => {
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

  const nonBaselineLedger = {
    id: 'l2',
    householdId: 'h1',
    name: 'Aggressive growth',
    isBaseline: false,
    origin: 'manual' as const,
    snapshotOf: 'l1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }

  beforeEach(() => {
    getToken.mockReset().mockResolvedValue('test-token')
    listFamilyMembers.mockReset()
    listInstruments.mockReset()
    listHoldings.mockReset()
    listLedgers.mockReset()
    getAiSuggestionsUsage.mockReset()
    track.mockReset()
    listFamilyMembers.mockResolvedValue({ members: [member], unreadableCount: 0, notYetEncryptedCount: 0 })
    listInstruments.mockResolvedValue([instrument])
    listHoldings.mockResolvedValue({ holdings: [holding], unreadableCount: 0, notYetEncryptedCount: 0 })
    getAiSuggestionsUsage.mockResolvedValue({
      plansUsed: 0,
      plansCap: 2,
      editsUsed: 0,
      editsCap: 2,
      globalOpen: true,
    })
  })

  it('renders the compare strip (no suggestion card) on a non-baseline ledger, as before this change', async () => {
    listLedgers.mockResolvedValue([baselineLedger, nonBaselineLedger])
    render(<Portfolio />)

    await screen.findByText("Ananya Verma's holdings")
    fireEvent.click(await screen.findByRole('tab', { name: 'Aggressive growth' }))

    expect(await screen.findByText('Compared to Current')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /one way to/i })).not.toBeInTheDocument()
  })

  it('never mounts the compare strip or the suggestion card on the Current (baseline) tab', async () => {
    listLedgers.mockResolvedValue([baselineLedger])
    render(<Portfolio />)

    await screen.findByText("Ananya Verma's holdings")
    expect(screen.queryByText('Compared to Current')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /one way to/i })).not.toBeInTheDocument()
  })
})
