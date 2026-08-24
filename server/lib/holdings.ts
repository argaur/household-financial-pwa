import { eq, and } from 'drizzle-orm'
import { holdings, familyMembers } from '../../drizzle/schema.js'
import type { db as Db } from './db.js'
import type { MemberScopedCreate, EncryptedUpdate, UpdateOutcome } from './envelope.js'
import { ensureBaselineLedger, getBaselineLedger } from './ledgers.js'

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
  const rows = await db.select().from(holdings).where(eq(holdings.householdId, householdId))
  const baseline = await getBaselineLedger(db, householdId)

  // Current only, never every ledger's rows pooled together.
  //
  // Before D-016 a household had exactly one set of holdings, so filtering by
  // household alone WAS filtering to Current. That stopped being true the
  // moment a second ledger could exist: without this filter, creating one copy
  // ledger would make the Portfolio screen show every holding twice, and four
  // would show it five times — strategy rows presented as things the household
  // actually owns. "Current never changes because a ledger exists" has to hold
  // on the read path too, not just the write path.
  //
  // A null `ledger_id` counts as Current. Migration 0004 made the column NOT
  // NULL, so no such row can exist in a migrated database; the case is kept
  // because a household with no baseline yet must still see its own rows rather
  // than an empty screen, which is exactly what a legacy pre-encryption row
  // does in the test suite.
  //
  // Filtered here rather than in SQL because the result is already bounded by
  // the household and the ledger cap, and an `or(isNull(...), eq(...))`
  // predicate is one more shape every fake db in the suite would have to model
  // — the same trade-off, and the same reasoning, as listLedgers' sort.
  // `?? null` because "no ledger" reaches this two ways: Postgres returns null
  // for the column, but a row object built without the field at all yields
  // undefined. Treating only one of them as Current would make the answer
  // depend on how the row was constructed rather than on what it means.
  return rows.filter((row) => {
    const ledgerId = row.ledgerId ?? null
    return ledgerId === null || (baseline !== null && ledgerId === baseline.id)
  })
}

/**
 * Holdings for one specific ledger, scoped to the household as well.
 *
 * The caller (the route) must already have resolved and household-checked
 * `ledgerId` via `getLedgerForHousehold` before calling this — the household
 * filter here is defense in depth, not the tenancy boundary itself.
 */
export async function listHoldingsForLedger(
  db: HoldingsDb,
  householdId: string,
  ledgerId: string,
): Promise<Holding[]> {
  return db
    .select()
    .from(holdings)
    .where(and(eq(holdings.householdId, householdId), eq(holdings.ledgerId, ledgerId)))
}

export async function createHolding(
  db: HoldingsDb & Pick<typeof Db, 'insert'>,
  householdId: string,
  input: CreateHoldingInput,
): Promise<Holding> {
  await assertMemberInHousehold(db, householdId, input.memberId)

  // Every holding created through this v1 route belongs to the household's
  // baseline ledger — "Current". D-016 added ledgers alongside holdings rather
  // than replacing the household relationship, so this path's behaviour is
  // unchanged: what used to be "the household's holdings" is now, identically,
  // "the household's Current ledger's holdings". Ledger-scoped creation is a
  // separate route; this one never writes into a non-baseline ledger.
  const baseline = await ensureBaselineLedger(db, householdId)

  // `version` is left to its column default of 1 — the client encrypted
  // against version 1, and letting the database own it means a client cannot
  // announce a version it did not earn.
  const [row] = await db
    .insert(holdings)
    .values({
      id: input.id,
      householdId,
      ledgerId: baseline.id,
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
 * Creates a holding inside a specific, already ownership-verified ledger.
 *
 * `ledgerId` here is never client input — the route resolves it via
 * `getLedgerForHousehold(db, householdId, ledgerId)` first, which returns
 * null (404, before this function is ever called) for a ledger that doesn't
 * exist or belongs to another household. This function's own job is only the
 * member-tenancy check, identical to the baseline path above.
 */
export async function createHoldingInLedger(
  db: HoldingsDb & Pick<typeof Db, 'insert'>,
  householdId: string,
  ledgerId: string,
  input: CreateHoldingInput,
): Promise<Holding> {
  await assertMemberInHousehold(db, householdId, input.memberId)

  const [row] = await db
    .insert(holdings)
    .values({
      id: input.id,
      householdId,
      ledgerId,
      memberId: input.memberId,
      ciphertext: input.ciphertext,
      iv: input.iv,
      alg: input.alg,
    })
    .returning()
  if (!row) throw new Error('Insert of a holding returned no row')
  return row
}

export type DeleteHoldingOutcome = 'deleted' | 'not_found'

/**
 * Deletes one holding, regardless of which ledger it belongs to — but only
 * within the caller's household. Mirrors `deleteLedger`'s shape: the
 * household filter is part of the lookup, so "no such holding" and "someone
 * else's holding" are indistinguishable from outside (the route answers both
 * with 404, never 403).
 *
 * Deliberately NOT baseline-aware: this is the tenancy boundary only. Nothing
 * here refuses a delete because the holding happens to sit in Current — a
 * caller editing their own baseline via `?id=` (no `ledgerId`) is expected
 * behaviour, unrelated to the "Current never changes because a ledger exists"
 * invariant, which is about *other* ledgers never touching Current, not about
 * Current being immutable to its own owner.
 */
export async function deleteHolding(
  db: HoldingsDb & Pick<typeof Db, 'delete'>,
  householdId: string,
  holdingId: string,
): Promise<DeleteHoldingOutcome> {
  const rows = await db
    .select()
    .from(holdings)
    .where(and(eq(holdings.id, holdingId), eq(holdings.householdId, householdId)))
    .limit(1)
  if (!rows[0]) return 'not_found'

  await db.delete(holdings).where(and(eq(holdings.id, holdingId), eq(holdings.householdId, householdId)))
  return 'deleted'
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
