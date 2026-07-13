import { eq } from 'drizzle-orm'
import { households } from '../../drizzle/schema.js'
import type { db as Db } from './db.js'

/**
 * Data retention rule (Documentation/design/DATA_MODEL.md, CLAUDE.md "Data
 * retention" constraint): on Clerk `user.deleted`, hard delete cascade. This
 * function only deletes the `households` row scoped to `ownerUserId` — it
 * deliberately does NOT issue separate deletes against family_members,
 * holdings, protection, or goals. Every one of those tables declares
 * `.references(() => households.id, { onDelete: 'cascade' })` in
 * drizzle/schema.ts, so Postgres itself removes those child rows when the
 * household row goes; duplicating that logic here would be redundant and
 * could drift out of sync with the schema. `analytics_events` has no FK to
 * households at all (by design — DATA_MODEL.md's retention rule: rows are
 * retained/orphaned, not deleted), so it is correctly untouched by this
 * delete.
 *
 * Returns false if no household existed for this owner (e.g. the user
 * deleted their Clerk account before ever completing onboarding) — not an
 * error, just nothing to clean up.
 */
export async function deleteHouseholdForOwner(
  db: Pick<typeof Db, 'delete'>,
  ownerUserId: string,
): Promise<boolean> {
  const deletedRows = await db.delete(households).where(eq(households.ownerUserId, ownerUserId)).returning()
  return deletedRows.length > 0
}
