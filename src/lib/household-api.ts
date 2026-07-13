export interface Household {
  id: string
  ownerUserId: string
  name: string
  createdAt: string
  updatedAt: string
}

interface HouseholdResponse {
  household: Household | null
}

export class HouseholdApiError extends Error {
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
    throw new HouseholdApiError(res.status, body.error ?? res.statusText)
  }
  return res
}

export async function fetchHousehold(token: string | null): Promise<Household | null> {
  const res = await authedFetch('/api/household', token)
  const body = (await res.json()) as HouseholdResponse
  return body.household
}

export async function createHousehold(token: string | null, name: string): Promise<Household> {
  const res = await authedFetch('/api/household', token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  const body = (await res.json()) as HouseholdResponse
  if (!body.household) throw new HouseholdApiError(500, 'household_missing_in_response')
  return body.household
}

export async function updateHousehold(token: string | null, name: string): Promise<Household> {
  // Household is a singleton per owner — no ?id= needed, same as the PATCH
  // route (see server/routes/household.ts).
  const res = await authedFetch('/api/household', token, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  const body = (await res.json()) as HouseholdResponse
  if (!body.household) throw new HouseholdApiError(500, 'household_missing_in_response')
  return body.household
}
