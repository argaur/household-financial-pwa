import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { ledgers, holdings, familyMembers } from '../../drizzle/schema.js'
import type { db as Db } from './db.js'
import { memberScopedCreateSchema, rowIdSchema } from './envelope.js'

export type Ledger = typeof ledgers.$inferSelect

/**
 * Reserved name for the baseline ledger. "Current never changes because a
 * ledger exists" is the guiding invariant of D-016, and this row is what
 * "Current" means in the database.
 */
export const BASELINE_LEDGER_NAME = 'Current'

type LedgerReadDb = Pick<typeof Db, 'select'>
type LedgerWriteDb = Pick<typeof Db, 'select' | 'insert'>
type LedgerDeleteDb = Pick<typeof Db, 'select' | 'delete'>
type LedgerCreateDb = Pick<typeof Db, 'select' | 'insert' | 'delete'>

/**
 * How many ledgers a household may hold *besides* "Current".
 *
 * The baseline is excluded on purpose: it is not a strategy the user chose to
 * keep, it is the record of what they actually own, and a cap that could make
 * it unreachable would be a cap on their own data.
 */
export const MAX_NON_BASELINE_LEDGERS = 4

/**
 * Ceiling on the holdings a single create may carry.
 *
 * This route accepts already-encrypted rows in bulk, which is exactly the shape
 * of a write amplifier. The cap keeps it a snapshot-copy channel rather than a
 * general bulk-import one; a household with more than 200 holdings is far
 * outside anything v1 supports.
 */
export const MAX_LEDGER_HOLDINGS = 200

/** 60 characters is what the ledger switcher can render without truncating. */
export const MAX_LEDGER_NAME_CHARS = 60

export async function getBaselineLedger(db: LedgerReadDb, householdId: string): Promise<Ledger | null> {
  const rows = await db
    .select()
    .from(ledgers)
    .where(and(eq(ledgers.householdId, householdId), eq(ledgers.isBaseline, true)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Returns a ledger only if it belongs to the given household, null otherwise —
 * including when the id doesn't exist at all.
 *
 * The household filter is part of the lookup itself, exactly like
 * `deleteLedger` below: a ledger belonging to another household and a ledger
 * that doesn't exist must be indistinguishable to the caller. Any route using
 * this to gate a `?ledgerId=` query param should answer both cases with 404,
 * never 403 — a 403 would confirm the ledger exists.
 */
export async function getLedgerForHousehold(
  db: LedgerReadDb,
  householdId: string,
  ledgerId: string,
): Promise<Ledger | null> {
  const rows = await db
    .select()
    .from(ledgers)
    .where(and(eq(ledgers.id, ledgerId), eq(ledgers.householdId, householdId)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Returns the household's baseline ledger, creating it if it does not exist.
 *
 * Get-or-create rather than a plain create, for two reasons. Households that
 * predate D-016 were given a baseline by `scripts/backfill-ledgers.mjs`, but a
 * household created in the window between migration 0004 and this code shipping
 * would have none — and since `holdings.ledger_id` is now NOT NULL, such a
 * household could never record a holding again. Self-healing here costs one
 * indexed lookup on a path that already does several, and removes a class of
 * permanently-stuck account entirely.
 *
 * The partial unique index on `(household_id) WHERE is_baseline` is the backstop
 * if two concurrent requests ever race this: one insert wins, the other fails
 * loudly rather than quietly giving the household a second "Current".
 */
export async function ensureBaselineLedger(db: LedgerWriteDb, householdId: string): Promise<Ledger> {
  const existing = await getBaselineLedger(db, householdId)
  if (existing) return existing

  const [row] = await db
    .insert(ledgers)
    .values({
      householdId,
      name: BASELINE_LEDGER_NAME,
      isBaseline: true,
      origin: 'manual',
    })
    .returning()
  if (!row) throw new Error('Insert of a baseline ledger returned no row')
  return row
}

/**
 * The household's ledgers, "Current" first and then oldest-created first.
 *
 * The ordering is done here rather than in SQL because the result set is
 * bounded at MAX_NON_BASELINE_LEDGERS + 1 rows by construction — sorting five
 * rows in memory is not worth an ORDER BY that every fake in the test suite
 * would then have to model. `id` is the final tiebreaker so the order is total
 * and the list cannot shuffle between two calls made in the same millisecond.
 */
export async function listLedgers(db: LedgerReadDb, householdId: string): Promise<Ledger[]> {
  const rows = await db.select().from(ledgers).where(eq(ledgers.householdId, householdId))
  return [...rows].sort((a, b) => {
    if (a.isBaseline !== b.isBaseline) return a.isBaseline ? -1 : 1
    const byCreated = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    if (byCreated !== 0) return byCreated
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/**
 * Body of POST /api/ledgers.
 *
 * Deliberately negative, exactly like server/lib/envelope.ts: there is no field
 * here that can carry an amount, an asset class, an instrument, a date or a
 * note, and `.strict()` means a client that sends one gets a 400 rather than
 * having it quietly dropped. `holdings` entries reuse `memberScopedCreateSchema`
 * unchanged — the same shape POST /api/holdings accepts, one row at a time.
 *
 * `isBaseline`, `origin`, `snapshotOf` and `householdId` are absent by design.
 * All four are decided by the server; a client can never mint a second
 * "Current", nor claim a ledger came from the AI planner, nor file a ledger
 * under someone else's household.
 */
export const createLedgerSchema = z
  .object({
    id: rowIdSchema,
    name: z.string().trim().min(1).max(MAX_LEDGER_NAME_CHARS),
    source: z.enum(['blank', 'copy']),
    holdings: z.array(memberScopedCreateSchema).max(MAX_LEDGER_HOLDINGS),
  })
  .strict()

export type CreateLedgerInput = z.infer<typeof createLedgerSchema>

export type CreateLedgerOutcome =
  | { status: 'created'; ledger: Ledger }
  | { status: 'cap_reached' }
  /** At least one memberId in the payload is not in the caller's household. */
  | { status: 'invalid_member' }

/**
 * Verifies every memberId in one query rather than one query per holding.
 *
 * The `family_members` foreign key on `holdings.member_id` proves a member
 * *exists*; it says nothing about whose household that member is in. Without
 * this check a caller could attach a row referencing another household's
 * member, which is a tenancy leak in the direction the FK does not look.
 */
async function findForeignMemberId(
  db: LedgerReadDb,
  householdId: string,
  memberIds: readonly string[],
): Promise<string | null> {
  if (memberIds.length === 0) return null
  const rows = await db.select().from(familyMembers).where(eq(familyMembers.householdId, householdId))
  const owned = new Set(rows.map((row) => row.id))
  return memberIds.find((id) => !owned.has(id)) ?? null
}

/**
 * Creates a non-baseline ledger and, for a copy, persists the holdings the
 * browser already re-encrypted for it.
 *
 * The server does the snapshot copy's *bookkeeping* and none of its crypto. It
 * holds no data key, and each row's ciphertext is bound by AAD to
 * `{ tableName, householdId, rowId, version }` — so byte-copying a Current
 * holding into a new row id would produce a row nobody, including its owner,
 * could ever decrypt. The browser therefore decrypts each Current holding and
 * re-encrypts it under the new row id before calling this. What is left here is
 * the part the client must not be trusted with: the cap, the tenancy boundary,
 * and the household id.
 */
export async function createLedger(
  db: LedgerCreateDb,
  householdId: string,
  input: CreateLedgerInput,
): Promise<CreateLedgerOutcome> {
  const existing = await listLedgers(db, householdId)
  const nonBaseline = existing.filter((row) => !row.isBaseline)
  if (nonBaseline.length >= MAX_NON_BASELINE_LEDGERS) return { status: 'cap_reached' }

  // Checked before anything is written, so a rejected request leaves no trace:
  // no ledger row, no holdings, nothing to compensate for.
  const foreign = await findForeignMemberId(
    db,
    householdId,
    input.holdings.map((holding) => holding.memberId),
  )
  if (foreign) return { status: 'invalid_member' }

  const baseline = existing.find((row) => row.isBaseline) ?? null

  const [ledger] = await db
    .insert(ledgers)
    .values({
      id: input.id,
      householdId,
      name: input.name,
      // Always false. A baseline is minted by ensureBaselineLedger alone; if a
      // client could ask for one, the partial unique index would be the only
      // thing standing between a household and two conflicting "Current"s.
      isBaseline: false,
      origin: 'manual',
      // A copy records what it was taken from, so the compare strip can say
      // which Current it diverged from. A blank ledger was taken from nothing.
      snapshotOf: input.source === 'copy' ? (baseline?.id ?? null) : null,
    })
    .returning()
  if (!ledger) throw new Error('Insert of a ledger returned no row')

  if (input.holdings.length === 0) return { status: 'created', ledger }

  // The `neon-http` driver has no interactive transactions — each statement is
  // its own round trip, so BEGIN/COMMIT is not available here. A single
  // multi-row INSERT still is atomic, which is why every holding goes in one
  // statement: either the whole snapshot lands or none of it does.
  //
  // A half-populated ledger is worse than no ledger at all. The user would be
  // comparing a strategy against a silently truncated copy of what they own and
  // have no way to tell — so if the insert fails, the ledger row it belongs to
  // is deleted rather than left behind as an empty shell the user must notice
  // and clean up themselves.
  try {
    await db.insert(holdings).values(
      input.holdings.map((holding) => ({
        id: holding.id,
        // Never from the body. The session resolved this household; the client
        // only ever supplied row ids.
        householdId,
        ledgerId: ledger.id,
        memberId: holding.memberId,
        ciphertext: holding.ciphertext,
        iv: holding.iv,
        alg: holding.alg,
      })),
    )
  } catch (err) {
    await db.delete(ledgers).where(and(eq(ledgers.id, ledger.id), eq(ledgers.householdId, householdId)))
    throw err
  }

  return { status: 'created', ledger }
}

export type DeleteLedgerOutcome = 'deleted' | 'not_found' | 'baseline'

/**
 * Deletes one of the household's non-baseline ledgers.
 *
 * A ledger belonging to another household is reported as `not_found`, not as a
 * refusal: answering "forbidden" would confirm the row exists to someone who
 * has no business knowing that. The household filter is part of the lookup, so
 * the two cases are genuinely indistinguishable from outside.
 *
 * `holdings.ledger_id` is ON DELETE CASCADE, so this ledger's holdings go with
 * it. That is why Current is refused outright: deleting the baseline would take
 * the household's real holdings with it.
 */
export async function deleteLedger(
  db: LedgerDeleteDb,
  householdId: string,
  ledgerId: string,
): Promise<DeleteLedgerOutcome> {
  const rows = await db
    .select()
    .from(ledgers)
    .where(and(eq(ledgers.id, ledgerId), eq(ledgers.householdId, householdId)))
    .limit(1)
  const target = rows[0]
  if (!target) return 'not_found'
  if (target.isBaseline) return 'baseline'

  await db.delete(ledgers).where(and(eq(ledgers.id, ledgerId), eq(ledgers.householdId, householdId)))
  return 'deleted'
}
