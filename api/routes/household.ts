import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../lib/db.js'
import { requireUserId } from '../lib/auth.js'
import { getHouseholdForOwner, createHouseholdForOwner } from '../lib/household.js'

const createHouseholdSchema = z.object({ name: z.string() })

// Mounted under clerkMiddleware() by api/app.ts — every handler here assumes
// a session may or may not be present and must check requireUserId() itself.
export const householdRoutes = new Hono()

householdRoutes.get('/', async (c) => {
  const userId = requireUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  return c.json({ household })
})

householdRoutes.post('/', async (c) => {
  const userId = requireUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json().catch(() => null)
  const parsed = createHouseholdSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_name' }, 400)

  try {
    const household = await createHouseholdForOwner(db, userId, parsed.data.name)
    return c.json({ household }, 201)
  } catch (err) {
    // Only a name-validation failure (ZodError from householdNameSchema) is
    // the client's fault — anything else (DB error, race on the unique
    // owner_user_id index) must surface as a 500, not be relabeled as bad input.
    if (err instanceof z.ZodError) return c.json({ error: 'invalid_name' }, 400)
    throw err
  }
})
