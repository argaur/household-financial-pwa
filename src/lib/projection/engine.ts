import type { AssetClass } from '@/lib/allocation'
import { resolveAnnualRate, type ResolvedRate } from './rates'

/**
 * E4 (D-024/D-025 AI import) — the deterministic compound growth engine.
 *
 * Pure by design: inputs in, a series out. No network, no database, no api
 * client imports, no reading of the clock. Every number the projection panel
 * and the "See the maths" panel show is produced here, locally, from figures
 * the user can see. D-002 forbids a live price feed and nothing here opens
 * one. DATA_MODEL.md note 15: no screen may render a number that came from
 * the model, so the model never touches this file either.
 *
 * SPEC.md G7 names the test suite beside this file as the artifact that
 * proves the auditability "See the maths" promises. The two conventions
 * below are the ones a reader has to know before they can check a number by
 * hand, so they are stated here in full rather than left to be inferred.
 *
 * ## Convention 1: contributions land at the END of each year
 *
 * A monthly contribution is applied as one lump of twelve monthly amounts at
 * the close of each year, and it earns nothing in the year it arrives. In
 * annuity terms this is an ordinary annuity, not an annuity due.
 *
 *   value(n) = value(n-1) x (1 + rate) + 12 x monthly
 *
 * Two reasons, in order.
 *
 * 1. It understates rather than overstates. The other convention, money in
 *    at the start of the year, credits a full year of growth to rupees that
 *    in reality arrive across twelve months, which flatters the answer. This
 *    file follows the same "err low" rule the seeded rates in rates.ts
 *    follow, for the same reason: overstating a return is the more harmful
 *    direction to be wrong in.
 * 2. It is the arithmetic a reader can reproduce. Start of year needs an
 *    extra factor on the contribution term; end of year is a multiply and an
 *    add, which is what the fixtures show.
 *
 * ## Convention 2: rounding happens ONCE, at the point of display
 *
 * The compounding runs at full floating point precision from the starting
 * value. Each published point is rounded to whole rupees from the exact
 * value for that year, never from the previous rounded one.
 *
 * Rounding each year and feeding the rounded figure back into the next year
 * drifts, and the drift grows: one lakh at 11 percent over 40 years lands 31
 * rupees away from the true figure. It is a small number and a real one, and
 * it has no defence, because the rounding is a presentation step. A user who
 * checks the chart with `100000 x 1.11^40` on a calculator must get the
 * number the chart shows.
 *
 * ## How a contribution is divided between holdings
 *
 * In proportion to each holding's STARTING value, fixed at year zero and
 * never rebalanced. A household that holds 75 percent equity is assumed to
 * keep buying in that shape. The weights are not recomputed each year,
 * because drifting them would be a rebalancing assumption the user never
 * stated.
 *
 * When there is nothing to weight by, meaning no holdings at all or every
 * holding at zero, contributions are held at ZERO growth. The engine will
 * not invent a rate for money with no stated destination, and a plain sum of
 * what was put in is the honest answer for savings that have not been
 * invested in anything yet.
 */

/** The specified maximum horizon (SPEC.md G3: `horizonYears: number, 1..40`). */
export const MAX_HORIZON_YEARS = 40

/** Months in a year. Named so the fixtures and the code use one constant. */
const MONTHS_PER_YEAR = 12

export interface ProjectionHolding {
  assetClass: AssetClass
  /**
   * The holding's current rupee value. A `numeric` column arrives from
   * Drizzle as a STRING, and a holding with nothing recorded arrives as null
   * or blank, so all three shapes are accepted. Absent means zero rupees,
   * which is a real and harmless answer. Unreadable or negative is bad data
   * and throws, because silently scoring it zero would hide the row.
   */
  currentValue: string | number | null | undefined
  /** `instruments.assumed_annual_rate_pct`, passed through to rates.ts untouched. */
  instrumentAnnualRatePct?: string | number | null
  /** `instruments.rate_source`, passed through to rates.ts untouched. */
  instrumentRateSource?: string | null
  /** `instruments.assumed_rate_as_of`, passed through to rates.ts untouched. */
  instrumentRateAsOf?: string | null
}

export interface ProjectionInput {
  holdings: ProjectionHolding[]
  /** Whole years, 0 to MAX_HORIZON_YEARS. Zero is valid and means "today only". */
  horizonYears: number
  /**
   * The household's per asset class rate overrides for this ledger. Handed
   * to rates.ts as is; the inverted precedence lives there, not here.
   */
  classOverrides?: Partial<Record<AssetClass, string | number | null | undefined>>
  /**
   * An optional recurring monthly amount, the goal planner's
   * `monthlyCapacityInr`. Absent and null both mean no contribution.
   */
  monthlyContributionInr?: number | null
}

/** One point on the line chart. One per year, year 0 through the horizon. */
export interface ProjectionPoint {
  year: number
  /** Whole rupees, rounded once from the exact value for this year. */
  valueInr: number
  /** Whole rupees put in since year 0, excluding the starting value. */
  contributedInr: number
  /** valueInr minus the starting value minus contributedInr. */
  growthInr: number
}

/** One holding's resolved assumptions and outcome, for the "See the maths" panel. */
export interface ProjectedHolding {
  assetClass: AssetClass
  /** Whole rupees at year zero. */
  startValueInr: number
  /** The rate, and which of rates.ts's three branches produced it. */
  rate: ResolvedRate
  /** This holding's share of every contribution, 0 to 1, fixed at year zero. */
  contributionWeight: number
  /** Whole rupees at the end of the horizon. */
  finalValueInr: number
}

export interface ProjectionResult {
  /** horizonYears + 1 points, year 0 first. */
  points: ProjectionPoint[]
  holdings: ProjectedHolding[]
  totalStartValueInr: number
  /** Everything contributed across the whole horizon. */
  totalContributedInr: number
  /** The last point's value, repeated for callers that only want the end. */
  finalValueInr: number
}

/**
 * Read a rupee amount that may arrive as a `numeric` string, a number, or
 * nothing.
 *
 * Absent (null, undefined, blank) is zero rupees: a holding with no recorded
 * value contributes nothing and that is a true statement about it. Anything
 * else that is not a finite non negative number throws, because a row the
 * engine cannot read must not be quietly counted as empty in a panel whose
 * whole purpose is that the user can check it.
 */
function parseAmountInr(value: string | number | null | undefined, label: string): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'string' && value.trim() === '') return 0
  const parsed = typeof value === 'number' ? value : Number(value.trim())
  if (!Number.isFinite(parsed)) {
    throw new RangeError(`${label} is not a readable rupee amount`)
  }
  if (parsed < 0) {
    throw new RangeError(`${label} is negative, which is not a value a holding can have`)
  }
  return parsed
}

function assertValidHorizon(horizonYears: number): void {
  if (!Number.isInteger(horizonYears)) {
    throw new RangeError('horizonYears must be a whole number of years')
  }
  if (horizonYears < 0 || horizonYears > MAX_HORIZON_YEARS) {
    throw new RangeError(`horizonYears must be between 0 and ${MAX_HORIZON_YEARS}`)
  }
}

function parseMonthlyContribution(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (!Number.isFinite(value)) {
    throw new RangeError('monthlyContributionInr is not a readable rupee amount')
  }
  if (value < 0) {
    throw new RangeError('monthlyContributionInr cannot be negative')
  }
  return value
}

/**
 * Project a set of holdings forward, one point per year.
 *
 * Pure: same input, same output, and the input is never mutated.
 */
export function projectHoldings(input: ProjectionInput): ProjectionResult {
  const { horizonYears } = input
  assertValidHorizon(horizonYears)

  const monthly = parseMonthlyContribution(input.monthlyContributionInr)
  const annualContribution = monthly * MONTHS_PER_YEAR

  // Resolve every holding's rate and starting value once, up front, so the
  // year loop below is nothing but arithmetic a reader can follow.
  const resolved = input.holdings.map((holding, index) => ({
    assetClass: holding.assetClass,
    startValue: parseAmountInr(holding.currentValue, `holdings[${index}].currentValue`),
    rate: resolveAnnualRate({
      assetClass: holding.assetClass,
      instrumentAnnualRatePct: holding.instrumentAnnualRatePct,
      instrumentRateSource: holding.instrumentRateSource,
      instrumentRateAsOf: holding.instrumentRateAsOf,
      classOverrides: input.classOverrides,
    }),
  }))

  const totalStartValue = resolved.reduce((sum, h) => sum + h.startValue, 0)

  // Contribution weights, fixed at year zero. When there is nothing to weight
  // by, every weight is zero and the contribution is carried separately at
  // zero growth. See the module comment.
  const weights = resolved.map((h) => (totalStartValue > 0 ? h.startValue / totalStartValue : 0))
  const uninvestedShare = totalStartValue > 0 ? 0 : 1

  // Exact running values, one per holding, never rounded inside the loop.
  const running = resolved.map((h) => h.startValue)
  let uninvested = 0

  const points: ProjectionPoint[] = []
  const roundedStart = Math.round(totalStartValue)

  for (let year = 0; year <= horizonYears; year += 1) {
    if (year > 0) {
      for (let i = 0; i < running.length; i += 1) {
        const growthFactor = 1 + resolved[i].rate.annualRatePct / 100
        // End of year contribution: it earns nothing in the year it arrives.
        running[i] = running[i] * growthFactor + annualContribution * weights[i]
      }
      uninvested += annualContribution * uninvestedShare
    }

    const exactTotal = running.reduce((sum, value) => sum + value, 0) + uninvested
    const valueInr = Math.round(exactTotal)
    const contributedInr = Math.round(annualContribution * year)
    points.push({
      year,
      valueInr,
      contributedInr,
      // Derived from the two published figures rather than from the exact
      // ones, so the three numbers always add up on screen.
      growthInr: valueInr - roundedStart - contributedInr,
    })
  }

  const holdings: ProjectedHolding[] = resolved.map((h, index) => ({
    assetClass: h.assetClass,
    startValueInr: Math.round(h.startValue),
    rate: h.rate,
    contributionWeight: weights[index],
    finalValueInr: Math.round(running[index]),
  }))

  return {
    points,
    holdings,
    totalStartValueInr: roundedStart,
    totalContributedInr: Math.round(annualContribution * horizonYears),
    finalValueInr: points[points.length - 1].valueInr,
  }
}
