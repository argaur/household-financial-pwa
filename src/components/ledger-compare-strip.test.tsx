import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LedgerCompareStrip } from './ledger-compare-strip'
import { expectNoAxeViolations } from '@/test/axe'
import { expectNoCallCarriesPortfolioShape } from '@/test/analytics-guard'
import type { Ledger } from '@/lib/ledgers-api'

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

const copiedLedger: Ledger = {
  id: 'ledger-1',
  householdId: 'h1',
  name: 'Aggressive growth',
  isBaseline: false,
  origin: 'manual',
  snapshotOf: 'baseline-1',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const blankLedger: Ledger = {
  ...copiedLedger,
  id: 'ledger-2',
  snapshotOf: null,
}

// Chosen so all three deltas land on different, non-zero values -- a shared
// fixture that produced two identical deltas would make assertions ambiguous
// (two "No change" nodes, etc).
const ledgerHoldings = [
  { assetClass: 'equity', currentValue: '150000', monthlySip: '12000' },
  { assetClass: 'debt', currentValue: '50000', monthlySip: '0' },
]

const baselineHoldings = [
  { assetClass: 'equity', currentValue: '80000', monthlySip: '5000' },
  { assetClass: 'debt', currentValue: '80000', monthlySip: '3000' },
]

describe('LedgerCompareStrip', () => {
  beforeEach(() => {
    track.mockReset()
  })

  it('renders the three totals with their deltas against Current', async () => {
    render(<LedgerCompareStrip ledger={copiedLedger} ledgerHoldings={ledgerHoldings} baselineHoldings={baselineHoldings} />)

    expect(screen.getByText('Current value (₹)')).toBeInTheDocument()
    expect(screen.getByText('₹2,00,000')).toBeInTheDocument()
    // ledger total 200000 vs baseline total 160000 -> +40000
    expect(screen.getByText('+₹40,000 vs Current')).toBeInTheDocument()

    expect(screen.getByText('Monthly SIP amount (₹)')).toBeInTheDocument()
    expect(screen.getByText('₹12,000')).toBeInTheDocument()
    // ledger SIP 12000 vs baseline SIP 8000 -> +4000
    expect(screen.getByText('+₹4,000 vs Current')).toBeInTheDocument()
  })

  it('shows the equity share delta in percentage points, worded so it cannot read as a percent change', async () => {
    render(<LedgerCompareStrip ledger={copiedLedger} ledgerHoldings={ledgerHoldings} baselineHoldings={baselineHoldings} />)
    // ledger equity share: 150000/200000 = 75%; baseline: 80000/160000 = 50% -> +25pp
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('+25 percentage points vs Current')).toBeInTheDocument()
  })

  it('shows "No change" rather than a zero-with-sign when a delta is exactly zero', async () => {
    // Ledger's own numbers equal to the baseline's -- every delta is 0.
    render(<LedgerCompareStrip ledger={copiedLedger} ledgerHoldings={baselineHoldings} baselineHoldings={baselineHoldings} />)
    expect(screen.getAllByText('No change vs Current')).toHaveLength(3)
  })

  it('shows a real minus sign for a negative delta', async () => {
    const lowerLedgerHoldings = [{ assetClass: 'equity', currentValue: '50000', monthlySip: '0' }]
    render(<LedgerCompareStrip ledger={copiedLedger} ledgerHoldings={lowerLedgerHoldings} baselineHoldings={baselineHoldings} />)
    // 50000 vs baseline 160000 -> -110000
    expect(screen.getByText('−₹1,10,000 vs Current')).toBeInTheDocument()
  })

  it('states the snapshot date and non-propagation for a copied ledger', async () => {
    render(<LedgerCompareStrip ledger={copiedLedger} ledgerHoldings={ledgerHoldings} baselineHoldings={baselineHoldings} />)
    expect(screen.getByText(/copied from Current on/i)).toBeInTheDocument()
    expect(screen.getByText(/don't carry over here/i)).toBeInTheDocument()
  })

  it('omits the propagation note for a blank (non-copied) ledger', async () => {
    render(<LedgerCompareStrip ledger={blankLedger} ledgerHoldings={ledgerHoldings} baselineHoldings={baselineHoldings} />)
    expect(screen.queryByText(/copied from Current on/i)).not.toBeInTheDocument()
  })

  it('fires compare_strip_viewed once per ledger view, not on every re-render', async () => {
    const { rerender } = render(
      <LedgerCompareStrip ledger={copiedLedger} ledgerHoldings={ledgerHoldings} baselineHoldings={baselineHoldings} />,
    )
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('compare_strip_viewed', {})

    // Same ledger, holdings changed (e.g. an edit) -- must not refire.
    rerender(
      <LedgerCompareStrip
        ledger={copiedLedger}
        ledgerHoldings={[...ledgerHoldings, { assetClass: 'gold', currentValue: '10000', monthlySip: null }]}
        baselineHoldings={baselineHoldings}
      />,
    )
    expect(track).toHaveBeenCalledTimes(1)

    // Switching to a different ledger view fires again.
    rerender(<LedgerCompareStrip ledger={blankLedger} ledgerHoldings={ledgerHoldings} baselineHoldings={baselineHoldings} />)
    expect(track).toHaveBeenCalledTimes(2)

    expectNoCallCarriesPortfolioShape(track)
  })

  it('has zero axe violations', async () => {
    const { container } = render(
      <LedgerCompareStrip ledger={copiedLedger} ledgerHoldings={ledgerHoldings} baselineHoldings={baselineHoldings} />,
    )
    await expectNoAxeViolations(container)
  })
})
