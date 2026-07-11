import { describe, it, expect } from 'vitest'
import { instrumentsSeedData } from './instruments-data.js'

describe('instrumentsSeedData', () => {
  it('has exactly 30 instruments', () => {
    expect(instrumentsSeedData).toHaveLength(30)
  })

  it('has exactly 5 instruments per category, across categories 1-6', () => {
    const counts = new Map<number, number>()
    for (const row of instrumentsSeedData) {
      counts.set(row.category, (counts.get(row.category) ?? 0) + 1)
    }
    expect([...counts.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6])
    for (const category of [1, 2, 3, 4, 5, 6]) {
      expect(counts.get(category)).toBe(5)
    }
  })

  it('has unique slugs', () => {
    const slugs = instrumentsSeedData.map((row) => row.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('has all required text fields non-empty for every row', () => {
    const requiredFields = ['slug', 'name', 'summary', 'returns', 'tax', 'liquidity', 'risk', 'eligibility', 'minInvestment'] as const
    for (const row of instrumentsSeedData) {
      for (const field of requiredFields) {
        expect(row[field].trim().length, `${row.slug}.${field}`).toBeGreaterThan(0)
      }
    }
  })

  it('only sets rateValue where rateAsOf is also set, and vice versa', () => {
    for (const row of instrumentsSeedData) {
      const hasRate = row.rateValue !== null
      const hasRateAsOf = row.rateAsOf !== null
      expect(hasRate, `${row.slug} rateValue/rateAsOf must both be set or both null`).toBe(hasRateAsOf)
    }
  })

  it('rateValue, where set, parses as a plausible annual percentage', () => {
    for (const row of instrumentsSeedData) {
      if (row.rateValue === null) continue
      const value = Number(row.rateValue)
      expect(Number.isFinite(value), row.slug).toBe(true)
      expect(value, row.slug).toBeGreaterThan(0)
      expect(value, row.slug).toBeLessThan(20)
    }
  })
})
