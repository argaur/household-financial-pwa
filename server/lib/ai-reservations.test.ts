import { describe, it, expect, vi, afterEach } from 'vitest'
import { createAiDbFake, type AiReservationRow } from '../test-helpers/ai-db-fake.js'
import { reserveAiCall, type ConsumeAiCallCounters } from './ai-reservations.js'

/**
 * Step R2 of Chunk R (D-024 item (b)): the reservation insert and its
 * idempotency absorption.
 *
 * What is actually being pinned here is a *cost* guarantee, not a data one. The
 * reservation row is the only thing standing between a double-tapped button and
 * a second billed Anthropic call, and `neon-http` has no transactions, so the
 * guarantee has to live in the composite UNIQUE on
 * `(household_id, idempotency_key)` and nowhere else. Every test below fails
 * loudly if that constraint stops being the mechanism.
 *
 * The counter UPDATEs are step R3 and are deliberately absent. They enter here
 * only as `consumeCounters`, the injected seam, which lets these tests count
 * downstream invocations instead of inferring them from a return value.
 */

const HOUSEHOLD_A = '11111111-1111-4111-8111-111111111111'
const HOUSEHOLD_B = '22222222-2222-4222-8222-222222222222'
const LEDGER_A = 'aaaaaaaa-1111-4111-8111-111111111111'
const KEY = '99999999-9999-4999-8999-999999999999'

/** Stand-in for R3's real counter step. Always succeeds unless a test says otherwise. */
function allowingCounters() {
  return vi.fn<ConsumeAiCallCounters>(async () => ({ status: 'consumed' }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('reserveAiCall — the first call', () => {
  it('writes exactly one reservation row, reserved, for a goal_plan call', async () => {
    const fake = createAiDbFake()
    const consumeCounters = allowingCounters()

    const outcome = await reserveAiCall(fake.db, { householdId: HOUSEHOLD_A, idempotencyKey: KEY, kind: 'goal_plan' }, { consumeCounters })

    expect(outcome.status).toBe('reserved')
    expect(fake.reservations).toHaveLength(1)
    expect(fake.counts.inserts).toBe(1)
    const row = fake.reservations[0]!
    expect(row.status).toBe('reserved')
    expect(row.kind).toBe('goal_plan')
    // A goal_plan call consumes the per-household plans cap...
    expect(row.capType).toBe('plans')
    // ...and has no ledger yet, because a goal plan mints its ledger only after
    // the response arrives. Null, never undefined and never a placeholder id.
    expect(row.ledgerId).toBeNull()
    expect(row.householdId).toBe(HOUSEHOLD_A)
    expect(row.idempotencyKey).toBe(KEY)
  })

  it('records the target ledger and the edits cap for a counsel call', async () => {
    const fake = createAiDbFake()
    const consumeCounters = allowingCounters()

    await reserveAiCall(
      fake.db,
      { householdId: HOUSEHOLD_A, idempotencyKey: KEY, kind: 'counsel', ledgerId: LEDGER_A },
      { consumeCounters },
    )

    const row = fake.reservations[0]!
    expect(row.kind).toBe('counsel')
    expect(row.capType).toBe('edits')
    expect(row.ledgerId).toBe(LEDGER_A)
  })

  it('runs the counter step exactly once, after the row exists', async () => {
    const fake = createAiDbFake()
    const seen: number[] = []
    const consumeCounters = vi.fn<ConsumeAiCallCounters>(async () => {
      // The reservation must already be durable when the counters move. The
      // SPEC's route order is insert, then counters, then Anthropic — a counter
      // consumed against a row that does not exist yet is a leaked call.
      seen.push(fake.reservations.length)
      return { status: 'consumed' }
    })

    await reserveAiCall(fake.db, { householdId: HOUSEHOLD_A, idempotencyKey: KEY, kind: 'goal_plan' }, { consumeCounters })

    expect(consumeCounters).toHaveBeenCalledTimes(1)
    expect(seen).toEqual([1])
  })

  it('reports a cap the counter step refused, without inventing its own', async () => {
    const fake = createAiDbFake()
    const consumeCounters = vi.fn<ConsumeAiCallCounters>(async () => ({ status: 'cap_reached', capType: 'global' }))

    const outcome = await reserveAiCall(fake.db, { householdId: HOUSEHOLD_A, idempotencyKey: KEY, kind: 'goal_plan' }, { consumeCounters })

    expect(outcome).toMatchObject({ status: 'cap_reached', capType: 'global' })
    // The row still exists. A refused reservation is not deleted: D-024 item (b)
    // as resolved says a consumed attempt stays consumed, and R4 owns moving
    // this row's status.
    expect(fake.reservations).toHaveLength(1)
  })
})

describe('reserveAiCall — the same key a second time', () => {
  it('inserts no second row and returns the first call\'s outcome', async () => {
    const fake = createAiDbFake()
    const consumeCounters = allowingCounters()
    const input = { householdId: HOUSEHOLD_A, idempotencyKey: KEY, kind: 'goal_plan' as const }

    const first = await reserveAiCall(fake.db, input, { consumeCounters })
    const second = await reserveAiCall(fake.db, input, { consumeCounters })

    expect(fake.reservations).toHaveLength(1)
    expect(fake.counts.inserts).toBe(1)
    expect(fake.counts.conflicts).toBe(1)
    expect(second.status).toBe('duplicate')
    expect(second.reservation.id).toBe(first.reservation.id)
  })

  it('makes zero downstream counter calls', async () => {
    const fake = createAiDbFake()
    const consumeCounters = allowingCounters()
    const input = { householdId: HOUSEHOLD_A, idempotencyKey: KEY, kind: 'goal_plan' as const }

    await reserveAiCall(fake.db, input, { consumeCounters })
    expect(consumeCounters).toHaveBeenCalledTimes(1)

    await reserveAiCall(fake.db, input, { consumeCounters })
    await reserveAiCall(fake.db, input, { consumeCounters })

    // Still one. Three user gestures with one idempotency key bill once.
    expect(consumeCounters).toHaveBeenCalledTimes(1)
  })

  it('replays the stored row, not a freshly built one', async () => {
    // The row a retry finds may have moved on since it was written. The replay
    // has to hand back what the database holds, or the client is told its call
    // is still in flight when it has already completed.
    const existing: AiReservationRow = {
      id: 'reservation-already-there',
      householdId: HOUSEHOLD_A,
      ledgerId: LEDGER_A,
      idempotencyKey: KEY,
      kind: 'counsel',
      capType: 'edits',
      status: 'completed',
      createdAt: new Date(0),
    }
    const fake = createAiDbFake({ reservations: [existing] })
    const consumeCounters = allowingCounters()

    const outcome = await reserveAiCall(
      fake.db,
      { householdId: HOUSEHOLD_A, idempotencyKey: KEY, kind: 'counsel', ledgerId: LEDGER_A },
      { consumeCounters },
    )

    expect(outcome.status).toBe('duplicate')
    expect(outcome.reservation).toMatchObject({ id: 'reservation-already-there', status: 'completed' })
    expect(consumeCounters).not.toHaveBeenCalled()
  })

  it('is not an error surface: nothing thrown, nothing logged as an error', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnLog = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = createAiDbFake()
    const consumeCounters = allowingCounters()
    const input = { householdId: HOUSEHOLD_A, idempotencyKey: KEY, kind: 'goal_plan' as const }

    await reserveAiCall(fake.db, input, { consumeCounters })
    await expect(reserveAiCall(fake.db, input, { consumeCounters })).resolves.toMatchObject({ status: 'duplicate' })

    expect(errorLog).not.toHaveBeenCalled()
    expect(warnLog).not.toHaveBeenCalled()
  })
})

describe('reserveAiCall — the constraint is composite', () => {
  it('lets a different household use the same idempotency key', async () => {
    const fake = createAiDbFake()
    const consumeCounters = allowingCounters()

    const first = await reserveAiCall(fake.db, { householdId: HOUSEHOLD_A, idempotencyKey: KEY, kind: 'goal_plan' }, { consumeCounters })
    const second = await reserveAiCall(fake.db, { householdId: HOUSEHOLD_B, idempotencyKey: KEY, kind: 'goal_plan' }, { consumeCounters })

    // Two independent reservations. A key minted by one household must never be
    // able to suppress another household's call — that would be a cross-tenant
    // denial of service costing nothing to mount.
    expect(first.status).toBe('reserved')
    expect(second.status).toBe('reserved')
    expect(fake.reservations).toHaveLength(2)
    expect(fake.counts.conflicts).toBe(0)
    expect(consumeCounters).toHaveBeenCalledTimes(2)
  })

  it('replays the calling household\'s row when two households share a key', async () => {
    // The read-back after a conflict is scoped by household as well as key. If
    // it filtered on the key alone, one household could read another's
    // reservation by guessing a UUID — and would be handed a row describing a
    // ledger it does not own.
    const rows: AiReservationRow[] = [
      {
        id: 'reservation-household-b',
        householdId: HOUSEHOLD_B,
        ledgerId: null,
        idempotencyKey: KEY,
        kind: 'goal_plan',
        capType: 'plans',
        status: 'failed',
        createdAt: new Date(0),
      },
      {
        id: 'reservation-household-a',
        householdId: HOUSEHOLD_A,
        ledgerId: null,
        idempotencyKey: KEY,
        kind: 'goal_plan',
        capType: 'plans',
        status: 'completed',
        createdAt: new Date(1000),
      },
    ]
    const fake = createAiDbFake({ reservations: rows })
    const consumeCounters = allowingCounters()

    const outcome = await reserveAiCall(fake.db, { householdId: HOUSEHOLD_A, idempotencyKey: KEY, kind: 'goal_plan' }, { consumeCounters })

    expect(outcome).toMatchObject({ status: 'duplicate' })
    expect(outcome.reservation.id).toBe('reservation-household-a')
    expect(consumeCounters).not.toHaveBeenCalled()
  })
})
