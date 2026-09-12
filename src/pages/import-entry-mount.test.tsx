import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Portfolio } from './Portfolio'
import type { ImportHostSheetProps } from '@/components/import-host-sheet'

/**
 * H4/H5 (D-025) — mounts `ImportHostSheet` on the ledger holdings view.
 *
 * SPEC.md §I4: the import entry point is "a secondary action on the ledger's
 * holdings view, next to the existing add affordance, naming the active
 * ledger. Not in the FAB, not in the nav." `ImportHostSheet` itself
 * (`import-host-sheet.tsx`) is fully built and covered by its own 38-test
 * suite; this file only proves Portfolio wires a real entry point to it —
 * reachable from both the empty and populated holdings states, never the
 * FAB — with the correct, real (not placeholder) props.
 *
 * `ImportHostSheet` is stubbed here the same way heavy children are stubbed
 * elsewhere in this file's siblings: this suite is about the mount contract
 * (is it reachable, are the right props wired, does a commit refresh the
 * list), not a re-test of the sheet's own internal flow.
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

const importHostSheetProps = vi.fn()
vi.mock('@/components/import-host-sheet', () => ({
  ImportHostSheet: (props: ImportHostSheetProps) => {
    importHostSheetProps(props)
    if (!props.open) return null
    return (
      <div data-testid="import-host-sheet-stub">
        <button type="button" onClick={() => props.onCommitted?.(2)}>
          simulate commit
        </button>
      </div>
    )
  },
}))

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

beforeEach(() => {
  listFamilyMembers.mockReset()
  listInstruments.mockReset()
  listHoldings.mockReset()
  listLedgers.mockReset()
  getAiSuggestionsUsage.mockReset()
  track.mockReset()
  importHostSheetProps.mockReset()
  listFamilyMembers.mockResolvedValue({ members: [member], unreadableCount: 0, notYetEncryptedCount: 0 })
  listInstruments.mockResolvedValue([instrument])
  listLedgers.mockResolvedValue([baselineLedger])
  getAiSuggestionsUsage.mockResolvedValue({ plansUsed: 0, plansCap: 2, editsUsed: 0, editsCap: 2, globalOpen: true })
})

describe('Portfolio — mounting the bulk import entry point (H4/H5)', () => {
  it('is reachable from the empty holdings state, next to "Record your first holding", and names the active ledger', async () => {
    listHoldings.mockResolvedValue({ holdings: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    render(<Portfolio />)

    await screen.findByText('Nothing recorded yet.')
    expect(screen.getByRole('button', { name: /record your first holding/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /import to current/i })).toBeInTheDocument()
    // Not the FAB -- the FAB only renders once holdings exist.
    expect(screen.queryByRole('button', { name: 'Record a holding' })).not.toBeInTheDocument()
  })

  it('is reachable from the populated holdings state, and is not the FAB', async () => {
    listHoldings.mockResolvedValue({ holdings: [holding], unreadableCount: 0, notYetEncryptedCount: 0 })
    render(<Portfolio />)

    await screen.findByText("Ananya Verma's holdings")
    const importButton = screen.getByRole('button', { name: /import to current/i })
    expect(importButton).toBeInTheDocument()
    expect(importButton).not.toHaveAttribute('aria-label', 'Record a holding')
    expect(screen.getByRole('button', { name: 'Record a holding' })).toBeInTheDocument()
  })

  it('opens the sheet wired to the real active ledger, its decrypted holdings, members and instruments', async () => {
    listHoldings.mockResolvedValue({ holdings: [holding], unreadableCount: 0, notYetEncryptedCount: 0 })
    render(<Portfolio />)

    await screen.findByText("Ananya Verma's holdings")
    fireEvent.click(screen.getByRole('button', { name: /import to current/i }))

    await screen.findByTestId('import-host-sheet-stub')
    const lastCall = importHostSheetProps.mock.calls.at(-1)?.[0] as ImportHostSheetProps
    expect(lastCall.open).toBe(true)
    expect(lastCall.ledgerId).toBe('l1')
    expect(lastCall.ledgerName).toBe('Current')
    expect(lastCall.members).toEqual([member])
    expect(lastCall.instruments).toEqual([instrument])
    expect(lastCall.existingHoldings).toEqual([holding])
  })

  it('refetches the ledger holdings when the sheet reports a commit', async () => {
    listHoldings.mockResolvedValueOnce({ holdings: [holding], unreadableCount: 0, notYetEncryptedCount: 0 })
    render(<Portfolio />)

    await screen.findByText("Ananya Verma's holdings")
    expect(screen.getAllByText(/1 holding\b/i).length).toBeGreaterThan(0)

    const secondHolding = { ...holding, id: 'hold2' }
    listHoldings.mockResolvedValueOnce({
      holdings: [holding, secondHolding],
      unreadableCount: 0,
      notYetEncryptedCount: 0,
    })

    fireEvent.click(screen.getByRole('button', { name: /import to current/i }))
    await screen.findByTestId('import-host-sheet-stub')
    fireEvent.click(screen.getByRole('button', { name: /simulate commit/i }))

    await waitFor(() => expect(screen.getAllByText(/2 holdings/i).length).toBeGreaterThan(0))
  })
})
