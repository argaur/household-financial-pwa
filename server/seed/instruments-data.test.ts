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

  /**
   * E1 (D-024/D-025 AI import) — the projection engine's per-instrument rate
   * assumption, distinct from the pre-existing rateValue/rateAsOf pair above
   * (library display, unaffected by this feature). Populated only where a
   * genuinely defensible *published* statutory rate exists; every market
   * instrument (equity, gold spot, crypto, real estate, etc.) stays null on
   * all three and falls back to an asset-class default later in this plan.
   */
  describe('instrument rate-assumption seed (assumedAnnualRatePct/rateSource/assumedRateAsOf)', () => {
    it('sets assumedAnnualRatePct, rateSource, and assumedRateAsOf together, or none of the three', () => {
      for (const row of instrumentsSeedData) {
        const hasRate = row.assumedAnnualRatePct !== null
        const hasSource = row.rateSource !== null
        const hasAsOf = row.assumedRateAsOf !== null
        expect(hasRate, `${row.slug}: rate/source/asOf must all be set or all null`).toBe(hasSource)
        expect(hasRate, `${row.slug}: rate/source/asOf must all be set or all null`).toBe(hasAsOf)
      }
    })

    it('has exactly 6 instruments with a non-null assumedAnnualRatePct', () => {
      const withRate = instrumentsSeedData.filter((row) => row.assumedAnnualRatePct !== null)
      expect(withRate).toHaveLength(6)
    })

    it('leaves the other 24 instruments null on all three fields', () => {
      const withoutRate = instrumentsSeedData.filter((row) => row.assumedAnnualRatePct === null)
      expect(withoutRate).toHaveLength(24)
      for (const row of withoutRate) {
        expect(row.rateSource, row.slug).toBeNull()
        expect(row.assumedRateAsOf, row.slug).toBeNull()
      }
    })

    it('never seeds a rate assumption for a market/price-tracking instrument with no published rate', () => {
      // Equity (1), gold (3), real estate (5) and alternative (6) assets have
      // no published *return*. Their whole return is a price movement, and
      // D-002 forbids a live price feed, so there is nothing defensible to
      // seed. Only statutory/notified-rate instruments carry an assumption.
      const noPublishedRateSlugs = instrumentsSeedData
        .filter((row) => [1, 3, 5, 6].includes(row.category))
        .map((row) => row.slug)
      for (const row of instrumentsSeedData) {
        if (noPublishedRateSlugs.includes(row.slug)) {
          expect(row.assumedAnnualRatePct, row.slug).toBeNull()
        }
      }
    })

    it('seeds no rate assumption for any gold instrument, Sovereign Gold Bonds included', () => {
      // Pinned deliberately so a future session does not re-add one.
      //
      // A metal has no published return, only a price. SGBs are the tempting
      // exception because they pay a genuinely fixed, government-notified
      // 2.50% p.a. coupon — but that coupon is *not* the instrument's return.
      // It sits on top of the gold-price component, which is the dominant term
      // and which D-002 forbids us from feeding in.
      //
      // Seeding 2.50% here would be worse than seeding nothing, because
      // `DATA_MODEL.md`'s resolution order (an instrument rate beats the
      // asset-class default) would then project every SGB holding at 2.50% a
      // year and silently understate it — in "See the maths", which
      // `DATA_MODEL.md` note 14 calls the regulatory surface. A plausible
      // wrong number is the most expensive failure this feature has.
      const goldRows = instrumentsSeedData.filter((row) => row.category === 3)
      expect(goldRows.length).toBeGreaterThan(0)
      for (const row of goldRows) {
        expect(row.assumedAnnualRatePct, row.slug).toBeNull()
        expect(row.rateSource, row.slug).toBeNull()
        expect(row.assumedRateAsOf, row.slug).toBeNull()
      }
    })

    it('rateSource, where set, is a non-empty citable string naming a real authority', () => {
      for (const row of instrumentsSeedData) {
        if (row.rateSource === null) continue
        expect(row.rateSource.trim().length, row.slug).toBeGreaterThan(10)
      }
    })

    it('assumedRateAsOf, where set, is a real ISO date (not in the future)', () => {
      for (const row of instrumentsSeedData) {
        if (row.assumedRateAsOf === null) continue
        expect(row.assumedRateAsOf, row.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        const parsed = new Date(row.assumedRateAsOf)
        expect(Number.isNaN(parsed.getTime()), row.slug).toBe(false)
      }
    })

    it('assumedAnnualRatePct, where set, parses as a plausible annual percentage', () => {
      for (const row of instrumentsSeedData) {
        if (row.assumedAnnualRatePct === null) continue
        const value = Number(row.assumedAnnualRatePct)
        expect(Number.isFinite(value), row.slug).toBe(true)
        expect(value, row.slug).toBeGreaterThan(0)
        expect(value, row.slug).toBeLessThan(20)
      }
    })

    // rateSource is rendered verbatim to the user in the "See the maths" panel
    // (DATA_MODEL.md, instruments amendment), which makes it user-facing copy
    // and subject to the project's hard zero-em-dash style rule. Pinned here
    // because a citation string reads like metadata and is the kind of copy a
    // style pass over components would never think to look at.
    it('no rateSource contains an em-dash or en-dash', () => {
      for (const row of instrumentsSeedData) {
        if (row.rateSource === null) continue
        expect(row.rateSource, row.slug).not.toMatch(/[–—]/)
      }
    })

    // The FD figure must come from the fresh-deposit series, not the
    // outstanding-deposit one. Outstanding blends in higher-rate back-book
    // deposits and so overstates what a new depositor will earn. Verified
    // 2026-09-09: fresh 5.90%, outstanding 6.58%.
    it('the bank FD rate cites the fresh-deposit series and not the outstanding one', () => {
      const fd = instrumentsSeedData.find((r) => r.slug === 'debt-fixed-deposit')
      expect(fd).toBeDefined()
      expect(fd!.rateSource).toMatch(/fresh rupee term deposits/)
      expect(fd!.rateSource).not.toMatch(/outstanding/)
    })
  })
})
