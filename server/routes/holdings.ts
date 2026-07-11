import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../lib/db.js'
import { verifyUserId } from '../lib/auth.js'
import { getHouseholdForOwner } from '../lib/household.js'
import { listHoldings, createHolding, updateHolding, HoldingError, type CreateHoldingInput } from '../lib/holdings.js'

// Mirrors the shape lib/holdings.ts's own zod schema validates, so a
// malformed body 400s at this HTTP boundary rather than only failing deep in
// the lib layer or type-checking.
const holdingBodySchema = z.object({
  memberId: z.string(),
  instrumentId: z.string(),
  investedAmount: z.union([z.string(), z.number()]),
  currentValue: z.union([z.string(), z.number()]),
  units: z.union([z.string(), z.number()]).optional(),
  monthlySip: z.union([z.string(), z.number()]).optional(),
  startDate: z.string().optional(),
  maturityDate: z.string().optional(),
  nominee: z.string().optional(),
  isEmergencyFund: z.boolean().optional(),
  notes: z.string().optional(),
})

// Update uses a query param (?id=), not a /:id path segment — this
// project's Vercel zero-config build (framework: vite) only routes
// single-path-segment /api/* requests to the catch-all function (see
// server/routes/instruments.ts for the full explanation).
export const holdingsRoutes = new Hono()

holdingsRoutes.get('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ holdings: [] })

  const result = await listHoldings(db, household.id)
  return c.json({ holdings: result })
})

holdingsRoutes.post('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_not_found' }, 404)

  const body = await c.req.json().catch(() => null)
  const parsed = holdingBodySchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_holding' }, 400)

  try {
    const holding = await createHolding(db, household.id, parsed.data as CreateHoldingInput)
    return c.json({ holding }, 201)
  } catch (err) {
    // Only client-input problems (bad enum/value, unknown member/instrument)
    // are the caller's fault — anything else must surface as a 500.
    if (err instanceof z.ZodError || err instanceof HoldingError) return c.json({ error: 'invalid_holding' }, 400)
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
  const parsed = holdingBodySchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_holding' }, 400)

  try {
    const holding = await updateHolding(db, household.id, holdingId, parsed.data as CreateHoldingInput)
    if (!holding) return c.json({ error: 'not_found' }, 404)
    return c.json({ holding })
  } catch (err) {
    if (err instanceof z.ZodError || err instanceof HoldingError) return c.json({ error: 'invalid_holding' }, 400)
    throw err
  }
})
