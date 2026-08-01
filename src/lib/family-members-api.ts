import { z } from 'zod'
import {
  decryptWireRow,
  decryptWireRows,
  encryptedFetch,
  newRowId,
  openVault,
  sealRow,
  type WireEnvelope,
} from './encrypted-rows'

/** Physical table name — half of the AAD every member ciphertext is bound to. */
const TABLE = 'family_members'

export const RELATIONSHIPS = ['self', 'spouse', 'child', 'parent', 'other'] as const
export const RISK_PROFILES = ['conservative', 'moderate', 'aggressive'] as const

/** A member's name, relationship, date of birth and risk profile never reach the server in the clear. */
const familyMemberPayloadSchema = z.object({
  name: z.string(),
  relationship: z.enum(RELATIONSHIPS),
  dateOfBirth: z.string(),
  riskProfile: z.enum(RISK_PROFILES).nullable(),
})

export type FamilyMemberPayload = z.infer<typeof familyMemberPayloadSchema>

export interface FamilyMember extends FamilyMemberPayload {
  id: string
  householdId: string
  /** Version of the stored row. Hand it back to {@link updateFamilyMember} as `expectedVersion`. */
  version: number
  createdAt: string
  updatedAt: string
}

export interface CreateFamilyMemberInput {
  name: string
  relationship: FamilyMember['relationship']
  dateOfBirth: string
  riskProfile?: FamilyMember['riskProfile']
}

export interface FamilyMemberList {
  members: FamilyMember[]
  unreadableCount: number
  notYetEncryptedCount: number
}

interface MembersListResponse {
  members: WireEnvelope[]
}
interface MemberResponse {
  member: WireEnvelope | null
}

export class FamilyMembersApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'FamilyMembersApiError'
  }
}

const fail = (status: number, message: string) => new FamilyMembersApiError(status, message)

function toPayload(input: CreateFamilyMemberInput): FamilyMemberPayload {
  return {
    name: input.name,
    relationship: input.relationship,
    dateOfBirth: input.dateOfBirth,
    riskProfile: input.riskProfile ?? null,
  }
}

function assemble(wire: WireEnvelope, payload: FamilyMemberPayload): FamilyMember {
  return {
    ...payload,
    id: wire.id,
    householdId: wire.householdId,
    version: wire.version,
    createdAt: wire.createdAt,
    updatedAt: wire.updatedAt,
  }
}

async function readBack(dataKey: CryptoKey, wire: WireEnvelope | null): Promise<FamilyMember> {
  if (!wire) throw new FamilyMembersApiError(500, 'member_missing_in_response')
  const outcome = await decryptWireRow(TABLE, dataKey, wire, familyMemberPayloadSchema, assemble)
  if (outcome.status !== 'decrypted') throw new FamilyMembersApiError(500, `member_${outcome.status}`)
  return outcome.row
}

export async function listFamilyMembers(token: string | null): Promise<FamilyMemberList> {
  const vault = await openVault()
  const res = await encryptedFetch('/api/family-members', token, fail)
  const body = (await res.json()) as MembersListResponse
  const decrypted = await decryptWireRows(TABLE, vault.dataKey, body.members, familyMemberPayloadSchema, assemble)
  return {
    members: decrypted.rows,
    unreadableCount: decrypted.unreadableCount,
    notYetEncryptedCount: decrypted.notYetEncryptedCount,
  }
}

export async function createFamilyMember(
  token: string | null,
  input: CreateFamilyMemberInput,
): Promise<FamilyMember> {
  const vault = await openVault()
  const id = newRowId()
  const sealed = await sealRow(TABLE, vault, id, 1, toPayload(input))

  const res = await encryptedFetch('/api/family-members', token, fail, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, ...sealed }),
  })
  const body = (await res.json()) as MemberResponse
  return readBack(vault.dataKey, body.member)
}

export async function updateFamilyMember(
  token: string | null,
  id: string,
  input: CreateFamilyMemberInput,
  expectedVersion: number,
): Promise<FamilyMember> {
  const vault = await openVault()
  const sealed = await sealRow(TABLE, vault, id, expectedVersion + 1, toPayload(input))

  // Query param, not a /:id path segment — see server/routes/family-members.ts
  // for why (Vercel zero-config routing only matches single-segment /api/* paths).
  const res = await encryptedFetch(`/api/family-members?id=${encodeURIComponent(id)}`, token, fail, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...sealed, expectedVersion }),
  })
  const body = (await res.json()) as MemberResponse
  return readBack(vault.dataKey, body.member)
}

export async function removeFamilyMember(token: string | null, id: string): Promise<void> {
  await encryptedFetch(`/api/family-members?id=${encodeURIComponent(id)}`, token, fail, { method: 'DELETE' })
}
