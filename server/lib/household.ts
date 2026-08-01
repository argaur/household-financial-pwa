import { eq, and } from 'drizzle-orm'
import { households } from '../../drizzle/schema.js'
import type { db as Db } from './db.js'
import type { HouseholdScopedCreate, EncryptedUpdate, UpdateOutcome } from './envelope.js'

export type Household = typeof households.$inferSelect

export type CreateHouseholdInput = HouseholdScopedCreate
export type UpdateHouseholdInput = EncryptedUpdate

/**
 * Every query here filters by ownerUserId (resolved server-side from the Clerk
 * session, never from client input) — this is the app-layer scoping boundary
 * Slice 1 proves out. No function in this module accepts a household_id from
 * a caller other than as the id of a row it is creating.
 *
 * The household's name is inside `ciphertext`; the server keeps the id, the
 * owner and the version.
 */
export async function getHouseholdForOwner(db: Pick<typeof Db, 'select'>, ownerUserId: string): Promise<Household | null> {
  const rows = await db.select().from(households).where(eq(households.ownerUserId, ownerUserId)).limit(1)
  return rows[0] ?? null
}

/**
 * Create-or-return. The id comes from the client because the household's own
 * id is half of the AAD binding its name ciphertext (see server/lib/envelope.ts
 * for why row ids are client-generated); `ownerUserId` never does.
 */
export async function createHouseholdForOwner(
  db: Pick<typeof Db, 'select' | 'insert'>,
  ownerUserId: string,
  input: CreateHouseholdInput,
): Promise<Household> {
  const existing = await getHouseholdForOwner(db, ownerUserId)
  if (existing) return existing

  const [row] = await db
    .insert(households)
    .values({
      id: input.id,
      ownerUserId,
      ciphertext: input.ciphertext,
      iv: input.iv,
      alg: input.alg,
    })
    .returning()
  if (!row) throw new Error('Insert of a household returned no row')
  return row
}

/**
 * Version-conditional update — see server/lib/holdings.ts's updateHolding for
 * the reasoning. Scoped by the householdId the route already resolved from the
 * caller's session, never by a client-supplied id.
 */
export async function updateHousehold(
  db: Pick<typeof Db, 'update'>,
  householdId: string,
  input: UpdateHouseholdInput,
): Promise<UpdateOutcome<Household>> {
  const [row] = await db
    .update(households)
    .set({
      ciphertext: input.ciphertext,
      iv: input.iv,
      alg: input.alg,
      version: input.expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(households.id, householdId), eq(households.version, input.expectedVersion)))
    .returning()
  if (!row) return { status: 'conflict' }
  return { status: 'updated', row }
}
