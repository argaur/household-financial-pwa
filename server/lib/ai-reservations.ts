import { and, eq } from 'drizzle-orm'
import { aiCallReservations } from '../../drizzle/schema.js'
import type { db as Db } from './db.js'

/**
 * The atomic pre-call reservation D-024 item (b) makes a hard requirement.
 *
 * One row lands in `ai_call_reservations` **before** any outbound Anthropic
 * request, never after. `neon-http` has no interactive transactions, so the
 * guarantee cannot come from BEGIN/COMMIT — it comes from the composite UNIQUE
 * index on `(household_id, idempotency_key)` and, in step R3, from a single
 * conditional `UPDATE ... WHERE counter < cap` per counter. Neither alone is
 * sufficient: the unique index absorbs the double-tap and client-retry cases,
 * the conditional UPDATEs absorb the concurrent-tab case
 * (`Documentation/design/DATA_MODEL.md`, `ai_global_usage`).
 *
 * A conflict here is **expected traffic, not an error**. A user whose network
 * dropped mid-request retrying the same gesture is the normal case this table
 * exists for, and `SPEC.md` §G3 requires that retry to return the first call's
 * outcome and make no second call. Nothing in this module throws on that path,
 * logs on that path, or lets it reach a 500.
 */

export type AiCallKind = 'goal_plan' | 'counsel'
export type AiCapType = 'plans' | 'edits'
/** The three caps of D-024 decision 6 that a single call can trip. */
export type AiCapKind = AiCapType | 'global'

export type AiCallReservation = typeof aiCallReservations.$inferSelect

type AiReservationDb = Pick<typeof Db, 'select' | 'insert'>
type AiReservationStatusDb = Pick<typeof Db, 'update'>

/**
 * The two terminal states of `ai_call_reservations.status`. `reserved` is
 * deliberately absent: nothing may move a row *back* to in-flight.
 */
export type AiCallSettlement = 'completed' | 'failed'

/**
 * Which cap a reservation is taken against, decided here and never by the
 * client. A goal plan spends the per-household plans cap; a counsel card spends
 * the per-ledger edits cap. `cap_type` is a stored fact about the row rather
 * than something re-derived at read time, so a later change to this mapping
 * cannot silently rewrite what a past call consumed.
 */
const CAP_TYPE_BY_KIND: Record<AiCallKind, AiCapType> = {
  goal_plan: 'plans',
  counsel: 'edits',
}

export interface ReserveAiCallInput {
  householdId: string
  /** Client-supplied v4 UUID, one per user gesture. */
  idempotencyKey: string
  kind: AiCallKind
  /** Required for `counsel`, absent for `goal_plan`, which has no ledger yet. */
  ledgerId?: string | null
}

export type ConsumeAiCallCountersOutcome =
  | { status: 'consumed' }
  | { status: 'cap_reached'; capType: AiCapKind }

/**
 * **The seam step R3 fills.** The three conditional counter UPDATEs of
 * `DATA_MODEL.md`'s `ai_global_usage` section live behind this type and nowhere
 * else:
 *
 * ```
 * UPDATE households      SET ai_plans_created = ai_plans_created + 1 WHERE id = $1 AND ai_plans_created < 2 RETURNING ...
 * UPDATE ledgers         SET ai_edits_used    = ai_edits_used + 1    WHERE id = $1 AND ai_edits_used < 2    RETURNING ...
 * UPDATE ai_global_usage SET calls_used       = calls_used + 1       WHERE period = $1 AND calls_used < cap_calls RETURNING ...
 * ```
 *
 * Zero rows affected means the cap is reached, and that is the *only* permitted
 * shape. D-024 item (b) rules out read-check-increment in as many words, so
 * this module ships no placeholder implementation of this type — a placeholder
 * is exactly how the forbidden shape survives into the final code. The
 * dependency is required, not defaulted: until R3 supplies a real one, the only
 * callers are tests that pass their own.
 */
export type ConsumeAiCallCounters = (context: {
  reservation: AiCallReservation
  capType: AiCapType
}) => Promise<ConsumeAiCallCountersOutcome>

export interface ReserveAiCallDeps {
  consumeCounters: ConsumeAiCallCounters
}

export type ReserveAiCallOutcome =
  /** Row written, counters consumed. The caller may now make the outbound call. */
  | { status: 'reserved'; reservation: AiCallReservation }
  /** This gesture was already reserved. Return its outcome; make no second call. */
  | { status: 'duplicate'; reservation: AiCallReservation }
  /** A counter refused. The row stays; a consumed attempt stays consumed. */
  | { status: 'cap_reached'; capType: AiCapKind; reservation: AiCallReservation }

/**
 * Reads back the reservation a conflicting insert collided with.
 *
 * Scoped by household as well as key, which is what makes the lookup match the
 * index that rejected the insert. Filtering by key alone would let one
 * household read another's reservation row simply by guessing a UUID.
 */
async function findReservation(
  db: AiReservationDb,
  householdId: string,
  idempotencyKey: string,
): Promise<AiCallReservation | null> {
  const rows = await db
    .select()
    .from(aiCallReservations)
    .where(
      and(
        eq(aiCallReservations.householdId, householdId),
        eq(aiCallReservations.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

/**
 * Closes out a reservation, once, in one guarded statement.
 *
 * **The only write in this module that a counter does not accompany, and that
 * is the whole point of step R4.** A call that was authorised — row written,
 * counters already spent — and whose downstream provider request then failed
 * moves `reserved -> failed` and *nothing is given back*. There is no refund
 * argument, no `release`, and no "only on a genuine provider error" carve-out,
 * because the proxy cannot distinguish a genuine failure from a claimed one:
 * "it failed" arrives from the same client the cap exists to limit. Add a
 * decrement here and a client that reports every call as failed has unlimited
 * calls, which is the exact hole the reservation table exists to close
 * (`DATA_MODEL.md` §ai_call_reservations, resolved 2026-09-07 in the strict
 * direction). The cost is real — a user whose call fails loses one of two plans
 * — and it is answered in `COPY_DECK.md`, before the call, not by the schema.
 *
 * `WHERE status = 'reserved'` rather than an unguarded set, so a late or
 * duplicated report cannot drag a row a later step already moved: a `completed`
 * row stays completed, and a row R3's cap path already failed stays failed.
 * Zero rows affected is that guard refusing, and it is returned as `false`
 * rather than swallowed — a caller that needs to know its settlement lost a
 * race can ask. It is not an error: a duplicated settlement is ordinary traffic
 * on the same retry paths `reserveAiCall` already absorbs.
 *
 * Shared with `ai-counters.ts`, which reaches the same transition from the
 * cap-refused side. One statement, one guard, one place.
 */
export async function settleAiCallReservation(
  db: AiReservationStatusDb,
  input: { reservationId: string; status: AiCallSettlement },
): Promise<boolean> {
  const rows = await db
    .update(aiCallReservations)
    .set({ status: input.status })
    .where(and(eq(aiCallReservations.id, input.reservationId), eq(aiCallReservations.status, 'reserved')))
    .returning({ id: aiCallReservations.id })
  return rows.length > 0
}

/**
 * Takes the reservation for one AI call, or absorbs a repeat of one already
 * taken.
 *
 * Order is not negotiable and matches `SPEC.md` §G3's route behaviour: the row
 * is inserted first, the counters move second, the provider is called third by
 * the caller. A counter consumed before the row exists is a call nothing can
 * account for afterwards.
 *
 * `ON CONFLICT DO NOTHING` rather than a caught `23505`: the conflict is a
 * normal outcome of this statement, not an exception, and letting the driver
 * raise would mean every call site has to know a SQLSTATE to tell "already
 * reserved" from "the database is broken". Postgres returns zero rows here and
 * raises nothing, so an empty result *is* the signal, and it is read as one.
 * The target is named explicitly so the clause absorbs only this index —
 * an untargeted `DO NOTHING` would also swallow a primary-key or foreign-key
 * violation and hand back the same empty array.
 */
export async function reserveAiCall(
  db: AiReservationDb,
  input: ReserveAiCallInput,
  deps: ReserveAiCallDeps,
): Promise<ReserveAiCallOutcome> {
  const capType = CAP_TYPE_BY_KIND[input.kind]

  const [inserted] = await db
    .insert(aiCallReservations)
    .values({
      householdId: input.householdId,
      // Null for goal_plan by construction: that ledger does not exist until
      // the response comes back.
      ledgerId: input.kind === 'counsel' ? (input.ledgerId ?? null) : null,
      idempotencyKey: input.idempotencyKey,
      kind: input.kind,
      capType,
      // Left to the column default rather than written here, so the schema
      // stays the single place 'reserved' is defined as the starting state.
    })
    .onConflictDoNothing({
      target: [aiCallReservations.householdId, aiCallReservations.idempotencyKey],
    })
    .returning()

  if (!inserted) {
    // Absorbed, not failed. Someone already reserved this exact gesture, so the
    // answer is whatever their row now says — including a status it reached
    // after they wrote it. No counter moves, no provider call, no log line.
    const existing = await findReservation(db, input.householdId, input.idempotencyKey)
    if (!existing) {
      // Genuinely unreachable through the composite index: the insert was
      // rejected for a duplicate, so the duplicate exists. Reaching this means
      // the row was deleted between the two statements (a household cascade
      // delete is the only path that does that), which is a real fault and must
      // not be dressed up as a successful reservation.
      throw new Error('Reservation conflicted but the conflicting row could not be read back')
    }
    return { status: 'duplicate', reservation: existing }
  }

  const counters = await deps.consumeCounters({ reservation: inserted, capType })
  if (counters.status === 'cap_reached') {
    // The row is deliberately left in place. D-024 item (b) as resolved: a
    // consumed attempt stays consumed, because "it did not go through" is a
    // claim the client makes. Moving this row's status is step R4's job.
    return { status: 'cap_reached', capType: counters.capType, reservation: inserted }
  }

  return { status: 'reserved', reservation: inserted }
}
