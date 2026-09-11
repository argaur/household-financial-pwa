import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../lib/db.js'
import { holdings, familyMembers } from '../../drizzle/schema.js'
import type { db as Db } from '../lib/db.js'
import { verifyUserId } from '../lib/auth.js'
import { getHouseholdForOwner } from '../lib/household.js'
import { memberScopedCreateSchema, type MemberScopedCreate } from '../lib/envelope.js'
import { ledgerIdSchema } from '../lib/projection-settings.js'
import { getLedgerForHousehold, MAX_LEDGER_HOLDINGS } from '../lib/ledgers.js'
import { listHoldingsForLedger } from '../lib/holdings.js'

/**
 * POST /api/holdings-batch — D-025 I10, the commit step of the Excel import.
 *
 * One top-level mount, not a sub-path of `/api/holdings`: this project's
 * zero-config Vercel build only routes single-path-segment `/api/*` requests to
 * the catch-all function, so `/api/holdings/batch` would 404 at the platform
 * before Hono ever saw it (see server/routes/instruments.ts for the full
 * explanation). `holdings-batch` is one segment, which is why it is spelled
 * this way rather than nested.
 *
 * **The array is the whole risk of this endpoint.** Per-element authorization
 * is the classic place an array route is weaker than the single-row route it
 * was modelled on: it validates `holdings[0]`, passes every batch where all the
 * elements are alike, and commits a mixed one. So the check here is structural,
 * not procedural — `authorizeBatch` below is the ONLY place an insertable row
 * object is ever constructed, and it constructs each one immediately after
 * checking that element's own `memberId`. There is no path from a request body
 * to `db.insert` that does not go through it, so "forgot to check element 7"
 * is not a mistake this handler can express: element 7 would have no row.
 *
 * Order, and it is the security property:
 *   1. Auth, before the body is read.
 *   2. Household, resolved from the session and never from the body.
 *   3. Shape, strict — a plaintext field is a 400, not a silent write.
 *   4. Ledger ownership, against the session household.
 *   5. EVERY memberId's tenancy.
 *   6. The row cap, which is the only check allowed to see a count, and so runs
 *      after both ownership checks: a caller who owns nothing here learns
 *      nothing about how full someone else's ledger is.
 *   7. One INSERT.
 *
 * **All or nothing means one statement.** The `neon-http` driver has no
 * interactive transactions — every statement is its own round trip, so there is
 * no BEGIN/COMMIT to wrap this in and no point pretending otherwise. A single
 * multi-row INSERT is atomic on its own, which is why every row goes in one
 * `db.insert(holdings).values([...])` call: the whole batch lands or none of it
 * does. Partial commit is a client-side concept here — the browser sends only
 * the rows it judged clean, and that set is the unit.
 *
 * Ownership answers 403, following server/routes/ai-suggestions.ts rather than
 * server/routes/ledgers.ts: a foreign ledger, a nonexistent ledger and a
 * session with no household all answer the same 403, so none of them is
 * distinguishable from outside. SPEC.md §I3 fixes this as 403.
 *
 * Nothing here logs a request or response body, on the same discipline as
 * `failureNote` in server/routes/ai-suggestions.ts: a refusal reports its
 * reason, never the element that caused it. The 409 body carries three counts
 * and no row content.
 */
export const holdingsBatchRoutes = new Hono()

// Encrypted rows must never sit in a browser, proxy or CDN cache — applied to
// every response, including errors (same rule as server/routes/holdings.ts).
holdingsBatchRoutes.use('*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
})

/**
 * The request body.
 *
 * `memberScopedCreateSchema` is reused UNCHANGED and is `.strict()` by its own
 * definition in server/lib/envelope.ts, so an element carrying an amount, an
 * instrument, a note — or its own `ledgerId` — is rejected outright rather than
 * having the extra key quietly dropped. There is deliberately no parallel
 * element schema here: a second copy is a second thing to forget to tighten.
 *
 * This is the same shape `createLedgerSchema` already carries
 * (`z.array(memberScopedCreateSchema).max(MAX_LEDGER_HOLDINGS)`), so the
 * endpoint extends a proven shape rather than inventing one. `.min(1)` because
 * an empty commit is a client bug, not a no-op worth a round trip.
 *
 * The ledger is named once, at the top level, and checked once. An element has
 * nowhere to name a ledger, which is what makes a heterogeneous-ledger batch
 * structurally impossible rather than merely guarded against.
 */
export const holdingsBatchSchema = z
  .object({
    ledgerId: ledgerIdSchema,
    holdings: z.array(memberScopedCreateSchema).min(1).max(MAX_LEDGER_HOLDINGS),
  })
  .strict()

export type HoldingsBatchInput = z.infer<typeof holdingsBatchSchema>

type BatchDb = Pick<typeof Db, 'select' | 'insert'>

/** Exactly the columns a batched holding may set. Constructed nowhere but `authorizeBatch`. */
interface AuthorizedHoldingRow {
  id: string
  householdId: string
  ledgerId: string
  memberId: string
  ciphertext: string
  iv: string
  alg: string
}

type AuthorizeOutcome =
  | { status: 'ok'; ledgerId: string; rows: AuthorizedHoldingRow[] }
  /** The ledger, or at least one element's member, is not the session household's. */
  | { status: 'forbidden' }

/**
 * Resolves the batch into insertable rows, or refuses it.
 *
 * Two tenancy facts the client may not assert: the ledger is the caller's, and
 * every `memberId` is the caller's. The `family_members` foreign key on
 * `holdings.member_id` proves a member *exists* and says nothing about whose
 * household it is in — the leak is in the direction the FK does not look, which
 * is why the household's own member ids are fetched once and every element is
 * tested against them.
 *
 * One query for the members, not one per element: the batch can carry 200 rows
 * and a per-row lookup would be 200 round trips on a route that should make
 * four. The loop is still per-element — the single query is an optimisation of
 * the lookup, never of the check.
 *
 * Returning the rows is the point. A caller cannot obtain an
 * `AuthorizedHoldingRow` any other way, so the insert below cannot be handed a
 * row whose member was never tested. `householdId` and `ledgerId` are stamped
 * from the verified session values here, never copied from the body.
 */
async function authorizeBatch(
  database: BatchDb,
  householdId: string,
  input: HoldingsBatchInput,
): Promise<AuthorizeOutcome> {
  const ledger = await getLedgerForHousehold(database, householdId, input.ledgerId)
  if (!ledger) return { status: 'forbidden' }

  const ownedMembers = await database.select().from(familyMembers).where(eq(familyMembers.householdId, householdId))
  const owned = new Set(ownedMembers.map((member) => member.id))

  const rows: AuthorizedHoldingRow[] = []
  for (const holding of input.holdings as MemberScopedCreate[]) {
    if (!owned.has(holding.memberId)) return { status: 'forbidden' }
    rows.push({
      id: holding.id,
      householdId,
      ledgerId: ledger.id,
      memberId: holding.memberId,
      ciphertext: holding.ciphertext,
      iv: holding.iv,
      alg: holding.alg,
    })
  }

  return { status: 'ok', ledgerId: ledger.id, rows }
}

holdingsBatchRoutes.post('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  // Folded into the same 403 as a foreign ledger: there is no ledger a session
  // without a household could own either, and a distinct answer would only tell
  // an attacker which of the two facts they had guessed right.
  if (!household) return c.json({ error: 'forbidden' }, 403)

  const body = await c.req.json().catch(() => null)
  const parsed = holdingsBatchSchema.safeParse(body)
  // No Zod issue list reaches the response or a log: issues quote the offending
  // value, and the offending value is household data.
  if (!parsed.success) return c.json({ error: 'invalid_batch' }, 400)

  const authorized = await authorizeBatch(db, household.id, parsed.data)
  if (authorized.status === 'forbidden') return c.json({ error: 'forbidden' }, 403)

  // The cap is checked against the ledger's CURRENT row count plus the whole
  // batch, before a single row is written. A per-element check would insert
  // rows up to the ceiling and refuse the rest, which is the partial commit
  // this endpoint exists to make impossible (SPEC.md §I6.12).
  const currentCount = (await listHoldingsForLedger(db, household.id, authorized.ledgerId)).length
  const attempted = authorized.rows.length
  if (currentCount + attempted > MAX_LEDGER_HOLDINGS) {
    return c.json(
      { status: 'ledger_full', currentCount, cap: MAX_LEDGER_HOLDINGS, attempted },
      409,
    )
  }

  // `version` is left to its column default of 1 on every row — the browser
  // encrypted against version 1, and letting the database own it means a client
  // cannot announce a version it did not earn. One statement, deliberately:
  // see the header note on atomicity over neon-http.
  await db.insert(holdings).values(authorized.rows)

  return c.json({ status: 'ok', inserted: attempted }, 201)
})
