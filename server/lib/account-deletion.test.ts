import { describe, it, expect, beforeEach, vi } from 'vitest'

// Fixture household with a family member, a holding, protection, a goal, and
// an analytics_events row referencing the same user — the shape DATA_MODEL.md
// describes as "populated". Deleting the household row should cascade-remove
// every child row EXCEPT analytics_events (no FK to households by design —
// see server/lib/account-deletion.ts's comment).
interface HouseholdRow {
  id: string
  ownerUserId: string
}

let households: HouseholdRow[] = []
let familyMembers: Array<{ id: string; householdId: string }> = []
let holdings: Array<{ id: string; householdId: string; memberId: string }> = []
let protection: Array<{ id: string; householdId: string; memberId: string }> = []
let goals: Array<{ id: string; householdId: string }> = []
let analyticsEvents: Array<{ id: string; userId: string }> = []

let lastEqValue: string | undefined

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    eq: (_col: unknown, value: string) => {
      lastEqValue = value
      return { __eq: value }
    },
  }
})

vi.mock('./db.js', () => ({
  db: {
    delete: (_table: unknown) => ({
      where: (_cond: unknown) => ({
        returning: () => {
          const ownerUserId = lastEqValue
          const deleted = households.filter((h) => h.ownerUserId === ownerUserId)
          const deletedIds = new Set(deleted.map((h) => h.id))
          // Simulate the real Postgres ON DELETE CASCADE FKs declared in
          // drizzle/schema.ts (household_id -> households.id) for every
          // user-owned table. analytics_events has no such FK and is
          // deliberately left untouched, per the retention rule.
          households = households.filter((h) => !deletedIds.has(h.id))
          familyMembers = familyMembers.filter((m) => !deletedIds.has(m.householdId))
          holdings = holdings.filter((h) => !deletedIds.has(h.householdId))
          protection = protection.filter((p) => !deletedIds.has(p.householdId))
          goals = goals.filter((g) => !deletedIds.has(g.householdId))
          return Promise.resolve(deleted)
        },
      }),
    }),
  },
}))

const { db } = await import('./db.js')
const { deleteHouseholdForOwner } = await import('./account-deletion.js')

describe('deleteHouseholdForOwner — cascade delete against a populated fixture', () => {
  beforeEach(() => {
    households = [{ id: 'h-1', ownerUserId: 'user_a' }]
    familyMembers = [{ id: 'm-1', householdId: 'h-1' }]
    holdings = [{ id: 'hold-1', householdId: 'h-1', memberId: 'm-1' }]
    protection = [{ id: 'p-1', householdId: 'h-1', memberId: 'm-1' }]
    goals = [{ id: 'g-1', householdId: 'h-1' }]
    analyticsEvents = [{ id: 'ae-1', userId: 'user_a' }]
    lastEqValue = undefined
  })

  it('deletes the household row and cascades to every user-owned child table', async () => {
    const deleted = await deleteHouseholdForOwner(db, 'user_a')
    expect(deleted).toBe(true)

    expect(households).toHaveLength(0)
    expect(familyMembers).toHaveLength(0)
    expect(holdings).toHaveLength(0)
    expect(protection).toHaveLength(0)
    expect(goals).toHaveLength(0)
  })

  it('retains (orphans) the analytics_events row instead of deleting it', async () => {
    await deleteHouseholdForOwner(db, 'user_a')
    expect(analyticsEvents).toHaveLength(1)
    expect(analyticsEvents[0].userId).toBe('user_a')
  })

  it('never touches another household when deleting one owner', async () => {
    households.push({ id: 'h-2', ownerUserId: 'user_b' })
    familyMembers.push({ id: 'm-2', householdId: 'h-2' })

    await deleteHouseholdForOwner(db, 'user_a')

    expect(households).toEqual([{ id: 'h-2', ownerUserId: 'user_b' }])
    expect(familyMembers).toEqual([{ id: 'm-2', householdId: 'h-2' }])
  })

  it('returns false when no household exists for that owner (nothing to clean up)', async () => {
    const deleted = await deleteHouseholdForOwner(db, 'user_no_household')
    expect(deleted).toBe(false)
    expect(households).toHaveLength(1)
  })
})
