import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { verifyUserId } from '../lib/auth.js'
import { getHouseholdForOwner } from '../lib/household.js'
import { householdScopedCreateSchema, encryptedUpdateSchema } from '../lib/envelope.js'
import {
  listFamilyMembers,
  createFamilyMember,
  updateFamilyMember,
  removeFamilyMember,
  type FamilyMember,
} from '../lib/family-members.js'

/**
 * /api/family-members — opaque encrypted rows. No schema on this route
 * accepts a name, a relationship, a date of birth or a risk profile; see
 * server/routes/holdings.ts for the shared shape and the ?id= query-param
 * rationale.
 *
 * Every handler resolves the caller's identity from the Authorization header
 * via verifyUserId(), then resolves the household from that identity via
 * getHouseholdForOwner() — never from the request body/URL.
 */
export const familyMembersRoutes = new Hono()

familyMembersRoutes.use('*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
})

/** Only the readable columns plus the envelope — legacy plaintext columns are never served. */
function serialize(row: FamilyMember) {
  return {
    id: row.id,
    householdId: row.householdId,
    ciphertext: row.ciphertext,
    iv: row.iv,
    alg: row.alg,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

familyMembersRoutes.get('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ members: [] })

  const rows = await listFamilyMembers(db, household.id)
  return c.json({ members: rows.map(serialize) })
})

familyMembersRoutes.post('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_not_found' }, 404)

  const body = await c.req.json().catch(() => null)
  const parsed = householdScopedCreateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_member' }, 400)

  const member = await createFamilyMember(db, household.id, parsed.data)
  return c.json({ member: serialize(member) }, 201)
})

familyMembersRoutes.patch('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_not_found' }, 404)

  const memberId = c.req.query('id')
  if (!memberId) return c.json({ error: 'missing_id' }, 400)

  const body = await c.req.json().catch(() => null)
  const parsed = encryptedUpdateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_member' }, 400)

  const outcome = await updateFamilyMember(db, household.id, memberId, parsed.data)
  if (outcome.status === 'not_found') return c.json({ error: 'not_found' }, 404)
  if (outcome.status === 'conflict') return c.json({ error: 'version_conflict' }, 409)
  return c.json({ member: serialize(outcome.row) })
})

familyMembersRoutes.delete('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_not_found' }, 404)

  const memberId = c.req.query('id')
  if (!memberId) return c.json({ error: 'missing_id' }, 400)

  const removed = await removeFamilyMember(db, household.id, memberId)
  if (!removed) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true })
})
