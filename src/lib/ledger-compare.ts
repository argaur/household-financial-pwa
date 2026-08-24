/**
 * D-016 Chunk 3: compare-strip math for strategy ledgers. Pure function over
 * already-decrypted `Holding` objects (src/lib/holdings-api.ts) -- this MUST
 * stay client-side. The server never holds a data key, and `current_value`,
 * `asset_class`, `monthly_sip` are NULL on every encrypted row (D-014/D-015),
 * so there is nothing for a compare API to sum. See DATA_MODEL.md:358 for the
 * three-number spec this implements, and the D-016 Chunk 3 handoff for why
 * this was found to be a stale assumption in the original plan's API table.
 *
 * Conventions, so a caller never has to guess:
 *  - delta = ledger MINUS baseline. Positive means this ledger holds more
 *    than the household's baseline ("Current") ledger.
 *  - equity share is a percentage (0-100); its delta is expressed in
 *    PERCENTAGE POINTS, not a percent-of-percent -- hence the
 *    `equitySharePercentagePointDelta` field name, not `...Percent...`.
 *  - each side (ledger, baseline) is rounded to 2 decimal places from its own
 *    raw sum, and each delta is then taken from those already-rounded sides.
 *    A rupee sum of decimal strings can land on something like
 *    0.30000000000000004; rounding at the boundary keeps that tail out of the
 *    UI. Subtracting the rounded sides rather than the raw ones is deliberate:
 *    it makes the strip internally consistent, so a reader who subtracts the
 *    two rendered numbers by hand always gets the rendered delta back.
 *  - an empty ledger (no holdings, or a zero total) reports equity share 0,
 *    never NaN or Infinity from a 0/0 division.
 */
import { computeAllocation, type AllocationInputHolding } from './allocation'

// Narrow input shape, same convention as AllocationInputHolding: only the
// fields this module reads, so tests use plain fixtures instead of the full
// Holding row type (which also carries id, householdId, version, etc).
export interface LedgerCompareInputHolding extends AllocationInputHolding {
  monthlySip: string | null
}

export interface LedgerTotals {
  totalValue: number
  /** 0-100. Never NaN; 0 for a ledger with no value. */
  equitySharePercent: number
  monthlySipTotal: number
}

export interface LedgerComparisonDelta {
  totalValueDelta: number
  /** Percentage points (ledger share minus baseline share), not a ratio. */
  equitySharePercentagePointDelta: number
  monthlySipDelta: number
}

export interface LedgerComparisonResult {
  ledger: LedgerTotals
  baseline: LedgerTotals
  delta: LedgerComparisonDelta
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * `Number('')` is 0 but `Number('abc')` is NaN, and a NaN anywhere in a sum
 * poisons the whole total. Encrypted rows are schema-validated before they
 * ever reach this module, but the compare strip must not depend on that --
 * garbage in must produce 0, not a silently NaN-tainted compare strip.
 */
function toSafeNumber(value: string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function computeLedgerTotals(holdings: LedgerCompareInputHolding[]): LedgerTotals {
  // computeAllocation does a bare Number(currentValue ?? 0) with no NaN
  // guard -- fine for its existing callers (validated DB rows), not fine
  // here, so sanitise before handing off rather than duplicating its sum.
  const sanitised: AllocationInputHolding[] = holdings.map((holding) => ({
    assetClass: holding.assetClass,
    currentValue: String(toSafeNumber(holding.currentValue)),
  }))
  const { allocation, totalValue } = computeAllocation(sanitised)
  const equityValue = allocation.find((slice) => slice.assetClass === 'equity')?.value ?? 0
  // Computed from the raw (unrounded) totalValue, not the rounded display
  // value below, so this doesn't compound two roundings into one number.
  const equitySharePercent = totalValue > 0 ? round2((equityValue / totalValue) * 100) : 0
  const monthlySipTotal = round2(holdings.reduce((sum, holding) => sum + toSafeNumber(holding.monthlySip), 0))

  return { totalValue: round2(totalValue), equitySharePercent, monthlySipTotal }
}

export function computeLedgerComparison(
  ledgerHoldings: LedgerCompareInputHolding[],
  baselineHoldings: LedgerCompareInputHolding[],
): LedgerComparisonResult {
  const ledger = computeLedgerTotals(ledgerHoldings)
  const baseline = computeLedgerTotals(baselineHoldings)

  return {
    ledger,
    baseline,
    delta: {
      totalValueDelta: round2(ledger.totalValue - baseline.totalValue),
      equitySharePercentagePointDelta: round2(ledger.equitySharePercent - baseline.equitySharePercent),
      monthlySipDelta: round2(ledger.monthlySipTotal - baseline.monthlySipTotal),
    },
  }
}
