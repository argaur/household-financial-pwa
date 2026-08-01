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

/** Physical table name — half of the AAD every protection ciphertext is bound to. */
const TABLE = 'protection'

export const PROTECTION_TYPES = ['term-life', 'health', 'disability', 'other'] as const
export const PROTECTION_STATUSES = ['active', 'lapsed', 'pending'] as const

/** Cover amounts, premiums and providers never reach the server in the clear. */
const protectionPayloadSchema = z.object({
  type: z.enum(PROTECTION_TYPES),
  coverAmount: z.string(),
  premium: z.string().nullable(),
  provider: z.string().nullable(),
  status: z.enum(PROTECTION_STATUSES),
})

export type ProtectionPayload = z.infer<typeof protectionPayloadSchema>

export interface Protection extends ProtectionPayload {
  id: string
  householdId: string
  memberId: string
  /** Version of the stored row. Hand it back to {@link updateProtection} as `expectedVersion`. */
  version: number
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

export interface ProtectionList {
  protection: Protection[]
  unreadableCount: number
  notYetEncryptedCount: number
}

interface ProtectionWire extends WireEnvelope {
  memberId: string
}

interface ProtectionListResponse {
  protection: ProtectionWire[]
}
interface ProtectionResponse {
  protection: ProtectionWire | null
}

export class ProtectionApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ProtectionApiError'
  }
}

const fail = (status: number, message: string) => new ProtectionApiError(status, message)

function toPayload(input: ProtectionInput): ProtectionPayload {
  return {
    type: input.type,
    coverAmount: input.coverAmount,
    premium: input.premium ?? null,
    provider: input.provider ?? null,
    status: input.status,
  }
}

function assemble(wire: ProtectionWire, payload: ProtectionPayload): Protection {
  return {
    ...payload,
    id: wire.id,
    householdId: wire.householdId,
    memberId: wire.memberId,
    version: wire.version,
    createdAt: wire.createdAt,
    updatedAt: wire.updatedAt,
  }
}

async function readBack(dataKey: CryptoKey, wire: ProtectionWire | null): Promise<Protection> {
  if (!wire) throw new ProtectionApiError(500, 'protection_missing_in_response')
  const outcome = await decryptWireRow(TABLE, dataKey, wire, protectionPayloadSchema, assemble)
  if (outcome.status !== 'decrypted') throw new ProtectionApiError(500, `protection_${outcome.status}`)
  return outcome.row
}

export async function listProtection(token: string | null): Promise<ProtectionList> {
  const vault = await openVault()
  const res = await encryptedFetch('/api/protection', token, fail)
  const body = (await res.json()) as ProtectionListResponse
  const decrypted = await decryptWireRows(TABLE, vault.dataKey, body.protection, protectionPayloadSchema, assemble)
  return {
    protection: decrypted.rows,
    unreadableCount: decrypted.unreadableCount,
    notYetEncryptedCount: decrypted.notYetEncryptedCount,
  }
}

export async function createProtection(token: string | null, input: ProtectionInput): Promise<Protection> {
  const vault = await openVault()
  const id = newRowId()
  const sealed = await sealRow(TABLE, vault, id, 1, toPayload(input))

  const res = await encryptedFetch('/api/protection', token, fail, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, memberId: input.memberId, ...sealed }),
  })
  const body = (await res.json()) as ProtectionResponse
  return readBack(vault.dataKey, body.protection)
}

export async function updateProtection(
  token: string | null,
  id: string,
  input: ProtectionInput,
  expectedVersion: number,
): Promise<Protection> {
  const vault = await openVault()
  const sealed = await sealRow(TABLE, vault, id, expectedVersion + 1, toPayload(input))

  // Query param, not a /:id path segment — see server/routes/protection.ts
  // for why (Vercel zero-config routing only matches single-segment /api/* paths).
  const res = await encryptedFetch(`/api/protection?id=${encodeURIComponent(id)}`, token, fail, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...sealed, expectedVersion }),
  })
  const body = (await res.json()) as ProtectionResponse
  return readBack(vault.dataKey, body.protection)
}
