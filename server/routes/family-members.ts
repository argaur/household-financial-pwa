import { Hono } from 'hono'
import { z } from 'zod'
import { relationshipEnum, riskProfileEnum } from '../../drizzle/schema.js'
import { db } from '../lib/db.js'
import { verifyUserId } from '../lib/auth.js'
import { getHouseholdForOwner } from '../lib/household.js'
import { listFamilyMembers, createFamilyMember, updateFamilyMember, removeFamilyMember } from '../lib/family-members.js'

// Mirrors the enums in server/lib/family-members.ts's own schema so an
// invalid relationship/riskProfile value 400s here (clean HTTP boundary
// error) rather than only failing type-checking or a deeper ZodError throw.
const createFamilyMemberSchema = z.object({
  name: z.string(),
  relationship: z.enum(relationshipEnum),
  dateOfBirth: z.string(),
  riskProfile: z.enum(riskProfileEnum).optional(),
})

// Every handler resolves the caller's identity from the Authorization header
// via verifyUserId(), then resolves the household from that identity via
// getHouseholdForOwner() — never from the request body/URL. No route accepts
// a client-supplied household_id.
export const familyMembersRoutes = new Hono()

familyMembersRoutes.get('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ members: [] })

  const members = await listFamilyMembers(db, household.id)
  return c.json({ members })
})

familyMembersRoutes.post('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_not_found' }, 404)

  const body = await c.req.json().catch(() => null)
  const parsed = createFamilyMemberSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_member' }, 400)

  try {
    const member = await createFamilyMember(db, household.id, parsed.data)
    return c.json({ member }, 201)
  } catch (err) {
    // Only a validation failure (ZodError from the lib-layer schema — enum
    // values, date-of-birth format/past-date check) is the client's fault —
    // anything else (DB error) must surface as a 500, not be relabeled 400.
    if (err instanceof z.ZodError) return c.json({ error: 'invalid_member' }, 400)
    throw err
  }
})

// Update/remove use a query param (?id=), not a /:id path segment — same
// Vercel zero-config routing limitation as holdings/protection (see
// server/routes/holdings.ts).
familyMembersRoutes.patch('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_not_found' }, 404)

  const memberId = c.req.query('id')
  if (!memberId) return c.json({ error: 'missing_id' }, 400)

  const body = await c.req.json().catch(() => null)
  const parsed = createFamilyMemberSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_member' }, 400)

  try {
    const member = await updateFamilyMember(db, household.id, memberId, parsed.data)
    if (!member) return c.json({ error: 'not_found' }, 404)
    return c.json({ member })
  } catch (err) {
    if (err instanceof z.ZodError) return c.json({ error: 'invalid_member' }, 400)
    throw err
  }
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
