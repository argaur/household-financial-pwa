import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { verifyUserId } from '../lib/auth.js'
import { householdScopedCreateSchema, encryptedUpdateSchema } from '../lib/envelope.js'
import { getHouseholdForOwner, createHouseholdForOwner, updateHousehold, type Household } from '../lib/household.js'

/**
 * /api/household — the caller's single household, as an opaque encrypted row.
 * The household's name lives in `ciphertext`; no schema on this route accepts
 * a name. See server/routes/holdings.ts for the shared envelope shape.
 *
 * Every handler resolves the caller's identity from the Authorization header
 * via verifyUserId() — never from the request body/URL.
 */
export const householdRoutes = new Hono()

householdRoutes.use('*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
})

/** Only the readable columns plus the envelope — the legacy `name` column is never served. */
function serialize(row: Household) {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    ciphertext: row.ciphertext,
    iv: row.iv,
    alg: row.alg,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

householdRoutes.get('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  return c.json({ household: household ? serialize(household) : null })
})

householdRoutes.post('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json().catch(() => null)
  const parsed = householdScopedCreateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_household' }, 400)

  const household = await createHouseholdForOwner(db, userId, parsed.data)
  return c.json({ household: serialize(household) }, 201)
})

// Household is a singleton per owner (unique owner_user_id index), so no
// ?id= query param is needed here, unlike the /:id-shaped resources — the
// route resolves the caller's one household from their session the same way
// GET/POST already do.
householdRoutes.patch('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_not_found' }, 404)

  const body = await c.req.json().catch(() => null)
  const parsed = encryptedUpdateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_household' }, 400)

  const outcome = await updateHousehold(db, household.id, parsed.data)
  // The household was resolved a line above, so a miss here can only mean the
  // stored version moved on — another device already renamed it.
  if (outcome.status !== 'updated') return c.json({ error: 'version_conflict' }, 409)
  return c.json({ household: serialize(outcome.row) })
})
