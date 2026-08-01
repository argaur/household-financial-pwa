import { eq, and } from 'drizzle-orm'
import { protection, familyMembers } from '../../drizzle/schema.js'
import type { db as Db } from './db.js'
import type { MemberScopedCreate, EncryptedUpdate, UpdateOutcome } from './envelope.js'

export type Protection = typeof protection.$inferSelect

/** Thrown when the member a protection record is filed under isn't in the caller's household. */
export class ProtectionError extends Error {
  constructor(public code: 'member_not_found') {
    super(code)
  }
}

export type CreateProtectionInput = MemberScopedCreate
export type UpdateProtectionInput = EncryptedUpdate

type ProtectionDb = Pick<typeof Db, 'select'>

async function assertMemberInHousehold(db: ProtectionDb, householdId: string, memberId: string): Promise<void> {
  const memberRows = await db
    .select()
    .from(familyMembers)
    .where(and(eq(familyMembers.id, memberId), eq(familyMembers.householdId, householdId)))
    .limit(1)
  if (!memberRows[0]) throw new ProtectionError('member_not_found')
}

/**
 * Same shape as server/lib/holdings.ts: householdId is always resolved from
 * the session, memberId is verified to belong to it, and the record's own
 * contents (type, cover amount, premium, provider, status) are opaque
 * ciphertext the server cannot read.
 */
export async function listProtection(db: ProtectionDb, householdId: string): Promise<Protection[]> {
  return db.select().from(protection).where(eq(protection.householdId, householdId))
}

export async function createProtection(
  db: ProtectionDb & Pick<typeof Db, 'insert'>,
  householdId: string,
  input: CreateProtectionInput,
): Promise<Protection> {
  await assertMemberInHousehold(db, householdId, input.memberId)

  const [row] = await db
    .insert(protection)
    .values({
      id: input.id,
      householdId,
      memberId: input.memberId,
      ciphertext: input.ciphertext,
      iv: input.iv,
      alg: input.alg,
    })
    .returning()
  if (!row) throw new Error('Insert of a protection record returned no row')
  return row
}

/** Version-conditional update — see server/lib/holdings.ts's updateHolding for the reasoning. */
export async function updateProtection(
  db: ProtectionDb & Pick<typeof Db, 'update'>,
  householdId: string,
  protectionId: string,
  input: UpdateProtectionInput,
): Promise<UpdateOutcome<Protection>> {
  const existingRows = await db
    .select()
    .from(protection)
    .where(and(eq(protection.id, protectionId), eq(protection.householdId, householdId)))
    .limit(1)
  if (!existingRows[0]) return { status: 'not_found' }

  const [row] = await db
    .update(protection)
    .set({
      ciphertext: input.ciphertext,
      iv: input.iv,
      alg: input.alg,
      version: input.expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(protection.id, protectionId),
        eq(protection.householdId, householdId),
        eq(protection.version, input.expectedVersion),
      ),
    )
    .returning()
  if (!row) return { status: 'conflict' }
  return { status: 'updated', row }
}
