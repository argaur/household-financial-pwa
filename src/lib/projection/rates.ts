import type { AssetClass } from '@/lib/allocation'

/**
 * E3 (D-024/D-025 AI import) — how one holding's annual rate is resolved.
 *
 * Pure module by design: inputs in, resolved rate out. No network, no
 * database, no api client imports. The projection engine and the "See the
 * maths" panel both call this so the number a user audits is the number the
 * engine used.
 *
 * ## The resolution order, verbatim from Documentation/design/DATA_MODEL.md
 *
 * 1. `instruments.assumed_annual_rate_pct` if the user has NOT overridden
 *    this asset class
 * 2. `ledger_projection_settings.annual_rate_pct` for the holding's asset
 *    class IF the user has overridden it, which overrides the instrument
 *    rate for EVERY holding in that class
 * 3. the seeded per class default if neither exists
 *
 * ## Read that again: the precedence is inverted on purpose
 *
 * This is NOT a most-specific-wins list. The BROADER value wins: an asset
 * class override beats the narrower per instrument rate. The intuitive
 * implementation (instrument first, class override as a fallback) is the
 * wrong one here.
 *
 * The reason is that the override is the household's explicit statement
 * about a whole class. A household that says "project my debt at 5%" must
 * get 5% for every debt holding, including the one whose instrument happens
 * to carry a seeded statutory rate. Letting the seeded rate win for that one
 * holding would silently ignore what the user asked for, in exactly the
 * panel DATA_MODEL.md note 14 calls the regulatory surface.
 *
 * So the effective order the code below runs is: override, then instrument,
 * then class default.
 *
 * An override is per asset class, NEVER per instrument. A per instrument
 * override is not in scope and must not be offered.
 */

/** Which of the three branches produced the rate. */
export type RateSource = 'class-override' | 'instrument' | 'class-default'

export interface ClassRateDefault {
  /** Nominal annual percent, e.g. 11 means 11% a year. */
  annualRatePct: number
  /** Plain words, rendered verbatim in the "See the maths" panel. */
  basis: string
}

export interface RateResolutionInput {
  /** The holding's asset class. */
  assetClass: AssetClass
  /**
   * `instruments.assumed_annual_rate_pct` for the holding's instrument.
   * A `numeric` column arrives from Drizzle as a STRING, and is null for the
   * 24 instruments with no defensible published rate, so both shapes and
   * absence are accepted here.
   */
  instrumentAnnualRatePct?: string | number | null
  /** `instruments.rate_source`, shown verbatim when the instrument branch wins. */
  instrumentRateSource?: string | null
  /** `instruments.assumed_rate_as_of`, an ISO date, for the staleness note. */
  instrumentRateAsOf?: string | null
  /**
   * The household's `ledger_projection_settings` rows for THIS ledger, keyed
   * by asset class. A class absent from the map is a class the user has not
   * overridden.
   */
  classOverrides?: Partial<Record<AssetClass, string | number | null | undefined>>
}

export interface ResolvedRate {
  /** Nominal annual percent, e.g. 11 means 11% a year. */
  annualRatePct: number
  source: RateSource
  /** Plain words explaining where the number came from. User facing. */
  basis: string
  /** ISO date the instrument rate was last checked, on that branch only. */
  asOf: string | null
}

/**
 * The seeded per class defaults, branch 3 of the order.
 *
 * Deliberately conservative long run NOMINAL figures. Two rules held while
 * choosing them, both from the spec and both about the same failure:
 *
 * - Err LOW rather than high. These feed a projection panel; overstating a
 *   return is the more harmful direction to be wrong in.
 * - Say what the number is grounded in, in plain words, and say plainly when
 *   it is a conservative placeholder rather than a published figure.
 *
 * These are static constants. Nothing fetches them. D-002 forbids a live
 * price feed and this module does not open one.
 *
 * Basis strings are user facing copy: zero em-dashes and zero en-dashes,
 * pinned by a test in rates.test.ts.
 */
export const PER_CLASS_DEFAULT_RATES: Record<AssetClass, ClassRateDefault> = {
  equity: {
    annualRatePct: 11,
    basis:
      'A conservative reading of the long run nominal return on Indian large cap equity indices over 20 years and more, trimmed below the historical average because past index returns are not a promise.',
  },
  debt: {
    annualRatePct: 6.5,
    basis:
      'A conservative reading of long run nominal yields on Indian government bonds and bank fixed deposits, set near the lower end of the range seen over the last decade.',
  },
  gold: {
    annualRatePct: 7,
    basis:
      'A conservative reading of the long run rise in the rupee price of gold, trimmed below the historical average because a metal pays nothing and its whole return is a price movement.',
  },
  hybrid: {
    annualRatePct: 9,
    basis:
      'A blend of the equity and debt defaults at roughly 60 to 40, rounded down. Hybrid funds hold both, so their assumption follows the two parts rather than a series of its own.',
  },
  'real-estate': {
    annualRatePct: 6,
    basis:
      'A conservative reading of long run nominal house price growth in Indian cities, counting capital appreciation only. Rent is not included, and neither are stamp duty, maintenance or the cost of a slow sale.',
  },
  alternative: {
    annualRatePct: 5,
    basis:
      'A deliberately conservative placeholder, not a published figure. This class covers holdings as different as crypto, unlisted shares and collectibles, which share no defensible long run series, so the default is set below the debt assumption on purpose.',
  },
}

/**
 * Parse a rate that may arrive as a `numeric` string, a number, or nothing.
 *
 * Returns null for anything that is not a usable rate, which is the whole
 * point of this helper: `Number(null)` and `Number('')` are both **0**, so a
 * missing rate read naively would project a holding at flat zero growth and
 * look like a deliberate assumption. Absent must fall through, never become
 * zero.
 *
 * A negative value is treated as bad data and falls through too. Zero is
 * kept, because an explicit 0 from a user override is a real statement.
 */
function parseRatePct(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null
    return value
  }
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

/**
 * Resolve the annual rate for one holding, with the branch that produced it.
 *
 * Order of the checks below is load bearing. The class override is tested
 * FIRST and beats the instrument rate. See the module comment: the broader
 * value wins here, which is the opposite of the usual rule.
 */
export function resolveAnnualRate(input: RateResolutionInput): ResolvedRate {
  const { assetClass, classOverrides } = input

  // Branch 2 of the spec's numbering, first in execution. The inversion.
  const override = parseRatePct(classOverrides?.[assetClass])
  if (override !== null) {
    return {
      annualRatePct: override,
      source: 'class-override',
      basis: 'Your own rate for this asset class, set in this plan. It applies to every holding in the class.',
      asOf: null,
    }
  }

  // Branch 1. Only reached when the class is not overridden.
  const instrumentRate = parseRatePct(input.instrumentAnnualRatePct)
  if (instrumentRate !== null) {
    const source = input.instrumentRateSource?.trim()
    return {
      annualRatePct: instrumentRate,
      source: 'instrument',
      basis: source && source.length > 0 ? source : 'The rate seeded for this instrument.',
      asOf: input.instrumentRateAsOf ?? null,
    }
  }

  // Branch 3. Neither an override nor an instrument rate.
  const fallback = PER_CLASS_DEFAULT_RATES[assetClass]
  return {
    annualRatePct: fallback.annualRatePct,
    source: 'class-default',
    basis: fallback.basis,
    asOf: null,
  }
}
