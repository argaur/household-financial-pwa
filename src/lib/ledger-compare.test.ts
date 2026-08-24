import { describe, it, expect } from 'vitest'
import { computeLedgerTotals, computeLedgerComparison, type LedgerCompareInputHolding } from './ledger-compare'

// Shorthand for building fixtures without repeating the full holding shape.
const h = (assetClass: string, currentValue: string | null, monthlySip: string | null = null): LedgerCompareInputHolding => ({
  assetClass,
  currentValue,
  monthlySip,
})

describe('computeLedgerTotals', () => {
  it('returns all zeros, never NaN, for an empty ledger', () => {
    expect(computeLedgerTotals([])).toEqual({ totalValue: 0, equitySharePercent: 0, monthlySipTotal: 0 })
  })

  it('treats a null monthlySip as 0', () => {
    const totals = computeLedgerTotals([h('equity', '1000', null)])
    expect(totals.monthlySipTotal).toBe(0)
  })

  it('treats a non-numeric currentValue as 0, not NaN', () => {
    const totals = computeLedgerTotals([h('equity', 'not-a-number')])
    expect(totals.totalValue).toBe(0)
    expect(totals.equitySharePercent).toBe(0)
    expect(Number.isNaN(totals.totalValue)).toBe(false)
  })

  it('treats an empty-string currentValue as 0, not NaN', () => {
    const totals = computeLedgerTotals([h('equity', '')])
    expect(totals.totalValue).toBe(0)
    expect(Number.isNaN(totals.totalValue)).toBe(false)
  })

  it('rounds a floating-point decimal-string sum to 2 places (0.1 + 0.2 case)', () => {
    // Plain JS: 0.1 + 0.2 === 0.30000000000000004. The rounding policy exists
    // so that tail never reaches the compare-strip UI.
    const totals = computeLedgerTotals([h('equity', '0.1'), h('debt', '0.2')])
    expect(totals.totalValue).toBe(0.3)
  })

  it('hand-computed fixture: multiple asset classes and SIPs', () => {
    // equity 180000 + debt 20000 + gold 20000 = 220000 total.
    // equity share = 180000 / 220000 * 100 = 81.8181...% -> rounds to 81.82.
    // monthly SIP = 8000 (equity) + 0 (debt) + 1000 (gold) = 9000.
    const totals = computeLedgerTotals([
      h('equity', '180000', '8000'),
      h('debt', '20000', '0'),
      h('gold', '20000', '1000'),
    ])
    expect(totals.totalValue).toBe(220000)
    expect(totals.equitySharePercent).toBe(81.82)
    expect(totals.monthlySipTotal).toBe(9000)
  })
})

describe('computeLedgerComparison', () => {
  // Baseline ("Current"): equity 100000 + debt 50000 = 150000 total.
  // equity share = 100000 / 150000 * 100 = 66.6666...% -> rounds to 66.67.
  // monthly SIP = 5000 (equity) + 2000 (debt) = 7000.
  const baseline: LedgerCompareInputHolding[] = [
    h('equity', '100000', '5000'),
    h('debt', '50000', '2000'),
  ]

  // Ledger ("Aggressive"): equity 180000 + debt 20000 + gold 20000 = 220000 total.
  // equity share = 81.8181...% -> rounds to 81.82. Monthly SIP = 9000.
  const aggressive: LedgerCompareInputHolding[] = [
    h('equity', '180000', '8000'),
    h('debt', '20000', '0'),
    h('gold', '20000', '1000'),
  ]

  it('hand-computed fixture: deltas match manually worked-out numbers', () => {
    const result = computeLedgerComparison(aggressive, baseline)

    expect(result.ledger).toEqual({ totalValue: 220000, equitySharePercent: 81.82, monthlySipTotal: 9000 })
    expect(result.baseline).toEqual({ totalValue: 150000, equitySharePercent: 66.67, monthlySipTotal: 7000 })
    // 220000 - 150000 = 70000
    // 81.82 - 66.67 = 15.15 (percentage points, not a ratio)
    // 9000 - 7000 = 2000
    expect(result.delta).toEqual({
      totalValueDelta: 70000,
      equitySharePercentagePointDelta: 15.15,
      monthlySipDelta: 2000,
    })
  })

  it('a ledger identical to baseline yields all-zero deltas', () => {
    const result = computeLedgerComparison(baseline, baseline)
    expect(result.delta).toEqual({
      totalValueDelta: 0,
      equitySharePercentagePointDelta: 0,
      monthlySipDelta: 0,
    })
  })

  it('empty ledger against a populated baseline reports negative deltas, no NaN', () => {
    const result = computeLedgerComparison([], baseline)
    expect(result.ledger).toEqual({ totalValue: 0, equitySharePercent: 0, monthlySipTotal: 0 })
    expect(result.delta).toEqual({
      totalValueDelta: -150000,
      equitySharePercentagePointDelta: -66.67,
      monthlySipDelta: -7000,
    })
  })

  it('populated ledger against an empty baseline reports positive deltas equal to the ledger totals', () => {
    const result = computeLedgerComparison(aggressive, [])
    expect(result.baseline).toEqual({ totalValue: 0, equitySharePercent: 0, monthlySipTotal: 0 })
    expect(result.delta).toEqual({
      totalValueDelta: 220000,
      equitySharePercentagePointDelta: 81.82,
      monthlySipDelta: 9000,
    })
  })

  it('both sides empty yields all zeros, no NaN or Infinity anywhere', () => {
    const result = computeLedgerComparison([], [])
    expect(result.ledger).toEqual({ totalValue: 0, equitySharePercent: 0, monthlySipTotal: 0 })
    expect(result.baseline).toEqual({ totalValue: 0, equitySharePercent: 0, monthlySipTotal: 0 })
    expect(result.delta).toEqual({
      totalValueDelta: 0,
      equitySharePercentagePointDelta: 0,
      monthlySipDelta: 0,
    })
  })
})
