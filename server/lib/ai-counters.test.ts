import { describe, it, expect } from 'vitest'
import { createAiDbFake, type AiReservationRow } from '../test-helpers/ai-db-fake.js'
import { reserveAiCall } from './ai-reservations.js'
import {
  createAiCallCounterConsumer,
  aiUsagePeriod,
  MAX_AI_PLANS_PER_HOUSEHOLD,
  MAX_AI_EDITS_PER_LEDGER,
} from './ai-counters.js'
import { AI_GLOBAL_MONTHLY_CALL_CAP } from './ai-usage.js'

/**
 * Step R3 of Chunk R (D-024 item (b)): the three conditional counter UPDATEs.
 *
 * **What makes these tests worth anything is the fake, not the assertions.** A
 * JavaScript object graph mutates synchronously, so a read-check-increment
 * implementation and a correct conditional UPDATE will both pass a naive
 * concurrency test — green, and proving nothing. `ai-db-fake.ts` is built so
 * they cannot both pass: `select` resolves on a macrotask, while `update`
 * evaluates its predicate and applies its write in one synchronous critical
 * section and defers only the result. That is exactly the asymmetry Postgres
 * gives a single statement, and it is what lets a second caller slip into the
 * gap a read-then-write leaves open.
 *
 * This was verified by mutation, not by argument: replacing the conditional
 * UPDATE with `SELECT` the counter, compare in JS, `UPDATE ... SET counter = n`
 * turns the concurrency tests below red with two successes where exactly one is
 * allowed. Same discipline as `src/lib/sm-breakpoint-pin.test.ts` (step E11).
 */

const HOUSEHOLD_A = '11111111-1111-4111-8111-111111111111'
const HOUSEHOLD_B = '22222222-2222-4222-8222-222222222222'
const LEDGER_A = 'aaaaaaaa-1111-4111-8111-111111111111'
const KEY_ONE = '99999999-9999-4999-8999-999999999991'
const KEY_TWO = '99999999-9999-4999-8999-999999999992'

/** A fixed instant inside September 2026, UTC. */
const SEPTEMBER = () => new Date('2026-09-10T12:00:00Z')

function reservation(overrides: Partial<AiReservationRow> = {}): AiReservationRow {
  return {
    id: 'reservation-1',
    householdId: HOUSEHOLD_A,
    ledgerId: null,
    idempotencyKey: KEY_ONE,
    kind: 'goal_plan',
    capType: 'plans',
    status: 'reserved',
    createdAt: new Date('2026-09-10T12:00:00Z'),
    ...overrides,
  }
}

function counselReservation(overrides: Partial<AiReservationRow> = {}): AiReservationRow {
  return reservation({ ledgerId: LEDGER_A, kind: 'counsel', capType: 'edits', ...overrides })
}

describe('aiUsagePeriod', () => {
  it('is YYYY-MM in UTC', () => {
    expect(aiUsagePeriod(new Date('2026-09-10T12:00:00Z'))).toBe('2026-09')
    expect(aiUsagePeriod(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01')
  })

  it('uses UTC even when local time is already in the next month', () => {
    // 23:00 UTC on the last day of August is 04:30 on 1 September in IST, where
    // this project is developed. The period must follow UTC, because
    // DATA_MODEL.md says UTC and because a breaker that rolls over at a
    // developer's local midnight is a breaker nobody can reason about.
    expect(aiUsagePeriod(new Date('2026-08-31T23:00:00Z'))).toBe('2026-08')
  })
})

describe('the per-household plans cap', () => {
  it('increments ai_plans_created and reports consumed while under the cap', async () => {
    const fake = createAiDbFake({ households: [{ id: HOUSEHOLD_A, aiPlansCreated: 0 }] })
    const consume = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })

    const outcome = await consume({ reservation: reservation(), capType: 'plans' })

    expect(outcome).toEqual({ status: 'consumed' })
    expect(fake.households[0]!.aiPlansCreated).toBe(1)
  })

  it('reports cap_reached and marks the reservation failed when the cap is already spent', async () => {
    const fake = createAiDbFake({
      households: [{ id: HOUSEHOLD_A, aiPlansCreated: MAX_AI_PLANS_PER_HOUSEHOLD }],
      reservations: [reservation()],
    })
    const consume = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })

    const outcome = await consume({ reservation: reservation(), capType: 'plans' })

    expect(outcome).toEqual({ status: 'cap_reached', capType: 'plans' })
    // Zero rows affected is the only cap signal. The counter must not have moved
    // past the cap on the way to discovering that.
    expect(fake.households[0]!.aiPlansCreated).toBe(MAX_AI_PLANS_PER_HOUSEHOLD)
    expect(fake.reservations[0]!.status).toBe('failed')
  })

  it('does not touch another household', async () => {
    const fake = createAiDbFake({
      households: [
        { id: HOUSEHOLD_A, aiPlansCreated: 0 },
        { id: HOUSEHOLD_B, aiPlansCreated: 0 },
      ],
    })
    const consume = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })

    await consume({ reservation: reservation(), capType: 'plans' })

    expect(fake.households[1]!.aiPlansCreated).toBe(0)
  })

  it('never spends the plans cap on a counsel call', async () => {
    const fake = createAiDbFake({
      households: [{ id: HOUSEHOLD_A, aiPlansCreated: 0 }],
      ledgers: [{ id: LEDGER_A, aiEditsUsed: 0 }],
    })
    const consume = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })

    await consume({ reservation: counselReservation(), capType: 'edits' })

    expect(fake.ledgers[0]!.aiEditsUsed).toBe(1)
    expect(fake.households[0]!.aiPlansCreated).toBe(0)
  })
})

describe('the per-ledger edits cap', () => {
  it('increments ai_edits_used and reports consumed while under the cap', async () => {
    const fake = createAiDbFake({ ledgers: [{ id: LEDGER_A, aiEditsUsed: 0 }] })
    const consume = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })

    const outcome = await consume({ reservation: counselReservation(), capType: 'edits' })

    expect(outcome).toEqual({ status: 'consumed' })
    expect(fake.ledgers[0]!.aiEditsUsed).toBe(1)
  })

  it('reports cap_reached and marks the reservation failed when the ledger is spent', async () => {
    const fake = createAiDbFake({
      ledgers: [{ id: LEDGER_A, aiEditsUsed: MAX_AI_EDITS_PER_LEDGER }],
      reservations: [counselReservation()],
    })
    const consume = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })

    const outcome = await consume({ reservation: counselReservation(), capType: 'edits' })

    expect(outcome).toEqual({ status: 'cap_reached', capType: 'edits' })
    expect(fake.ledgers[0]!.aiEditsUsed).toBe(MAX_AI_EDITS_PER_LEDGER)
    expect(fake.reservations[0]!.status).toBe('failed')
  })

  it('refuses a counsel reservation carrying no ledger rather than silently skipping the cap', async () => {
    const fake = createAiDbFake({ ledgers: [{ id: LEDGER_A, aiEditsUsed: 0 }] })
    const consume = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })

    await expect(
      consume({ reservation: counselReservation({ ledgerId: null }), capType: 'edits' }),
    ).rejects.toThrow(/ledger/i)
  })
})

describe('the global monthly circuit breaker', () => {
  it('creates the month row lazily, seeded from the server constant, and counts the call', async () => {
    const fake = createAiDbFake({ households: [{ id: HOUSEHOLD_A, aiPlansCreated: 0 }] })
    const consume = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })

    const outcome = await consume({ reservation: reservation(), capType: 'plans' })

    expect(outcome).toEqual({ status: 'consumed' })
    expect(fake.globalUsage).toHaveLength(1)
    expect(fake.globalUsage[0]).toMatchObject({
      period: '2026-09',
      callsUsed: 1,
      capCalls: AI_GLOBAL_MONTHLY_CALL_CAP,
    })
  })

  it('does not produce two rows or lose an increment when two first-calls-of-the-month race', async () => {
    const fake = createAiDbFake({
      households: [
        { id: HOUSEHOLD_A, aiPlansCreated: 0 },
        { id: HOUSEHOLD_B, aiPlansCreated: 0 },
      ],
    })
    const consume = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })

    const outcomes = await Promise.all([
      consume({ reservation: reservation(), capType: 'plans' }),
      consume({ reservation: reservation({ id: 'reservation-2', householdId: HOUSEHOLD_B }), capType: 'plans' }),
    ])

    expect(outcomes.map((o) => o.status)).toEqual(['consumed', 'consumed'])
    expect(fake.globalUsage).toHaveLength(1)
    expect(fake.globalUsage[0]!.callsUsed).toBe(2)
  })

  it('blocks a goal_plan call when the month is exhausted', async () => {
    const fake = createAiDbFake({
      households: [{ id: HOUSEHOLD_A, aiPlansCreated: 0 }],
      reservations: [reservation()],
      globalUsage: [
        {
          period: '2026-09',
          callsUsed: AI_GLOBAL_MONTHLY_CALL_CAP,
          capCalls: AI_GLOBAL_MONTHLY_CALL_CAP,
          updatedAt: new Date(0),
        },
      ],
    })
    const consume = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })

    const outcome = await consume({ reservation: reservation(), capType: 'plans' })

    expect(outcome).toEqual({ status: 'cap_reached', capType: 'global' })
    expect(fake.globalUsage[0]!.callsUsed).toBe(AI_GLOBAL_MONTHLY_CALL_CAP)
    expect(fake.reservations[0]!.status).toBe('failed')
  })

  it('blocks a counsel call when the month is exhausted', async () => {
    const fake = createAiDbFake({
      ledgers: [{ id: LEDGER_A, aiEditsUsed: 0 }],
      reservations: [counselReservation()],
      globalUsage: [
        {
          period: '2026-09',
          callsUsed: AI_GLOBAL_MONTHLY_CALL_CAP,
          capCalls: AI_GLOBAL_MONTHLY_CALL_CAP,
          updatedAt: new Date(0),
        },
      ],
    })
    const consume = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })

    const outcome = await consume({ reservation: counselReservation(), capType: 'edits' })

    expect(outcome).toEqual({ status: 'cap_reached', capType: 'global' })
    expect(fake.reservations[0]!.status).toBe('failed')
  })

  it('compares against the row cap_calls, not against the server constant', async () => {
    // A month whose row was created when the cap was 1. Raising the constant
    // later must not retroactively reopen that month.
    const fake = createAiDbFake({
      households: [{ id: HOUSEHOLD_A, aiPlansCreated: 0 }],
      globalUsage: [{ period: '2026-09', callsUsed: 1, capCalls: 1, updatedAt: new Date(0) }],
    })
    const consume = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })

    const outcome = await consume({ reservation: reservation(), capType: 'plans' })

    expect(outcome).toEqual({ status: 'cap_reached', capType: 'global' })
    expect(fake.globalUsage[0]!.callsUsed).toBe(1)
  })

  it('leaves a spent global month alone rather than incrementing past its cap', async () => {
    const fake = createAiDbFake({
      households: [{ id: HOUSEHOLD_A, aiPlansCreated: 0 }],
      globalUsage: [
        {
          period: '2026-09',
          callsUsed: AI_GLOBAL_MONTHLY_CALL_CAP,
          capCalls: AI_GLOBAL_MONTHLY_CALL_CAP,
          updatedAt: new Date(0),
        },
      ],
    })
    const consume = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })

    await consume({ reservation: reservation(), capType: 'plans' })
    await consume({ reservation: reservation(), capType: 'plans' })

    expect(fake.globalUsage[0]!.callsUsed).toBe(AI_GLOBAL_MONTHLY_CALL_CAP)
  })
})

describe('cap ordering, the documented cost', () => {
  it('spends the per-entity cap before the global one, so a tripped breaker consumes a household plan', async () => {
    // This is not incidental behaviour, it is the resolved trade-off recorded in
    // ai-counters.ts. There is no transaction, so one of the two counters has to
    // move first. The per-entity counter is chosen, and the cost is asserted
    // here rather than left implicit: at the exact moment the breaker trips, the
    // requesting household loses one of its own plans for a call that never went
    // out. The alternative burns a shared global slot, which lands the loss on
    // every other household instead of on the requester.
    const fake = createAiDbFake({
      households: [{ id: HOUSEHOLD_A, aiPlansCreated: 0 }],
      reservations: [reservation()],
      globalUsage: [
        {
          period: '2026-09',
          callsUsed: AI_GLOBAL_MONTHLY_CALL_CAP,
          capCalls: AI_GLOBAL_MONTHLY_CALL_CAP,
          updatedAt: new Date(0),
        },
      ],
    })
    const consume = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })

    await consume({ reservation: reservation(), capType: 'plans' })

    expect(fake.households[0]!.aiPlansCreated).toBe(1)
  })

  it('never touches the global row when the per-entity cap already refused', async () => {
    const fake = createAiDbFake({
      households: [{ id: HOUSEHOLD_A, aiPlansCreated: MAX_AI_PLANS_PER_HOUSEHOLD }],
      reservations: [reservation()],
    })
    const consume = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })

    await consume({ reservation: reservation(), capType: 'plans' })

    // No row created, no call counted against the month: a call the household
    // cap refused never reached the provider, so it must not spend a global slot.
    expect(fake.globalUsage).toHaveLength(0)
  })
})

describe('concurrency — SPEC.md §G6.9', () => {
  it('two concurrent callers with different keys and one plan left produce exactly one success and one cap_reached', async () => {
    const fake = createAiDbFake({
      households: [{ id: HOUSEHOLD_A, aiPlansCreated: MAX_AI_PLANS_PER_HOUSEHOLD - 1 }],
    })
    const consumeCounters = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })

    const outcomes = await Promise.all([
      reserveAiCall(fake.db, { householdId: HOUSEHOLD_A, idempotencyKey: KEY_ONE, kind: 'goal_plan' }, { consumeCounters }),
      reserveAiCall(fake.db, { householdId: HOUSEHOLD_A, idempotencyKey: KEY_TWO, kind: 'goal_plan' }, { consumeCounters }),
    ])

    const statuses = outcomes.map((outcome) => outcome.status).sort()
    // Exactly one, not at most one. Two reservation rows exist — different keys,
    // so the unique index does not fire — and it is the conditional UPDATE alone
    // that has to separate them.
    expect(statuses).toEqual(['cap_reached', 'reserved'])
    expect(fake.reservations).toHaveLength(2)
    expect(fake.households[0]!.aiPlansCreated).toBe(MAX_AI_PLANS_PER_HOUSEHOLD)
    expect(fake.reservations.filter((row) => row.status === 'failed')).toHaveLength(1)
  })

  it('two concurrent counsel callers on one ledger with one edit left produce exactly one success', async () => {
    const fake = createAiDbFake({
      ledgers: [{ id: LEDGER_A, aiEditsUsed: MAX_AI_EDITS_PER_LEDGER - 1 }],
    })
    const consumeCounters = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })

    const outcomes = await Promise.all([
      reserveAiCall(fake.db, { householdId: HOUSEHOLD_A, idempotencyKey: KEY_ONE, kind: 'counsel', ledgerId: LEDGER_A }, { consumeCounters }),
      reserveAiCall(fake.db, { householdId: HOUSEHOLD_A, idempotencyKey: KEY_TWO, kind: 'counsel', ledgerId: LEDGER_A }, { consumeCounters }),
    ])

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['cap_reached', 'reserved'])
    expect(fake.ledgers[0]!.aiEditsUsed).toBe(MAX_AI_EDITS_PER_LEDGER)
  })

  it('two concurrent callers on the last global slot produce exactly one success', async () => {
    const fake = createAiDbFake({
      households: [
        { id: HOUSEHOLD_A, aiPlansCreated: 0 },
        { id: HOUSEHOLD_B, aiPlansCreated: 0 },
      ],
      globalUsage: [
        {
          period: '2026-09',
          callsUsed: AI_GLOBAL_MONTHLY_CALL_CAP - 1,
          capCalls: AI_GLOBAL_MONTHLY_CALL_CAP,
          updatedAt: new Date(0),
        },
      ],
    })
    const consumeCounters = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })

    const outcomes = await Promise.all([
      reserveAiCall(fake.db, { householdId: HOUSEHOLD_A, idempotencyKey: KEY_ONE, kind: 'goal_plan' }, { consumeCounters }),
      reserveAiCall(fake.db, { householdId: HOUSEHOLD_B, idempotencyKey: KEY_TWO, kind: 'goal_plan' }, { consumeCounters }),
    ])

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['cap_reached', 'reserved'])
    expect(fake.globalUsage[0]!.callsUsed).toBe(AI_GLOBAL_MONTHLY_CALL_CAP)
  })
})
