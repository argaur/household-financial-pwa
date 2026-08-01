import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { verifyUserId } from '../lib/auth.js'
import { getHouseholdForOwner } from '../lib/household.js'
import { memberScopedCreateSchema, encryptedUpdateSchema } from '../lib/envelope.js'
import { listHoldings, createHolding, updateHolding, HoldingError, type Holding } from '../lib/holdings.js'

/**
 * /api/holdings — opaque encrypted rows.
 *
 * There is no schema on this route that can accept an amount, a date, an
 * instrument or a note: the request body is `{ id, memberId, ciphertext, iv,
 * alg }` on create and `{ ciphertext, iv, alg, expectedVersion }` on update,
 * both `.strict()`, so a plaintext field is a 400 rather than a silent write.
 *
 * Update uses a query param (?id=), not a /:id path segment — this project's
 * Vercel zero-config build (framework: vite) only routes single-path-segment
 * /api/* requests to the catch-all function (see server/routes/instruments.ts
 * for the full explanation).
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

  const rows = await listHoldings(db, household.id)
  return c.json({ holdings: rows.map(serialize) })
})

holdingsRoutes.post('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_not_found' }, 404)

  const body = await c.req.json().catch(() => null)
  const parsed = memberScopedCreateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_holding' }, 400)

  try {
    const holding = await createHolding(db, household.id, parsed.data)
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
