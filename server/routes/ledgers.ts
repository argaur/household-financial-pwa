import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { verifyUserId } from '../lib/auth.js'
import { getHouseholdForOwner } from '../lib/household.js'
import { listLedgers, createLedger, deleteLedger, createLedgerSchema, type Ledger } from '../lib/ledgers.js'

/**
 * /api/ledgers — D-016 strategy ledgers.
 *
 * A ledger is a named container of holdings. "Current" is the baseline, the
 * record of what the household actually owns, and the invariant the whole
 * feature rests on is that Current never changes because another ledger exists.
 * Nothing on this route can write into the baseline, rename it or delete it.
 *
 * Two things this route deliberately does NOT do:
 *
 * 1. It never sees plaintext. A non-baseline ledger's *name* now arrives sealed
 *    as `{ ciphertext, iv, alg }`, exactly like every holding it carries, and is
 *    stored exactly as received — this route reads neither. The one exception
 *    is the baseline "Current" row: `ensureBaselineLedger` (server/lib/ledgers.ts)
 *    writes it as a literal string before the user has necessarily unlocked
 *    their vault, so it is not user data and carries no envelope at all.
 *    There is no schema here that accepts an amount, an asset class, an
 *    instrument, a date or a note, and every schema is `.strict()`.
 *
 * 2. It never performs the snapshot copy's crypto. The server holds no data
 *    key, and row ciphertext is bound by AAD to
 *    `{ tableName, householdId, rowId, version }`, so a byte-copy into a new
 *    row id would be permanently undecryptable. The browser decrypts each
 *    Current holding and re-encrypts it under the new row id's AAD; the server
 *    enforces tenancy, the cap, and persistence. See server/lib/ledgers.ts.
 *
 * DELETE uses a query param (?id=), not a /:id path segment: this project's
 * zero-config Vercel build only routes single-path-segment /api/* requests to
 * the catch-all function, so a second segment 404s at the platform level before
 * Hono ever sees it (see server/routes/instruments.ts for the full account).
 *
 * Every handler resolves the caller from the Authorization header via
 * verifyUserId(), then the household from that identity via
 * getHouseholdForOwner() — never from the request body or the URL.
 */
export const ledgersRoutes = new Hono()

ledgersRoutes.use('*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
})

/**
 * Only the columns a client needs, listed explicitly rather than spread.
 * `aiEditsUsed` and `projectionHorizonYears` belong to D-017 and D-018 and are
 * withheld until a route actually needs them.
 *
 * `name` and the envelope travel together, mirroring `StoredEnvelope`
 * (server/lib/envelope.ts) and how households/holdings already respond. The
 * client decides which to trust by whether `ciphertext` is present: null means
 * the baseline row and a plain `name`; non-null means a sealed row whose `name`
 * is null and must be decrypted.
 */
function serialize(row: Ledger) {
  return {
    id: row.id,
    householdId: row.householdId,
    name: row.name,
    ciphertext: row.ciphertext,
    iv: row.iv,
    alg: row.alg,
    version: row.version,
    isBaseline: row.isBaseline,
    origin: row.origin,
    snapshotOf: row.snapshotOf,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

ledgersRoutes.get('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ ledgers: [] })

  const rows = await listLedgers(db, household.id)
  return c.json({ ledgers: rows.map(serialize) })
})

ledgersRoutes.post('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_not_found' }, 404)

  const body = await c.req.json().catch(() => null)
  const parsed = createLedgerSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_ledger' }, 400)

  const outcome = await createLedger(db, household.id, parsed.data)
  // 409, not 400: the request is well-formed, the household is simply already
  // holding as many strategies as it may. Deleting one makes the same request
  // succeed unchanged.
  if (outcome.status === 'cap_reached') return c.json({ error: 'ledger_cap_reached' }, 409)
  // Whole-request rejection, nothing partially written — a caller must not be
  // able to attach a row referencing another household's member.
  if (outcome.status === 'invalid_member') return c.json({ error: 'invalid_member' }, 400)
  return c.json({ ledger: serialize(outcome.ledger) }, 201)
})

ledgersRoutes.delete('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_not_found' }, 404)

  const ledgerId = c.req.query('id')
  if (!ledgerId) return c.json({ error: 'missing_id' }, 400)

  const outcome = await deleteLedger(db, household.id, ledgerId)
  // 404 covers "no such ledger" and "someone else's ledger" alike; a 403 would
  // tell an outsider the row exists.
  if (outcome === 'not_found') return c.json({ error: 'not_found' }, 404)
  if (outcome === 'baseline') return c.json({ error: 'cannot_delete_baseline' }, 400)
  return c.json({ ok: true })
})
