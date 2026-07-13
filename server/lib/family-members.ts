import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { familyMembers, relationshipEnum, riskProfileEnum } from '../../drizzle/schema.js'
import type { db as Db } from './db.js'

export type FamilyMember = typeof familyMembers.$inferSelect

const dateOfBirthSchema = z
  .string()
  .trim()
  .min(1, 'Date of birth is required')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Date of birth must be a valid date')
  .refine((value) => Date.parse(value) <= Date.now(), 'Date of birth must be in the past')

const createFamilyMemberSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  relationship: z.enum(relationshipEnum),
  dateOfBirth: dateOfBirthSchema,
  riskProfile: z.enum(riskProfileEnum).optional(),
})

export type CreateFamilyMemberInput = z.input<typeof createFamilyMemberSchema>

/** Thrown when a member referenced by id doesn't belong to the caller's household (or doesn't exist). */
export class FamilyMemberError extends Error {
  constructor(public code: 'member_not_found') {
    super(code)
  }
}

/**
 * Every query here filters by householdId (resolved server-side from the
 * Clerk session via getHouseholdForOwner, never from client input) — this
 * mirrors the app-layer scoping boundary Slice 1 established for households.
 * No function in this module accepts a client-supplied household_id from a
 * different caller than the route already resolved.
 */
export async function listFamilyMembers(db: Pick<typeof Db, 'select'>, householdId: string): Promise<FamilyMember[]> {
  const rows = await db.select().from(familyMembers).where(eq(familyMembers.householdId, householdId))
  return rows as FamilyMember[]
}

export async function createFamilyMember(
  db: Pick<typeof Db, 'insert'>,
  householdId: string,
  input: CreateFamilyMemberInput,
): Promise<FamilyMember> {
  const parsed = createFamilyMemberSchema.parse(input)
  const [row] = await db
    .insert(familyMembers)
    .values({
      householdId,
      name: parsed.name,
      relationship: parsed.relationship,
      dateOfBirth: parsed.dateOfBirth,
      riskProfile: parsed.riskProfile,
    })
    .returning()
  return row as FamilyMember
}

/**
 * Slice 9 — edit a member's own fields (name/relationship/DOB/risk profile).
 * Scoped by householdId + memberId together (mirrors holdings.ts's
 * resolveMemberAndInstrument cross-household check) — a memberId alone
 * doesn't prove ownership, the FK doesn't enforce it either.
 */
export async function updateFamilyMember(
  db: Pick<typeof Db, 'select' | 'update'>,
  householdId: string,
  memberId: string,
  input: CreateFamilyMemberInput,
): Promise<FamilyMember | null> {
  const existingRows = await db
    .select()
    .from(familyMembers)
    .where(and(eq(familyMembers.id, memberId), eq(familyMembers.householdId, householdId)))
    .limit(1)
  if (!existingRows[0]) return null

  const parsed = createFamilyMemberSchema.parse(input)
  const [row] = await db
    .update(familyMembers)
    .set({
      name: parsed.name,
      relationship: parsed.relationship,
      dateOfBirth: parsed.dateOfBirth,
      riskProfile: parsed.riskProfile ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(familyMembers.id, memberId), eq(familyMembers.householdId, householdId)))
    .returning()
  return (row as FamilyMember | undefined) ?? null
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
