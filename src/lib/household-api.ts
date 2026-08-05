import { z } from 'zod'
import { decryptWireRow, encryptedFetch, openVault, sealRow, type WireEnvelope } from './encrypted-rows'

/** Physical table name — half of the AAD the household ciphertext is bound to. */
const TABLE = 'households'

/** The household's name is the only thing it holds, and the server never sees it. */
const householdPayloadSchema = z.object({
  name: z.string(),
})

export type HouseholdPayload = z.infer<typeof householdPayloadSchema>

export interface Household extends HouseholdPayload {
  id: string
  ownerUserId: string
  /** Version of the stored row. Hand it back to {@link updateHousehold} as `expectedVersion`. */
  version: number
  createdAt: string
  updatedAt: string
}

/**
 * Reading the household has four outcomes, not two: it may not exist yet
 * (a brand-new user), it may be readable, it may predate encryption, or it may
 * refuse to decrypt. Collapsing the last two into `null` would tell a user
 * with a real household that they have none, and offer to create a second one.
 */
export type HouseholdRead =
  | { state: 'absent' }
  | { state: 'ok'; household: Household }
  | { state: 'not-yet-encrypted'; id: string }
  | { state: 'unreadable'; id: string; reason: string }

interface HouseholdWire extends Omit<WireEnvelope, 'householdId'> {
  ownerUserId: string
}

interface HouseholdResponse {
  household: HouseholdWire | null
}

export class HouseholdApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'HouseholdApiError'
  }
}

const fail = (status: number, message: string) => new HouseholdApiError(status, message)

/** A household's AAD `householdId` is its own id — it is the root of the tenancy tree. */
function toEnvelope(wire: HouseholdWire): HouseholdWire & WireEnvelope {
  return { ...wire, householdId: wire.id }
}

function assemble(wire: HouseholdWire & WireEnvelope, payload: HouseholdPayload): Household {
  return {
    ...payload,
    id: wire.id,
    ownerUserId: wire.ownerUserId,
    version: wire.version,
    createdAt: wire.createdAt,
    updatedAt: wire.updatedAt,
  }
}

async function readBack(dataKey: CryptoKey, wire: HouseholdWire | null): Promise<Household> {
  if (!wire) throw new HouseholdApiError(500, 'household_missing_in_response')
  const outcome = await decryptWireRow(TABLE, dataKey, toEnvelope(wire), householdPayloadSchema, assemble)
  if (outcome.status !== 'decrypted') throw new HouseholdApiError(500, `household_${outcome.status}`)
  return outcome.row
}

/**
 * Does a household row exist for this user, and what is its id?
 *
 * Deliberately does NOT open the vault. {@link fetchHousehold} cannot run
 * before the vault is unlocked, but deciding *whether* to show an unlock screen
 * at all requires knowing whether there is a household to unlock — a question
 * that has to be answerable while locked. Only the id crosses back: the name
 * stays ciphertext and is never touched here.
 */
export async function probeHousehold(
  token: string | null,
): Promise<{ exists: boolean; id: string | null; encrypted: boolean }> {
  const res = await encryptedFetch('/api/household', token, fail)
  const body = (await res.json()) as HouseholdResponse
  if (!body.household) return { exists: false, id: null, encrypted: false }
  // `ciphertext` is the only thing that distinguishes a row this app sealed
  // from one written before encryption existed. Both look identical to a
  // caller that only asks whether a household is there, and the two need
  // opposite answers: sealed-with-no-key is unopenable, plaintext is not.
  return { exists: true, id: body.household.id, encrypted: body.household.ciphertext != null }
}

export async function fetchHousehold(token: string | null): Promise<HouseholdRead> {
  const vault = await openVault()
  const res = await encryptedFetch('/api/household', token, fail)
  const body = (await res.json()) as HouseholdResponse
  if (!body.household) return { state: 'absent' }

  const outcome = await decryptWireRow(
    TABLE,
    vault.dataKey,
    toEnvelope(body.household),
    householdPayloadSchema,
    assemble,
  )
  if (outcome.status === 'decrypted') return { state: 'ok', household: outcome.row }
  if (outcome.status === 'not-yet-encrypted') return { state: 'not-yet-encrypted', id: outcome.id }
  return { state: 'unreadable', id: outcome.id, reason: outcome.reason }
}

/**
 * The new household takes the id the vault was unlocked for. That id is
 * already half of every AAD this household will ever produce, so it has to be
 * decided before the first ciphertext exists — the vault is where it is
 * decided, and the server only ever attaches the owner.
 */
export async function createHousehold(token: string | null, name: string): Promise<Household> {
  const vault = await openVault()
  const id = vault.householdId
  const sealed = await sealRow(TABLE, vault, id, 1, { name })

  const res = await encryptedFetch('/api/household', token, fail, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, ...sealed }),
  })
  const body = (await res.json()) as HouseholdResponse
  return readBack(vault.dataKey, body.household)
}

export async function updateHousehold(
  token: string | null,
  name: string,
  expectedVersion: number,
): Promise<Household> {
  const vault = await openVault()
  const sealed = await sealRow(TABLE, vault, vault.householdId, expectedVersion + 1, { name })

  // Household is a singleton per owner — no ?id= needed, same as the PATCH
  // route (see server/routes/household.ts).
  const res = await encryptedFetch('/api/household', token, fail, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...sealed, expectedVersion }),
  })
  const body = (await res.json()) as HouseholdResponse
  return readBack(vault.dataKey, body.household)
}
