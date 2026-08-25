import { describe, it, expect } from 'vitest'
import { computeAllocation, type AllocationInputHolding } from './allocation.js'

function holding(overrides: Partial<AllocationInputHolding> = {}): AllocationInputHolding {
  return { assetClass: 'equity', currentValue: '1000', ...overrides }
}

describe('computeAllocation', () => {
  it('returns an empty allocation and zero total for no holdings', () => {
    const result = computeAllocation([])
    expect(result.allocation).toEqual([])
    expect(result.totalValue).toBe(0)
  })

  it('a single asset class is 100%', () => {
    const result = computeAllocation([holding({ assetClass: 'equity', currentValue: '500' })])
    expect(result.totalValue).toBe(500)
    expect(result.allocation).toEqual([{ assetClass: 'equity', value: 500, percentage: 100 }])
  })

  it('several asset classes sum to 100% when they divide evenly', () => {
    const result = computeAllocation([
      holding({ assetClass: 'equity', currentValue: '600' }),
      holding({ assetClass: 'debt', currentValue: '300' }),
      holding({ assetClass: 'gold', currentValue: '100' }),
    ])
    expect(result.totalValue).toBe(1000)
    expect(result.allocation).toEqual([
      { assetClass: 'equity', value: 600, percentage: 60 },
      { assetClass: 'debt', value: 300, percentage: 30 },
      { assetClass: 'gold', value: 100, percentage: 10 },
    ])
  })

  it('aggregates multiple holdings within the same asset class', () => {
    const result = computeAllocation([
      holding({ assetClass: 'equity', currentValue: '400' }),
      holding({ assetClass: 'equity', currentValue: '200' }),
      holding({ assetClass: 'debt', currentValue: '400' }),
    ])
    expect(result.totalValue).toBe(1000)
    expect(result.allocation).toEqual([
      { assetClass: 'equity', value: 600, percentage: 60 },
      { assetClass: 'debt', value: 400, percentage: 40 },
    ])
  })

  it('treats a null currentValue as zero', () => {
    const result = computeAllocation([holding({ currentValue: null }), holding({ assetClass: 'debt', currentValue: '200' })])
    expect(result.totalValue).toBe(200)
    expect(result.allocation).toEqual([
      { assetClass: 'equity', value: 0, percentage: 0 },
      { assetClass: 'debt', value: 200, percentage: 100 },
    ])
  })

  it('rounds each slice independently, so percentages are not guaranteed to sum to exactly 100', () => {
    // 1/3, 1/3, 1/3 of 300 each -> 33.33...% each -> rounds to 33 each -> sums to 99, not 100.
    const result = computeAllocation([
      holding({ assetClass: 'equity', currentValue: '100' }),
      holding({ assetClass: 'debt', currentValue: '100' }),
      holding({ assetClass: 'gold', currentValue: '100' }),
    ])
    expect(result.totalValue).toBe(300)
    expect(result.allocation.map((a) => a.percentage)).toEqual([33, 33, 33])
    expect(result.allocation.reduce((sum, a) => sum + a.percentage, 0)).toBe(99)
  })

  it('orders slices by the fixed asset-class order, not insertion order', () => {
    const result = computeAllocation([
      holding({ assetClass: 'gold', currentValue: '100' }),
      holding({ assetClass: 'equity', currentValue: '100' }),
    ])
    expect(result.allocation.map((a) => a.assetClass)).toEqual(['equity', 'gold'])
  })

  // D-016 Slice 5 — emergency fund is a per-holding flag, so it is reported as
  // a subset of each asset class rather than a class of its own.
  it('reports the flagged part of a class as reserveValue, without changing value or percentage', () => {
    const result = computeAllocation([
      holding({ assetClass: 'debt', currentValue: '1800' }),
      holding({ assetClass: 'debt', currentValue: '1200', isEmergencyFund: true }),
      holding({ assetClass: 'equity', currentValue: '7000' }),
    ])
    expect(result.totalValue).toBe(10000)
    expect(result.allocation).toEqual([
      { assetClass: 'equity', value: 7000, percentage: 70 },
      { assetClass: 'debt', value: 3000, percentage: 30, reserveValue: 1200 },
    ])
  })

  it('tracks a reserve spread across more than one asset class', () => {
    const result = computeAllocation([
      holding({ assetClass: 'equity', currentValue: '500', isEmergencyFund: true }),
      holding({ assetClass: 'debt', currentValue: '500', isEmergencyFund: true }),
    ])
    expect(result.allocation.map((a) => a.reserveValue)).toEqual([500, 500])
  })

  it('omits reserveValue entirely when nothing is flagged, rather than reporting zero', () => {
    const result = computeAllocation([holding({ assetClass: 'equity', currentValue: '100', isEmergencyFund: false })])
    expect(result.allocation[0]).not.toHaveProperty('reserveValue')
  })

  it('omits asset classes with no holdings entirely, rather than a zero-value slice', () => {
    const result = computeAllocation([holding({ assetClass: 'equity', currentValue: '100' })])
    expect(result.allocation).toHaveLength(1)
    expect(result.allocation.map((a) => a.assetClass)).toEqual(['equity'])
  })
})
