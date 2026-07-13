import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { protection, familyMembers, protectionTypeEnum, protectionStatusEnum } from '../../drizzle/schema.js'
import type { db as Db } from './db.js'

export type Protection = typeof protection.$inferSelect

/** Thrown for any client-input problem (unknown member) or a missing protection record. */
export class ProtectionError extends Error {
  constructor(public code: 'member_not_found' | 'protection_not_found') {
    super(code)
  }
}

// Matches drizzle's `numeric` column convention in this project (see
// holdings.ts's numericString) — stored/returned as a string, not a float,
// to avoid money-precision loss.
const numericString = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length > 0 && !Number.isNaN(Number(v)) && Number(v) >= 0, `${label} must be a non-negative number`)

const protectionInputSchema = z.object({
  memberId: z.string().trim().min(1, 'Member is required'),
  type: z.enum(protectionTypeEnum),
  coverAmount: numericString('Cover amount'),
  premium: numericString('Premium').optional(),
  provider: z.string().trim().max(200).optional(),
  status: z.enum(protectionStatusEnum),
})

export type CreateProtectionInput = z.input<typeof protectionInputSchema>

type ProtectionDb = Pick<typeof Db, 'select'>

async function resolveMember(db: ProtectionDb, householdId: string, memberId: string) {
  const memberRows = await db
    .select()
    .from(familyMembers)
    .where(and(eq(familyMembers.id, memberId), eq(familyMembers.householdId, householdId)))
    .limit(1)
  if (!memberRows[0]) throw new ProtectionError('member_not_found')
}

/**
 * Every query filters by householdId (resolved server-side from the Clerk
 * session, never client input) — mirrors the app-layer scoping boundary
 * proven in Slice 1/2/4. memberId is additionally verified to belong to the
 * same household before a protection record can be created/updated against
 * it, since the family_members FK alone doesn't enforce cross-household
 * isolation (same pattern as holdings.ts).
 */
export async function listProtection(db: ProtectionDb, householdId: string): Promise<Protection[]> {
  const rows = await db.select().from(protection).where(eq(protection.householdId, householdId))
  return rows as Protection[]
}

export async function createProtection(
  db: ProtectionDb & Pick<typeof Db, 'insert'>,
  householdId: string,
  input: CreateProtectionInput,
): Promise<Protection> {
  const parsed = protectionInputSchema.parse(input)
  await resolveMember(db, householdId, parsed.memberId)

  const [row] = await db
    .insert(protection)
    .values({
      householdId,
      memberId: parsed.memberId,
      type: parsed.type,
      coverAmount: parsed.coverAmount,
      premium: parsed.premium,
      provider: parsed.provider,
      status: parsed.status,
    })
    .returning()
  return row as Protection
}

export async function updateProtection(
  db: ProtectionDb & Pick<typeof Db, 'update'>,
  householdId: string,
  protectionId: string,
  input: CreateProtectionInput,
): Promise<Protection | null> {
  const existingRows = await db
    .select()
    .from(protection)
    .where(and(eq(protection.id, protectionId), eq(protection.householdId, householdId)))
    .limit(1)
  if (!existingRows[0]) return null

  const parsed = protectionInputSchema.parse(input)
  await resolveMember(db, householdId, parsed.memberId)

  const [row] = await db
    .update(protection)
    .set({
      memberId: parsed.memberId,
      type: parsed.type,
      coverAmount: parsed.coverAmount,
      premium: parsed.premium ?? null,
      provider: parsed.provider ?? null,
      status: parsed.status,
      updatedAt: new Date(),
    })
    .where(and(eq(protection.id, protectionId), eq(protection.householdId, householdId)))
    .returning()
  return row as Protection
}
