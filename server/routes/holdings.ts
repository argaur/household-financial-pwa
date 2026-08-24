import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { verifyUserId } from '../lib/auth.js'
import { getHouseholdForOwner } from '../lib/household.js'
import { memberScopedCreateSchema, encryptedUpdateSchema } from '../lib/envelope.js'
import {
  listHoldings,
  listHoldingsForLedger,
  createHolding,
  createHoldingInLedger,
  updateHolding,
  deleteHolding,
  HoldingError,
  type Holding,
} from '../lib/holdings.js'
import { getLedgerForHousehold } from '../lib/ledgers.js'

/**
 * /api/holdings — opaque encrypted rows.
 *
 * There is no schema on this route that can accept an amount, a date, an
 * instrument or a note: the request body is `{ id, memberId, ciphertext, iv,
 * alg }` on create and `{ ciphertext, iv, alg, expectedVersion }` on update,
 * both `.strict()`, so a plaintext field is a 400 rather than a silent write.
 *
 * Update and delete use a query param (?id=), not a /:id path segment — this
 * project's Vercel zero-config build (framework: vite) only routes
 * single-path-segment /api/* requests to the catch-all function (see
 * server/routes/instruments.ts for the full explanation). The same
 * constraint is why ledger scoping on GET/POST is an optional `?ledgerId=`
 * query param on this flat resource rather than a nested
 * `/api/ledgers/:id/holdings` route (D-016 Chunk 3).
 *
 * `?ledgerId=` contract:
 *   - GET  /api/holdings                 -> unchanged: the household's holdings
 *   - GET  /api/holdings?ledgerId=<uuid> -> that ledger's holdings only
 *   - POST /api/holdings                 -> unchanged: files into the baseline
 *   - POST /api/holdings?ledgerId=<uuid> -> creates inside that ledger
 *   - PATCH/DELETE act on `?id=` alone, regardless of which ledger the
 *     holding belongs to — they never take `?ledgerId=`.
 *
 * Whenever `?ledgerId=` is supplied, ownership is verified via
 * `getLedgerForHousehold` BEFORE any other work: a ledger that doesn't exist
 * or belongs to another household is answered with 404, never 403 — a 403
 * would confirm the ledger exists to someone who has no business knowing
 * that (mirrors `deleteLedger`'s reasoning in server/lib/ledgers.ts).
 */
export const holdingsRoutes = new Hono()

// Encrypted rows must never sit in a browser, proxy or CDN cache — applied to
// every response on this route, including errors (same rule as
// server/routes/household-keys.ts).
holdingsRoutes.use('*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
})

/**
 * Only the readable columns plus the envelope, listed explicitly. The legacy
 * plaintext columns still exist on rows written before encryption; naming the
 * fields here rather than spreading the row is what stops them being served.
 */
function serialize(row: Holding) {
  return {
    id: row.id,
    householdId: row.householdId,
    memberId: row.memberId,
    ciphertext: row.ciphertext,
    iv: row.iv,
    alg: row.alg,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

holdingsRoutes.get('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ holdings: [] })

  const ledgerId = c.req.query('ledgerId')
  if (ledgerId) {
    const ledger = await getLedgerForHousehold(db, household.id, ledgerId)
    if (!ledger) return c.json({ error: 'not_found' }, 404)
    const rows = await listHoldingsForLedger(db, household.id, ledger.id)
    return c.json({ holdings: rows.map(serialize) })
  }

  const rows = await listHoldings(db, household.id)
  return c.json({ holdings: rows.map(serialize) })
})

holdingsRoutes.post('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_not_found' }, 404)

  // Resolved (and ownership-checked) before the body is even parsed — a
  // ledger that isn't the caller's is refused before anything else happens.
  const ledgerId = c.req.query('ledgerId')
  let ledger: Awaited<ReturnType<typeof getLedgerForHousehold>> = null
  if (ledgerId) {
    ledger = await getLedgerForHousehold(db, household.id, ledgerId)
    if (!ledger) return c.json({ error: 'not_found' }, 404)
  }

  const body = await c.req.json().catch(() => null)
  const parsed = memberScopedCreateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_holding' }, 400)

  try {
    const holding = ledger
      ? await createHoldingInLedger(db, household.id, ledger.id, parsed.data)
      : await createHolding(db, household.id, parsed.data)
    return c.json({ holding: serialize(holding) }, 201)
  } catch (err) {
    // Only a member that isn't in the caller's household is the caller's
    // fault — anything else must surface as a 500.
    if (err instanceof HoldingError) return c.json({ error: 'invalid_holding' }, 400)
    throw err
  }
})

holdingsRoutes.patch('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_not_found' }, 404)

  const holdingId = c.req.query('id')
  if (!holdingId) return c.json({ error: 'missing_id' }, 400)

  const body = await c.req.json().catch(() => null)
  const parsed = encryptedUpdateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_holding' }, 400)

  const outcome = await updateHolding(db, household.id, holdingId, parsed.data)
  if (outcome.status === 'not_found') return c.json({ error: 'not_found' }, 404)
  // 409: another device already wrote a newer version. Nothing was changed —
  // the client must re-read, re-apply its edit and retry, because blindly
  // overwriting would discard that other write in full.
  if (outcome.status === 'conflict') return c.json({ error: 'version_conflict' }, 409)
  return c.json({ holding: serialize(outcome.row) })
})

// Deletes a holding regardless of which ledger it belongs to — Current or
// otherwise — as long as it is the caller's household's. No `?ledgerId=`
// here: `?id=` alone is the whole address, exactly like PATCH above.
holdingsRoutes.delete('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_not_found' }, 404)

  const holdingId = c.req.query('id')
  if (!holdingId) return c.json({ error: 'missing_id' }, 400)

  const outcome = await deleteHolding(db, household.id, holdingId)
  // Covers "no such holding" and "someone else's holding" alike — a 403
  // would confirm the row exists to a caller who has no business knowing.
  if (outcome === 'not_found') return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true })
})
