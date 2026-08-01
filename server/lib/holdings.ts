import { eq, and } from 'drizzle-orm'
import { holdings, familyMembers } from '../../drizzle/schema.js'
import type { db as Db } from './db.js'
import type { MemberScopedCreate, EncryptedUpdate, UpdateOutcome } from './envelope.js'

export type Holding = typeof holdings.$inferSelect

/** Thrown when the member a holding is filed under isn't in the caller's household. */
export class HoldingError extends Error {
  constructor(public code: 'member_not_found') {
    super(code)
  }
}

export type CreateHoldingInput = MemberScopedCreate
export type UpdateHoldingInput = EncryptedUpdate

type HoldingsDb = Pick<typeof Db, 'select'>

async function assertMemberInHousehold(db: HoldingsDb, householdId: string, memberId: string): Promise<void> {
  const memberRows = await db
    .select()
    .from(familyMembers)
    .where(and(eq(familyMembers.id, memberId), eq(familyMembers.householdId, householdId)))
    .limit(1)
  if (!memberRows[0]) throw new HoldingError('member_not_found')
}

/**
 * Every query filters by householdId (resolved server-side from the Clerk
 * session, never client input) — mirrors the app-layer scoping boundary
 * proven in Slice 1/2. memberId is additionally verified to belong to the
 * same household before a holding can be created against it, since the
 * family_members FK alone doesn't enforce cross-household isolation.
 *
 * Nothing in here can read a holding's contents: `instrumentId`, amounts,
 * dates and notes now live inside `ciphertext`, sealed under a key the server
 * never receives. What is left is the tenancy boundary and the version.
 */
export async function listHoldings(db: HoldingsDb, householdId: string): Promise<Holding[]> {
  return db.select().from(holdings).where(eq(holdings.householdId, householdId))
}

export async function createHolding(
  db: HoldingsDb & Pick<typeof Db, 'insert'>,
  householdId: string,
  input: CreateHoldingInput,
): Promise<Holding> {
  await assertMemberInHousehold(db, householdId, input.memberId)

  // `version` is left to its column default of 1 — the client encrypted
  // against version 1, and letting the database own it means a client cannot
  // announce a version it did not earn.
  const [row] = await db
    .insert(holdings)
    .values({
      id: input.id,
      householdId,
      memberId: input.memberId,
      ciphertext: input.ciphertext,
      iv: input.iv,
      alg: input.alg,
    })
    .returning()
  if (!row) throw new Error('Insert of a holding returned no row')
  return row
}

/**
 * Version-conditional update — the replacement for last-write-wins.
 *
 * The UPDATE carries `version = expectedVersion` in its WHERE clause, so two
 * devices that both read version 3 cannot both write version 4: the second one
 * matches zero rows and is reported as a conflict instead of silently
 * discarding the first one's entire encrypted row. The existence check that
 * runs first exists only to tell "someone else's row / no such row" (404)
 * apart from "your copy is stale" (409); the atomicity lives in the UPDATE
 * predicate, not in the check.
 */
export async function updateHolding(
  db: HoldingsDb & Pick<typeof Db, 'update'>,
  householdId: string,
  holdingId: string,
  input: UpdateHoldingInput,
): Promise<UpdateOutcome<Holding>> {
  const existingRows = await db
    .select()
    .from(holdings)
    .where(and(eq(holdings.id, holdingId), eq(holdings.householdId, householdId)))
    .limit(1)
  if (!existingRows[0]) return { status: 'not_found' }

  const [row] = await db
    .update(holdings)
    .set({
      ciphertext: input.ciphertext,
      iv: input.iv,
      alg: input.alg,
      version: input.expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(holdings.id, holdingId),
        eq(holdings.householdId, householdId),
        eq(holdings.version, input.expectedVersion),
      ),
    )
    .returning()
  if (!row) return { status: 'conflict' }
  return { status: 'updated', row }
}
