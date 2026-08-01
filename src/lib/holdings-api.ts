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

/** Physical table name — half of the AAD every holding ciphertext is bound to. */
const TABLE = 'holdings'

export const ASSET_CLASSES = ['equity', 'debt', 'gold', 'hybrid', 'real-estate', 'alternative'] as const
export type AssetClass = (typeof ASSET_CLASSES)[number]

/**
 * Everything about a holding that the server must not be able to read. The
 * instrument, the amounts, the dates, the nominee and the notes all live in
 * here; only `id`, `householdId`, `memberId` and the version stay outside.
 */
const holdingPayloadSchema = z.object({
  instrumentId: z.string(),
  assetClass: z.enum(ASSET_CLASSES),
  investedAmount: z.string(),
  currentValue: z.string(),
  units: z.string().nullable(),
  monthlySip: z.string().nullable(),
  startDate: z.string().nullable(),
  maturityDate: z.string().nullable(),
  nominee: z.string().nullable(),
  isEmergencyFund: z.boolean(),
  notes: z.string().nullable(),
})

export type HoldingPayload = z.infer<typeof holdingPayloadSchema>

export interface Holding extends HoldingPayload {
  id: string
  householdId: string
  memberId: string
  /** Version of the stored row. Must be handed back to {@link updateHolding} as `expectedVersion`. */
  version: number
  createdAt: string
  updatedAt: string
}

export interface HoldingInput {
  memberId: string
  instrumentId: string
  assetClass: AssetClass
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

export interface HoldingList {
  holdings: Holding[]
  /** Rows that failed to decrypt. A count only — the contents are, by definition, unavailable. */
  unreadableCount: number
  /** Rows written before encryption existed, still holding no ciphertext. */
  notYetEncryptedCount: number
}

interface HoldingWire extends WireEnvelope {
  memberId: string
}

interface HoldingsListResponse {
  holdings: HoldingWire[]
}
interface HoldingResponse {
  holding: HoldingWire | null
}

export class HoldingsApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'HoldingsApiError'
  }
}

const fail = (status: number, message: string) => new HoldingsApiError(status, message)

/** Absent optional fields become explicit nulls so a round trip is byte-stable. */
function toPayload(input: HoldingInput): HoldingPayload {
  return {
    instrumentId: input.instrumentId,
    assetClass: input.assetClass,
    investedAmount: input.investedAmount,
    currentValue: input.currentValue,
    units: input.units ?? null,
    monthlySip: input.monthlySip ?? null,
    startDate: input.startDate ?? null,
    maturityDate: input.maturityDate ?? null,
    nominee: input.nominee ?? null,
    isEmergencyFund: input.isEmergencyFund ?? false,
    notes: input.notes ?? null,
  }
}

function assemble(wire: HoldingWire, payload: HoldingPayload): Holding {
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

/** Decrypt the single row a create/update responds with, so a wrong-shaped write surfaces immediately. */
async function readBack(dataKey: CryptoKey, wire: HoldingWire | null): Promise<Holding> {
  if (!wire) throw new HoldingsApiError(500, 'holding_missing_in_response')
  const outcome = await decryptWireRow(TABLE, dataKey, wire, holdingPayloadSchema, assemble)
  if (outcome.status !== 'decrypted') throw new HoldingsApiError(500, `holding_${outcome.status}`)
  return outcome.row
}

export async function listHoldings(token: string | null): Promise<HoldingList> {
  const vault = await openVault()
  const res = await encryptedFetch('/api/holdings', token, fail)
  const body = (await res.json()) as HoldingsListResponse
  const decrypted = await decryptWireRows(TABLE, vault.dataKey, body.holdings, holdingPayloadSchema, assemble)
  return {
    holdings: decrypted.rows,
    unreadableCount: decrypted.unreadableCount,
    notYetEncryptedCount: decrypted.notYetEncryptedCount,
  }
}

export async function createHolding(token: string | null, input: HoldingInput): Promise<Holding> {
  const vault = await openVault()
  // The id is generated here because the AAD binds the ciphertext to its row,
  // and that binding has to exist before the bytes leave the browser.
  const id = newRowId()
  const sealed = await sealRow(TABLE, vault, id, 1, toPayload(input))

  const res = await encryptedFetch('/api/holdings', token, fail, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, memberId: input.memberId, ...sealed }),
  })
  const body = (await res.json()) as HoldingResponse
  return readBack(vault.dataKey, body.holding)
}

/**
 * @param expectedVersion the `version` of the holding this edit was made
 * against. The server updates only if the stored version still matches, and
 * answers 409 otherwise rather than discarding the other device's write.
 */
export async function updateHolding(
  token: string | null,
  id: string,
  input: HoldingInput,
  expectedVersion: number,
): Promise<Holding> {
  const vault = await openVault()
  // Sealed at the version the row will have once stored, not the one it has now.
  const sealed = await sealRow(TABLE, vault, id, expectedVersion + 1, toPayload(input))

  // Query param, not a /:id path segment — see server/routes/holdings.ts for
  // why (Vercel zero-config routing only matches single-segment /api/* paths).
  const res = await encryptedFetch(`/api/holdings?id=${encodeURIComponent(id)}`, token, fail, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...sealed, expectedVersion }),
  })
  const body = (await res.json()) as HoldingResponse
  return readBack(vault.dataKey, body.holding)
}
