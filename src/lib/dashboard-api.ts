export type AssetClass = 'equity' | 'debt' | 'gold' | 'hybrid' | 'real-estate' | 'alternative'
export type CompletenessTier = 'getting_started' | 'on_track' | 'strong'

export interface CompletenessChecks {
  memberCoverage: boolean
  emergencyFund: boolean
  bothParentsProtected: boolean
  assetDiversity: boolean
  noStaleValues: boolean
}

export interface Completeness {
  checks: CompletenessChecks
  score: number
  tier: CompletenessTier
}

export interface AllocationSlice {
  assetClass: AssetClass
  value: number
  percentage: number
}

/** Slice 7 — mirrors server/lib/nudge.ts. Keep the two in sync. */
export type NudgeCheckId =
  | 'member_coverage'
  | 'emergency_fund'
  | 'both_parents_protected'
  | 'asset_diversity'
  | 'no_stale_values'
  | 'complete'

export interface Nudge {
  checkId: NudgeCheckId
  learnCardSlug: string
  memberName?: string
  assetClassCount?: number
}

export interface DashboardData {
  household: { id: string; name: string }
  completeness: Completeness
  /** Always present — exactly one nudge, never zero (SPEC.md §7). */
  nudge: Nudge
  allocation: AllocationSlice[]
  totalValue: number
}

export class DashboardApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function fetchDashboard(token: string | null): Promise<DashboardData> {
  const res = await fetch('/api/dashboard', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new DashboardApiError(res.status, body.error ?? res.statusText)
  }
  return (await res.json()) as DashboardData
}
