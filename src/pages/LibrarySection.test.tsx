import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { LibrarySection } from './LibrarySection'
import type { Instrument } from '@/lib/instruments-api'
import type { Holding } from '@/lib/holdings-api'

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))

const getToken = vi.fn().mockResolvedValue('test-token')
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken }),
}))

const listInstruments = vi.fn()
vi.mock('@/lib/instruments-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instruments-api')>()
  return { ...actual, listInstruments: (...args: unknown[]) => listInstruments(...args) }
})

const getVault = vi.fn()
vi.mock('@/lib/crypto/key-store', () => ({
  getVault: (...args: unknown[]) => getVault(...args),
}))

const listHoldings = vi.fn()
vi.mock('@/lib/holdings-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/holdings-api')>()
  return { ...actual, listHoldings: (...args: unknown[]) => listHoldings(...args) }
})

// The sheet's own vault-resolution/unlock/holding-form behaviour is covered
// by add-holding-sheet.test.tsx. Here it's stubbed to a minimal controlled
// shell so LibrarySection's own wiring (open state, onAdded plumbing) can be
// tested without dragging in that whole resolution chain.
vi.mock('@/components/add-holding-sheet', () => ({
  AddHoldingSheet: ({
    instrument,
    open,
    onAdded,
  }: {
    instrument: Instrument
    open: boolean
    onOpenChange: (open: boolean) => void
    onAdded: (holding: Holding) => void
  }) =>
    open ? (
      <div data-testid={`sheet-${instrument.slug}`}>
        <button
          onClick={() =>
            onAdded({
              id: 'hold-1',
              householdId: 'h1',
              memberId: 'm1',
              instrumentId: instrument.id,
              assetClass: 'equity',
              investedAmount: '1000',
              currentValue: '1000',
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
            })
          }
        >
          Simulate save
        </button>
      </div>
    ) : null,
}))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/explore/:sectionSlug" element={<LibrarySection />} />
        <Route path="/explore" element={<div>Explore page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

const instrumentA: Instrument = {
  id: 'i1',
  slug: 'equity-direct-stocks',
  category: 1,
  name: 'Direct Stocks',
  summary: 'Buying shares of individual companies on the stock exchange.',
  returns: 'Market-linked',
  tax: '',
  liquidity: '',
  risk: 'High',
  eligibility: '',
  minInvestment: '',
  rateValue: null,
  rateAsOf: null,
  createdAt: '',
}

const instrumentB: Instrument = {
  id: 'i2',
  slug: 'equity-index-fund',
  category: 1,
  name: 'Index Fund',
  summary: 'Tracks a market index rather than picking individual stocks.',
  returns: 'Market-linked',
  tax: '',
  liquidity: '',
  risk: 'Moderate',
  eligibility: '',
  minInvestment: '',
  rateValue: null,
  rateAsOf: null,
  createdAt: '',
}

describe('LibrarySection', () => {
  beforeEach(() => {
    listInstruments.mockReset()
    getToken.mockClear()
    getVault.mockReset()
    getVault.mockResolvedValue(null)
    listHoldings.mockReset()
  })

  it('lists instruments with name, full summary and the extracted risk level', async () => {
    listInstruments.mockResolvedValue([
      {
        slug: 'equity-direct-stocks',
        name: 'Direct Stocks',
        summary: 'Buying shares of individual companies on the stock exchange.',
        returns: 'Market-linked; can swing sharply either way over short periods.',
        risk: 'High — concentrated in single-company performance; no diversification unless built manually.',
      },
    ])
    renderAt('/explore/equity')

    await screen.findByText('Direct Stocks')
    expect(listInstruments).toHaveBeenCalledWith(1)
    // The summary renders whole — a card never shows a clipped paragraph.
    expect(screen.getByText('Buying shares of individual companies on the stock exchange.')).toBeInTheDocument()
    // Risk is the lead clause, not the full paragraph clamped to one line.
    expect(screen.getByText('High', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText(/no diversification unless built manually/)).not.toBeInTheDocument()
    // The full returns paragraph belongs to the detail page, not the card.
    expect(screen.queryByText(/over short periods/)).not.toBeInTheDocument()
    // High has a plain-word gloss in the static lookup, added inline.
    expect(screen.getByText(/value can drop a lot in the short term/i)).toBeInTheDocument()
  })

  it('links each instrument to its detail page', async () => {
    listInstruments.mockResolvedValue([
      {
        slug: 'equity-direct-stocks',
        name: 'Direct Stocks',
        summary: 'Buying shares of individual companies on the stock exchange.',
        returns: 'Market-linked',
        risk: 'High',
      },
    ])
    renderAt('/explore/equity')

    const link = await screen.findByText('Direct Stocks')
    expect(link.closest('a')).toHaveAttribute('href', '/explore/equity/equity-direct-stocks')
  })

  it('redirects to /explore for an unknown section slug', () => {
    renderAt('/explore/not-a-real-section')
    expect(screen.getByText('Explore page')).toBeInTheDocument()
  })

  it('shows an error state when the fetch fails', async () => {
    listInstruments.mockRejectedValue(new Error('network error'))
    renderAt('/explore/equity')

    await screen.findByText(/couldn't load this section/i)
  })

  it('renders a "+ Add" button on each instrument card', async () => {
    listInstruments.mockResolvedValue([instrumentA, instrumentB])
    renderAt('/explore/equity')

    await screen.findByText('Direct Stocks')
    expect(screen.getAllByRole('button', { name: /\+ add/i })).toHaveLength(2)
  })

  it('a locked/absent vault (getVault returns null) never calls listHoldings, and no card renders held', async () => {
    getVault.mockResolvedValue(null)
    listInstruments.mockResolvedValue([instrumentA, instrumentB])
    renderAt('/explore/equity')

    await screen.findByText('Direct Stocks')
    await waitFor(() => expect(getVault).toHaveBeenCalled())
    // Flush the microtask queue past the point where a wrongly-gated effect
    // would reach listHoldings. getVault/getToken/listHoldings all resolve
    // via mockResolvedValue, so a buggy effect chains: getVault resolves ->
    // (microtask) getToken() is called and resolves -> (microtask)
    // listHoldings() is called. A macrotask boundary (setTimeout) only fires
    // once every pending microtask, however deeply chained, has drained --
    // so this is a deterministic barrier past that call site, not a timing
    // guess. Without this flush, the assertions below run before the buggy
    // path's listHoldings call would have happened and pass vacuously
    // regardless of whether the getVault gate is even present (verified by
    // mutation: deleting the `!vault` guard in LibrarySection.tsx makes this
    // test fail with this flush in place, and pass without it).
    await new Promise((resolve) => setTimeout(resolve, 0))
    // The correct implementation never reaches getToken in the locked case
    // (it returns immediately after getVault resolves null). Asserting this
    // pins the same constraint from a second angle, though it alone would
    // not close the race above.
    expect(getToken).not.toHaveBeenCalled()
    expect(listHoldings).not.toHaveBeenCalled()
    expect(screen.queryByText(/in ledger/i)).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /\+ add/i })).toHaveLength(2)
  })

  it('with an unlocked vault, an already-held instrument shows "In ledger" and no "+ Add" button, while unheld cards keep theirs', async () => {
    getVault.mockResolvedValue({ householdId: 'h1', dataKey: {} })
    listHoldings.mockResolvedValue({
      holdings: [{ instrumentId: 'i1' }],
      unreadableCount: 0,
      notYetEncryptedCount: 0,
    })
    listInstruments.mockResolvedValue([instrumentA, instrumentB])
    renderAt('/explore/equity')

    await waitFor(() => expect(listHoldings).toHaveBeenCalledWith('test-token', undefined))
    await screen.findByText(/in ledger/i)
    expect(screen.getAllByRole('button', { name: /\+ add/i })).toHaveLength(1)
  })

  it('tapping "+ Add" opens the sheet for that instrument without navigating away', async () => {
    getVault.mockResolvedValue(null)
    listInstruments.mockResolvedValue([instrumentA, instrumentB])
    renderAt('/explore/equity')

    await screen.findByText('Direct Stocks')
    const buttons = screen.getAllByRole('button', { name: /\+ add/i })
    fireEvent.click(buttons[0])

    expect(screen.getByTestId('sheet-equity-direct-stocks')).toBeInTheDocument()
    expect(screen.queryByTestId('sheet-equity-index-fund')).not.toBeInTheDocument()
    // The detail-page link is still intact — no navigation occurred.
    const link = screen.getByText('Direct Stocks')
    expect(link.closest('a')).toHaveAttribute('href', '/explore/equity/equity-direct-stocks')
  })

  it('after a successful save via onAdded, the card re-renders as held with no refetch', async () => {
    getVault.mockResolvedValue({ householdId: 'h1', dataKey: {} })
    listHoldings.mockResolvedValue({ holdings: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    listInstruments.mockResolvedValue([instrumentA, instrumentB])
    renderAt('/explore/equity')

    await waitFor(() => expect(listHoldings).toHaveBeenCalledTimes(1))
    const buttons = screen.getAllByRole('button', { name: /\+ add/i })
    fireEvent.click(buttons[0])
    fireEvent.click(screen.getByRole('button', { name: /simulate save/i }))

    await screen.findByText(/in ledger/i)
    expect(screen.getAllByRole('button', { name: /\+ add/i })).toHaveLength(1)
    expect(listHoldings).toHaveBeenCalledTimes(1)
  })
})
