import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { verifyUserId } from '../lib/auth.js'
import { getHouseholdForOwner } from '../lib/household.js'
import { memberScopedCreateSchema, encryptedUpdateSchema } from '../lib/envelope.js'
import { listProtection, createProtection, updateProtection, ProtectionError, type Protection } from '../lib/protection.js'

/**
 * /api/protection — opaque encrypted rows. No schema on this route accepts a
 * cover amount, a premium, a provider or a status; see server/routes/holdings.ts
 * for the shared shape and the ?id= query-param rationale. No delete route —
 * matches holdings' Slice 4 precedent of shipping list/create/update only.
 */
export const protectionRoutes = new Hono()

protectionRoutes.use('*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
})

/** Only the readable columns plus the envelope — legacy plaintext columns are never served. */
function serialize(row: Protection) {
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

protectionRoutes.get('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ protection: [] })

  const rows = await listProtection(db, household.id)
  return c.json({ protection: rows.map(serialize) })
})

protectionRoutes.post('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_not_found' }, 404)

  const body = await c.req.json().catch(() => null)
  const parsed = memberScopedCreateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_protection' }, 400)

  try {
    const record = await createProtection(db, household.id, parsed.data)
    return c.json({ protection: serialize(record) }, 201)
  } catch (err) {
    if (err instanceof ProtectionError) return c.json({ error: 'invalid_protection' }, 400)
    throw err
  }
})

protectionRoutes.patch('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_not_found' }, 404)

  const protectionId = c.req.query('id')
  if (!protectionId) return c.json({ error: 'missing_id' }, 400)

  const body = await c.req.json().catch(() => null)
  const parsed = encryptedUpdateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_protection' }, 400)

  const outcome = await updateProtection(db, household.id, protectionId, parsed.data)
  if (outcome.status === 'not_found') return c.json({ error: 'not_found' }, 404)
  if (outcome.status === 'conflict') return c.json({ error: 'version_conflict' }, 409)
  return c.json({ protection: serialize(outcome.row) })
})
