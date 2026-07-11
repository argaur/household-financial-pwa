import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { holdings, familyMembers, instruments, assetClassEnum } from '../../drizzle/schema.js'
import type { db as Db } from './db.js'

export type Holding = typeof holdings.$inferSelect

/** Thrown for any client-input problem (unknown member/instrument, bad values) or a missing holding. */
export class HoldingError extends Error {
  constructor(public code: 'member_not_found' | 'instrument_not_found' | 'holding_not_found') {
    super(code)
  }
}

// Matches drizzle's `numeric` column convention in this project (see
// instruments.rateValue) — stored/returned as a string, not a float, to
// avoid money-precision loss.
const numericString = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length > 0 && !Number.isNaN(Number(v)) && Number(v) >= 0, `${label} must be a non-negative number`)

const holdingInputSchema = z.object({
  memberId: z.string().trim().min(1, 'Member is required'),
  instrumentId: z.string().trim().min(1, 'Instrument is required'),
  investedAmount: numericString('Amount invested'),
  currentValue: numericString('Current value'),
  units: numericString('Units').optional(),
  monthlySip: numericString('Monthly SIP').optional(),
  startDate: z.string().trim().min(1).optional(),
  maturityDate: z.string().trim().min(1).optional(),
  nominee: z.string().trim().max(200).optional(),
  isEmergencyFund: z.boolean().optional().default(false),
  notes: z.string().trim().max(1000).optional(),
})

export type CreateHoldingInput = z.input<typeof holdingInputSchema>

// category is 1-indexed (1=Equity ... 6=Alternative); assetClassEnum is in
// the same order — see drizzle/schema.ts's category comment.
function assetClassForCategory(category: number): (typeof assetClassEnum)[number] {
  return assetClassEnum[category - 1]
}

type HoldingsDb = Pick<typeof Db, 'select'>

async function resolveMemberAndInstrument(db: HoldingsDb, householdId: string, memberId: string, instrumentId: string) {
  const memberRows = await db
    .select()
    .from(familyMembers)
    .where(and(eq(familyMembers.id, memberId), eq(familyMembers.householdId, householdId)))
    .limit(1)
  const member = memberRows[0]
  if (!member) throw new HoldingError('member_not_found')

  const instrumentRows = await db.select().from(instruments).where(eq(instruments.id, instrumentId)).limit(1)
  const instrument = instrumentRows[0] as { category: number } | undefined
  if (!instrument) throw new HoldingError('instrument_not_found')

  return { assetClass: assetClassForCategory(instrument.category) }
}

/**
 * Every query filters by householdId (resolved server-side from the Clerk
 * session, never client input) — mirrors the app-layer scoping boundary
 * proven in Slice 1/2. memberId is additionally verified to belong to the
 * same household before a holding can be created/updated against it, since
 * the family_members FK alone doesn't enforce cross-household isolation.
 */
export async function listHoldings(db: HoldingsDb, householdId: string): Promise<Holding[]> {
  const rows = await db.select().from(holdings).where(eq(holdings.householdId, householdId))
  return rows as Holding[]
}

export async function createHolding(
  db: HoldingsDb & Pick<typeof Db, 'insert'>,
  householdId: string,
  input: CreateHoldingInput,
): Promise<Holding> {
  const parsed = holdingInputSchema.parse(input)
  const { assetClass } = await resolveMemberAndInstrument(db, householdId, parsed.memberId, parsed.instrumentId)

  const [row] = await db
    .insert(holdings)
    .values({
      householdId,
      memberId: parsed.memberId,
      instrumentId: parsed.instrumentId,
      assetClass,
      investedAmount: parsed.investedAmount,
      currentValue: parsed.currentValue,
      units: parsed.units,
      monthlySip: parsed.monthlySip,
      startDate: parsed.startDate,
      maturityDate: parsed.maturityDate,
      nominee: parsed.nominee,
      isEmergencyFund: parsed.isEmergencyFund,
      notes: parsed.notes,
    })
    .returning()
  return row as Holding
}

export async function updateHolding(
  db: HoldingsDb & Pick<typeof Db, 'update'>,
  householdId: string,
  holdingId: string,
  input: CreateHoldingInput,
): Promise<Holding | null> {
  const existingRows = await db
    .select()
    .from(holdings)
    .where(and(eq(holdings.id, holdingId), eq(holdings.householdId, householdId)))
    .limit(1)
  if (!existingRows[0]) return null

  const parsed = holdingInputSchema.parse(input)
  const { assetClass } = await resolveMemberAndInstrument(db, householdId, parsed.memberId, parsed.instrumentId)

  const [row] = await db
    .update(holdings)
    .set({
      memberId: parsed.memberId,
      instrumentId: parsed.instrumentId,
      assetClass,
      investedAmount: parsed.investedAmount,
      currentValue: parsed.currentValue,
      units: parsed.units ?? null,
      monthlySip: parsed.monthlySip ?? null,
      startDate: parsed.startDate ?? null,
      maturityDate: parsed.maturityDate ?? null,
      nominee: parsed.nominee ?? null,
      isEmergencyFund: parsed.isEmergencyFund,
      notes: parsed.notes ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(holdings.id, holdingId), eq(holdings.householdId, householdId)))
    .returning()
  return row as Holding
}
