import { eq, and } from 'drizzle-orm'
import { ledgers } from '../../drizzle/schema.js'
import type { db as Db } from './db.js'

export type Ledger = typeof ledgers.$inferSelect

/**
 * Reserved name for the baseline ledger. "Current never changes because a
 * ledger exists" is the guiding invariant of D-016, and this row is what
 * "Current" means in the database.
 */
export const BASELINE_LEDGER_NAME = 'Current'

type LedgerReadDb = Pick<typeof Db, 'select'>
type LedgerWriteDb = Pick<typeof Db, 'select' | 'insert'>

export async function getBaselineLedger(db: LedgerReadDb, householdId: string): Promise<Ledger | null> {
  const rows = await db
    .select()
    .from(ledgers)
    .where(and(eq(ledgers.householdId, householdId), eq(ledgers.isBaseline, true)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Returns the household's baseline ledger, creating it if it does not exist.
 *
 * Get-or-create rather than a plain create, for two reasons. Households that
 * predate D-016 were given a baseline by `scripts/backfill-ledgers.mjs`, but a
 * household created in the window between migration 0004 and this code shipping
 * would have none — and since `holdings.ledger_id` is now NOT NULL, such a
 * household could never record a holding again. Self-healing here costs one
 * indexed lookup on a path that already does several, and removes a class of
 * permanently-stuck account entirely.
 *
 * The partial unique index on `(household_id) WHERE is_baseline` is the backstop
 * if two concurrent requests ever race this: one insert wins, the other fails
 * loudly rather than quietly giving the household a second "Current".
 */
export async function ensureBaselineLedger(db: LedgerWriteDb, householdId: string): Promise<Ledger> {
  const existing = await getBaselineLedger(db, householdId)
  if (existing) return existing

  const [row] = await db
    .insert(ledgers)
    .values({
      householdId,
      name: BASELINE_LEDGER_NAME,
      isBaseline: true,
      origin: 'manual',
    })
    .returning()
  if (!row) throw new Error('Insert of a baseline ledger returned no row')
  return row
}
