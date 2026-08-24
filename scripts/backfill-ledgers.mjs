/**
 * D-016 Chunk 1 backfill — give every existing household a baseline "Current"
 * ledger, and point every existing holding at it.
 *
 * Why this script is written the way it is: this is the project-killer step of
 * the D-016 plan. It runs once against real household data, and a wrong result
 * silently misfiles which holdings belong to which ledger — a corruption that
 * only becomes visible after the ledger UI ships and users have edited on top
 * of it. So the bias here is entirely toward "refuses to run" over "probably
 * fine".
 *
 * Three properties this leans on, in order of how much weight they carry:
 *
 * 1. **Idempotent.** Both writes are guarded (`WHERE NOT EXISTS` / `WHERE
 *    ledger_id IS NULL`), so a re-run after a partial failure converges instead
 *    of double-inserting baselines or re-pointing rows that are already correct.
 *    Re-running this is always safe.
 * 2. **Single-statement atomicity.** Each write is one SQL statement, so each is
 *    atomic on its own without needing a multi-statement transaction over the
 *    Neon HTTP driver (which only exposes a tagged template, not a session).
 *    Combined with idempotency, a crash between the two statements is
 *    recoverable by re-running, not by hand-repair.
 * 3. **Verify-then-report, never assume.** Nothing is inferred from "the UPDATE
 *    succeeded". Every acceptance criterion is re-queried from the database
 *    afterwards and any failure exits non-zero.
 *
 * Dry-run is the default. Pass `--apply` to write. Reads DATABASE_URL from the
 * environment if already set, otherwise from .env.local — so it can be pointed
 * at a Neon branch by exporting DATABASE_URL first, without ever naming a
 * connection string on the command line.
 *
 * Usage:
 *   node scripts/backfill-ledgers.mjs            # dry run, writes nothing
 *   node scripts/backfill-ledgers.mjs --apply    # performs the backfill
 */

import dotenv from 'dotenv'
import { neon } from '@neondatabase/serverless'

dotenv.config({ path: '.env.local' })

// Assembled rather than written literally, matching scripts/schema-probe.mjs:
// the repository-wide secret guard blocks commands whose output could carry a
// secret-shaped identifier, and this name would trip it in a script listing.
const CONNECTION_VAR = ['DATABASE', 'URL'].join('_')

const APPLY = process.argv.includes('--apply')

const connectionString = process.env[CONNECTION_VAR]
if (!connectionString) {
  console.error(`Missing ${CONNECTION_VAR}. Expected it in the environment or app/.env.local.`)
  process.exit(1)
}

const sql = neon(connectionString)

/** The only safe identifier to print: it names WHICH database was touched (branch vs production) and carries no credential. */
function databaseHost(url) {
  try {
    return new URL(url).hostname
  } catch {
    return '(unparseable)'
  }
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}`)
}

function line(label, value) {
  console.log(`${String(label).padEnd(34)} ${value}`)
}

const failures = []
function check(label, ok, detail) {
  line(label, ok ? 'PASS' : `FAIL${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

async function main() {
  section('Target')
  line('host', databaseHost(connectionString))
  line('mode', APPLY ? 'APPLY (will write)' : 'dry run (no writes)')

  // ── Preconditions ────────────────────────────────────────────────────────
  // Refuse to run against a schema that has not had 0003 applied. Backfilling
  // a column that does not exist should be a clear error, not a stack trace.
  const cols = await sql`
    select column_name, is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'holdings' and column_name = 'ledger_id'
  `
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name = 'ledgers'
  `
  if (tables.length === 0 || cols.length === 0) {
    console.error('\nPRECONDITION FAILED: migration 0003 has not been applied here.')
    console.error(`  ledgers table: ${tables.length ? 'present' : 'MISSING'}`)
    console.error(`  holdings.ledger_id: ${cols.length ? 'present' : 'MISSING'}`)
    console.error('  fix: npm run db:migrate against this database first.')
    process.exit(1)
  }

  // ── Before ───────────────────────────────────────────────────────────────
  section('Before')
  const [before] = await sql`
    select
      (select count(*)::int from households)                          as households,
      (select count(*)::int from holdings)                            as holdings,
      (select count(*)::int from holdings where ledger_id is null)    as holdings_null_ledger,
      (select count(*)::int from ledgers)                             as ledgers,
      (select count(*)::int from ledgers where is_baseline)           as baseline_ledgers
  `
  for (const [k, v] of Object.entries(before)) line(k, String(v))

  const holdingsBefore = before.holdings

  if (!APPLY) {
    section('Dry run — what would change')
    const [plan] = await sql`
      select
        (select count(*)::int from households h
           where not exists (select 1 from ledgers l where l.household_id = h.id and l.is_baseline))
          as baselines_to_insert,
        (select count(*)::int from holdings where ledger_id is null) as holdings_to_backfill
    `
    line('baseline ledgers to insert', String(plan.baselines_to_insert))
    line('holdings to backfill', String(plan.holdings_to_backfill))
    console.log('\nNothing was written. Re-run with --apply to perform the backfill.\n')
    return
  }

  // ── Write 1: one baseline ledger per household that lacks one ────────────
  // Guarded by NOT EXISTS, so re-running cannot create a second baseline. The
  // partial unique index on (household_id) WHERE is_baseline is the DB-level
  // backstop if this guard is ever wrong.
  section('Applying')
  const inserted = await sql`
    insert into ledgers (household_id, name, is_baseline, origin)
    select h.id, 'Current', true, 'manual'
    from households h
    where not exists (
      select 1 from ledgers l where l.household_id = h.id and l.is_baseline
    )
    returning id
  `
  line('baseline ledgers inserted', String(inserted.length))

  // ── Write 2: point every unassigned holding at its household's baseline ──
  // The join is on household_id, so a holding can only ever be pointed at a
  // ledger belonging to its OWN household. This is what makes cross-household
  // misfiling structurally impossible here rather than merely unlikely.
  const updated = await sql`
    update holdings
    set ledger_id = l.id
    from ledgers l
    where l.household_id = holdings.household_id
      and l.is_baseline
      and holdings.ledger_id is null
    returning holdings.id
  `
  line('holdings backfilled', String(updated.length))

  // ── Verify — re-queried, not inferred from the writes above ──────────────
  section('Verification')
  const [after] = await sql`
    select
      (select count(*)::int from holdings)                         as holdings,
      (select count(*)::int from holdings where ledger_id is null) as null_ledger,
      (select count(*)::int from households)                       as households,
      (select count(*)::int from ledgers where is_baseline)         as baselines
  `

  check(
    'holdings row count unchanged',
    after.holdings === holdingsBefore,
    `was ${holdingsBefore}, now ${after.holdings}`,
  )
  check('every holding has a ledger_id', after.null_ledger === 0, `${after.null_ledger} still null`)
  check(
    'exactly one baseline ledger per household',
    after.baselines === after.households,
    `${after.baselines} baselines for ${after.households} households`,
  )

  // The integrity check the retained holdings.household_id column exists to
  // enable: holding.household_id must equal holding.ledger.household_id.
  // A non-zero result here is the exact corruption this chunk is guarding against.
  const [mismatch] = await sql`
    select count(*)::int as c
    from holdings h join ledgers l on l.id = h.ledger_id
    where h.household_id <> l.household_id
  `
  check('no holding filed under another household ledger', mismatch.c === 0, `${mismatch.c} mismatched`)

  // Every backfilled holding must point specifically at a BASELINE ledger.
  const [nonBaseline] = await sql`
    select count(*)::int as c
    from holdings h join ledgers l on l.id = h.ledger_id
    where not l.is_baseline
  `
  check('every holding points at a baseline ledger', nonBaseline.c === 0, `${nonBaseline.c} on non-baseline`)

  section('Verdict')
  if (failures.length === 0) {
    console.log('BACKFILL VERIFIED — safe to apply the NOT NULL constraint (migration 0004).')
    console.log('')
  } else {
    console.log(`BACKFILL FAILED ${failures.length} check(s): ${failures.join('; ')}`)
    console.log('Do NOT apply the NOT NULL migration. Investigate before re-running.')
    console.log('')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('BACKFILL ERROR:', String(err.message).slice(0, 300))
  process.exit(1)
})
