import { Hono } from 'hono'
import { z } from 'zod'
import { protectionTypeEnum, protectionStatusEnum } from '../../drizzle/schema.js'
import { db } from '../lib/db.js'
import { verifyUserId } from '../lib/auth.js'
import { getHouseholdForOwner } from '../lib/household.js'
import { listProtection, createProtection, updateProtection, ProtectionError, type CreateProtectionInput } from '../lib/protection.js'

// Mirrors the shape lib/protection.ts's own zod schema validates (same enums
// imported directly from drizzle/schema.ts, not redeclared — a prior slice
// shipped a route/lib enum drift bug), so a malformed body 400s at this HTTP
// boundary rather than only failing deep in the lib layer or type-checking.
const protectionBodySchema = z.object({
  memberId: z.string(),
  type: z.enum(protectionTypeEnum),
  coverAmount: z.union([z.string(), z.number()]),
  premium: z.union([z.string(), z.number()]).optional(),
  provider: z.string().optional(),
  status: z.enum(protectionStatusEnum),
})

// Update uses a query param (?id=), not a /:id path segment — this
// project's Vercel zero-config build (framework: vite) only routes
// single-path-segment /api/* requests to the catch-all function (see
// server/routes/holdings.ts for the full explanation). No delete route —
// matches holdings' Slice 4 precedent of shipping list/create/update only.
export const protectionRoutes = new Hono()

protectionRoutes.get('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ protection: [] })

  const result = await listProtection(db, household.id)
  return c.json({ protection: result })
})

protectionRoutes.post('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_not_found' }, 404)

  const body = await c.req.json().catch(() => null)
  const parsed = protectionBodySchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_protection' }, 400)

  try {
    const record = await createProtection(db, household.id, parsed.data as CreateProtectionInput)
    return c.json({ protection: record }, 201)
  } catch (err) {
    // Only client-input problems (bad enum/value, unknown member) are the
    // caller's fault — anything else must surface as a 500.
    if (err instanceof z.ZodError || err instanceof ProtectionError) return c.json({ error: 'invalid_protection' }, 400)
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
  const parsed = protectionBodySchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_protection' }, 400)

  try {
    const record = await updateProtection(db, household.id, protectionId, parsed.data as CreateProtectionInput)
    if (!record) return c.json({ error: 'not_found' }, 404)
    return c.json({ protection: record })
  } catch (err) {
    if (err instanceof z.ZodError || err instanceof ProtectionError) return c.json({ error: 'invalid_protection' }, 400)
    throw err
  }
})
