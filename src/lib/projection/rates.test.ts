import { describe, it, expect } from 'vitest'
import { ASSET_CLASS_ORDER, type AssetClass } from '@/lib/allocation'
import {
  PER_CLASS_DEFAULT_RATES,
  resolveAnnualRate,
  type RateResolutionInput,
} from './rates'

/**
 * E3 (D-024/D-025 AI import) — the rate resolution order.
 *
 * The order is specified in Documentation/design/DATA_MODEL.md (the
 * "ledger_projection_settings: unchanged, now actually used" section) and is
 * deliberately NOT a most-specific-wins priority list. A per asset class
 * override beats the per instrument rate. Each branch below is pinned
 * separately because a silently wrong precedence produces plausible numbers
 * that are wrong, in the panel DATA_MODEL.md note 14 calls the regulatory
 * surface.
 */
describe('resolveAnnualRate', () => {
  describe('branch 1: the instrument rate, when the class is not overridden', () => {
    it('uses the instrument rate when there are no overrides at all', () => {
      const resolved = resolveAnnualRate({
        assetClass: 'debt',
        instrumentAnnualRatePct: '7.10',
        instrumentRateSource: 'Ministry of Finance notified PPF rate',
      })
      expect(resolved.annualRatePct).toBe(7.1)
      expect(resolved.source).toBe('instrument')
      expect(resolved.basis).toBe('Ministry of Finance notified PPF rate')
    })

    it('uses the instrument rate when some OTHER class is overridden', () => {
      const resolved = resolveAnnualRate({
        assetClass: 'debt',
        instrumentAnnualRatePct: '7.10',
        classOverrides: { equity: '9.00' },
      })
      expect(resolved.annualRatePct).toBe(7.1)
      expect(resolved.source).toBe('instrument')
    })

    it('accepts a number as well as the string a numeric column returns', () => {
      const resolved = resolveAnnualRate({ assetClass: 'debt', instrumentAnnualRatePct: 7.1 })
      expect(resolved.annualRatePct).toBe(7.1)
      expect(resolved.source).toBe('instrument')
    })

    it('falls back to a stated basis when the instrument carries a rate but no source string', () => {
      const resolved = resolveAnnualRate({ assetClass: 'debt', instrumentAnnualRatePct: '7.10' })
      expect(resolved.source).toBe('instrument')
      expect(resolved.basis.trim().length).toBeGreaterThan(0)
    })
  })

  describe('branch 2: a class override beats the instrument rate (the inversion)', () => {
    it('prefers the class override over the instrument rate for the same class', () => {
      const resolved = resolveAnnualRate({
        assetClass: 'debt',
        instrumentAnnualRatePct: '7.10',
        instrumentRateSource: 'Ministry of Finance notified PPF rate',
        classOverrides: { debt: '5.00' },
      })
      expect(resolved.annualRatePct).toBe(5)
      expect(resolved.source).toBe('class-override')
      expect(resolved.basis).not.toBe('Ministry of Finance notified PPF rate')
    })

    it('applies the override to EVERY holding in the class, seeded rate or not', () => {
      // The whole point of the inversion: a household that says "project debt
      // at 5%" must not silently get 7.1% for the one debt holding whose
      // instrument happens to carry a seeded statutory rate.
      const holdings: Array<{ label: string; instrumentAnnualRatePct: string | null }> = [
        { label: 'ppf', instrumentAnnualRatePct: '7.10' },
        { label: 'epf', instrumentAnnualRatePct: '8.25' },
        { label: 'corporate-bond-fund', instrumentAnnualRatePct: null },
      ]
      for (const holding of holdings) {
        const resolved = resolveAnnualRate({
          assetClass: 'debt',
          instrumentAnnualRatePct: holding.instrumentAnnualRatePct,
          classOverrides: { debt: '5.00' },
        })
        expect(resolved.annualRatePct, holding.label).toBe(5)
        expect(resolved.source, holding.label).toBe('class-override')
      }
    })

    it('beats the per class default too, when there is no instrument rate', () => {
      const resolved = resolveAnnualRate({
        assetClass: 'equity',
        instrumentAnnualRatePct: null,
        classOverrides: { equity: '14.00' },
      })
      expect(resolved.annualRatePct).toBe(14)
      expect(resolved.source).toBe('class-override')
    })

    it('honours an explicit override of exactly 0, which is a real user statement', () => {
      const resolved = resolveAnnualRate({
        assetClass: 'equity',
        instrumentAnnualRatePct: '11.00',
        classOverrides: { equity: '0' },
      })
      expect(resolved.annualRatePct).toBe(0)
      expect(resolved.source).toBe('class-override')
    })

    it('an override on one class does not affect any other class', () => {
      const overrides: Partial<Record<AssetClass, string>> = { gold: '3.00' }
      for (const assetClass of ASSET_CLASS_ORDER) {
        const resolved = resolveAnnualRate({ assetClass, classOverrides: overrides })
        if (assetClass === 'gold') {
          expect(resolved.annualRatePct).toBe(3)
          expect(resolved.source).toBe('class-override')
        } else {
          expect(resolved.source, assetClass).toBe('class-default')
          expect(resolved.annualRatePct, assetClass).toBe(
            PER_CLASS_DEFAULT_RATES[assetClass].annualRatePct,
          )
        }
      }
    })
  })

  describe('branch 3: the per class default, when there is neither', () => {
    it('uses the seeded per class default for every class', () => {
      for (const assetClass of ASSET_CLASS_ORDER) {
        const resolved = resolveAnnualRate({ assetClass })
        expect(resolved.source, assetClass).toBe('class-default')
        expect(resolved.annualRatePct, assetClass).toBe(
          PER_CLASS_DEFAULT_RATES[assetClass].annualRatePct,
        )
        expect(resolved.basis, assetClass).toBe(PER_CLASS_DEFAULT_RATES[assetClass].basis)
      }
    })
  })

  describe('absent values fall through rather than being read as 0', () => {
    // Number(null) === 0 and Number('') === 0. A numeric column arrives from
    // Drizzle as a STRING, so a missing rate is a live hazard here: read as 0
    // it would project every unseeded holding at flat zero growth and look
    // deliberate.
    const absentValues: Array<[string, RateResolutionInput['instrumentAnnualRatePct']]> = [
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
      ['whitespace', '   '],
      ['not a number', 'n/a'],
    ]

    for (const [label, value] of absentValues) {
      it(`treats an instrument rate of ${label} as absent, not as 0`, () => {
        const resolved = resolveAnnualRate({ assetClass: 'equity', instrumentAnnualRatePct: value })
        expect(resolved.source).toBe('class-default')
        expect(resolved.annualRatePct).toBe(PER_CLASS_DEFAULT_RATES.equity.annualRatePct)
        expect(resolved.annualRatePct).not.toBe(0)
      })

      it(`treats a class override of ${label} as absent, not as 0`, () => {
        const resolved = resolveAnnualRate({
          assetClass: 'equity',
          instrumentAnnualRatePct: '11.50',
          classOverrides: { equity: value },
        })
        expect(resolved.source).toBe('instrument')
        expect(resolved.annualRatePct).toBe(11.5)
      })
    }

    it('treats a negative instrument rate as bad data and falls through', () => {
      const resolved = resolveAnnualRate({ assetClass: 'equity', instrumentAnnualRatePct: '-4.00' })
      expect(resolved.source).toBe('class-default')
    })

    it('treats a negative class override as bad data and falls through', () => {
      const resolved = resolveAnnualRate({
        assetClass: 'equity',
        instrumentAnnualRatePct: '11.50',
        classOverrides: { equity: '-4.00' },
      })
      expect(resolved.source).toBe('instrument')
      expect(resolved.annualRatePct).toBe(11.5)
    })

    it('carries the instrument as-of date through only on the instrument branch', () => {
      const onInstrument = resolveAnnualRate({
        assetClass: 'debt',
        instrumentAnnualRatePct: '7.10',
        instrumentRateAsOf: '2026-09-09',
      })
      expect(onInstrument.asOf).toBe('2026-09-09')

      const overridden = resolveAnnualRate({
        assetClass: 'debt',
        instrumentAnnualRatePct: '7.10',
        instrumentRateAsOf: '2026-09-09',
        classOverrides: { debt: '5.00' },
      })
      expect(overridden.asOf).toBeNull()
    })
  })

  describe('PER_CLASS_DEFAULT_RATES', () => {
    it('covers exactly the six asset classes, and no others', () => {
      expect(Object.keys(PER_CLASS_DEFAULT_RATES).sort()).toEqual([...ASSET_CLASS_ORDER].sort())
    })

    it('is a plausible, conservative nominal annual percentage for every class', () => {
      for (const assetClass of ASSET_CLASS_ORDER) {
        const { annualRatePct } = PER_CLASS_DEFAULT_RATES[assetClass]
        expect(Number.isFinite(annualRatePct), assetClass).toBe(true)
        expect(annualRatePct, assetClass).toBeGreaterThan(0)
        expect(annualRatePct, assetClass).toBeLessThan(15)
      }
    })

    it('carries a non-empty plain words basis string for every class', () => {
      for (const assetClass of ASSET_CLASS_ORDER) {
        expect(PER_CLASS_DEFAULT_RATES[assetClass].basis.trim().length, assetClass).toBeGreaterThan(
          20,
        )
      }
    })

    // Rendered verbatim in the "See the maths" panel, so these are user-facing
    // copy and subject to the project's hard zero-em-dash style rule. Same pin
    // as server/seed/instruments-data.test.ts has on rateSource.
    it('no basis string contains an em-dash or en-dash', () => {
      for (const assetClass of ASSET_CLASS_ORDER) {
        expect(PER_CLASS_DEFAULT_RATES[assetClass].basis, assetClass).not.toMatch(/[–—]/)
      }
    })
  })
})
