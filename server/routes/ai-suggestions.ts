import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { verifyUserId } from '../lib/auth.js'
import { getHouseholdForOwner } from '../lib/household.js'
import { getLedgerForHousehold } from '../lib/ledgers.js'
import { ledgerIdSchema } from '../lib/projection-settings.js'
import { getAiSuggestionsUsage } from '../lib/ai-suggestions.js'

/**
 * /api/ai-suggestions — D-024/D-025 AI import, step R5 (Chunk R's last step).
 *
 * Usage only: `{ plansUsed, plansCap, editsUsed, editsCap, globalOpen }`, so
 * the dashboard can render a cap-exhausted state without a speculative POST.
 * The proxy that actually spends a call is Chunk A and does not exist yet —
 * this route adds no POST.
 *
 * Single path segment, ledger selected by `?ledgerId=`, same reasoning as
 * `server/routes/projection-settings.ts`: this project's zero-config Vercel
 * build only routes single-path-segment `/api/*` requests to the catch-all
 * function, so `/api/ai-suggestions/:ledgerId` would 404 at the platform
 * before Hono ever saw it.
 *
 * Ownership follows `projection-settings.ts`, not `ledgers.ts`: a foreign or
 * nonexistent ledger both answer 403 (never 404), and "no household yet" is
 * folded into the same 403 rather than treated as a distinct case — there is
 * no ledger a session without a household could own either.
 */
export const aiSuggestionsRoutes = new Hono()

aiSuggestionsRoutes.use('*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
})

aiSuggestionsRoutes.get('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'forbidden' }, 403)

  const rawLedgerId = c.req.query('ledgerId')
  const parsedLedgerId = ledgerIdSchema.safeParse(rawLedgerId)
  if (!parsedLedgerId.success) return c.json({ error: 'invalid_ledger_id' }, 400)

  const ledger = await getLedgerForHousehold(db, household.id, parsedLedgerId.data)
  if (!ledger) return c.json({ error: 'forbidden' }, 403)

  const usage = await getAiSuggestionsUsage(db, household, ledger)
  return c.json(usage)
})
