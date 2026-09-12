import { eq, asc } from 'drizzle-orm'
import { instruments } from '../../drizzle/schema.js'
import type { db as Db } from './db.js'

/**
 * The public response shape, stated explicitly rather than inferred from the
 * table.
 *
 * This used to be `db.select().from(instruments)` with the row returned
 * straight through as JSON, which made the API's shape an accident of the
 * schema: any column added to `instruments` became public the moment it
 * existed, without anyone deciding to publish it. Harmless while the table is
 * pure catalog content, wrong as a default. Adding a field to the response is
 * now a deliberate edit here, pinned by an exact-key-set test in
 * `server/instruments.integration.test.ts`.
 */
const publicColumns = {
  id: instruments.id,
  slug: instruments.slug,
  category: instruments.category,
  name: instruments.name,
  summary: instruments.summary,
  returns: instruments.returns,
  tax: instruments.tax,
  liquidity: instruments.liquidity,
  risk: instruments.risk,
  eligibility: instruments.eligibility,
  minInvestment: instruments.minInvestment,
  // Library display rate (pre-existing, 5 rows populated).
  rateValue: instruments.rateValue,
  rateAsOf: instruments.rateAsOf,
  // Projection-engine rate assumption (E1, D-024). Distinct from the pair
  // above: assumedRateAsOf maps to assumed_rate_as_of, because rate_as_of was
  // already taken. Plaintext catalog data, already public.
  assumedAnnualRatePct: instruments.assumedAnnualRatePct,
  rateSource: instruments.rateSource,
  assumedRateAsOf: instruments.assumedRateAsOf,
  createdAt: instruments.createdAt,
}

export type Instrument = {
  [K in keyof typeof publicColumns]: (typeof instruments.$inferSelect)[K]
}

/**
 * Instruments are public, read-only content (DATA_MODEL.md: "no write routes
 * exposed for them") — no household/user scoping, unlike every other lib
 * module in server/lib.
 */
export async function listInstruments(db: Pick<typeof Db, 'select'>, category?: number): Promise<Instrument[]> {
  const rows = category
    ? await db
        .select(publicColumns)
        .from(instruments)
        .where(eq(instruments.category, category))
        .orderBy(asc(instruments.name))
    : await db.select(publicColumns).from(instruments).orderBy(asc(instruments.category), asc(instruments.name))
  return rows as Instrument[]
}

export async function getInstrumentBySlug(db: Pick<typeof Db, 'select'>, slug: string): Promise<Instrument | null> {
  const rows = await db.select(publicColumns).from(instruments).where(eq(instruments.slug, slug)).limit(1)
  return (rows[0] as Instrument | undefined) ?? null
}
