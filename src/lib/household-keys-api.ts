import { encryptedFetch } from './encrypted-rows'

/**
 * Client for `/api/household-keys` — the household's wrapped key material.
 *
 * Everything on this route is opaque to the server by construction: two copies
 * of the data key, each wrapped under a key derived from a credential the
 * server has never seen. This module moves those blobs and nothing else. No
 * passphrase, no recovery code and no unwrapped key ever reaches it.
 */

/** The wrapped key material exactly as `POST /api/household-keys` accepts it. */
export interface HouseholdKeyMaterial {
  kdfAlg: string
  kdfIterations: number
  passphraseSalt: string
  wrappedDekPassphrase: string
  passphraseWrapIv: string
  recoverySalt: string
  wrappedDekRecovery: string
  recoveryWrapIv: string
}

/** The stored row, as `GET /api/household-keys` returns it. */
export interface HouseholdKeys extends HouseholdKeyMaterial {
  householdId: string
  createdAt: string
  updatedAt: string
}

export class HouseholdKeysApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HouseholdKeysApiError'
  }
}

const fail = (status: number, message: string) => new HouseholdKeysApiError(status, message)

/**
 * The household's key material, or `null` when there is none yet.
 *
 * A 404 is not an error here — it is the ordinary state of a user who has not
 * finished setup, and of a user who has no household at all. The route cannot
 * distinguish those two, which is why {@link import('./key-setup').resolveVaultState}
 * probes the household separately before deciding what to show.
 */
export async function fetchHouseholdKeys(token: string | null): Promise<HouseholdKeys | null> {
  try {
    const res = await encryptedFetch('/api/household-keys', token, fail)
    const body = (await res.json()) as { householdKeys: HouseholdKeys }
    return body.householdKeys
  } catch (err) {
    if (err instanceof HouseholdKeysApiError && err.status === 404) return null
    throw err
  }
}

/**
 * What a create attempt did.
 *
 * `already-exists` is a 409, and 409 is the route working as designed — key
 * material is create-only. It must never be retried "with force": overwriting
 * the row would strand the data key that every encrypted row in the household
 * is sealed under, permanently.
 */
export type CreateHouseholdKeysOutcome = 'created' | 'already-exists'

export async function createHouseholdKeys(
  token: string | null,
  material: HouseholdKeyMaterial,
): Promise<CreateHouseholdKeysOutcome> {
  try {
    await encryptedFetch('/api/household-keys', token, fail, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(material),
    })
    return 'created'
  } catch (err) {
    if (err instanceof HouseholdKeysApiError && err.status === 409) return 'already-exists'
    throw err
  }
}

/** The passphrase copy's three columns, tagged so the server can pick its schema. */
export interface PassphraseRewrap {
  credential: 'passphrase'
  passphraseSalt: string
  wrappedDekPassphrase: string
  passphraseWrapIv: string
}

/** The recovery copy's three columns. */
export interface RecoveryRewrap {
  credential: 'recovery'
  recoverySalt: string
  wrappedDekRecovery: string
  recoveryWrapIv: string
}

/**
 * One credential's re-wrapped copy.
 *
 * A union of two disjoint shapes, mirroring the server's discriminated union of
 * two `.strict()` schemas. There is no type here that can carry both
 * credentials, so "change the passphrase and accidentally overwrite the
 * recovery copy" is not a request this client can construct.
 */
export type HouseholdKeyRewrap = PassphraseRewrap | RecoveryRewrap

/**
 * PATCH the wrapped copy of ONE credential.
 *
 * Same single path segment as GET and POST — Vercel's zero-config routing only
 * serves `/api/*` with one segment, so the credential being rotated is carried
 * by the body's discriminator, never by a sub-path.
 *
 * The caller must have already proven, locally, that the new blob unwraps to a
 * working data key. This function only moves bytes; it cannot check anything,
 * and neither can the server.
 */
export async function rewrapHouseholdKeys(
  token: string | null,
  rewrap: HouseholdKeyRewrap,
): Promise<HouseholdKeys> {
  const res = await encryptedFetch('/api/household-keys', token, fail, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(rewrap),
  })
  const body = (await res.json()) as { householdKeys: HouseholdKeys }
  return body.householdKeys
}
