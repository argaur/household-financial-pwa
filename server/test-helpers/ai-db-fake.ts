/**
 * A purpose-built in-memory stand-in for the `neon-http` Drizzle client, for
 * the D-024 AI cost-control tables only (`ai_call_reservations`,
 * `ai_global_usage`).
 *
 * Why not reuse the hand-rolled fakes in `server/*.integration.test.ts`: those
 * model `select`, `insert` and `delete` well enough for the routes they cover,
 * but their `update()` is a bare stub that returns `[]` and models nothing, and
 * none of them models a UNIQUE constraint at all. Chunk R exists to prove the
 * cost-control mechanism *before* any Anthropic call is written, and every
 * guarantee it rests on is a database guarantee: a composite unique index, and
 * (in step R3) a conditional `UPDATE ... WHERE counter < cap` that either
 * affects one row or zero. A fake that does not model those proves nothing.
 *
 * Two properties are modelled deliberately and are the whole point:
 *
 * 1. **The composite UNIQUE on `(household_id, idempotency_key)` behaves the
 *    way Postgres behaves.** `server/lib/ai-reservations.ts` writes its insert
 *    as `.onConflictDoNothing({ target: [...] })`, and against a real Postgres
 *    that statement returns **zero rows** on a conflict rather than raising
 *    SQLSTATE 23505. This fake returns an empty array for exactly that case.
 *    It deliberately does *not* invent some bespoke error shape: a fake that
 *    throws where production returns `[]` passes the test and ships the bug.
 *    If the implementation is ever changed to catch the error instead of
 *    absorbing it with `ON CONFLICT`, this fake must change with it, to throw
 *    an error carrying `code: '23505'` and the real `constraint` name — which
 *    is what `@neondatabase/serverless` surfaces.
 *
 * 2. **`select` is genuinely asynchronous.** Every read is a network round trip
 *    over HTTP in production. The fake defers with a macrotask so a replay path
 *    that only works because a promise happened to resolve synchronously cannot
 *    pass here.
 *
 * 3. **`update()` is atomic the way one Postgres statement is atomic (R3).**
 *    This is the property the whole of step R3 rests on, and it is the easiest
 *    one to fake wrongly. A single `UPDATE ... SET c = c + 1 WHERE c < cap
 *    RETURNING c` evaluates its predicate and applies its write with nothing
 *    else able to interleave; only the *result* travels back over the network.
 *    So the arm below does predicate-plus-mutation-plus-projection in one
 *    synchronous critical section and defers only the resolution, by a
 *    macrotask, exactly like `select`. That asymmetry is deliberate and is what
 *    gives the tests teeth: a read-check-increment implementation has to await
 *    an async `select` between reading and writing, so a second concurrent
 *    caller genuinely slips into the gap and the lost update is observable.
 *    Make `select` synchronous and every concurrency test here silently becomes
 *    vacuous — both the correct and the forbidden shape would pass.
 *
 *    Zero rows returned is the cap being reached, and it is the only cap signal
 *    the implementation is allowed to read.
 */
import { PgDialect } from 'drizzle-orm/pg-core'
// Imported as a value, not a type: `applySet` needs `instanceof SQL` to tell an
// increment expression from a literal assignment.
import { SQL, getTableName } from 'drizzle-orm'
import {
  aiCallReservations,
  aiGlobalUsage,
  // Aliased: `createAiDbFake` holds local arrays of the same two names, and a
  // shadowed table reference would silently break every `table === ...` check.
  households as householdsTable,
  ledgers as ledgersTable,
} from '../../drizzle/schema.js'

export interface AiReservationRow {
  id: string
  householdId: string
  ledgerId: string | null
  idempotencyKey: string
  kind: 'goal_plan' | 'counsel'
  capType: 'plans' | 'edits'
  status: 'reserved' | 'completed' | 'failed'
  createdAt: Date
}

export interface AiGlobalUsageRow {
  period: string
  callsUsed: number
  capCalls: number
  updatedAt: Date
}

/**
 * Only the two fields R3 touches. `households` carries far more in the real
 * schema; modelling the rest here would invite a test to assert something this
 * fake is not entitled to speak for.
 */
export interface AiHouseholdRow {
  id: string
  aiPlansCreated: number
  /**
   * The tenancy column. Added for A3, whose route resolves the household from
   * the session through `getHouseholdForOwner` rather than being handed one.
   * Optional so every Chunk R test that seeds a household without it still
   * compiles; a row without it simply matches no owner lookup.
   */
  ownerUserId?: string
}

export interface AiLedgerRow {
  id: string
  aiEditsUsed: number
  /** Tenancy, for the same reason as `ownerUserId` above. */
  householdId?: string
  isBaseline?: boolean
}

/** One write this fake actually applied, so "no other table is touched" is checkable. */
export interface AiDbFakeWrite {
  operation: 'insert' | 'update'
  /** SQL table name, read off the Drizzle table object. */
  table: string
  /** Column names the statement set. Empty for an insert. */
  columns: string[]
}

/** Counters the tests assert on, so "no second write" is a number, not a vibe. */
export interface AiDbFakeCounts {
  selects: number
  inserts: number
  /** Inserts the composite unique index rejected. Expected traffic, not errors. */
  conflicts: number
  /** Conditional counter UPDATEs issued, whether or not they affected a row. */
  updates: number
  /**
   * Every insert and update in order. A5 asserts against this that the proxy
   * writes nothing to Neon beyond the reservation row, its status, and the
   * cost-control counters — so a future change that stashed a request or a
   * response anywhere would show up here as an extra table or an extra column.
   */
  writes: AiDbFakeWrite[]
}

export interface AiDbFake {
  /** Pass to the module under test. Typed `never` — the repo idiom for these fakes. */
  db: never
  reservations: AiReservationRow[]
  globalUsage: AiGlobalUsageRow[]
  households: AiHouseholdRow[]
  ledgers: AiLedgerRow[]
  counts: AiDbFakeCounts
}

const RESERVATION_FIELDS: Record<string, keyof AiReservationRow> = {
  id: 'id',
  household_id: 'householdId',
  ledger_id: 'ledgerId',
  idempotency_key: 'idempotencyKey',
  kind: 'kind',
  cap_type: 'capType',
  status: 'status',
  created_at: 'createdAt',
}

const GLOBAL_USAGE_FIELDS: Record<string, keyof AiGlobalUsageRow> = {
  period: 'period',
  calls_used: 'callsUsed',
  cap_calls: 'capCalls',
  updated_at: 'updatedAt',
}

const HOUSEHOLD_FIELDS: Record<string, keyof AiHouseholdRow> = {
  id: 'id',
  ai_plans_created: 'aiPlansCreated',
  owner_user_id: 'ownerUserId',
}

const LEDGER_FIELDS: Record<string, keyof AiLedgerRow> = {
  id: 'id',
  ai_edits_used: 'aiEditsUsed',
  household_id: 'householdId',
  is_baseline: 'isBaseline',
}

const dialect = new PgDialect()

/**
 * Turns a real Drizzle `eq(...)` / `and(eq(...), eq(...))` condition into
 * `[columnName, value]` pairs, by rendering it through Drizzle's own Postgres
 * dialect and reading the column names back out of the generated SQL.
 *
 * The alternative the older fakes use is `vi.mock('drizzle-orm')` to replace
 * `eq`/`and` with tagged objects. That works, but it means the test never
 * exercises the real condition builders, and every consumer of the fake has to
 * repeat the mock. Going through `sqlToQuery` keeps the production call sites
 * untouched.
 *
 * Throws rather than returning an empty filter list. An undecodable condition
 * must fail loudly: silently matching every row would turn a scoping bug into
 * a green test.
 */
function decodeWhere(condition: unknown): Array<[string, unknown]> {
  const query = dialect.sqlToQuery(condition as SQL)
  const pairs: Array<[string, unknown]> = []
  for (const match of query.sql.matchAll(/"[^"]+"\."([^"]+)"\s*=\s*\$(\d+)/g)) {
    pairs.push([match[1]!, query.params[Number(match[2]) - 1]])
  }
  if (pairs.length === 0) {
    throw new Error(`ai db fake: could not decode where clause: ${query.sql}`)
  }
  return pairs
}

/**
 * One decoded comparison from a `where` clause.
 *
 * `otherColumn` exists for the global breaker alone, whose predicate is
 * `calls_used < cap_calls` — column against column, with no bind parameter. That
 * is not incidental: `DATA_MODEL.md` requires the month's ceiling to be read
 * from the row rather than from the server constant, so a raised cap cannot
 * rewrite a past month. A fake that could only compare against `$n` would let
 * an implementation quietly compare against `AI_GLOBAL_MONTHLY_CALL_CAP` and
 * still go green.
 */
interface DecodedPredicate {
  column: string
  op: '=' | '<'
  value?: unknown
  otherColumn?: string
}

/**
 * Decodes `eq(...)` and `lt(...)` comparisons out of a real Drizzle condition,
 * through Drizzle's own Postgres dialect, the same way `decodeWhere` does.
 *
 * Rendering rather than pattern-matching the builder objects is what keeps the
 * production call sites honest: the condition the implementation passes is the
 * condition Postgres would receive, and anything this fake cannot read is
 * something the tests have not actually pinned, so it throws.
 */
function decodePredicates(condition: unknown): DecodedPredicate[] {
  const query = dialect.sqlToQuery(condition as SQL)
  const predicates: DecodedPredicate[] = []
  const pattern = /"[^"]+"\."([^"]+)"\s*(=|<)\s*(?:\$(\d+)|"[^"]+"\."([^"]+)")/g
  for (const match of query.sql.matchAll(pattern)) {
    const [, column, op, paramIndex, otherColumn] = match
    predicates.push(
      otherColumn === undefined
        ? { column: column!, op: op as '=' | '<', value: query.params[Number(paramIndex) - 1] }
        : { column: column!, op: op as '=' | '<', otherColumn },
    )
  }
  if (predicates.length === 0) {
    throw new Error(`ai db fake: could not decode where clause: ${query.sql}`)
  }
  return predicates
}

function fieldOf<Row>(column: string, fields: Record<string, keyof Row>): keyof Row {
  const field = fields[column]
  if (!field) throw new Error(`ai db fake: unmodelled column "${column}" in where clause`)
  return field
}

function satisfies<Row>(row: Row, predicates: DecodedPredicate[], fields: Record<string, keyof Row>): boolean {
  return predicates.every((predicate) => {
    const actual = row[fieldOf(predicate.column, fields)]
    const expected =
      predicate.otherColumn === undefined
        ? predicate.value
        : row[fieldOf(predicate.otherColumn, fields)]
    return predicate.op === '=' ? actual === expected : (actual as number) < (expected as number)
  })
}

function matches<Row>(row: Row, pairs: Array<[string, unknown]>, fields: Record<string, keyof Row>): boolean {
  return pairs.every(([column, value]) => {
    const field = fields[column]
    if (!field) throw new Error(`ai db fake: unmodelled column "${column}" in where clause`)
    return row[field] === value
  })
}

/**
 * Applies an `UPDATE ... SET` payload to one in-memory row.
 *
 * A `sql` expression is accepted only in the `column + n` / `column - n` shape,
 * which is the increment the required statement uses. Anything else throws,
 * because an expression this fake cannot evaluate is one the tests are not
 * really pinning.
 *
 * Subtraction is supported for the same reason the plain literal below is: the
 * forbidden shape has to be *runnable* here or the mutation check that proves
 * the tests discriminate cannot be run at all. A refund on the failure path —
 * `SET ai_plans_created = ai_plans_created - 1`, the "be fair" change R4 exists
 * to forbid — must fail `ai-reservation-settlement.test.ts` with a wrong number,
 * not with an unsupported-expression error from this file.
 *
 * A plain literal is applied as written and deliberately not rejected. The
 * forbidden read-check-increment shape ends in `SET counter = <number>`, and it
 * has to be *runnable* here for the concurrency tests to catch it doing the
 * wrong thing. A fake that refused the literal would fail that mutation with an
 * error instead of a lost update, and would prove nothing about the mechanism.
 */
function applySet(row: Record<string, unknown>, values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value instanceof SQL) {
      const rendered = dialect.sqlToQuery(value).sql
      const increment = /^"[^"]+"\."[^"]+"\s*([+-])\s*(\d+)$/.exec(rendered.trim())
      if (!increment) throw new Error(`ai db fake: unsupported SET expression: ${rendered}`)
      const step = Number(increment[2])
      row[key] = (row[key] as number) + (increment[1] === '-' ? -step : step)
      continue
    }
    row[key] = value
  }
}

/** Reads a Drizzle column's SQL name back off the column object. */
function columnName(column: unknown): string {
  const name = (column as { name?: unknown }).name
  if (typeof name !== 'string') throw new Error('ai db fake: returning() takes columns only')
  return name
}

function project<Row>(
  row: Record<string, unknown>,
  selection: Record<string, unknown> | undefined,
  fields: Record<string, keyof Row>,
): Record<string, unknown> {
  if (!selection) return { ...row }
  return Object.fromEntries(
    Object.entries(selection).map(([alias, column]) => [
      alias,
      row[fieldOf(columnName(column), fields) as string],
    ]),
  )
}

/** One macrotask, so a read is never resolvable in the same tick it was issued. */
function roundTrip<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 0))
}

export function createAiDbFake(seed: {
  reservations?: AiReservationRow[]
  globalUsage?: AiGlobalUsageRow[]
  households?: AiHouseholdRow[]
  ledgers?: AiLedgerRow[]
} = {}): AiDbFake {
  const reservations: AiReservationRow[] = [...(seed.reservations ?? [])]
  const globalUsage: AiGlobalUsageRow[] = [...(seed.globalUsage ?? [])]
  const households: AiHouseholdRow[] = (seed.households ?? []).map((row) => ({ ...row }))
  const ledgers: AiLedgerRow[] = (seed.ledgers ?? []).map((row) => ({ ...row }))
  const counts: AiDbFakeCounts = { selects: 0, inserts: 0, conflicts: 0, updates: 0, writes: [] }

  /**
   * Recorded for every write the fake applies, conflicts included, so A5's
   * "nothing reaches Neon beyond the reservation status" is asserted against
   * what the statement actually did rather than against a count.
   */
  function recordWrite(operation: 'insert' | 'update', table: unknown, columns: string[] = []): void {
    counts.writes.push({ operation, table: getTableName(table as never), columns })
  }
  let idCounter = 0
  let clock = 0

  function nextTimestamp() {
    clock += 1000
    return new Date(clock)
  }

  function buildReservation(values: Record<string, unknown>): AiReservationRow {
    return {
      id: (values.id as string | undefined) ?? `reservation-${++idCounter}`,
      householdId: String(values.householdId),
      // Null, never undefined: `ledger_id` is nullable and a goal_plan call
      // omits it entirely, so the fake must store the same absence the column
      // would.
      ledgerId: (values.ledgerId as string | null | undefined) ?? null,
      idempotencyKey: String(values.idempotencyKey),
      kind: values.kind as AiReservationRow['kind'],
      capType: values.capType as AiReservationRow['capType'],
      // Mirrors the column default in drizzle/schema.ts. A caller that does not
      // send a status gets 'reserved', exactly as Postgres would give it.
      status: (values.status as AiReservationRow['status'] | undefined) ?? 'reserved',
      createdAt: (values.createdAt as Date | undefined) ?? nextTimestamp(),
    }
  }

  /** The one place a Drizzle table object is resolved to its in-memory rows. */
  function tableState(table: unknown): { rows: unknown[]; fields: Record<string, string> } {
    if (table === aiCallReservations) return { rows: reservations, fields: RESERVATION_FIELDS }
    if (table === aiGlobalUsage) return { rows: globalUsage, fields: GLOBAL_USAGE_FIELDS }
    if (table === householdsTable) return { rows: households, fields: HOUSEHOLD_FIELDS }
    if (table === ledgersTable) return { rows: ledgers, fields: LEDGER_FIELDS }
    throw new Error('ai db fake: unhandled table')
  }

  const client = {
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => {
          // Every modelled table is readable, deliberately. The forbidden
          // read-check-increment shape starts with a SELECT of a counter, and it
          // has to be expressible here or the mutation check that proves these
          // tests discriminate could not be run at all.
          const state = tableState(table)
          const pairs = decodeWhere(condition)
          // Snapshotted, not handed out live. A query result is data that was
          // true when the statement ran; it is not a window onto the row. This
          // one line is load-bearing: with live references, a read-check-
          // increment implementation would read the *other* caller's already
          // incremented value on resume and accidentally behave correctly,
          // which makes every concurrency test below vacuous.
          const rows: unknown[] = state.rows
            .filter((row) => matches(row as never, pairs, state.fields as never))
            .map((row) => ({ ...(row as object) }))
          counts.selects += 1
          const result = roundTrip(rows) as Promise<unknown[]> & { limit: (n: number) => Promise<unknown[]> }
          result.limit = (n: number) => roundTrip(rows.slice(0, n))
          return result
        },
      }),
    }),

    /**
     * Models one conditional `UPDATE ... SET c = c + 1 WHERE ... AND c < cap
     * RETURNING c`.
     *
     * The critical section below — filter, mutate, project — runs to completion
     * with no `await` inside it, which is the whole point: that is the slice of
     * behaviour Postgres guarantees for a single statement, and it is what makes
     * the conditional UPDATE safe without a transaction. Only the resolution is
     * deferred, so the statement still costs a round trip.
     *
     * Rows are projected into plain objects *before* the deferral, so a later
     * caller's increment cannot retroactively change what this statement said it
     * returned.
     */
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: unknown) => ({
          returning: (selection?: Record<string, unknown>) => {
            const state = tableState(table)
            const predicates = decodePredicates(condition)
            counts.updates += 1
            recordWrite('update', table, Object.keys(values))

            const affected = state.rows.filter((row) =>
              satisfies(row as never, predicates, state.fields as never),
            )
            for (const row of affected) applySet(row as Record<string, unknown>, values)
            const projected = affected.map((row) =>
              project(row as Record<string, unknown>, selection, state.fields as never),
            )

            return roundTrip(projected)
          },
        }),
      }),
    }),

    insert: (table: unknown) => {
      if (table === aiGlobalUsage) {
        return {
          values: (values: Record<string, unknown>) => ({
            /**
             * Models the lazy creation of a month's row. `period` is the primary
             * key, so two concurrent first-calls-of-the-month race here and
             * Postgres resolves it by letting exactly one row exist and raising
             * nothing for the loser. The target is checked for the same reason
             * the reservations arm checks it.
             */
            onConflictDoNothing: (config?: { target?: unknown }) => ({
              returning: () => {
                if (config?.target !== aiGlobalUsage.period) {
                  throw new Error('ai db fake: onConflictDoNothing must target [period] explicitly')
                }
                const period = String(values.period)
                if (globalUsage.some((row) => row.period === period)) {
                  counts.conflicts += 1
                  return roundTrip([] as unknown[])
                }
                const row: AiGlobalUsageRow = {
                  period,
                  callsUsed: Number(values.callsUsed ?? 0),
                  capCalls: Number(values.capCalls),
                  updatedAt: nextTimestamp(),
                }
                globalUsage.push(row)
                counts.inserts += 1
                recordWrite('insert', aiGlobalUsage)
                return roundTrip([row] as unknown[])
              },
            }),
          }),
        }
      }
      if (table !== aiCallReservations) throw new Error('ai db fake: unhandled table in insert()')
      return {
        values: (values: Record<string, unknown>) => {
          const candidate = buildReservation(values)
          return {
            /**
             * Models `INSERT ... ON CONFLICT (household_id, idempotency_key)
             * DO NOTHING RETURNING *`. Postgres returns no row for the
             * conflicting insert and raises nothing; so does this.
             *
             * The `target` argument is checked rather than ignored, because
             * `onConflictDoNothing()` with no target swallows a conflict on
             * *any* constraint — including the primary key and the household
             * foreign key — which would hide real bugs behind a silent no-op.
             */
            onConflictDoNothing: (config?: { target?: unknown }) => ({
              returning: () => {
                const target = config?.target
                const targeted =
                  Array.isArray(target) &&
                  target.length === 2 &&
                  target[0] === aiCallReservations.householdId &&
                  target[1] === aiCallReservations.idempotencyKey
                if (!targeted) {
                  throw new Error(
                    'ai db fake: onConflictDoNothing must target [householdId, idempotencyKey] explicitly',
                  )
                }

                const clash = reservations.some(
                  (row) =>
                    row.householdId === candidate.householdId &&
                    row.idempotencyKey === candidate.idempotencyKey,
                )
                if (clash) {
                  counts.conflicts += 1
                  return roundTrip([] as unknown[])
                }

                reservations.push(candidate)
                counts.inserts += 1
                recordWrite('insert', aiCallReservations)
                return roundTrip([candidate] as unknown[])
              },
            }),
          }
        },
      }
    },
  }

  return { db: client as never, reservations, globalUsage, households, ledgers, counts }
}
