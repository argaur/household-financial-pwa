import { eq } from 'drizzle-orm'
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
