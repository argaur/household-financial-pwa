import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { verifyUserId } from '../lib/auth.js'
import { getHouseholdForOwner } from '../lib/household.js'
import { getLedgerForHousehold } from '../lib/ledgers.js'
import {
  getProjectionSettings,
  putProjectionSettings,
  putProjectionSettingsSchema,
  ledgerIdSchema,
} from '../lib/projection-settings.js'

/**
 * /api/projection-settings — D-024/D-025 AI import, step E5.
 *
 * A ledger's projection horizon and its per-asset-class return-rate
 * overrides. Ledger is selected by `?ledgerId=`, never a path segment: this
 * project's zero-config Vercel build only routes single-path-segment
 * `/api/*` requests to the catch-all function, so `/api/projection-settings/:id`
 * would 404 at the platform before Hono ever saw it (see
 * server/routes/ledgers.ts and server/routes/instruments.ts for the full
 * account of the same limitation).
 *
 * Ownership check deliberately departs from the ledgers/holdings convention:
 * those routes answer a foreign ledger with 404 so an outsider can't learn
 * the id exists. Step E5's contract asks for 403 here instead — still
 * without leaking existence, because the SAME 403 body covers "not yours"
 * and "no such ledger at all", both resolved by the one
 * getLedgerForHousehold lookup this route shares with /api/holdings.
 *
 * Rates are plaintext by design: an asset-class return assumption says
 * nothing about what the household owns, so nothing here is sealed or
 * routed through server/lib/envelope.ts.
 */
export const projectionSettingsRoutes = new Hono()

projectionSettingsRoutes.use('*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
})

projectionSettingsRoutes.get('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  // No household yet means no ledger this session could own either — same
  // uniform 403 as an owned-by-someone-else or nonexistent ledger below.
  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'forbidden' }, 403)

  const rawLedgerId = c.req.query('ledgerId')
  const parsedLedgerId = ledgerIdSchema.safeParse(rawLedgerId)
  if (!parsedLedgerId.success) return c.json({ error: 'invalid_ledger_id' }, 400)

  const ledger = await getLedgerForHousehold(db, household.id, parsedLedgerId.data)
  if (!ledger) return c.json({ error: 'forbidden' }, 403)

  const result = await getProjectionSettings(db, ledger)
  return c.json(result)
})

projectionSettingsRoutes.put('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'forbidden' }, 403)

  const body = await c.req.json().catch(() => null)
  const parsed = putProjectionSettingsSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  const ledger = await getLedgerForHousehold(db, household.id, parsed.data.ledgerId)
  if (!ledger) return c.json({ error: 'forbidden' }, 403)

  await putProjectionSettings(db, ledger, parsed.data)
  return c.json({ status: 'ok' })
})
