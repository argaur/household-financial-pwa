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
 * a 409. There is no update path in this module by design — rotating the
 * passphrase is a separate, explicit flow.
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
