import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { ledgers, ledgerProjectionSettings, assetClassEnum } from '../../drizzle/schema.js'
import type { db as Db } from './db.js'

/**
 * /api/projection-settings — D-024/D-025 AI import, step E5.
 *
 * Per-ledger, per-asset-class return-rate overrides plus the ledger's
 * projection horizon. `Documentation/design/SPEC.md` lines 315-325 specs the
 * response as `{ ledgerId, horizonYears, rates }`, but `horizonYears` is a
 * single per-ledger scalar and `ledger_projection_settings` (added in step
 * E1) is one row per asset class — there is no natural home for it there.
 *
 * RESOLUTION: `ledgers.projection_horizon_years` already exists as an
 * integer column (migration 0003, `drizzle/schema.ts` line ~92) and has
 * been sitting unused since D-016 was specced. No schema change, no second
 * table — `horizonYears` reads and writes that column directly, and the
 * `rates` array is the only thing this route touches on
 * `ledger_projection_settings`.
 *
 * Rates are a household's return ASSUMPTION for a whole asset class, not a
 * holding: plaintext by design, no ciphertext/iv/alg/version envelope, never
 * routed through server/lib/envelope.ts.
 */

export type LedgerRow = typeof ledgers.$inferSelect
export type ProjectionSettingRow = typeof ledgerProjectionSettings.$inferSelect

type ReadDb = Pick<typeof Db, 'select'>
type WriteDb = Pick<typeof Db, 'select' | 'insert' | 'update' | 'delete'>

/** Postgres `numeric(5,2)` ceiling: 5 significant digits, 2 after the decimal. */
export const MAX_ANNUAL_RATE_PCT = 999.99
export const MIN_ANNUAL_RATE_PCT = -999.99

export const MIN_HORIZON_YEARS = 1
export const MAX_HORIZON_YEARS = 100

/** Rejects rather than rounds: a rate with more than 2 decimal places is refused outright. */
const annualRatePctSchema = z
  .number()
  .finite()
  .min(MIN_ANNUAL_RATE_PCT)
  .max(MAX_ANNUAL_RATE_PCT)
  .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, 'annualRatePct may carry at most 2 decimal places')

const horizonYearsSchema = z.number().int().min(MIN_HORIZON_YEARS).max(MAX_HORIZON_YEARS)

export const ledgerIdSchema = z.string().uuid()

/** One row of the `rates` array. */
export const rateEntrySchema = z
  .object({
    assetClass: z.enum(assetClassEnum),
    annualRatePct: annualRatePctSchema,
  })
  .strict()

/**
 * Body of `PUT /api/projection-settings`.
 *
 * `.strict()` throughout, matching the discipline in `server/lib/envelope.ts`
 * — an unknown key is a 400, never silently dropped. `horizonYears` is
 * `optional()` (omit the key to leave it untouched) and separately
 * `nullable()` (send `null` to clear it) so the two intents are distinguishable.
 */
export const putProjectionSettingsSchema = z
  .object({
    ledgerId: ledgerIdSchema,
    horizonYears: horizonYearsSchema.nullable().optional(),
    rates: z.array(rateEntrySchema).max(assetClassEnum.length),
  })
  .strict()
  .refine(
    (body) => new Set(body.rates.map((r) => r.assetClass)).size === body.rates.length,
    { message: 'rates must not repeat an assetClass', path: ['rates'] },
  )

export type PutProjectionSettingsInput = z.infer<typeof putProjectionSettingsSchema>

export interface ProjectionSettingsResult {
  ledgerId: string
  horizonYears: number | null
  rates: Array<{ assetClass: (typeof assetClassEnum)[number]; annualRatePct: number }>
}

/**
 * Reads the full projection-settings state for one ledger.
 *
 * `ledger` is the row already resolved (and ownership-checked) by the
 * caller — this never re-derives tenancy, it only reads. A ledger with no
 * saved rate overrides yields an empty `rates` array, not an error.
 */
export async function getProjectionSettings(db: ReadDb, ledger: LedgerRow): Promise<ProjectionSettingsResult> {
  const rows = await db.select().from(ledgerProjectionSettings).where(eq(ledgerProjectionSettings.ledgerId, ledger.id))
  return {
    ledgerId: ledger.id,
    horizonYears: ledger.projectionHorizonYears,
    // numeric(5,2) round-trips through Drizzle as a string (same as
    // instruments.assumed_annual_rate_pct) — converted back to a number here
    // since the wire contract is `annualRatePct: number`.
    rates: rows.map((row) => ({ assetClass: row.assetClass, annualRatePct: Number(row.annualRatePct) })),
  }
}

/**
 * Replaces one ledger's projection settings with exactly the state given.
 *
 * `rates` is treated as the FULL desired set, not a patch: an asset class
 * omitted from the array is deleted if a row for it existed. This is what
 * makes a repeated PUT with the same body idempotent — same rows, same
 * values, no growth — and what lets a client clear an override by simply
 * not sending it again.
 *
 * `neon-http` has no interactive transactions (see server/lib/ledgers.ts's
 * createLedger for the same constraint) — each statement here is its own
 * round trip. With at most `assetClassEnum.length` (6) rows in play this is
 * cheap, and doing it as read-then-per-row-write in application code (rather
 * than one bulk upsert relying on `ON CONFLICT ... excluded`) keeps every
 * statement one of the four primitives this module's tests already model.
 */
export async function putProjectionSettings(db: WriteDb, ledger: LedgerRow, input: PutProjectionSettingsInput): Promise<void> {
  if ('horizonYears' in input) {
    await db
      .update(ledgers)
      .set({ projectionHorizonYears: input.horizonYears ?? null, updatedAt: new Date() })
      .where(eq(ledgers.id, ledger.id))
  }

  const existing = await db
    .select()
    .from(ledgerProjectionSettings)
    .where(eq(ledgerProjectionSettings.ledgerId, ledger.id))
  const existingByClass = new Map(existing.map((row) => [row.assetClass, row]))
  const keep = new Set(input.rates.map((r) => r.assetClass))

  for (const rate of input.rates) {
    const current = existingByClass.get(rate.assetClass)
    const annualRatePct = rate.annualRatePct.toFixed(2)
    if (current) {
      await db
        .update(ledgerProjectionSettings)
        .set({ annualRatePct, updatedAt: new Date() })
        .where(and(eq(ledgerProjectionSettings.ledgerId, ledger.id), eq(ledgerProjectionSettings.assetClass, rate.assetClass)))
    } else {
      await db.insert(ledgerProjectionSettings).values({
        ledgerId: ledger.id,
        assetClass: rate.assetClass,
        annualRatePct,
      })
    }
  }

  for (const row of existing) {
    if (keep.has(row.assetClass)) continue
    await db
      .delete(ledgerProjectionSettings)
      .where(and(eq(ledgerProjectionSettings.ledgerId, ledger.id), eq(ledgerProjectionSettings.assetClass, row.assetClass)))
  }
}
