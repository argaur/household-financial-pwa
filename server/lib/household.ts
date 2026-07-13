import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { households } from '../../drizzle/schema.js'
import type { db as Db } from './db.js'

export type Household = typeof households.$inferSelect

const householdNameSchema = z.string().trim().min(1, 'Household name is required').max(100, 'Household name is too long')

/**
 * Every query here filters by ownerUserId (resolved server-side from the Clerk
 * session, never from client input) — this is the app-layer scoping boundary
 * Slice 1 proves out. No function in this module accepts a household_id.
 */
export async function getHouseholdForOwner(db: Pick<typeof Db, 'select'>, ownerUserId: string): Promise<Household | null> {
  const rows = await db.select().from(households).where(eq(households.ownerUserId, ownerUserId)).limit(1)
  return (rows[0] as Household | undefined) ?? null
}

export async function createHouseholdForOwner(
  db: Pick<typeof Db, 'select' | 'insert'>,
  ownerUserId: string,
  name: string,
): Promise<Household> {
  const existing = await getHouseholdForOwner(db, ownerUserId)
  if (existing) return existing

  const parsedName = householdNameSchema.parse(name)
  const [row] = await db.insert(households).values({ ownerUserId, name: parsedName }).returning()
  return row as Household
}

/**
 * Slice 9 — rename an existing household. Scoped by householdId (already
 * resolved server-side from the caller's session via getHouseholdForOwner),
 * never by a client-supplied id. Returns null if no row matched (defensive —
 * shouldn't happen given the route always resolves the household first).
 */
export async function updateHouseholdName(
  db: Pick<typeof Db, 'update'>,
  householdId: string,
  name: string,
): Promise<Household | null> {
  const parsedName = householdNameSchema.parse(name)
  const [row] = await db
    .update(households)
    .set({ name: parsedName, updatedAt: new Date() })
    .where(eq(households.id, householdId))
    .returning()
  return (row as Household | undefined) ?? null
}
