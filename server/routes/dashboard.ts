import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { verifyUserId } from '../lib/auth.js'
import { getHouseholdForOwner } from '../lib/household.js'
import { getDashboard } from '../lib/dashboard.js'

// Flat resource, no path segments — fine as-is under this project's Vercel
// zero-config routing (see server/routes/holdings.ts for the constraint
// that motivates ?id= query params elsewhere; this route has no sub-ids).
export const dashboardRoutes = new Hono()

dashboardRoutes.get('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_not_found' }, 404)

  const result = await getDashboard(db, household.id)
  return c.json({
    household: { id: household.id, name: household.name },
    completeness: result.completeness,
    allocation: result.allocation,
    totalValue: result.totalValue,
  })
})
