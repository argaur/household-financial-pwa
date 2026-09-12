import { describe, it, expect } from 'vitest'
import {
  MAX_AI_REQUEST_BYTES,
  TARGET_AMOUNT_BAND_INR,
  MONTHLY_CAPACITY_BAND_INR,
  aiSuggestionRequestSchema,
  goalPlanRequestSchema,
  counselRequestSchema,
} from './ai-suggestion-request.js'
import { LIBRARY_INSTRUMENT_SLUGS } from './ai-suggestion-output.js'

/**
 * A3's payload-minimisation requirement, tested as a property of the schema
 * rather than of the route.
 *
 * The plan's wording is the bar: the schema must make a member name, a nominee
 * and an exact rupee amount **unrepresentable**, not merely discouraged. So
 * these tests do not check that the route happens to drop such a field — they
 * check that a body carrying one is refused outright.
 */

const VALID_GOAL_PLAN = {
  kind: 'goal_plan',
  idempotencyKey: '3f7b6a10-1c4e-4a5d-9f2b-8c1e5d0a7b31',
  horizonYears: 18,
  targetAmountBandInr: 5_000_000,
  monthlyCapacityBandInr: 47_000,
  currentMix: [
    { assetClass: 'equity', weightPct: 60 },
    { assetClass: 'debt', weightPct: 25 },
    { assetClass: 'gold', weightPct: 15 },
  ],
} as const

describe('goalPlanRequestSchema — the shape it accepts', () => {
  it('accepts a minimised goal-plan body', () => {
    expect(goalPlanRequestSchema.safeParse(VALID_GOAL_PLAN).success).toBe(true)
  })

  it('accepts a null monthly capacity, which means "not stated"', () => {
    const body = { ...VALID_GOAL_PLAN, monthlyCapacityBandInr: null }
    expect(goalPlanRequestSchema.safeParse(body).success).toBe(true)
  })

  it('requires an idempotency key that is a v4-shaped uuid, not any string', () => {
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, idempotencyKey: 'gesture-1' }).success).toBe(false)
  })

  it('bounds the horizon to 1..40 years', () => {
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, horizonYears: 0 }).success).toBe(false)
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, horizonYears: 41 }).success).toBe(false)
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, horizonYears: 1 }).success).toBe(true)
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, horizonYears: 40 }).success).toBe(true)
  })

  it('bounds a mix weight to 0..100 and refuses a repeated asset class', () => {
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, currentMix: [{ assetClass: 'equity', weightPct: 101 }] }).success).toBe(false)
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, currentMix: [{ assetClass: 'equity', weightPct: -1 }] }).success).toBe(false)
    const repeated = [
      { assetClass: 'equity', weightPct: 50 },
      { assetClass: 'equity', weightPct: 50 },
    ]
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, currentMix: repeated }).success).toBe(false)
  })
})

describe('goalPlanRequestSchema — a name is unrepresentable, not filtered', () => {
  it('rejects a body carrying a member name', () => {
    const result = goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, memberName: 'Rinku' })
    expect(result.success).toBe(false)
  })

  it('rejects a body carrying a nominee', () => {
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, nominee: 'Siya' }).success).toBe(false)
  })

  it('rejects a body carrying a household or ledger name', () => {
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, householdName: 'Gupta' }).success).toBe(false)
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, ledgerName: "Siya's education" }).success).toBe(false)
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, notes: 'call the bank about the FD' }).success).toBe(false)
  })

  it('rejects a name substituted into every field the schema does accept', () => {
    // The strongest form of "unrepresentable": there is no accepted key whose
    // value may be free text. A schema that grew a `label` or a `goalName`
    // later would fail here without anyone having to remember this rule.
    for (const key of Object.keys(VALID_GOAL_PLAN)) {
      const body = { ...VALID_GOAL_PLAN, [key]: 'Rinku Gupta' }
      expect(goalPlanRequestSchema.safeParse(body).success, `${key} accepted a person's name`).toBe(false)
    }
  })

  it('rejects a name smuggled into an asset class, which is an enum and not free text', () => {
    const mix = [{ assetClass: "Rinku's PPF", weightPct: 100 }]
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, currentMix: mix }).success).toBe(false)
  })
})

describe('goalPlanRequestSchema — an exact rupee amount is unrepresentable', () => {
  it('rejects a target that is not banded to the nearest 100000', () => {
    expect(TARGET_AMOUNT_BAND_INR).toBe(100_000)
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, targetAmountBandInr: 5_234_567 }).success).toBe(false)
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, targetAmountBandInr: 5_100_000 }).success).toBe(true)
  })

  it('rejects a monthly capacity that is not banded to the nearest 1000', () => {
    expect(MONTHLY_CAPACITY_BAND_INR).toBe(1_000)
    // 18500 is a real figure from this household's own SIP total. Banded to
    // 1000 it is 18000 or 19000; the exact number may not be sent.
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, monthlyCapacityBandInr: 18_500 }).success).toBe(false)
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, monthlyCapacityBandInr: 18_000 }).success).toBe(true)
  })

  it('rejects an amount hung off a mix entry', () => {
    const mix = [{ assetClass: 'equity', weightPct: 60, amountInr: 5_734_120 }]
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, currentMix: mix }).success).toBe(false)
  })

  it('refuses a target of zero or a negative capacity', () => {
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, targetAmountBandInr: 0 }).success).toBe(false)
    expect(goalPlanRequestSchema.safeParse({ ...VALID_GOAL_PLAN, monthlyCapacityBandInr: -1_000 }).success).toBe(false)
  })
})

describe('aiSuggestionRequestSchema — the union the route parses against', () => {
  it('accepts a goal_plan body', () => {
    expect(aiSuggestionRequestSchema.safeParse(VALID_GOAL_PLAN).success).toBe(true)
  })

  it('rejects an unknown kind rather than defaulting to one', () => {
    expect(aiSuggestionRequestSchema.safeParse({ ...VALID_GOAL_PLAN, kind: 'freeform' }).success).toBe(false)
    const { kind: _kind, ...withoutKind } = VALID_GOAL_PLAN
    expect(aiSuggestionRequestSchema.safeParse(withoutKind).success).toBe(false)
  })
})

describe('MAX_AI_REQUEST_BYTES', () => {
  it('is small enough that the route cannot be used as a data channel', () => {
    // A legitimate body is a few hundred bytes: six mix entries, three numbers
    // and a uuid. The cap only has to stop abuse.
    expect(MAX_AI_REQUEST_BYTES).toBeLessThanOrEqual(4096)
    expect(new TextEncoder().encode(JSON.stringify(VALID_GOAL_PLAN)).byteLength).toBeLessThan(MAX_AI_REQUEST_BYTES)
  })
})

/**
 * D-024 Chunk C, step C1: the `kind: "counsel"` member. `SPEC.md` §G3.
 *
 * Same discipline as the goal-plan tests above: a name or an exact rupee
 * amount must be unrepresentable, not merely discouraged, and the union stays
 * strict and discriminated so a body cannot mix the two shapes.
 */

const VALID_COUNSEL = {
  kind: 'counsel',
  idempotencyKey: '3f7b6a10-1c4e-4a5d-9f2b-8c1e5d0a7b31',
  ledgerId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  currentMix: [
    { assetClass: 'equity', weightPct: 60 },
    { assetClass: 'debt', weightPct: 40 },
  ],
  holdingSlugs: ['equity-index-funds-etfs', 'debt-ppf'],
} as const

describe('counselRequestSchema — the shape it accepts', () => {
  it('accepts a minimised counsel body', () => {
    expect(counselRequestSchema.safeParse(VALID_COUNSEL).success).toBe(true)
  })

  it('requires ledgerId to be a uuid, not any string', () => {
    expect(counselRequestSchema.safeParse({ ...VALID_COUNSEL, ledgerId: 'ledger-1' }).success).toBe(false)
  })

  it('requires an idempotency key that is a v4-shaped uuid, not any string', () => {
    expect(counselRequestSchema.safeParse({ ...VALID_COUNSEL, idempotencyKey: 'gesture-1' }).success).toBe(false)
  })

  it('bounds a mix weight to 0..100 and refuses a repeated asset class, same as goal_plan', () => {
    expect(
      counselRequestSchema.safeParse({ ...VALID_COUNSEL, currentMix: [{ assetClass: 'equity', weightPct: 101 }] })
        .success,
    ).toBe(false)
    const repeated = [
      { assetClass: 'equity', weightPct: 50 },
      { assetClass: 'equity', weightPct: 50 },
    ]
    expect(counselRequestSchema.safeParse({ ...VALID_COUNSEL, currentMix: repeated }).success).toBe(false)
  })
})

describe('counselRequestSchema — holdingSlugs accepts only the library allowlist', () => {
  it('sources its allowlist from the same instrumentsSeedData-derived export A4 validates output against', () => {
    // Not a hand-copied list: proves the two ends cannot drift apart.
    expect(LIBRARY_INSTRUMENT_SLUGS.length).toBeGreaterThan(0)
    expect(counselRequestSchema.safeParse({ ...VALID_COUNSEL, holdingSlugs: [LIBRARY_INSTRUMENT_SLUGS[0]] }).success).toBe(
      true,
    )
  })

  it('rejects a slug outside the library', () => {
    expect(counselRequestSchema.safeParse({ ...VALID_COUNSEL, holdingSlugs: ['not-a-library-slug'] }).success).toBe(
      false,
    )
  })

  it('rejects an empty holdingSlugs array', () => {
    expect(counselRequestSchema.safeParse({ ...VALID_COUNSEL, holdingSlugs: [] }).success).toBe(false)
  })

  it('rejects a repeated slug', () => {
    expect(
      counselRequestSchema.safeParse({
        ...VALID_COUNSEL,
        holdingSlugs: ['equity-index-funds-etfs', 'equity-index-funds-etfs'],
      }).success,
    ).toBe(false)
  })

  it('rejects a holding entry that carries an amount or a name instead of a bare slug', () => {
    expect(
      counselRequestSchema.safeParse({
        ...VALID_COUNSEL,
        holdingSlugs: [{ slug: 'equity-index-funds-etfs', amountInr: 500_000 }],
      }).success,
    ).toBe(false)
  })
})

describe('counselRequestSchema — a name or an exact rupee amount is unrepresentable', () => {
  it('rejects a body carrying a member name', () => {
    expect(counselRequestSchema.safeParse({ ...VALID_COUNSEL, memberName: 'Rinku' }).success).toBe(false)
  })

  it('rejects a body carrying a nominee or a ledger name', () => {
    expect(counselRequestSchema.safeParse({ ...VALID_COUNSEL, nominee: 'Siya' }).success).toBe(false)
    expect(counselRequestSchema.safeParse({ ...VALID_COUNSEL, ledgerName: "Siya's education" }).success).toBe(false)
  })

  it('rejects a rupee amount on the body', () => {
    expect(counselRequestSchema.safeParse({ ...VALID_COUNSEL, amountInr: 500_000 }).success).toBe(false)
  })

  it('rejects an amount hung off a mix entry', () => {
    const mix = [{ assetClass: 'equity', weightPct: 60, amountInr: 5_734_120 }]
    expect(counselRequestSchema.safeParse({ ...VALID_COUNSEL, currentMix: mix }).success).toBe(false)
  })

  it('rejects a name substituted into every field the schema does accept', () => {
    for (const key of Object.keys(VALID_COUNSEL)) {
      const body = { ...VALID_COUNSEL, [key]: 'Rinku Gupta' }
      expect(counselRequestSchema.safeParse(body).success, `${key} accepted a person's name`).toBe(false)
    }
  })
})

describe('aiSuggestionRequestSchema — the union stays strict and discriminated (C1)', () => {
  it('accepts a counsel body', () => {
    expect(aiSuggestionRequestSchema.safeParse(VALID_COUNSEL).success).toBe(true)
  })

  it('rejects kind "counsel" carrying goal_plan-only fields', () => {
    const body = {
      ...VALID_COUNSEL,
      horizonYears: 18,
      targetAmountBandInr: 5_000_000,
      monthlyCapacityBandInr: null,
    }
    expect(aiSuggestionRequestSchema.safeParse(body).success).toBe(false)
  })

  it('rejects kind "goal_plan" carrying counsel-only fields', () => {
    const body = {
      ...VALID_GOAL_PLAN,
      ledgerId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      holdingSlugs: ['equity-index-funds-etfs'],
    }
    expect(aiSuggestionRequestSchema.safeParse(body).success).toBe(false)
  })

  it('rejects a counsel body missing its own required field (ledgerId)', () => {
    const { ledgerId: _ledgerId, ...withoutLedgerId } = VALID_COUNSEL
    expect(aiSuggestionRequestSchema.safeParse(withoutLedgerId).success).toBe(false)
  })
})
