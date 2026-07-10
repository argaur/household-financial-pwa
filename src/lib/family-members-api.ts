export interface FamilyMember {
  id: string
  householdId: string
  name: string
  relationship: 'self' | 'spouse' | 'child' | 'parent' | 'other'
  dateOfBirth: string
  riskProfile?: 'conservative' | 'moderate' | 'aggressive' | null
  createdAt: string
  updatedAt: string
}

interface MembersListResponse {
  members: FamilyMember[]
}
interface MemberCreateResponse {
  member: FamilyMember | null
}

export interface CreateFamilyMemberInput {
  name: string
  relationship: FamilyMember['relationship']
  dateOfBirth: string
  riskProfile?: FamilyMember['riskProfile']
}

export class FamilyMembersApiError extends Error {
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
    throw new FamilyMembersApiError(res.status, body.error ?? res.statusText)
  }
  return res
}

export async function listFamilyMembers(token: string | null): Promise<FamilyMember[]> {
  const res = await authedFetch('/api/family-members', token)
  const body = (await res.json()) as MembersListResponse
  return body.members
}

export async function createFamilyMember(token: string | null, input: CreateFamilyMemberInput): Promise<FamilyMember> {
  const res = await authedFetch('/api/family-members', token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = (await res.json()) as MemberCreateResponse
  if (!body.member) throw new FamilyMembersApiError(500, 'member_missing_in_response')
  return body.member
}
