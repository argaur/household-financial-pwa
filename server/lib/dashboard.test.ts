import { describe, it, expect, vi } from 'vitest'
import { familyMembers, holdings, protection } from '../../drizzle/schema.js'
import { computeCompleteness, getDashboard, type CompletenessInputHolding, type CompletenessInputMember, type CompletenessInputProtection } from './dashboard.js'

// --- computeCompleteness: pure function, tested directly against fixture
// households per IMPLEMENTATION_PLAN.md's "Slice 6" Tests column. ---

const self: CompletenessInputMember = { id: 'm1', relationship: 'self' }
const spouse: CompletenessInputMember = { id: 'm2', relationship: 'spouse' }
const child: CompletenessInputMember = { id: 'm3', relationship: 'child' }

function holding(overrides: Partial<CompletenessInputHolding> = {}): CompletenessInputHolding {
  return {
    memberId: 'm1',
    assetClass: 'equity',
    currentValue: '1000',
    isEmergencyFund: false,
    ...overrides,
  }
}

function activeProtection(memberId: string): CompletenessInputProtection {
  return { memberId, status: 'active' }
}

describe('computeCompleteness', () => {
  it('fixture: 0 members — every check unmet, score 0, tier getting_started', () => {
    const result = computeCompleteness([], [], [])
    expect(result.checks).toEqual({
      memberCoverage: false,
      emergencyFund: false,
      bothParentsProtected: false,
      assetDiversity: false,
      noStaleValues: false,
    })
    expect(result.score).toBe(0)
    expect(result.tier).toBe('getting_started')
  })

  it('fixture: 1 member, no holdings — every check unmet', () => {
    const result = computeCompleteness([self], [], [])
    expect(result.checks.memberCoverage).toBe(false)
    expect(result.checks.noStaleValues).toBe(false)
    expect(result.score).toBe(0)
    expect(result.tier).toBe('getting_started')
  })

  it('member coverage passes only when every member has at least one holding', () => {
    const result = computeCompleteness([self, spouse], [holding({ memberId: 'm1' })], [])
    expect(result.checks.memberCoverage).toBe(false)

    const bothCovered = computeCompleteness(
      [self, spouse],
      [holding({ memberId: 'm1' }), holding({ memberId: 'm2' })],
      [],
    )
    expect(bothCovered.checks.memberCoverage).toBe(true)
  })

  it('emergency fund check passes when any holding is flagged', () => {
    const result = computeCompleteness([self], [holding({ isEmergencyFund: true })], [])
    expect(result.checks.emergencyFund).toBe(true)
  })

  it('both-parents-protected check only counts self/spouse, requires active status', () => {
    const noProtection = computeCompleteness([self, spouse, child], [holding()], [])
    expect(noProtection.checks.bothParentsProtected).toBe(false)

    const onlySelf = computeCompleteness([self, spouse], [holding()], [activeProtection('m1')])
    expect(onlySelf.checks.bothParentsProtected).toBe(false)

    const lapsedSpouse = computeCompleteness(
      [self, spouse],
      [holding()],
      [activeProtection('m1'), { memberId: 'm2', status: 'lapsed' }],
    )
    expect(lapsedSpouse.checks.bothParentsProtected).toBe(false)

    const bothActive = computeCompleteness(
      [self, spouse],
      [holding()],
      [activeProtection('m1'), activeProtection('m2')],
    )
    expect(bothActive.checks.bothParentsProtected).toBe(true)

    // Child-only protection doesn't count toward this check, but also
    // doesn't block it — only self/spouse members are considered.
    const childOnly = computeCompleteness([child], [holding({ memberId: 'm3' })], [activeProtection('m3')])
    expect(childOnly.checks.bothParentsProtected).toBe(false)
  })

  it('asset diversity check passes at 3+ distinct asset classes', () => {
    const two = computeCompleteness(
      [self],
      [holding({ assetClass: 'equity' }), holding({ assetClass: 'debt' })],
      [],
    )
    expect(two.checks.assetDiversity).toBe(false)

    const three = computeCompleteness(
      [self],
      [holding({ assetClass: 'equity' }), holding({ assetClass: 'debt' }), holding({ assetClass: 'gold' })],
      [],
    )
    expect(three.checks.assetDiversity).toBe(true)
  })

  it('no-stale-values check requires holdings to exist and all have a current value', () => {
    const withNull = computeCompleteness([self], [holding({ currentValue: null })], [])
    expect(withNull.checks.noStaleValues).toBe(false)

    const allSet = computeCompleteness([self], [holding({ currentValue: '5000' })], [])
    expect(allSet.checks.noStaleValues).toBe(true)
  })

  it('fixture: full coverage — all 5 checks pass, score 5, tier strong', () => {
    const result = computeCompleteness(
      [self, spouse],
      [
        holding({ memberId: 'm1', assetClass: 'equity', isEmergencyFund: true }),
        holding({ memberId: 'm2', assetClass: 'debt' }),
        holding({ memberId: 'm1', assetClass: 'gold' }),
      ],
      [activeProtection('m1'), activeProtection('m2')],
    )
    expect(result.checks).toEqual({
      memberCoverage: true,
      emergencyFund: true,
      bothParentsProtected: true,
      assetDiversity: true,
      noStaleValues: true,
    })
    expect(result.score).toBe(5)
    expect(result.tier).toBe('strong')
  })

  it('tier boundaries: 0-1 getting_started, 2-3 on_track, 4-5 strong', () => {
    // No members, no holdings, one active protection record -> nothing to
    // attach it to (no self/spouse) -> every check unmet -> score 0.
    const zeroChecks = computeCompleteness([], [], [])
    expect(zeroChecks.score).toBe(0)
    expect(zeroChecks.tier).toBe('getting_started')

    // Emergency fund + no-stale-values pass (1 holding, has a value) -> 2 -> on_track
    const twoChecks = computeCompleteness([], [holding({ isEmergencyFund: true })], [])
    expect(twoChecks.score).toBe(2)
    expect(twoChecks.tier).toBe('on_track')

    // + asset diversity (3 classes) -> 3 -> still on_track (upper boundary)
    const threeChecks = computeCompleteness(
      [],
      [
        holding({ assetClass: 'equity', isEmergencyFund: true }),
        holding({ assetClass: 'debt' }),
        holding({ assetClass: 'gold' }),
      ],
      [],
    )
    expect(threeChecks.score).toBe(3)
    expect(threeChecks.tier).toBe('on_track')

    // + member coverage (1 member, all their holdings) -> 4 -> strong (lower boundary)
    const fourChecks = computeCompleteness(
      [self],
      [
        holding({ memberId: 'm1', assetClass: 'equity', isEmergencyFund: true }),
        holding({ memberId: 'm1', assetClass: 'debt' }),
        holding({ memberId: 'm1', assetClass: 'gold' }),
      ],
      [],
    )
    expect(fourChecks.score).toBe(4)
    expect(fourChecks.tier).toBe('strong')
  })
})

// --- getDashboard: composes listFamilyMembers/listHoldings/listProtection
// (already household-scoped, tested elsewhere) against a fake db, verifying
// allocation totals/percentages and pass-through of the completeness result.

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
