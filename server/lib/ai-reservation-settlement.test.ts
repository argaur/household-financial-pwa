import { describe, it, expect } from 'vitest'
import { createAiDbFake, type AiDbFake } from '../test-helpers/ai-db-fake.js'
import { reserveAiCall, settleAiCallReservation, type ReserveAiCallOutcome } from './ai-reservations.js'
import {
  createAiCallCounterConsumer,
  MAX_AI_PLANS_PER_HOUSEHOLD,
  MAX_AI_EDITS_PER_LEDGER,
} from './ai-counters.js'
import { AI_GLOBAL_MONTHLY_CALL_CAP } from './ai-usage.js'

/**
 * Step R4 of Chunk R (D-024 item (b)): **a failed call does not release its
 * reservation.**
 *
 * R3 covers the other transition and the two must not be confused: R3 is a cap
 * refusing a call *before* it goes out, R4 is a call that was authorised —
 * row written, counters already spent — whose downstream provider request then
 * failed. Neither refunds anything.
 *
 * `DATA_MODEL.md` answers this in the strict direction and says why in as many
 * words: *"Releasing on failure reintroduces the exact hole the reservation
 * exists to close, because 'failure' is client-reported and a client that
 * reports every call as failed gets unlimited calls. The counter is the cost
 * control and it must be un-gameable, not fair."* The proxy cannot tell a
 * genuine provider error from a claimed one, so there is no carve-out to write
 * even if someone wanted one.
 *
 * **These tests assert counter values, never "no refund method was called".**
 * A refund is a write, so the only honest proof it did not happen is the number
 * in the row afterwards. The discriminating case is `exhausts its cap even when
 * every call is reported as failed` below: inserting any decrement on the
 * failure path turns it red, because the third attempt starts succeeding.
 */

const HOUSEHOLD_A = '11111111-1111-4111-8111-111111111111'
const LEDGER_A = 'aaaaaaaa-1111-4111-8111-111111111111'
const KEYS = [
  '99999999-9999-4999-8999-999999999991',
  '99999999-9999-4999-8999-999999999992',
  '99999999-9999-4999-8999-999999999993',
]

const SEPTEMBER = () => new Date('2026-09-10T12:00:00Z')

/**
 * One whole attempt with a downstream call that fails: reserve, spend the
 * counters, make the outbound request, have it blow up, settle the row.
 *
 * Written as the route will be written rather than as a direct call to the
 * settle helper, because "the client said it failed" is the entire threat model
 * here and a test that skipped the reserve step would not be testing it.
 */
async function attemptWithFailingDownstream(
  fake: AiDbFake,
  idempotencyKey: string,
  kind: 'goal_plan' | 'counsel' = 'goal_plan',
): Promise<ReserveAiCallOutcome> {
  const consumeCounters = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })
  const outcome = await reserveAiCall(
    fake.db,
    {
      householdId: HOUSEHOLD_A,
      idempotencyKey,
      kind,
      ledgerId: kind === 'counsel' ? LEDGER_A : null,
    },
    { consumeCounters },
  )

  if (outcome.status === 'reserved') {
    // The provider call would go here, and it threw.
    await settleAiCallReservation(fake.db, {
      reservationId: outcome.reservation.id,
      status: 'failed',
    })
  }

  return outcome
}

describe('a downstream failure after a successful reservation', () => {
  it('moves the reservation to failed and leaves the household plans counter spent', async () => {
    const fake = createAiDbFake({ households: [{ id: HOUSEHOLD_A, aiPlansCreated: 0 }] })

    const outcome = await attemptWithFailingDownstream(fake, KEYS[0]!)

    expect(outcome.status).toBe('reserved')
    expect(fake.reservations).toHaveLength(1)
    expect(fake.reservations[0]!.status).toBe('failed')
    // The point of the step. Post-consumption values, unchanged.
    expect(fake.households[0]!.aiPlansCreated).toBe(1)
    expect(fake.globalUsage[0]!.callsUsed).toBe(1)
  })

  it('leaves the per-ledger edits counter spent', async () => {
    const fake = createAiDbFake({ ledgers: [{ id: LEDGER_A, aiEditsUsed: 0 }] })

    await attemptWithFailingDownstream(fake, KEYS[0]!, 'counsel')

    expect(fake.reservations[0]!.status).toBe('failed')
    expect(fake.ledgers[0]!.aiEditsUsed).toBe(1)
  })

  it('does not refund the global monthly breaker', async () => {
    const fake = createAiDbFake({
      households: [{ id: HOUSEHOLD_A, aiPlansCreated: 0 }],
      globalUsage: [
        {
          period: '2026-09',
          callsUsed: AI_GLOBAL_MONTHLY_CALL_CAP - 1,
          capCalls: AI_GLOBAL_MONTHLY_CALL_CAP,
          updatedAt: new Date(0),
        },
      ],
    })

    await attemptWithFailingDownstream(fake, KEYS[0]!)

    // The month is now spent, by a call that never produced anything. That is
    // the documented cost, not a bug to be smoothed over: the breaker counts
    // calls that were authorised, and this one was.
    expect(fake.globalUsage[0]!.callsUsed).toBe(AI_GLOBAL_MONTHLY_CALL_CAP)
    expect(fake.reservations[0]!.status).toBe('failed')
  })

  it('exhausts its cap even when every call is reported as failed', async () => {
    // The heart of R4. A client that claims every call failed must still run out
    // of calls, or the reservation table is decoration. Three sequential
    // attempts against a cap of two: two authorised-then-failed, one refused.
    const fake = createAiDbFake({ households: [{ id: HOUSEHOLD_A, aiPlansCreated: 0 }] })

    const outcomes: ReserveAiCallOutcome[] = []
    for (const key of KEYS) {
      outcomes.push(await attemptWithFailingDownstream(fake, key))
    }

    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'reserved',
      'reserved',
      'cap_reached',
    ])
    expect(outcomes[2]).toMatchObject({ status: 'cap_reached', capType: 'plans' })

    // Never 0 (a refund on every failure), never 1 (a refund on one of them).
    expect(fake.households[0]!.aiPlansCreated).toBe(MAX_AI_PLANS_PER_HOUSEHOLD)
    expect(fake.households[0]!.aiPlansCreated).toBe(2)
    // Two calls were authorised and went out; the third never did.
    expect(fake.globalUsage[0]!.callsUsed).toBe(2)
    expect(fake.reservations).toHaveLength(3)
    expect(fake.reservations.map((row) => row.status)).toEqual(['failed', 'failed', 'failed'])
  })

  it('exhausts a ledger edits cap the same way', async () => {
    const fake = createAiDbFake({ ledgers: [{ id: LEDGER_A, aiEditsUsed: 0 }] })

    const outcomes: ReserveAiCallOutcome[] = []
    for (const key of KEYS) {
      outcomes.push(await attemptWithFailingDownstream(fake, key, 'counsel'))
    }

    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'reserved',
      'reserved',
      'cap_reached',
    ])
    expect(fake.ledgers[0]!.aiEditsUsed).toBe(MAX_AI_EDITS_PER_LEDGER)
  })
})

describe('settleAiCallReservation', () => {
  it('moves a reserved row to completed when the call succeeded', async () => {
    // So that `failed` is a real transition and not the only terminal state the
    // code can reach.
    const fake = createAiDbFake({ households: [{ id: HOUSEHOLD_A, aiPlansCreated: 0 }] })
    const consumeCounters = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })
    const outcome = await reserveAiCall(
      fake.db,
      { householdId: HOUSEHOLD_A, idempotencyKey: KEYS[0]!, kind: 'goal_plan' },
      { consumeCounters },
    )
    if (outcome.status !== 'reserved') throw new Error('expected a reservation')

    const moved = await settleAiCallReservation(fake.db, {
      reservationId: outcome.reservation.id,
      status: 'completed',
    })

    expect(moved).toBe(true)
    expect(fake.reservations[0]!.status).toBe('completed')
    expect(fake.households[0]!.aiPlansCreated).toBe(1)
  })

  it('cannot drag a completed row back to failed', async () => {
    // The guard is `status = 'reserved'`. A late failure report arriving after
    // the response was already relayed must not rewrite history — and must not
    // be reported to its caller as though it had.
    const fake = createAiDbFake({ households: [{ id: HOUSEHOLD_A, aiPlansCreated: 0 }] })
    const consumeCounters = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })
    const outcome = await reserveAiCall(
      fake.db,
      { householdId: HOUSEHOLD_A, idempotencyKey: KEYS[0]!, kind: 'goal_plan' },
      { consumeCounters },
    )
    if (outcome.status !== 'reserved') throw new Error('expected a reservation')

    await settleAiCallReservation(fake.db, {
      reservationId: outcome.reservation.id,
      status: 'completed',
    })
    const moved = await settleAiCallReservation(fake.db, {
      reservationId: outcome.reservation.id,
      status: 'failed',
    })

    expect(moved).toBe(false)
    expect(fake.reservations[0]!.status).toBe('completed')
  })

  it('cannot settle a row a cap already failed, and does not re-run its counters', async () => {
    const fake = createAiDbFake({
      households: [{ id: HOUSEHOLD_A, aiPlansCreated: MAX_AI_PLANS_PER_HOUSEHOLD }],
    })
    const consumeCounters = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })
    const outcome = await reserveAiCall(
      fake.db,
      { householdId: HOUSEHOLD_A, idempotencyKey: KEYS[0]!, kind: 'goal_plan' },
      { consumeCounters },
    )
    if (outcome.status !== 'cap_reached') throw new Error('expected a refused reservation')

    const moved = await settleAiCallReservation(fake.db, {
      reservationId: outcome.reservation.id,
      status: 'completed',
    })

    expect(moved).toBe(false)
    expect(fake.reservations[0]!.status).toBe('failed')
    expect(fake.households[0]!.aiPlansCreated).toBe(MAX_AI_PLANS_PER_HOUSEHOLD)
  })

  it('leaves another household reservation alone', async () => {
    const fake = createAiDbFake({
      households: [{ id: HOUSEHOLD_A, aiPlansCreated: 0 }],
    })

    await attemptWithFailingDownstream(fake, KEYS[0]!)
    const first = fake.reservations[0]!

    const consumeCounters = createAiCallCounterConsumer(fake.db, { now: SEPTEMBER })
    const second = await reserveAiCall(
      fake.db,
      { householdId: HOUSEHOLD_A, idempotencyKey: KEYS[1]!, kind: 'goal_plan' },
      { consumeCounters },
    )
    if (second.status !== 'reserved') throw new Error('expected a reservation')

    await settleAiCallReservation(fake.db, {
      reservationId: second.reservation.id,
      status: 'completed',
    })

    expect(first.status).toBe('failed')
    expect(fake.reservations[1]!.status).toBe('completed')
  })
})
