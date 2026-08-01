import { eq } from 'drizzle-orm'
import { householdKeys } from '../../drizzle/schema.js'
import type { db as Db } from './db.js'

export type HouseholdKeyRow = typeof householdKeys.$inferSelect

/**
 * Wrapped key material for a household's client-side encryption.
 *
 * The server stores and returns opaque blobs only — it never holds the
 * passphrase, the recovery code, or the unwrapped DEK, and therefore can never
 * decrypt anything. Every function here is scoped by householdId, which the
 * route resolves from the Clerk session (never from client input).
 */

/** The only KDF this build accepts. Kept here so the client imports it rather than re-typing a string. */
export const SUPPORTED_KDF_ALG = 'PBKDF2-SHA256'

export interface CreateHouseholdKeysInput {
  kdfAlg: string
  kdfIterations: number
  passphraseSalt: string
  wrappedDekPassphrase: string
  passphraseWrapIv: string
  recoverySalt: string
  wrappedDekRecovery: string
  recoveryWrapIv: string
}

export async function getHouseholdKeys(
  db: Pick<typeof Db, 'select'>,
  householdId: string,
): Promise<HouseholdKeyRow | null> {
  const rows = await db.select().from(householdKeys).where(eq(householdKeys.householdId, householdId)).limit(1)
  return (rows[0] as HouseholdKeyRow | undefined) ?? null
}

/**
 * CREATE-ONLY, deliberately. Overwriting existing key material would make every
 * encrypted row in the household permanently unreadable, so this returns null
 * instead of updating when a row already exists, and the caller turns that into
 * a 409. Rotating a credential is the separate, explicit flow below — it never
 * runs through here.
 *
 * onConflictDoNothing() on the household_id primary key closes the
 * check-then-insert race at the database level: a concurrent second request
 * gets an empty `returning()` rather than clobbering the first one's row.
 */
export async function createHouseholdKeys(
  db: Pick<typeof Db, 'insert'>,
  householdId: string,
  input: CreateHouseholdKeysInput,
): Promise<HouseholdKeyRow | null> {
  const rows = await db
    .insert(householdKeys)
    .values({ householdId, ...input })
    .onConflictDoNothing()
    .returning()
  return (rows[0] as HouseholdKeyRow | undefined) ?? null
}

/** A passphrase change: the three passphrase columns, and structurally nothing else. */
export interface RewrapPassphraseInput {
  passphraseSalt: string
  wrappedDekPassphrase: string
  passphraseWrapIv: string
}

/** A recovery-code reset: the three recovery columns, and structurally nothing else. */
export interface RewrapRecoveryInput {
  recoverySalt: string
  wrappedDekRecovery: string
  recoveryWrapIv: string
}

/**
 * Re-wrap ONE credential. The data key itself never changes — the client
 * unwrapped it under the old credential and wrapped the identical bytes under
 * the new one, so not a single encrypted row is affected.
 *
 * ATOMICITY IS THE WHOLE POINT. A wrapped blob and the salt its KEK is derived
 * from are meaningless apart: persist a new salt without its new blob and the
 * household is locked out permanently, with no server-side recovery. So this is
 * ONE `UPDATE ... SET <three columns> WHERE household_id = $1 RETURNING *`.
 * Postgres applies a single statement atomically, which makes the half-written
 * state unreachable rather than merely unlikely. There is deliberately no
 * variant that sets a subset, and no path that touches both credentials — the
 * input type is a union of two disjoint shapes, so "update the salt but not the
 * blob" and "clobber the other credential" are both type errors, not review
 * comments.
 *
 * `kdfAlg` and `kdfIterations` are absent on purpose: BOTH copies are derived at
 * those parameters, so changing them during a one-credential rotation would
 * silently invalidate the credential that was not being changed.
 *
 * UPDATE, never upsert: a missing row yields an empty `returning()` and a 404.
 * This function can only ever modify key material that already exists.
 */
export async function rewrapHouseholdKeys(
  db: Pick<typeof Db, 'update'>,
  householdId: string,
  input: RewrapPassphraseInput | RewrapRecoveryInput,
): Promise<HouseholdKeyRow | null> {
  const rows = await db
    .update(householdKeys)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(householdKeys.householdId, householdId))
    .returning()
  return (rows[0] as HouseholdKeyRow | undefined) ?? null
}
