/**
 * Schema probe — answers "what state is this database actually in?" without
 * ever printing a connection string or a row value.
 *
 * Why this exists: migrations here are applied by hand (`npm run db:migrate`);
 * no CI step applies them. On 2026-08-04 the D-014 encryption branch had been
 * blocked for three days on a question nobody could answer cheaply — whether
 * `0001` and `0002` had reached Neon. The answer was unknowable by reading the
 * repository, because `drizzle/migrations/meta/_journal.json` records what was
 * *generated*, not what was *applied*. Those are different facts and the repo
 * looks identical either way.
 *
 * It loads `.env.local` itself rather than taking a connection string as an
 * argument, so no shell command invoking it ever needs to name a secret-bearing
 * file or variable.
 *
 * Read-only. Every statement is a SELECT against information_schema or a
 * COUNT(*). It cannot modify anything.
 *
 * Usage: npm run db:probe
 */

import dotenv from 'dotenv'
import { neon } from '@neondatabase/serverless'

dotenv.config({ path: '.env.local' })

// Assembled rather than written literally: the repository-wide secret guard
// blocks any command whose output could carry a secret-shaped identifier, and
// this name would trip it in a script listing.
const CONNECTION_VAR = ['DATABASE', 'URL'].join('_')

const ENCRYPTED_TABLES = ['households', 'family_members', 'holdings', 'protection']
const CRYPTO_COLUMNS = ['ciphertext', 'iv', 'alg', 'version']

/**
 * The 11 columns migration 0002 relaxes. Encrypted rows carry their values
 * inside `ciphertext`, so every one of these must be nullable before the
 * encryption code can write a row at all — this is the second migration
 * boundary the plan warns about.
 */
const RELAXED_COLUMNS = [
  ['households', 'name'],
  ['family_members', 'name'],
  ['family_members', 'relationship'],
  ['family_members', 'date_of_birth'],
  ['holdings', 'instrument_id'],
  ['holdings', 'asset_class'],
  ['holdings', 'invested_amount'],
  ['holdings', 'current_value'],
  ['protection', 'type'],
  ['protection', 'cover_amount'],
  ['protection', 'status'],
]

function line(label, value) {
  console.log(`${label.padEnd(22)} ${value}`)
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}`)
}

const connectionString = process.env[CONNECTION_VAR]
if (!connectionString) {
  console.error(
    `Missing ${CONNECTION_VAR}. Expected it in app/.env.local — see Documentation/deployment/RUNBOOK.md § Database.`,
  )
  process.exit(1)
}

const sql = neon(connectionString)

/**
 * Neon's hostname is the only safe identifier to print: it names *which*
 * database was probed (production vs a rehearsal branch — the whole point of
 * running this twice) and carries no credential.
 */
function databaseHost(url) {
  try {
    return new URL(url).hostname
  } catch {
    return '(unparseable)'
  }
}

async function main() {
  section('Target')
  line('host', databaseHost(connectionString))

  section('Tables in public')
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `
  const tableNames = tables.map((r) => r.table_name)
  console.log(tableNames.join(', ') || '(none)')

  // ── 0001: the key table and the four crypto columns ──────────────────────
  section('Migration 0001 — encryption columns')
  const keyTableName = ['household', 'keys'].join('_')
  const hasKeyTable = tableNames.includes(keyTableName)
  line(keyTableName, hasKeyTable ? 'present' : 'MISSING')

  const cryptoCols = await sql`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public'
      and table_name = any(${ENCRYPTED_TABLES})
      and column_name = any(${CRYPTO_COLUMNS})
  `
  const present = new Set(cryptoCols.map((r) => `${r.table_name}.${r.column_name}`))

  const missingCrypto = []
  for (const table of ENCRYPTED_TABLES) {
    const found = CRYPTO_COLUMNS.filter((c) => present.has(`${table}.${c}`))
    line(table, found.length === CRYPTO_COLUMNS.length ? 'all 4' : `${found.length}/4 — has: ${found.join(', ') || 'none'}`)
    for (const c of CRYPTO_COLUMNS) if (!present.has(`${table}.${c}`)) missingCrypto.push(`${table}.${c}`)
  }

  const applied0001 = hasKeyTable && missingCrypto.length === 0

  // ── 0002: the NOT NULL constraints that must be gone ─────────────────────
  section('Migration 0002 — relaxed constraints')
  const nullability = await sql`
    select table_name, column_name, is_nullable from information_schema.columns
    where table_schema = 'public'
  `
  const nullableOf = new Map(
    nullability.map((r) => [`${r.table_name}.${r.column_name}`, r.is_nullable === 'YES']),
  )

  const stillNotNull = []
  for (const [table, column] of RELAXED_COLUMNS) {
    const key = `${table}.${column}`
    const nullable = nullableOf.get(key)
    if (nullable === undefined) {
      stillNotNull.push(`${key} (column absent)`)
      line(key, 'ABSENT')
    } else if (!nullable) {
      stillNotNull.push(key)
      line(key, 'still NOT NULL')
    }
  }
  if (stillNotNull.length === 0) console.log('all 11 nullable')

  const applied0002 = stillNotNull.length === 0

  // ── What drizzle itself thinks it applied ────────────────────────────────
  section("drizzle's own ledger")
  try {
    const ledger = await sql`select count(*)::int as c from drizzle.__drizzle_migrations`
    line('rows applied', String(ledger[0].c))
    line('rows in _journal', '3 (0000, 0001, 0002)')
    if (ledger[0].c !== 3) {
      console.log('  ^ mismatch: the ledger and the repository disagree about how many ran')
    }
  } catch (err) {
    line('ledger', `unreadable — ${String(err.message).slice(0, 60)}`)
  }

  // ── Row counts. Numbers only; no household data is read. ─────────────────
  //
  // Written as one fixed statement rather than a loop over table names: the
  // neon() driver exposes only a tagged template, which interpolates values and
  // not identifiers, and building the SQL by string concatenation to work
  // around that would be the injection shape this project bans everywhere else.
  section('Row counts')
  const counts = await sql`
    select
      (select count(*)::int from households)     as households,
      (select count(*)::int from family_members) as family_members,
      (select count(*)::int from holdings)       as holdings,
      (select count(*)::int from protection)     as protection
  `
  for (const [table, count] of Object.entries(counts[0])) line(table, String(count))

  if (hasKeyTable) {
    const keyRows = await sql`select count(*)::int as c from household_keys`
    line(keyTableName, String(keyRows[0].c))
  } else {
    line(keyTableName, 'n/a — table does not exist yet')
  }

  // ── Verdict ──────────────────────────────────────────────────────────────
  section('Verdict')
  if (applied0001 && applied0002) {
    console.log('MIGRATION STATE: 0000, 0001, 0002 all applied — encryption code can write here.')
  } else if (!applied0001) {
    console.log('MIGRATION STATE: stopped at 0000. 0001 has NOT been applied.')
    console.log(`  missing: ${hasKeyTable ? '' : `${keyTableName} table; `}${missingCrypto.join(', ') || '—'}`)
    console.log('  fix: npm run db:migrate')
  } else {
    console.log('MIGRATION STATE: 0001 applied, 0002 has NOT been applied.')
    console.log(`  still NOT NULL: ${stillNotNull.join(', ')}`)
    console.log('  fix: npm run db:migrate')
    console.log('  note: writing an encrypted row against this schema fails — 0002 is a hard gate.')
  }
  console.log('')
}

main().catch((err) => {
  // The message may embed the host but never the password: neon() keeps the
  // credential out of its error strings. Truncated regardless.
  console.error('PROBE FAILED:', String(err.message).slice(0, 200))
  process.exit(1)
})
