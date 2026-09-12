import { and, eq, lt, sql } from 'drizzle-orm'
import { aiGlobalUsage, households, ledgers } from '../../drizzle/schema.js'
import { AI_GLOBAL_MONTHLY_CALL_CAP } from './ai-usage.js'
import { settleAiCallReservation } from './ai-reservations.js'
import type {
  AiCapKind,
  AiCapType,
  AiCallReservation,
  ConsumeAiCallCounters,
  ConsumeAiCallCountersOutcome,
} from './ai-reservations.js'
import type { db as Db } from './db.js'

/**
 * The three conditional counter UPDATEs of D-024 item (b), and the only place
 * in the codebase a cap is enforced.
 *
 * **Shape, not policy, is what this module is for.** Every counter moves by a
 * single statement of the form
 *
 * ```
 * UPDATE <table> SET <counter> = <counter> + 1 WHERE <key> = $1 AND <counter> < <cap> RETURNING <counter>
 * ```
 *
 * and a cap is reported **only** by that statement affecting zero rows. There is
 * no `SELECT` of a counter anywhere in this file, and there must never be one.
 * `neon-http` has no interactive transactions, so read-check-increment is not a
 * slower way of doing the same thing, it is a different and broken thing: two
 * tabs, a double tap, or a client retry all read the same value and both write
 * back, and the cap — which D-016 says is the entire cost-control mechanism —
 * stops existing. `server/test-helpers/ai-db-fake.ts` is built specifically so
 * that substitution turns the concurrency tests red.
 *
 * ## The ordering trade-off, stated rather than papered over
 *
 * A call spends two counters: its per-entity cap (household plans, or ledger
 * edits) and the global monthly breaker. They are two statements and there is no
 * transaction, so one moves first, and whichever moves first can be spent on a
 * call the second one then refuses.
 *
 * **Chosen: per-entity first, global second.** The cost is real and bounded: at
 * the exact moment the monthly breaker trips, the requesting household loses one
 * of its own plans (or one of a ledger's edits) for a call that never went out.
 * Nothing refunds it.
 *
 * Why this direction:
 *
 * - **The loss lands on the requester, not on everyone.** The reverse order
 *   burns a slot out of the 50 shared by every household, so one refused call
 *   would push the whole product closer to a tripped breaker and show every
 *   other user a monthly-limit message they did not cause.
 * - **It cannot falsely close the breaker.** `calls_used` only ever moves for a
 *   call the per-entity cap already allowed, which keeps the global row an
 *   honest record of calls that were actually authorised.
 * - **It matches the standing direction.** D-024's resolution of 2026-09-07 is
 *   that a failed call does not refund its reservation, because "it failed" is a
 *   claim the client makes. Consistency with that strict rule was ruled to
 *   matter more than fairness in the rare tie.
 *
 * The window is narrow — it opens only on the single call that finds the breaker
 * already at its cap — but it is not zero, and it is a product-visible cost. It
 * is asserted directly in `ai-counters.test.ts` under "cap ordering, the
 * documented cost", so nobody can quietly reverse it later.
 *
 * ## Why the reservation is marked `failed` here
 *
 * A refused counter means no provider call will happen, and the row written a
 * moment earlier would otherwise sit at `reserved` forever. The transition runs
 * through `settleAiCallReservation` in `ai-reservations.ts`, the same guarded
 * statement step R4 uses when an *authorised* call fails downstream. Two
 * different reasons, one transition, one guard. Neither path refunds a counter.
 */

/**
 * Per-household goal plans, and per-ledger counsel edits. Both are 2
 * (`DATA_MODEL.md`'s `... < 2` literals, from the D-016 cap).
 *
 * Named rather than inlined, following `MAX_LEDGER_HOLDINGS` in
 * `server/lib/ledgers.ts`: a bare `2` inside a `WHERE` clause is unreadable and
 * un-greppable, and these two values will be argued about again.
 */
export const MAX_AI_PLANS_PER_HOUSEHOLD = 2
export const MAX_AI_EDITS_PER_LEDGER = 2

/**
 * The `ai_global_usage.period` key for an instant: `YYYY-MM` in **UTC**.
 *
 * UTC and not local time, because the server runs on Vercel Edge while this
 * project is developed in IST, and a breaker whose month rolls over at whichever
 * midnight the runtime happens to believe in is a breaker nobody can reason
 * about.
 */
export function aiUsagePeriod(now: Date): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${now.getUTCFullYear()}-${month}`
}

type AiCounterDb = Pick<typeof Db, 'insert' | 'update'>

export interface AiCallCounterOptions {
  /** Injectable so the period boundary is testable without touching the clock. */
  now?: () => Date
}

/**
 * Builds the `consumeCounters` dependency `reserveAiCall` requires.
 *
 * A factory rather than a bare function because the database handle and the
 * clock are the only things that vary, and binding them once keeps the call site
 * in the route free of both.
 */
export function createAiCallCounterConsumer(
  db: AiCounterDb,
  options: AiCallCounterOptions = {},
): ConsumeAiCallCounters {
  const now = options.now ?? (() => new Date())

  /**
   * The per-entity statement. One row affected means consumed; zero means the
   * cap is reached, and that is the entire test.
   */
  async function consumePerEntity(
    reservation: AiCallReservation,
    capType: AiCapType,
  ): Promise<boolean> {
    if (capType === 'plans') {
      const rows = await db
        .update(households)
        .set({ aiPlansCreated: sql`${households.aiPlansCreated} + 1` })
        .where(
          and(
            eq(households.id, reservation.householdId),
            lt(households.aiPlansCreated, MAX_AI_PLANS_PER_HOUSEHOLD),
          ),
        )
        .returning({ aiPlansCreated: households.aiPlansCreated })
      return rows.length > 0
    }

    if (!reservation.ledgerId) {
      // Not a cap outcome and must not be reported as one. A counsel
      // reservation with no ledger has no counter to spend, and treating that as
      // "consumed" would let a malformed request buy an uncapped provider call.
      throw new Error('An edits reservation must carry a ledger to charge the cap against')
    }

    const rows = await db
      .update(ledgers)
      .set({ aiEditsUsed: sql`${ledgers.aiEditsUsed} + 1` })
      .where(and(eq(ledgers.id, reservation.ledgerId), lt(ledgers.aiEditsUsed, MAX_AI_EDITS_PER_LEDGER)))
      .returning({ aiEditsUsed: ledgers.aiEditsUsed })
    return rows.length > 0
  }

  /**
   * The global statement, plus the lazy creation of the month's row.
   *
   * The insert runs unconditionally first, rather than only after an update
   * finds nothing. Two statements either way, but this order needs no retry
   * branch, and the retry branch is where a race would hide: `ON CONFLICT DO
   * NOTHING` on the `period` primary key means two concurrent first-calls-of-the
   * -month leave exactly one row and raise nothing, and each then increments it
   * once, so neither a duplicate row nor a lost increment is possible.
   *
   * `cap_calls` is seeded from the server constant **only here, at creation**.
   * The predicate compares `calls_used` against the row's own `cap_calls`, never
   * against the constant, so raising the cap later cannot retroactively reopen a
   * past month (`DATA_MODEL.md` §ai_global_usage).
   */
  async function consumeGlobal(): Promise<boolean> {
    const period = aiUsagePeriod(now())

    await db
      .insert(aiGlobalUsage)
      .values({ period, capCalls: AI_GLOBAL_MONTHLY_CALL_CAP })
      .onConflictDoNothing({ target: aiGlobalUsage.period })
      .returning({ period: aiGlobalUsage.period })

    const rows = await db
      .update(aiGlobalUsage)
      .set({ callsUsed: sql`${aiGlobalUsage.callsUsed} + 1`, updatedAt: now() })
      .where(and(eq(aiGlobalUsage.period, period), lt(aiGlobalUsage.callsUsed, aiGlobalUsage.capCalls)))
      .returning({ callsUsed: aiGlobalUsage.callsUsed })
    return rows.length > 0
  }

  return async ({ reservation, capType }): Promise<ConsumeAiCallCountersOutcome> => {
    const capReached = async (kind: AiCapKind): Promise<ConsumeAiCallCountersOutcome> => {
      // The same guarded transition step R4 uses from the downstream-failure
      // side, not a second copy of it. Both arrive at `reserved -> failed`, both
      // must be blocked by a status a later step already moved, and a second
      // statement would only be a second place for the guard to be dropped.
      await settleAiCallReservation(db, { reservationId: reservation.id, status: 'failed' })
      return { status: 'cap_reached', capType: kind }
    }

    if (!(await consumePerEntity(reservation, capType))) return capReached(capType)
    if (!(await consumeGlobal())) return capReached('global')

    return { status: 'consumed' }
  }
}
