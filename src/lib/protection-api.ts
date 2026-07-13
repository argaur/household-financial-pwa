export interface Protection {
  id: string
  householdId: string
  memberId: string
  type: 'term-life' | 'health' | 'disability' | 'other'
  coverAmount: string
  premium: string | null
  provider: string | null
  status: 'active' | 'lapsed' | 'pending'
  createdAt: string
  updatedAt: string
}

export interface ProtectionInput {
  memberId: string
  type: Protection['type']
  coverAmount: string
  premium?: string
  provider?: string
  status: Protection['status']
}

interface ProtectionListResponse {
  protection: Protection[]
}
interface ProtectionResponse {
  protection: Protection | null
}

export class ProtectionApiError extends Error {
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
    throw new ProtectionApiError(res.status, body.error ?? res.statusText)
  }
  return res
}

export async function listProtection(token: string | null): Promise<Protection[]> {
  const res = await authedFetch('/api/protection', token)
  const body = (await res.json()) as ProtectionListResponse
  return body.protection
}

export async function createProtection(token: string | null, input: ProtectionInput): Promise<Protection> {
  const res = await authedFetch('/api/protection', token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = (await res.json()) as ProtectionResponse
  if (!body.protection) throw new ProtectionApiError(500, 'protection_missing_in_response')
  return body.protection
}

export async function updateProtection(token: string | null, id: string, input: ProtectionInput): Promise<Protection> {
  // Query param, not a /:id path segment — see server/routes/protection.ts
  // for why (Vercel zero-config routing only matches single-segment
  // /api/* paths).
  const res = await authedFetch(`/api/protection?id=${encodeURIComponent(id)}`, token, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = (await res.json()) as ProtectionResponse
  if (!body.protection) throw new ProtectionApiError(500, 'protection_missing_in_response')
  return body.protection
}
