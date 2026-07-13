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

export interface DashboardData {
  household: { id: string; name: string }
  completeness: Completeness
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
