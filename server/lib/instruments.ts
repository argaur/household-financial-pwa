import { eq, asc } from 'drizzle-orm'
import { instruments } from '../../drizzle/schema.js'
import type { db as Db } from './db.js'

export type Instrument = typeof instruments.$inferSelect

/**
 * Instruments are public, read-only content (DATA_MODEL.md: "no write routes
 * exposed for them") — no household/user scoping, unlike every other lib
 * module in server/lib.
 */
export async function listInstruments(db: Pick<typeof Db, 'select'>, category?: number): Promise<Instrument[]> {
  const rows = category
    ? await db.select().from(instruments).where(eq(instruments.category, category)).orderBy(asc(instruments.name))
    : await db.select().from(instruments).orderBy(asc(instruments.category), asc(instruments.name))
  return rows as Instrument[]
}

export async function getInstrumentBySlug(db: Pick<typeof Db, 'select'>, slug: string): Promise<Instrument | null> {
  const rows = await db.select().from(instruments).where(eq(instruments.slug, slug)).limit(1)
  return (rows[0] as Instrument | undefined) ?? null
}
