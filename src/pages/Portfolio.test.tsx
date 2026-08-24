import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Portfolio } from './Portfolio'
import { expectNoAxeViolations } from '@/test/axe'
import { expectNoCallCarriesPortfolioShape } from '@/test/analytics-guard'

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
const createHolding = vi.fn()
const updateHolding = vi.fn()
const deleteHolding = vi.fn()
vi.mock('@/lib/holdings-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/holdings-api')>()
  return {
    ...actual,
    listHoldings: (...args: unknown[]) => listHoldings(...args),
    createHolding: (...args: unknown[]) => createHolding(...args),
    updateHolding: (...args: unknown[]) => updateHolding(...args),
    deleteHolding: (...args: unknown[]) => deleteHolding(...args),
  }
})

const listLedgers = vi.fn()
vi.mock('@/lib/ledgers-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ledgers-api')>()
  return {
    ...actual,
    listLedgers: (...args: unknown[]) => listLedgers(...args),
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

const ledgerHolding = {
  ...holding,
  id: 'hold2',
  currentValue: '20000',
}

describe('Portfolio', () => {
  beforeEach(() => {
    listFamilyMembers.mockReset()
    listInstruments.mockReset()
    listHoldings.mockReset()
    createHolding.mockReset()
    updateHolding.mockReset()
    deleteHolding.mockReset()
    listLedgers.mockReset()
    track.mockReset()
    // The list clients return the decrypted rows plus counts of what could
    // not be read — see src/lib/encrypted-rows.ts.
    listFamilyMembers.mockResolvedValue({ members: [member], unreadableCount: 0, notYetEncryptedCount: 0 })
    listInstruments.mockResolvedValue([instrument])
    listLedgers.mockResolvedValue([baselineLedger])
  })

  it('shows the empty state and a CTA when there are no holdings', async () => {
    listHoldings.mockResolvedValue({ holdings: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    render(<Portfolio />)
    await screen.findByText(/nothing recorded yet/i)
    expect(screen.getByRole('button', { name: /record your first holding/i })).toBeInTheDocument()
  })

  it('lists holdings grouped by member with a summary line', async () => {
    listHoldings.mockResolvedValue({ holdings: [holding], unreadableCount: 0, notYetEncryptedCount: 0 })
    render(<Portfolio />)
    await screen.findByText("Ananya Verma's holdings")
    expect(screen.getByText('Large Cap Index Fund')).toBeInTheDocument()
    expect(screen.getAllByText(/1 holding · ₹10,500/i)).toHaveLength(2)
  })

  // /portfolio is one of the five screens documented at zero axe violations
  // live (see CLAUDE.md). Scanned with a holding listed, not the empty state,
  // so the row/summary markup is actually exercised.
  it('has zero axe violations', async () => {
    listHoldings.mockResolvedValue({ holdings: [holding], unreadableCount: 0, notYetEncryptedCount: 0 })
    const { container } = render(<Portfolio />)
    await screen.findByText("Ananya Verma's holdings")
    await expectNoAxeViolations(container)
  })

  it('opens the add sheet from the empty-state CTA and appends the created holding', async () => {
    listHoldings.mockResolvedValue({ holdings: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    createHolding.mockResolvedValue(holding)
    render(<Portfolio />)

    await screen.findByText(/nothing recorded yet/i)
    fireEvent.click(screen.getByRole('button', { name: /record your first holding/i }))

    await screen.findByRole('heading', { name: /record a holding/i })
    fireEvent.click(screen.getByRole('combobox', { name: /instrument/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Large Cap Index Fund' }))
    fireEvent.change(screen.getByLabelText(/amount invested/i), { target: { value: '10000' } })
    fireEvent.change(screen.getByLabelText(/current value/i), { target: { value: '10500' } })
    fireEvent.click(screen.getByRole('button', { name: /add to plan/i }))

    await screen.findByText('Large Cap Index Fund')
  })

  it('restores the pre-open scroll position after the add-holding sheet closes (B-002)', async () => {
    listHoldings.mockResolvedValue({ holdings: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    createHolding.mockResolvedValue(holding)
    render(<Portfolio />)

    await screen.findByText(/nothing recorded yet/i)

    // Page is scrolled slightly before the sheet opens — this is the offset
    // the user should land back on once the sheet closes.
    let scrollY = 40
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
    const scrollToSpy = vi.spyOn(window, 'scrollTo')

    fireEvent.click(screen.getByRole('button', { name: /record your first holding/i }))
    await screen.findByRole('heading', { name: /record a holding/i })

    // Simulate a mobile browser scrolling the fixed-position sheet's host
    // document while a lower field is focused — the tall-sheet scroll drift
    // that B-002 leaves behind.
    scrollY = 640

    fireEvent.click(screen.getByRole('combobox', { name: /instrument/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Large Cap Index Fund' }))
    fireEvent.change(screen.getByLabelText(/amount invested/i), { target: { value: '10000' } })
    fireEvent.change(screen.getByLabelText(/current value/i), { target: { value: '10500' } })
    fireEvent.click(screen.getByRole('button', { name: /add to plan/i }))

    await screen.findByText('Large Cap Index Fund')

    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 40 }))
  })

  it('opens the edit sheet pre-filled when a holding row is tapped', async () => {
    listHoldings.mockResolvedValue({ holdings: [holding], unreadableCount: 0, notYetEncryptedCount: 0 })
    updateHolding.mockResolvedValue({ ...holding, currentValue: '12000' })
    render(<Portfolio />)

    await screen.findByText('Large Cap Index Fund')
    fireEvent.click(screen.getByText('Large Cap Index Fund'))

    await screen.findByRole('heading', { name: /update holding/i })
    const currentValueInput = screen.getByLabelText(/current value/i) as HTMLInputElement
    expect(currentValueInput.value).toBe('10500')

    fireEvent.change(currentValueInput, { target: { value: '12000' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(updateHolding).toHaveBeenCalledWith(
          'test-token',
          'hold1',
          expect.objectContaining({ currentValue: '12000', assetClass: 'equity' }),
          1,
        ),
      )
  })

  it('restores the pre-open scroll position after the edit-holding sheet closes (B-002, shared seam)', async () => {
    listHoldings.mockResolvedValue({ holdings: [holding], unreadableCount: 0, notYetEncryptedCount: 0 })
    updateHolding.mockResolvedValue({ ...holding, currentValue: '12000' })
    render(<Portfolio />)

    await screen.findByText('Large Cap Index Fund')

    let scrollY = 40
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
    const scrollToSpy = vi.spyOn(window, 'scrollTo')

    fireEvent.click(screen.getByText('Large Cap Index Fund'))
    await screen.findByRole('heading', { name: /update holding/i })

    scrollY = 640

    const currentValueInput = screen.getByLabelText(/current value/i) as HTMLInputElement
    fireEvent.change(currentValueInput, { target: { value: '12000' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(updateHolding).toHaveBeenCalled())

    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 40 }))
  })

  it('mounts the ledger tab strip with Current always present', async () => {
    listHoldings.mockResolvedValue({ holdings: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    render(<Portfolio />)
    await screen.findByRole('tab', { name: 'Current' })
  })

  // THE HARD ACCEPTANCE RULE: adding, editing or deleting inside a
  // non-baseline ledger must leave Current byte-identical. These tests are
  // the criterion the whole feature rests on.
  describe('Current never changes', () => {
    it('the Current tab creates without a ledgerId, and never renders the compare strip (unchanged from before this chunk)', async () => {
      listHoldings.mockResolvedValue({ holdings: [], unreadableCount: 0, notYetEncryptedCount: 0 })
      createHolding.mockResolvedValue(holding)
      render(<Portfolio />)

      await screen.findByText(/nothing recorded yet/i)
      expect(screen.queryByText('Compared to Current')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /record your first holding/i }))
      await screen.findByRole('heading', { name: /record a holding/i })
      fireEvent.click(screen.getByRole('combobox', { name: /instrument/i }))
      fireEvent.click(await screen.findByRole('option', { name: 'Large Cap Index Fund' }))
      fireEvent.change(screen.getByLabelText(/amount invested/i), { target: { value: '10000' } })
      fireEvent.change(screen.getByLabelText(/current value/i), { target: { value: '10500' } })
      fireEvent.click(screen.getByRole('button', { name: /add to plan/i }))

      await waitFor(() => expect(createHolding).toHaveBeenCalled())
      // No third argument at all on the Current tab -- not even `undefined`
      // explicitly threaded, which is what "unchanged" means here.
      expect(createHolding).toHaveBeenCalledWith('test-token', expect.any(Object), undefined)
      expect(screen.queryByText('Compared to Current')).not.toBeInTheDocument()
    })

    it('adding a holding on a non-baseline tab calls createHolding WITH that ledgerId, and leaves Current unchanged', async () => {
      listLedgers.mockResolvedValue([baselineLedger, nonBaselineLedger])
      listHoldings.mockImplementation(async (_token: unknown, ledgerId?: string) => {
        if (ledgerId === nonBaselineLedger.id) {
          return { holdings: [], unreadableCount: 0, notYetEncryptedCount: 0 }
        }
        return { holdings: [holding], unreadableCount: 0, notYetEncryptedCount: 0 }
      })
      createHolding.mockResolvedValue(ledgerHolding)
      render(<Portfolio />)

      // Current loads first, with its one holding.
      await screen.findByText('Large Cap Index Fund')
      expect(screen.getAllByText(/1 holding · ₹10,500/i)).toHaveLength(2)

      fireEvent.click(screen.getByRole('tab', { name: 'Aggressive growth' }))
      await screen.findByText(/nothing recorded yet/i)
      await screen.findByText('Compared to Current')

      fireEvent.click(screen.getByRole('button', { name: /record your first holding/i }))
      await screen.findByRole('heading', { name: /record a holding/i })
      fireEvent.click(screen.getByRole('combobox', { name: /instrument/i }))
      fireEvent.click(await screen.findByRole('option', { name: 'Large Cap Index Fund' }))
      fireEvent.change(screen.getByLabelText(/amount invested/i), { target: { value: '10000' } })
      fireEvent.change(screen.getByLabelText(/current value/i), { target: { value: '20000' } })
      fireEvent.click(screen.getByRole('button', { name: /add to plan/i }))

      await waitFor(() =>
        expect(createHolding).toHaveBeenCalledWith('test-token', expect.any(Object), nonBaselineLedger.id),
      )
      await waitFor(() => expect(screen.getAllByText(/1 holding · ₹20,000/i)).toHaveLength(2))

      // Switch back to Current: still exactly the one original holding, at
      // its original value -- the ledger's add did not touch it.
      fireEvent.click(screen.getByRole('tab', { name: 'Current' }))
      await waitFor(() => expect(screen.getAllByText(/1 holding · ₹10,500/i)).toHaveLength(2))
      expect(screen.queryByText(/₹20,000/i)).not.toBeInTheDocument()
    })

    it('deleting inside a non-baseline ledger drops only that ledger row and leaves Current unchanged', async () => {
      listLedgers.mockResolvedValue([baselineLedger, nonBaselineLedger])
      listHoldings.mockImplementation(async (_token: unknown, ledgerId?: string) => {
        if (ledgerId === nonBaselineLedger.id) {
          return { holdings: [ledgerHolding], unreadableCount: 0, notYetEncryptedCount: 0 }
        }
        return { holdings: [holding], unreadableCount: 0, notYetEncryptedCount: 0 }
      })
      deleteHolding.mockResolvedValue(undefined)
      render(<Portfolio />)

      await screen.findByText('Large Cap Index Fund')
      fireEvent.click(screen.getByRole('tab', { name: 'Aggressive growth' }))
      await waitFor(() => expect(screen.getAllByText(/1 holding · ₹20,000/i)).toHaveLength(2))

      // Open the edit sheet on the ledger's own row, then remove it. The
      // holding card is itself the edit trigger (see Portfolio.tsx).
      fireEvent.click(screen.getByRole('button', { name: /large cap index fund/i }))
      fireEvent.click(await screen.findByRole('button', { name: /remove holding/i }))
      fireEvent.click(await screen.findByRole('button', { name: /^removing|^remove holding$/i }))

      await waitFor(() => expect(deleteHolding).toHaveBeenCalledWith('test-token', ledgerHolding.id))
      await screen.findByText(/nothing recorded yet/i)

      // Current is untouched: still its one original holding at its original value.
      fireEvent.click(screen.getByRole('tab', { name: 'Current' }))
      await waitFor(() => expect(screen.getAllByText(/1 holding · ₹10,500/i)).toHaveLength(2))
      expect(listHoldings).not.toHaveBeenCalledWith('test-token', baselineLedger.id)
    })
  })

  describe('ledger switching', () => {
    it('fires ledger_switched only on a user-initiated tab change, never on initial mount', async () => {
      listLedgers.mockResolvedValue([baselineLedger, nonBaselineLedger])
      listHoldings.mockResolvedValue({ holdings: [holding], unreadableCount: 0, notYetEncryptedCount: 0 })
      render(<Portfolio />)

      await screen.findByRole('tab', { name: 'Current' })
      expect(track).not.toHaveBeenCalledWith('ledger_switched', {})

      fireEvent.click(screen.getByRole('tab', { name: 'Aggressive growth' }))
      await waitFor(() => expect(track).toHaveBeenCalledWith('ledger_switched', {}))
      expect(track.mock.calls.filter(([name]) => name === 'ledger_switched')).toHaveLength(1)

      expectNoCallCarriesPortfolioShape(track)
    })

    it('does not overwrite a newer tab with a slow response from an abandoned one', async () => {
      const thirdLedger = { ...nonBaselineLedger, id: 'l3', name: 'Balanced' }
      listLedgers.mockResolvedValue([baselineLedger, nonBaselineLedger, thirdLedger])

      let resolveSlow: (value: { holdings: (typeof holding)[]; unreadableCount: number; notYetEncryptedCount: number }) => void =
        () => {}
      const slow = new Promise<{ holdings: (typeof holding)[]; unreadableCount: number; notYetEncryptedCount: number }>(
        (resolve) => {
          resolveSlow = resolve
        },
      )

      listHoldings.mockImplementation(async (_token: unknown, ledgerId?: string) => {
        if (!ledgerId) return { holdings: [holding], unreadableCount: 0, notYetEncryptedCount: 0 }
        if (ledgerId === nonBaselineLedger.id) return slow
        if (ledgerId === thirdLedger.id) return { holdings: [ledgerHolding], unreadableCount: 0, notYetEncryptedCount: 0 }
        return { holdings: [], unreadableCount: 0, notYetEncryptedCount: 0 }
      })

      render(<Portfolio />)
      await screen.findByText('Large Cap Index Fund')

      fireEvent.click(screen.getByRole('tab', { name: 'Aggressive growth' })) // slow fetch left in flight
      fireEvent.click(screen.getByRole('tab', { name: 'Balanced' })) // abandons it before it resolves

      await waitFor(() => expect(screen.getAllByText(/1 holding · ₹20,000/i)).toHaveLength(2))

      // The abandoned fetch resolves late, with Current's own holding.
      resolveSlow({ holdings: [holding], unreadableCount: 0, notYetEncryptedCount: 0 })
      await new Promise((resolve) => setTimeout(resolve, 0))

      // Still Balanced's holding -- the stale response never landed.
      expect(screen.getAllByText(/1 holding · ₹20,000/i)).toHaveLength(2)
      expect(screen.queryByText(/₹10,500/i)).not.toBeInTheDocument()
    })
  })
})
