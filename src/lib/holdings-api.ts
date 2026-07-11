export interface Holding {
  id: string
  householdId: string
  memberId: string
  instrumentId: string
  assetClass: 'equity' | 'debt' | 'gold' | 'hybrid' | 'real-estate' | 'alternative'
  investedAmount: string
  currentValue: string
  units: string | null
  monthlySip: string | null
  startDate: string | null
  maturityDate: string | null
  nominee: string | null
  priceSource: string
  isEmergencyFund: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface HoldingInput {
  memberId: string
  instrumentId: string
  investedAmount: string
  currentValue: string
  units?: string
  monthlySip?: string
  startDate?: string
  maturityDate?: string
  nominee?: string
  isEmergencyFund?: boolean
  notes?: string
}

interface HoldingsListResponse {
  holdings: Holding[]
}
interface HoldingResponse {
  holding: Holding | null
}

export class HoldingsApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function authedFetch(path: string, token: string | null, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new HoldingsApiError(res.status, body.error ?? res.statusText)
  }
  return res
}

export async function listHoldings(token: string | null): Promise<Holding[]> {
  const res = await authedFetch('/api/holdings', token)
  const body = (await res.json()) as HoldingsListResponse
  return body.holdings
}

export async function createHolding(token: string | null, input: HoldingInput): Promise<Holding> {
  const res = await authedFetch('/api/holdings', token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = (await res.json()) as HoldingResponse
  if (!body.holding) throw new HoldingsApiError(500, 'holding_missing_in_response')
  return body.holding
}

export async function updateHolding(token: string | null, id: string, input: HoldingInput): Promise<Holding> {
  // Query param, not a /:id path segment — see server/routes/holdings.ts for
  // why (Vercel zero-config routing only matches single-segment /api/* paths).
  const res = await authedFetch(`/api/holdings?id=${encodeURIComponent(id)}`, token, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = (await res.json()) as HoldingResponse
  if (!body.holding) throw new HoldingsApiError(500, 'holding_missing_in_response')
  return body.holding
}
