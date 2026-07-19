import { describe, it, expect } from 'vitest'
import {
  selectNudge,
  buildNudgeContext,
  NUDGE_CHECK_ORDER,
  type NudgeCheckId,
  type NudgeInputHolding,
  type NudgeInputMember,
} from './nudge.js'
import type { CompletenessChecks } from './dashboard.js'

const CHECK_KEYS = [
  'memberCoverage',
  'emergencyFund',
  'bothParentsProtected',
  'assetDiversity',
  'noStaleValues',
] as const satisfies readonly (keyof CompletenessChecks)[]

/** All 2^5 = 32 combinations of the five checks, in a stable order. */
function allCombinations(): CompletenessChecks[] {
  const combos: CompletenessChecks[] = []
  for (let mask = 0; mask < 32; mask++) {
    const checks = {} as CompletenessChecks
    CHECK_KEYS.forEach((key, i) => {
      checks[key] = Boolean(mask & (1 << i))
    })
    combos.push(checks)
  }
  return combos
}

const context = { memberWithoutHoldings: 'Meera', unprotectedParent: 'Arun', assetClassCount: 2 }

describe('selectNudge — the "exactly one nudge" invariant (SPEC.md §7)', () => {
  const combos = allCombinations()

  it('covers all 32 combinations', () => {
    expect(combos).toHaveLength(32)
    expect(new Set(combos.map((c) => JSON.stringify(c))).size).toBe(32)
  })

  it('never returns zero nudges — every combination yields exactly one', () => {
    for (const checks of combos) {
      const nudge = selectNudge(checks, context)
      expect(nudge, JSON.stringify(checks)).toBeTruthy()
      expect(typeof nudge.checkId, JSON.stringify(checks)).toBe('string')
    }
  })

  it('always returns a non-empty learnCardSlug (both analytics events require it)', () => {
    for (const checks of combos) {
      expect(selectNudge(checks, context).learnCardSlug.length).toBeGreaterThan(0)
    }
  })

  it('selects the FIRST unmet check in DATA_MODEL.md order for all 31 incomplete combinations', () => {
    for (const checks of combos) {
      const firstUnmetIndex = CHECK_KEYS.findIndex((key) => !checks[key])
      if (firstUnmetIndex === -1) continue
      const expected: NudgeCheckId = NUDGE_CHECK_ORDER[firstUnmetIndex]
      expect(selectNudge(checks, context).checkId, JSON.stringify(checks)).toBe(expected)
    }
  })

  it('returns the affirming "complete" nudge when all five checks pass', () => {
    const allPass: CompletenessChecks = {
      memberCoverage: true,
      emergencyFund: true,
      bothParentsProtected: true,
      assetDiversity: true,
      noStaleValues: true,
    }
    expect(selectNudge(allPass, context).checkId).toBe('complete')
  })

  it('is pure — same input yields a deeply equal result', () => {
    const checks = allCombinations()[0]
    expect(selectNudge(checks, context)).toEqual(selectNudge(checks, context))
  })

  it('a later unmet check never outranks an earlier one', () => {
    // Only check 5 unmet -> check 5. Checks 1 and 5 unmet -> check 1.
    const onlyLastUnmet: CompletenessChecks = {
      memberCoverage: true,
      emergencyFund: true,
      bothParentsProtected: true,
      assetDiversity: true,
      noStaleValues: false,
    }
    expect(selectNudge(onlyLastUnmet, context).checkId).toBe('no_stale_values')

    expect(selectNudge({ ...onlyLastUnmet, memberCoverage: false }, context).checkId).toBe('member_coverage')
  })
})

describe('selectNudge — interpolation data carried to the copy layer', () => {
  const failing = (key: keyof CompletenessChecks): CompletenessChecks => ({
    memberCoverage: true,
    emergencyFund: true,
    bothParentsProtected: true,
    assetDiversity: true,
    noStaleValues: true,
    [key]: false,
  })

  it('check 1 carries the name of the member with no holdings', () => {
    expect(selectNudge(failing('memberCoverage'), context).memberName).toBe('Meera')
  })

  it('check 3 carries the name of the unprotected parent', () => {
    expect(selectNudge(failing('bothParentsProtected'), context).memberName).toBe('Arun')
  })

  it('check 4 carries the asset-class count', () => {
    expect(selectNudge(failing('assetDiversity'), context).assetClassCount).toBe(2)
  })

  it('checks that need no interpolation carry neither field', () => {
    const nudge = selectNudge(failing('emergencyFund'), context)
    expect(nudge.memberName).toBeUndefined()
    expect(nudge.assetClassCount).toBeUndefined()
  })

  it('degrades safely when a name is unavailable rather than emitting "undefined"', () => {
    const nudge = selectNudge(failing('memberCoverage'), { assetClassCount: 0 })
    expect(nudge.checkId).toBe('member_coverage')
    expect(nudge.memberName).toBeUndefined()
  })
})

describe('buildNudgeContext', () => {
  const self: NudgeInputMember = { id: 'm1', name: 'Arun', relationship: 'self' }
  const spouse: NudgeInputMember = { id: 'm2', name: 'Meera', relationship: 'spouse' }
  const child: NudgeInputMember = { id: 'm3', name: 'Nila', relationship: 'child' }

  function holding(overrides: Partial<NudgeInputHolding> = {}): NudgeInputHolding {
    return { memberId: 'm1', assetClass: 'equity', ...overrides }
  }

  it('names the first member (in list order) with no holdings', () => {
    const ctx = buildNudgeContext([self, spouse, child], [holding()], [])
    expect(ctx.memberWithoutHoldings).toBe('Meera')
  })

  it('leaves memberWithoutHoldings undefined when every member has a holding', () => {
    const ctx = buildNudgeContext(
      [self, spouse],
      [holding(), holding({ memberId: 'm2' })],
      [],
    )
    expect(ctx.memberWithoutHoldings).toBeUndefined()
  })

  it('names the first parent lacking active protection, ignoring children', () => {
    const ctx = buildNudgeContext([self, spouse, child], [], [{ memberId: 'm1', status: 'active' }])
    expect(ctx.unprotectedParent).toBe('Meera')
  })

  it('does not count a lapsed protection row as cover', () => {
    const ctx = buildNudgeContext([self], [], [{ memberId: 'm1', status: 'lapsed' }])
    expect(ctx.unprotectedParent).toBe('Arun')
  })

  it('counts distinct asset classes', () => {
    const ctx = buildNudgeContext(
      [self],
      [holding(), holding({ assetClass: 'debt' }), holding({ assetClass: 'debt' })],
      [],
    )
    expect(ctx.assetClassCount).toBe(2)
  })

  it('returns a zero count for a household with no holdings', () => {
    expect(buildNudgeContext([self], [], []).assetClassCount).toBe(0)
  })
})
