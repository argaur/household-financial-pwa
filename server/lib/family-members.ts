import { eq, and } from 'drizzle-orm'
import { familyMembers } from '../../drizzle/schema.js'
import type { db as Db } from './db.js'
import type { HouseholdScopedCreate, EncryptedUpdate, UpdateOutcome } from './envelope.js'

export type FamilyMember = typeof familyMembers.$inferSelect

export type CreateFamilyMemberInput = HouseholdScopedCreate
export type UpdateFamilyMemberInput = EncryptedUpdate

/**
 * Every query here filters by householdId (resolved server-side from the Clerk
 * session via getHouseholdForOwner, never from client input) — this mirrors
 * the app-layer scoping boundary Slice 1 established for households. No
 * function in this module accepts a client-supplied household_id.
 *
 * A member's name, relationship, date of birth and risk profile are inside
 * `ciphertext`. The server keeps only the id and the household it belongs to,
 * which is exactly what it needs to enforce tenancy and cascade deletes.
 */
export async function listFamilyMembers(db: Pick<typeof Db, 'select'>, householdId: string): Promise<FamilyMember[]> {
  return db.select().from(familyMembers).where(eq(familyMembers.householdId, householdId))
}

export async function createFamilyMember(
  db: Pick<typeof Db, 'insert'>,
  householdId: string,
  input: CreateFamilyMemberInput,
): Promise<FamilyMember> {
  const [row] = await db
    .insert(familyMembers)
    .values({
      id: input.id,
      householdId,
      ciphertext: input.ciphertext,
      iv: input.iv,
      alg: input.alg,
    })
    .returning()
  if (!row) throw new Error('Insert of a family member returned no row')
  return row
}

/**
 * Version-conditional update — see server/lib/holdings.ts's updateHolding.
 * Scoped by householdId + memberId together: a memberId alone doesn't prove
 * ownership, and the FK doesn't enforce it either.
 */
export async function updateFamilyMember(
  db: Pick<typeof Db, 'select' | 'update'>,
  householdId: string,
  memberId: string,
  input: UpdateFamilyMemberInput,
): Promise<UpdateOutcome<FamilyMember>> {
  const existingRows = await db
    .select()
    .from(familyMembers)
    .where(and(eq(familyMembers.id, memberId), eq(familyMembers.householdId, householdId)))
    .limit(1)
  if (!existingRows[0]) return { status: 'not_found' }

  const [row] = await db
    .update(familyMembers)
    .set({
      ciphertext: input.ciphertext,
      iv: input.iv,
      alg: input.alg,
      version: input.expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(familyMembers.id, memberId),
        eq(familyMembers.householdId, householdId),
        eq(familyMembers.version, input.expectedVersion),
      ),
    )
    .returning()
  if (!row) return { status: 'conflict' }
  return { status: 'updated', row }
}

/**
 * Slice 9 — remove a member. `holdings.member_id` and `protection.member_id`
 * both have ON DELETE CASCADE to family_members (drizzle/schema.ts) — the DB
 * itself removes that member's holdings/protection rows when this delete
 * runs, no separate cleanup needed here. The route surfaces this consequence
 * to the user via the confirm-dialog copy before calling this.
 */
export async function removeFamilyMember(
  db: Pick<typeof Db, 'select' | 'delete'>,
  householdId: string,
  memberId: string,
): Promise<boolean> {
  const existingRows = await db
    .select()
    .from(familyMembers)
    .where(and(eq(familyMembers.id, memberId), eq(familyMembers.householdId, householdId)))
    .limit(1)
  if (!existingRows[0]) return false

  await db.delete(familyMembers).where(and(eq(familyMembers.id, memberId), eq(familyMembers.householdId, householdId)))
  return true
}
