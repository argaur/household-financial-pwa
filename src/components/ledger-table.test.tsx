import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LedgerTable } from './ledger-table'
import { expectNoAxeViolations } from '@/test/axe'
import type { Holding } from '@/lib/holdings-api'
import type { Instrument } from '@/lib/instruments-api'

function makeHolding(overrides: Partial<Holding>): Holding {
  return {
    id: 'h1',
    householdId: 'hh1',
    memberId: 'm1',
    instrumentId: 'i1',
    assetClass: 'equity',
    investedAmount: '10000',
    currentValue: '10000',
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

const instrument: Instrument = {
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

const goldInstrument: Instrument = { ...instrument, id: 'i2', slug: 'physical-gold', name: 'Gold, physical' }

describe('LedgerTable', () => {
  it('renders one row per holding with its instrument name and current value', () => {
    const holdings = [
      makeHolding({ id: 'h1', currentValue: '10000' }),
      makeHolding({ id: 'h2', instrumentId: 'i2', currentValue: '5000' }),
    ]
    render(<LedgerTable holdings={holdings} instruments={[instrument, goldInstrument]} onSelect={vi.fn()} />)

    expect(screen.getByText('Large Cap Index Fund')).toBeInTheDocument()
    expect(screen.getByText('₹10,000')).toBeInTheDocument()
    expect(screen.getByText('₹5,000')).toBeInTheDocument()
  })

  it('falls back to "Holding" when the instrument cannot be found', () => {
    const holdings = [makeHolding({ id: 'h1', instrumentId: 'missing' })]
    render(<LedgerTable holdings={holdings} instruments={[instrument]} onSelect={vi.fn()} />)

    expect(screen.getByText('Holding')).toBeInTheDocument()
  })

  it('closes the total row with a double rule and sums the visible rows', () => {
    const holdings = [
      makeHolding({ id: 'h1', currentValue: '10000' }),
      makeHolding({ id: 'h2', instrumentId: 'i2', currentValue: '5000' }),
    ]
    const { container } = render(
      <LedgerTable holdings={holdings} instruments={[instrument, goldInstrument]} onSelect={vi.fn()} />,
    )

    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('₹15,000')).toBeInTheDocument()

    const totalRow = screen.getByText('Total').closest('tr')
    expect(totalRow?.className).toContain('border-double')
    expect(totalRow?.className).toMatch(/border-t-\[3px\]/)
    expect(container.querySelectorAll('tr[role="button"]')).toHaveLength(2)
  })

  it('weighs each row against an explicit ledgerTotalValue rather than the passed-in subset', () => {
    // The subset here (10000 + 5000 = 15000) is well short of the ledger's
    // real total (40000), so neither row's weight equals its "share of the
    // subset" figure -- proving the denominator is the explicit prop, not
    // rowsTotal.
    const holdings = [
      makeHolding({ id: 'h1', currentValue: '10000' }),
      makeHolding({ id: 'h2', instrumentId: 'i2', currentValue: '5000' }),
    ]
    render(
      <LedgerTable
        holdings={holdings}
        instruments={[instrument, goldInstrument]}
        ledgerTotalValue={40000}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText('13%')).toBeInTheDocument()
    // Total row: subset (15000) against the ledger total (40000) = 38%, not 100%.
    expect(screen.getByText('38%')).toBeInTheDocument()
  })

  it('calls onSelect with the holding when a row is clicked', () => {
    const onSelect = vi.fn()
    const holdings = [makeHolding({ id: 'h1' })]
    render(<LedgerTable holdings={holdings} instruments={[instrument]} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: /large cap index fund/i }))
    expect(onSelect).toHaveBeenCalledWith(holdings[0])
  })

  it('calls onSelect on Enter and Space for keyboard access', () => {
    const onSelect = vi.fn()
    const holdings = [makeHolding({ id: 'h1' })]
    render(<LedgerTable holdings={holdings} instruments={[instrument]} onSelect={onSelect} />)

    const row = screen.getByRole('button', { name: /large cap index fund/i })
    fireEvent.keyDown(row, { key: 'Enter' })
    fireEvent.keyDown(row, { key: ' ' })
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it('renders nothing for an empty holdings list rather than an empty table shell', () => {
    const { container } = render(<LedgerTable holdings={[]} instruments={[instrument]} onSelect={vi.fn()} />)
    expect(container.querySelector('table')).not.toBeInTheDocument()
  })

  it('has zero axe violations', async () => {
    const holdings = [makeHolding({ id: 'h1' })]
    const { container } = render(<LedgerTable holdings={holdings} instruments={[instrument]} onSelect={vi.fn()} />)
    await expectNoAxeViolations(container)
  })
})
