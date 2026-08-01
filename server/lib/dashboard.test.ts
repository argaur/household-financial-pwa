import { describe, it, expect, vi } from 'vitest'
import { familyMembers, holdings, protection } from '../../drizzle/schema.js'
import { getDashboard } from './dashboard.js'

// --- getDashboard: composes listFamilyMembers/listHoldings/listProtection
// (already household-scoped, tested elsewhere) against a fake db, verifying
// allocation totals/percentages and pass-through of the completeness result.
// computeCompleteness itself now lives in src/lib/dashboard.ts and is tested
// there — see src/lib/dashboard.test.ts.

function fakeDb(rows: { members: unknown[]; holdings: unknown[]; protection: unknown[] }) {
  function pickRows(table: unknown): unknown[] {
    if (table === familyMembers) return rows.members
    if (table === holdings) return rows.holdings
    if (table === protection) return rows.protection
    return []
  }
  return {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => Promise.resolve(pickRows(table))),
      })),
    })),
  }
}

describe('getDashboard', () => {
  it('returns zero allocation and score 0 for a household with nothing recorded', async () => {
    const db = fakeDb({ members: [], holdings: [], protection: [] })
    const result = await getDashboard(db as never, 'h1')
    expect(result.allocation).toEqual([])
    expect(result.totalValue).toBe(0)
    expect(result.completeness.score).toBe(0)
  })

  it('aggregates current_value by asset class and computes percentages', async () => {
    const db = fakeDb({
      members: [{ id: 'm1', householdId: 'h1', relationship: 'self' }],
      holdings: [
        { memberId: 'm1', householdId: 'h1', assetClass: 'equity', currentValue: '600', isEmergencyFund: false },
        { memberId: 'm1', householdId: 'h1', assetClass: 'debt', currentValue: '300', isEmergencyFund: false },
        { memberId: 'm1', householdId: 'h1', assetClass: 'gold', currentValue: '100', isEmergencyFund: false },
      ],
      protection: [],
    })
    const result = await getDashboard(db as never, 'h1')
    expect(result.totalValue).toBe(1000)
    expect(result.allocation).toEqual([
      { assetClass: 'equity', value: 600, percentage: 60 },
      { assetClass: 'debt', value: 300, percentage: 30 },
      { assetClass: 'gold', value: 100, percentage: 10 },
    ])
    // 3 asset classes -> diversity check passes; 1 member with holdings -> coverage passes
    expect(result.completeness.checks.assetDiversity).toBe(true)
    expect(result.completeness.checks.memberCoverage).toBe(true)
  })

  it('returns exactly one nudge, naming the member who has no holdings (Slice 7)', async () => {
    const db = fakeDb({
      members: [
        { id: 'm1', householdId: 'h1', name: 'Arun', relationship: 'self' },
        { id: 'm2', householdId: 'h1', name: 'Meera', relationship: 'spouse' },
      ],
      holdings: [
        { memberId: 'm1', householdId: 'h1', assetClass: 'equity', currentValue: '600', isEmergencyFund: false },
      ],
      protection: [],
    })
    const result = await getDashboard(db as never, 'h1')
    expect(result.completeness.checks.memberCoverage).toBe(false)
    expect(result.nudge.checkId).toBe('member_coverage')
    expect(result.nudge.memberName).toBe('Meera')
    expect(result.nudge.learnCardSlug).toBe('portfolio')
  })

  it('nudge falls through to the first unmet check when earlier checks pass (Slice 7)', async () => {
    const db = fakeDb({
      members: [{ id: 'm1', householdId: 'h1', name: 'Arun', relationship: 'self' }],
      holdings: [
        { memberId: 'm1', householdId: 'h1', assetClass: 'equity', currentValue: '600', isEmergencyFund: true },
        { memberId: 'm1', householdId: 'h1', assetClass: 'debt', currentValue: '300', isEmergencyFund: false },
      ],
      protection: [{ memberId: 'm1', householdId: 'h1', status: 'active' }],
    })
    const result = await getDashboard(db as never, 'h1')
    // checks 1-3 pass; only 2 asset classes -> check 4 is the first unmet
    expect(result.nudge.checkId).toBe('asset_diversity')
    expect(result.nudge.assetClassCount).toBe(2)
  })

  it('allocation is ordered by the fixed assetClassEnum order, not insertion order', async () => {
    const db = fakeDb({
      members: [],
      holdings: [
        { memberId: 'm1', householdId: 'h1', assetClass: 'gold', currentValue: '100', isEmergencyFund: false },
        { memberId: 'm1', householdId: 'h1', assetClass: 'equity', currentValue: '100', isEmergencyFund: false },
      ],
      protection: [],
    })
    const result = await getDashboard(db as never, 'h1')
    expect(result.allocation.map((a) => a.assetClass)).toEqual(['equity', 'gold'])
  })
})
