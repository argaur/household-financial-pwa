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
}

// Narrow input shape — only the fields the allocation loop actually reads,
// so it's testable against plain fixture objects without pulling in full
// drizzle row types (mirrors the Completeness*/Nudge* input-shape pattern).
export interface AllocationInputHolding {
  assetClass: string
  currentValue: string | null
}

export interface AllocationResult {
  allocation: AllocationSlice[]
  totalValue: number
}

export function computeAllocation(holdings: AllocationInputHolding[]): AllocationResult {
  const totals = new Map<string, number>()
  let totalValue = 0
  for (const h of holdings) {
    const value = Number(h.currentValue ?? 0)
    totalValue += value
    totals.set(h.assetClass, (totals.get(h.assetClass) ?? 0) + value)
  }

  const allocation: AllocationSlice[] = ASSET_CLASS_ORDER.filter((assetClass) => totals.has(assetClass)).map(
    (assetClass) => {
      const value = totals.get(assetClass) ?? 0
      return { assetClass, value, percentage: totalValue > 0 ? Math.round((value / totalValue) * 100) : 0 }
    },
  )

  return { allocation, totalValue }
}
