import { describe, it, expect } from 'vitest'
import {
  MAX_HORIZON_YEARS,
  projectHoldings,
  type ProjectionInput,
} from './engine'

/**
 * E4 (D-024/D-025 AI import) — the compound growth engine.
 *
 * SPEC.md G7 flags this file specifically: "See the maths" promises the user
 * that the chart is auditable, so THIS SUITE is the artifact that proves the
 * promise. DATA_MODEL.md note 14 calls the same numbers the regulatory
 * surface.
 *
 * The rule every fixture below obeys: a human can read the fixture and check
 * the number by hand. Inputs are round (a lakh, ten years, ten percent).
 * Every expected value states the arithmetic that produces it, in a form
 * someone can key into a calculator. A fixture whose expected number nobody
 * can independently derive would prove nothing about auditability, so there
 * are none of those here.
 *
 * The two conventions the fixtures assume, both stated in engine.ts and both
 * pinned by their own tests below:
 *
 * - **Contributions land at the END of each year**, as one lump of twelve
 *   monthly amounts, and earn nothing in the year they arrive.
 * - **Rounding happens once, at the point of display.** The compounding runs
 *   at full precision and each published point is rounded from the exact
 *   value, never from the previous rounded one.
 */

/** A holding shaped for the engine, with the noise the engine ignores left out. */
function holding(
  assetClass: ProjectionInput['holdings'][number]['assetClass'],
  currentValue: string | number | null,
  extra: Partial<ProjectionInput['holdings'][number]> = {},
) {
  return { assetClass, currentValue, ...extra }
}

describe('projectHoldings: the arithmetic, in fixtures a human can check', () => {
  /**
   * FIXTURE 1 — checkable in your head.
   *
   *   one lakh, ten percent, one year, nothing added
   *   100000 x 1.10 = 110000
   */
  it('grows one lakh at ten percent for one year to 110000', () => {
    const result = projectHoldings({
      holdings: [holding('equity', 100000)],
      classOverrides: { equity: 10 },
      horizonYears: 1,
    })

    expect(result.points).toHaveLength(2)
    expect(result.points[0]).toEqual({ year: 0, valueInr: 100000, contributedInr: 0, growthInr: 0 })
    expect(result.points[1]).toEqual({
      year: 1,
      valueInr: 110000,
      contributedInr: 0,
      growthInr: 10000,
    })
  })

  /**
   * FIXTURE 2 — one calculator keystroke per year.
   *
   *   100000 x 1.10^10
   *   1.10^10 = 2.5937424601
   *   100000 x 2.5937424601 = 259374.24601  ->  259374
   *
   * The intermediate years are the same sum with a smaller exponent:
   *   year 1  100000 x 1.1        = 110000
   *   year 2  100000 x 1.1^2      = 121000
   *   year 3  100000 x 1.1^3      = 133100
   */
  it('grows one lakh at ten percent for ten years to 259374', () => {
    const result = projectHoldings({
      holdings: [holding('equity', 100000)],
      classOverrides: { equity: 10 },
      horizonYears: 10,
    })

    expect(result.points).toHaveLength(11)
    expect(result.points.map((p) => p.valueInr)).toEqual([
      100000, // year 0, untouched
      110000, // 100000 x 1.1
      121000, // 100000 x 1.1^2
      133100, // 100000 x 1.1^3
      146410, // 100000 x 1.1^4
      161051, // 100000 x 1.1^5
      177156, // 100000 x 1.1^6  = 177156.1
      194872, // 100000 x 1.1^7  = 194871.71
      214359, // 100000 x 1.1^8  = 214358.881
      235795, // 100000 x 1.1^9  = 235794.7691
      259374, // 100000 x 1.1^10 = 259374.24601
    ])
    expect(result.finalValueInr).toBe(259374)
  })

  /**
   * FIXTURE 3 — the contribution convention, in round numbers.
   *
   * One lakh at ten percent, plus 1000 a month. Twelve thousand a year lands
   * at the END of each year and earns nothing that year:
   *
   *   year 1  100000 x 1.1 + 12000 = 110000 + 12000 = 122000
   *   year 2  122000 x 1.1 + 12000 = 134200 + 12000 = 146200
   *   year 3  146200 x 1.1 + 12000 = 160820 + 12000 = 172820
   *
   * If a reader gets 123200 for year 1 they have assumed start of year
   * contributions, which is the other convention and NOT the one used here.
   */
  it('adds a monthly contribution at the end of each year', () => {
    const result = projectHoldings({
      holdings: [holding('equity', 100000)],
      classOverrides: { equity: 10 },
      horizonYears: 3,
      monthlyContributionInr: 1000,
    })

    expect(result.points.map((p) => p.valueInr)).toEqual([100000, 122000, 146200, 172820])
  })

  it('states start of year contributions are NOT the convention', () => {
    // Start of year would be 100000 x 1.1 + 12000 x 1.1 = 123200.
    const result = projectHoldings({
      holdings: [holding('equity', 100000)],
      classOverrides: { equity: 10 },
      horizonYears: 1,
      monthlyContributionInr: 1000,
    })
    expect(result.points[1].valueInr).toBe(122000)
    expect(result.points[1].valueInr).not.toBe(123200)
  })

  /**
   * FIXTURE 4 — two classes, two rates, and the contribution split.
   *
   * A lakh in equity at 10% and a lakh in debt at 5%, so the split of any
   * contribution is 50/50 by starting value. 1000 a month is 12000 a year,
   * so 6000 goes to each side:
   *
   *   equity  100000 x 1.1  + 6000 = 110000 + 6000 = 116000
   *   debt    100000 x 1.05 + 6000 = 105000 + 6000 = 111000
   *   total                                        = 227000
   *
   * Without the contribution the same year is 110000 + 105000 = 215000.
   */
  it('compounds each holding at its own rate and splits contributions by starting value', () => {
    const holdings = [holding('equity', 100000), holding('debt', 100000)]
    const classOverrides = { equity: 10, debt: 5 }

    const withoutContribution = projectHoldings({ holdings, classOverrides, horizonYears: 1 })
    expect(withoutContribution.points[1].valueInr).toBe(215000)

    const withContribution = projectHoldings({
      holdings,
      classOverrides,
      horizonYears: 1,
      monthlyContributionInr: 1000,
    })
    expect(withContribution.points[1].valueInr).toBe(227000)
    expect(withContribution.holdings.map((h) => h.contributionWeight)).toEqual([0.5, 0.5])
    expect(withContribution.holdings.map((h) => h.finalValueInr)).toEqual([116000, 111000])
  })

  /**
   * FIXTURE 5 — an uneven split, still checkable.
   *
   * 75000 equity and 25000 debt is a 75/25 split of 12000 a year, so 9000
   * and 3000. Both at ten percent to keep the growth arithmetic trivial:
   *
   *   equity  75000 x 1.1 + 9000 = 82500 + 9000 = 91500
   *   debt    25000 x 1.1 + 3000 = 27500 + 3000 = 30500
   *   total                                     = 122000
   *
   * Which is the same total as fixture 3, as it must be: same lakh, same
   * rate, same contribution, only the buckets differ.
   */
  it('splits a contribution in proportion to each holding, not equally', () => {
    const result = projectHoldings({
      holdings: [holding('equity', 75000), holding('debt', 25000)],
      classOverrides: { equity: 10, debt: 10 },
      horizonYears: 1,
      monthlyContributionInr: 1000,
    })

    expect(result.holdings.map((h) => h.finalValueInr)).toEqual([91500, 30500])
    expect(result.points[1].valueInr).toBe(122000)
  })

  /**
   * FIXTURE 6 — the parts of a point add up.
   *
   * Fixture 3's year 3, decomposed:
   *   started with          100000
   *   contributed 3 x 12000  36000
   *   growth                 36820   (172820 - 100000 - 36000)
   *   value                 172820
   */
  it('reports contributed and growth so that start + contributed + growth = value', () => {
    const result = projectHoldings({
      holdings: [holding('equity', 100000)],
      classOverrides: { equity: 10 },
      horizonYears: 3,
      monthlyContributionInr: 1000,
    })

    const year3 = result.points[3]
    expect(year3).toEqual({ year: 3, valueInr: 172820, contributedInr: 36000, growthInr: 36820 })
    expect(result.totalStartValueInr + year3.contributedInr + year3.growthInr).toBe(year3.valueInr)
    expect(result.totalContributedInr).toBe(36000)
  })
})

describe('projectHoldings: rounding, decided once and stated', () => {
  /**
   * FIXTURE 7 — why the engine rounds once rather than every year.
   *
   * One lakh at the seeded equity default of 11 percent, over the full
   * 40 year horizon:
   *
   *   exact       100000 x 1.11^40 = 6500086.86...  ->  6500087
   *   rounded
   *   every year  ...                              ->  6500118
   *
   * A 31 rupee drift, from nothing but the choice of when to round. The
   * engine publishes 6500087, the exact figure rounded once, because the
   * rounding is a display step and must not feed back into the maths. A user
   * who checks the number with 100000 x 1.11^40 on a calculator gets the
   * engine's answer, which is the whole point of the panel.
   */
  it('rounds once from the exact value, not once per year', () => {
    const result = projectHoldings({
      holdings: [holding('equity', 100000)],
      horizonYears: 40,
    })

    expect(result.finalValueInr).toBe(6500087)
    expect(result.finalValueInr).toBe(Math.round(100000 * Math.pow(1.11, 40)))

    // What round-every-year would have produced, computed here so the drift
    // is visible in the fixture rather than asserted from memory.
    let compounded = 100000
    for (let year = 0; year < 40; year += 1) compounded = Math.round(compounded * 1.11)
    expect(compounded).toBe(6500118)
    expect(result.finalValueInr).not.toBe(compounded)
  })

  it('carries no floating point dust into a whole rupee answer', () => {
    const result = projectHoldings({
      holdings: [holding('equity', 100000)],
      classOverrides: { equity: 10 },
      horizonYears: 40,
    })
    for (const point of result.points) {
      expect(Number.isInteger(point.valueInr)).toBe(true)
      expect(Number.isInteger(point.growthInr)).toBe(true)
      expect(Number.isFinite(point.valueInr)).toBe(true)
    }
    // 100000 x 1.1^40 = 4525925.5568...
    expect(result.finalValueInr).toBe(4525926)
  })
})

describe('projectHoldings: rates arrive as strings, and zero is not absent', () => {
  it('reads an instrument rate that arrived as a numeric string', () => {
    // 100000 x 1.10 = 110000, with the ten percent supplied as '10.00'.
    const result = projectHoldings({
      holdings: [holding('equity', 100000, { instrumentAnnualRatePct: '10.00' })],
      horizonYears: 1,
    })
    expect(result.points[1].valueInr).toBe(110000)
    expect(result.holdings[0].rate.source).toBe('instrument')
  })

  it('does not turn a null rate into zero growth', () => {
    // Number(null) is 0. If that path existed the answer would be a flat
    // 100000. The class default of 11 percent must win instead.
    const result = projectHoldings({
      holdings: [holding('equity', 100000, { instrumentAnnualRatePct: null })],
      horizonYears: 1,
    })
    expect(result.points[1].valueInr).toBe(111000)
    expect(result.holdings[0].rate.source).toBe('class-default')
  })

  it('does not turn an empty string rate into zero growth', () => {
    // Number('') is also 0. Same trap, second shape.
    const result = projectHoldings({
      holdings: [holding('equity', 100000, { instrumentAnnualRatePct: '' })],
      horizonYears: 1,
    })
    expect(result.points[1].valueInr).toBe(111000)
    expect(result.holdings[0].rate.source).toBe('class-default')
  })

  it('treats an explicit zero override as a real rate, flat and deliberate', () => {
    // A user who says "project my gold at zero" gets a flat line, and the
    // panel says the number came from their own override, not from a
    // missing figure.
    const result = projectHoldings({
      holdings: [holding('gold', 100000, { instrumentAnnualRatePct: '7.00' })],
      classOverrides: { gold: 0 },
      horizonYears: 10,
    })
    expect(result.points.map((p) => p.valueInr)).toEqual(Array(11).fill(100000))
    expect(result.holdings[0].rate.source).toBe('class-override')
    expect(result.holdings[0].rate.annualRatePct).toBe(0)
  })

  it('keeps a zero rate holding flat while its neighbour still grows', () => {
    // 100000 flat + 100000 x 1.1 = 100000 + 110000 = 210000
    const result = projectHoldings({
      holdings: [holding('gold', 100000), holding('equity', 100000)],
      classOverrides: { gold: 0, equity: 10 },
      horizonYears: 1,
    })
    expect(result.points[1].valueInr).toBe(210000)
  })

  it('reports the resolved rate and its basis for every holding, for the maths panel', () => {
    const result = projectHoldings({
      holdings: [holding('debt', 50000, { instrumentAnnualRatePct: '7.10', instrumentRateSource: 'Ministry of Finance notified PPF rate', instrumentRateAsOf: '2026-09-01' })],
      horizonYears: 5,
    })
    expect(result.holdings[0].rate).toEqual({
      annualRatePct: 7.1,
      source: 'instrument',
      basis: 'Ministry of Finance notified PPF rate',
      asOf: '2026-09-01',
    })
  })
})

describe('projectHoldings: the edges', () => {
  it('returns the starting value only, for a horizon of zero', () => {
    const result = projectHoldings({
      holdings: [holding('equity', 100000)],
      horizonYears: 0,
    })
    expect(result.points).toEqual([{ year: 0, valueInr: 100000, contributedInr: 0, growthInr: 0 }])
    expect(result.finalValueInr).toBe(100000)
  })

  it('returns zeroes rather than NaN for an empty holdings set', () => {
    const result = projectHoldings({ holdings: [], horizonYears: 10 })
    expect(result.points).toHaveLength(11)
    for (const point of result.points) {
      expect(point.valueInr).toBe(0)
      expect(Number.isNaN(point.valueInr)).toBe(false)
    }
    expect(result.totalStartValueInr).toBe(0)
    expect(result.finalValueInr).toBe(0)
  })

  it('holds contributions at zero growth when there is no mix to invest them into', () => {
    // Nothing owned yet, 1000 a month, ten years: 1000 x 12 x 10 = 120000.
    // The engine will not invent a rate for money with no stated destination.
    const result = projectHoldings({
      holdings: [],
      horizonYears: 10,
      monthlyContributionInr: 1000,
    })
    expect(result.finalValueInr).toBe(120000)
    expect(result.points[1].valueInr).toBe(12000)
    expect(result.points[10].growthInr).toBe(0)
  })

  it('treats a zero amount holding as contributing nothing, without breaking the split', () => {
    // The empty debt holding takes no share of the contribution. All of it
    // follows the equity lakh: 100000 x 1.1 + 12000 = 122000.
    const result = projectHoldings({
      holdings: [holding('equity', 100000), holding('debt', 0)],
      classOverrides: { equity: 10, debt: 5 },
      horizonYears: 1,
      monthlyContributionInr: 1000,
    })
    expect(result.holdings.map((h) => h.contributionWeight)).toEqual([1, 0])
    expect(result.holdings[1].finalValueInr).toBe(0)
    expect(result.points[1].valueInr).toBe(122000)
  })

  it('treats a null or blank amount as nothing recorded, not as a broken row', () => {
    const result = projectHoldings({
      holdings: [holding('equity', 100000), holding('debt', null), holding('gold', '')],
      classOverrides: { equity: 10 },
      horizonYears: 1,
    })
    expect(result.totalStartValueInr).toBe(100000)
    expect(result.points[1].valueInr).toBe(110000)
  })

  it('reads an amount that arrived as a numeric string', () => {
    const result = projectHoldings({
      holdings: [holding('equity', '100000.00')],
      classOverrides: { equity: 10 },
      horizonYears: 1,
    })
    expect(result.points[1].valueInr).toBe(110000)
  })

  it('accepts the full forty year horizon and rejects one year more', () => {
    expect(MAX_HORIZON_YEARS).toBe(40)
    expect(() => projectHoldings({ holdings: [], horizonYears: 40 })).not.toThrow()
    expect(() => projectHoldings({ holdings: [], horizonYears: 41 })).toThrow(RangeError)
  })

  it('rejects a horizon that is negative or not a whole number of years', () => {
    expect(() => projectHoldings({ holdings: [], horizonYears: -1 })).toThrow(RangeError)
    expect(() => projectHoldings({ holdings: [], horizonYears: 2.5 })).toThrow(RangeError)
    expect(() => projectHoldings({ holdings: [], horizonYears: Number.NaN })).toThrow(RangeError)
  })

  it('rejects an amount that is negative or unreadable, rather than silently scoring it zero', () => {
    expect(() =>
      projectHoldings({ holdings: [holding('equity', -1)], horizonYears: 1 }),
    ).toThrow(RangeError)
    expect(() =>
      projectHoldings({ holdings: [holding('equity', 'twelve thousand')], horizonYears: 1 }),
    ).toThrow(RangeError)
  })

  it('rejects a negative or unreadable monthly contribution', () => {
    expect(() =>
      projectHoldings({ holdings: [], horizonYears: 1, monthlyContributionInr: -500 }),
    ).toThrow(RangeError)
    expect(() =>
      projectHoldings({ holdings: [], horizonYears: 1, monthlyContributionInr: Number.POSITIVE_INFINITY }),
    ).toThrow(RangeError)
  })

  it('treats an absent monthly contribution as no contribution at all', () => {
    const none = projectHoldings({
      holdings: [holding('equity', 100000)],
      classOverrides: { equity: 10 },
      horizonYears: 5,
    })
    const explicitNull = projectHoldings({
      holdings: [holding('equity', 100000)],
      classOverrides: { equity: 10 },
      horizonYears: 5,
      monthlyContributionInr: null,
    })
    expect(explicitNull.points).toEqual(none.points)
    expect(none.totalContributedInr).toBe(0)
  })
})

describe('projectHoldings: purity', () => {
  it('does not mutate its input', () => {
    const input: ProjectionInput = {
      holdings: [holding('equity', 100000)],
      classOverrides: { equity: 10 },
      horizonYears: 3,
      monthlyContributionInr: 1000,
    }
    const snapshot = JSON.parse(JSON.stringify(input))
    projectHoldings(input)
    expect(input).toEqual(snapshot)
  })

  it('returns the same answer every time it is called with the same input', () => {
    const input: ProjectionInput = {
      holdings: [holding('equity', 100000), holding('debt', 250000)],
      horizonYears: 20,
      monthlyContributionInr: 5000,
    }
    expect(projectHoldings(input)).toEqual(projectHoldings(input))
  })

  it('imports nothing that reaches the network or the clock', async () => {
    const source = await import('./engine?raw').then((m) => m.default as string)
    // Guard against the assertions below passing on an empty read.
    expect(source).toContain('export function projectHoldings')
    expect(source).not.toMatch(/\bfetch\(/)
    expect(source).not.toMatch(/Date\.now/)
    expect(source).not.toMatch(/new Date\(/)
    expect(source).not.toMatch(/from '@\/lib\/.*-api'/)
  })
})
