/**
 * Slice 6 (dashboard) allocation breakdown — extracted from the loop that
 * used to live inline in server/lib/dashboard.ts so it can run client-side
 * once dashboard data becomes client-side encrypted. Pure function over
 * plain holding rows; no queries, no DOM.
 *
 * ASSET_CLASS_ORDER mirrors drizzle/schema.ts's `assetClassEnum` — that file
 * pulls in drizzle-orm's pg-core schema builders, which has no place in a
 * client bundle, so the fixed display order is duplicated here rather than
 * imported. Keep the two in sync (same pattern already used by
 * src/lib/dashboard-api.ts for its own mirrored types).
 */
export const ASSET_CLASS_ORDER = ['equity', 'debt', 'gold', 'hybrid', 'real-estate', 'alternative'] as const

export type AssetClass = (typeof ASSET_CLASS_ORDER)[number]

export interface AllocationSlice {
  assetClass: AssetClass
  value: number
  percentage: number
  /**
   * The part of `value` held in holdings flagged `isEmergencyFund` — the
   * "reserve" the donut paints with a hatched fill (D-016 Slice 5, folio
   * plate "Emergency fund on the donut").
   *
   * Emergency fund is a PER-HOLDING flag, not an asset class: a household's
   * reserve can sit in debt, in equity, or in both at once. So it is reported
   * as a subset of each class rather than carved out into a class of its own.
   * That keeps every `value`/`percentage` above exactly true of the class
   * (nothing is subtracted or double-counted) while still letting the chart
   * mark which part of the class is the reserve.
   *
   * Optional and omitted entirely when a class holds no reserve, so callers
   * and fixtures written before this field keep type-checking and keep
   * comparing equal.
   */
  reserveValue?: number
}

// Narrow input shape — only the fields the allocation loop actually reads,
// so it's testable against plain fixture objects without pulling in full
// drizzle row types (mirrors the Completeness*/Nudge* input-shape pattern).
export interface AllocationInputHolding {
  assetClass: string
  currentValue: string | null
  /** Optional: absent/false means the holding is not part of the reserve. */
  isEmergencyFund?: boolean | null
}

export interface AllocationResult {
  allocation: AllocationSlice[]
  totalValue: number
}

export function computeAllocation(holdings: AllocationInputHolding[]): AllocationResult {
  const totals = new Map<string, number>()
  const reserves = new Map<string, number>()
  let totalValue = 0
  for (const h of holdings) {
    const value = Number(h.currentValue ?? 0)
    totalValue += value
    totals.set(h.assetClass, (totals.get(h.assetClass) ?? 0) + value)
    if (h.isEmergencyFund) {
      reserves.set(h.assetClass, (reserves.get(h.assetClass) ?? 0) + value)
    }
  }

  const allocation: AllocationSlice[] = ASSET_CLASS_ORDER.filter((assetClass) => totals.has(assetClass)).map(
    (assetClass) => {
      const value = totals.get(assetClass) ?? 0
      const reserveValue = reserves.get(assetClass) ?? 0
      return {
        assetClass,
        value,
        percentage: totalValue > 0 ? Math.round((value / totalValue) * 100) : 0,
        // Omitted, not zeroed, when there is no reserve — a `reserveValue: 0`
        // key would break every existing `toEqual` fixture for no gain.
        ...(reserveValue > 0 ? { reserveValue } : {}),
      }
    },
  )

  return { allocation, totalValue }
}
