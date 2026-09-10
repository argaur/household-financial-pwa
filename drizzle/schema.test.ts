import { describe, it, expect } from 'vitest'
import { getTableColumns, getTableName } from 'drizzle-orm'
import fs from 'node:fs'
import path from 'node:path'
import {
  households,
  familyMembers,
  holdings,
  protection,
  householdKeys,
  instruments,
  goals,
  ledgers,
  ledgerProjectionSettings,
  aiCallReservations,
  aiGlobalUsage,
  aiCallKindEnum,
  aiCallCapTypeEnum,
  aiCallStatusEnum,
} from './schema'
import { AI_GLOBAL_MONTHLY_CALL_CAP } from '../server/lib/ai-usage.js'

/**
 * Structural regression guard for the additive encryption-prep migration.
 * Asserts new nullable ciphertext columns exist, pre-existing columns are
 * untouched, and the generated SQL is additive-only (no DROP/SET NOT NULL).
 */

const preExistingColumns = {
  households: ['id', 'ownerUserId', 'name', 'createdAt', 'updatedAt'],
  familyMembers: [
    'id',
    'householdId',
    'name',
    'relationship',
    'dateOfBirth',
    'riskProfile',
    'createdAt',
    'updatedAt',
  ],
  holdings: [
    'id',
    'householdId',
    'memberId',
    'instrumentId',
    'assetClass',
    'investedAmount',
    'currentValue',
    'units',
    'monthlySip',
    'startDate',
    'maturityDate',
    'nominee',
    'priceSource',
    'isEmergencyFund',
    'notes',
    'createdAt',
    'updatedAt',
  ],
  protection: [
    'id',
    'householdId',
    'memberId',
    'type',
    'coverAmount',
    'premium',
    'provider',
    'status',
    'createdAt',
    'updatedAt',
  ],
} as const

const encryptionTables = { households, familyMembers, holdings, protection } as const

describe('drizzle/schema.ts — additive encryption-prep migration', () => {
  describe.each(Object.entries(encryptionTables))('%s', (tableName, table) => {
    const columns = getTableColumns(table as typeof households)

    it('has ciphertext, iv, alg (nullable) and version (not-null default 1) columns', () => {
      expect(columns.ciphertext).toBeDefined()
      expect(columns.ciphertext.notNull).toBe(false)
      expect(columns.ciphertext.dataType).toBe('string')

      expect(columns.iv).toBeDefined()
      expect(columns.iv.notNull).toBe(false)

      expect(columns.alg).toBeDefined()
      expect(columns.alg.notNull).toBe(false)

      expect(columns.version).toBeDefined()
      expect(columns.version.notNull).toBe(true)
      expect(columns.version.hasDefault).toBe(true)
      expect(columns.version.default).toBe(1)
    })

    it('still has every pre-existing column, unchanged', () => {
      const expectedCols = preExistingColumns[tableName as keyof typeof preExistingColumns]
      for (const colKey of expectedCols) {
        expect(columns[colKey], `expected column "${colKey}" to still exist on "${tableName}"`).toBeDefined()
      }
    })
  })

  describe('householdKeys', () => {
    it('maps to the household_keys table', () => {
      expect(getTableName(householdKeys)).toBe('household_keys')
    })

    it('has exactly the expected columns, with householdId as primary key', () => {
      const columns = getTableColumns(householdKeys)
      const expectedKeys = [
        'householdId',
        'kdfAlg',
        'kdfIterations',
        'passphraseSalt',
        'wrappedDekPassphrase',
        'passphraseWrapIv',
        'recoverySalt',
        'wrappedDekRecovery',
        'recoveryWrapIv',
        'createdAt',
        'updatedAt',
      ].sort()

      expect(Object.keys(columns).sort()).toEqual(expectedKeys)

      expect(columns.householdId.primary).toBe(true)
      expect(columns.householdId.notNull).toBe(true)

      expect(columns.kdfAlg.notNull).toBe(true)
      expect(columns.kdfIterations.notNull).toBe(true)
      expect(columns.passphraseSalt.notNull).toBe(true)
      expect(columns.wrappedDekPassphrase.notNull).toBe(true)
      expect(columns.passphraseWrapIv.notNull).toBe(true)
      expect(columns.recoverySalt.notNull).toBe(true)
      expect(columns.wrappedDekRecovery.notNull).toBe(true)
      expect(columns.recoveryWrapIv.notNull).toBe(true)

      expect(columns.createdAt.notNull).toBe(true)
      expect(columns.createdAt.hasDefault).toBe(true)
      expect(columns.updatedAt.notNull).toBe(true)
      expect(columns.updatedAt.hasDefault).toBe(true)
    })
  })
})

/**
 * Nullability relaxation for columns that become client-side encrypted.
 * These columns lose NOT NULL so an encrypted-only INSERT (which leaves the
 * plaintext column empty) doesn't fail every write. Old plaintext rows and
 * new encrypted rows coexist until the final destructive migration.
 */
const relaxedColumns: Record<string, readonly string[]> = {
  households: ['name'],
  familyMembers: ['name', 'relationship', 'dateOfBirth'],
  holdings: ['instrumentId', 'assetClass', 'investedAmount', 'currentValue'],
  protection: ['type', 'coverAmount', 'status'],
}

// Columns that carry tenant separation, cascade deletes, or the concurrency
// check — these must stay NOT NULL on every table touched by this migration.
const mustStayNotNull: Record<string, readonly string[]> = {
  households: ['id', 'ownerUserId', 'createdAt', 'updatedAt', 'version'],
  familyMembers: ['id', 'householdId', 'createdAt', 'updatedAt', 'version'],
  holdings: ['id', 'householdId', 'memberId', 'createdAt', 'updatedAt', 'version'],
  protection: ['id', 'householdId', 'memberId', 'createdAt', 'updatedAt', 'version'],
}

describe('drizzle/schema.ts — NOT NULL relaxation for encrypted columns', () => {
  describe.each(Object.entries(encryptionTables))('%s', (tableName, table) => {
    const columns = getTableColumns(table as typeof households)

    it('has the columns that become encrypted marked nullable', () => {
      const expectedRelaxed = relaxedColumns[tableName] ?? []
      for (const colKey of expectedRelaxed) {
        expect(columns[colKey], `expected column "${colKey}" to exist on "${tableName}"`).toBeDefined()
        expect(columns[colKey].notNull, `expected "${tableName}.${colKey}" to be nullable`).toBe(false)
      }
    })

    it('still has tenant/cascade/concurrency columns as NOT NULL', () => {
      const expectedNotNull = mustStayNotNull[tableName] ?? []
      for (const colKey of expectedNotNull) {
        expect(columns[colKey], `expected column "${colKey}" to exist on "${tableName}"`).toBeDefined()
        expect(columns[colKey].notNull, `expected "${tableName}.${colKey}" to stay NOT NULL`).toBe(true)
      }
    })
  })

  it('does not relax instruments.name — public teaching content stays fully readable', () => {
    const columns = getTableColumns(instruments)
    expect(columns.name).toBeDefined()
    expect(columns.name.notNull).toBe(true)
  })

  it('does not relax goals.name — v1.5 schema-only, no UI, would be a defect to touch', () => {
    const columns = getTableColumns(goals)
    expect(columns.name).toBeDefined()
    expect(columns.name.notNull).toBe(true)
  })
})

describe('generated migration SQL is additive-only', () => {
  const migrationsDir = path.resolve(__dirname, 'migrations')

  function migrationFileByPrefix(prefix: string): string {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && f.startsWith(prefix))
      .sort()
    if (files.length === 0) {
      throw new Error(`No migration SQL file starting with "${prefix}" found — run \`npm run db:generate\` first.`)
    }
    return files[0]
  }

  it('0001 contains no DROP TABLE, DROP COLUMN, or SET NOT NULL statements', () => {
    const file = migrationFileByPrefix('0001')
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8').toUpperCase()

    expect(sql).not.toMatch(/DROP\s+TABLE/)
    expect(sql).not.toMatch(/DROP\s+COLUMN/)
    expect(sql).not.toMatch(/SET\s+NOT\s+NULL/)
  })

  it('0001 contains ADD COLUMN statements for the new encryption-prep columns', () => {
    const file = migrationFileByPrefix('0001')
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8').toUpperCase()

    expect(sql).toMatch(/ADD\s+COLUMN\s+"?CIPHERTEXT"?/)
    expect(sql).toMatch(/ADD\s+COLUMN\s+"?IV"?/)
    expect(sql).toMatch(/ADD\s+COLUMN\s+"?ALG"?/)
    expect(sql).toMatch(/ADD\s+COLUMN\s+"?VERSION"?/)
    expect(sql).toMatch(/CREATE\s+TABLE\s+"?HOUSEHOLD_KEYS"?/)
  })
})

describe('drizzle/migrations/0002 — NOT NULL relaxation, additive only', () => {
  const migrationsDir = path.resolve(__dirname, 'migrations')

  function migration0002File(): string {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && f.startsWith('0002'))
      .sort()
    if (files.length === 0) {
      throw new Error('No migration SQL file starting with "0002" found — run `npm run db:generate` first.')
    }
    return files[0]
  }

  it('contains no DROP TABLE, DROP COLUMN, SET NOT NULL, RENAME, or TRUNCATE statements', () => {
    const file = migration0002File()
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8').toUpperCase()

    expect(sql).not.toMatch(/DROP\s+TABLE/)
    expect(sql).not.toMatch(/DROP\s+COLUMN/)
    expect(sql).not.toMatch(/SET\s+NOT\s+NULL/)
    expect(sql).not.toMatch(/RENAME/)
    expect(sql).not.toMatch(/TRUNCATE/)
  })

  it('contains exactly eleven ALTER COLUMN ... DROP NOT NULL statements', () => {
    const file = migration0002File()
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8').toUpperCase()

    const dropNotNullMatches = sql.match(/ALTER\s+TABLE\s+\S+\s+ALTER\s+COLUMN\s+\S+\s+DROP\s+NOT\s+NULL/g) ?? []
    expect(dropNotNullMatches).toHaveLength(11)
  })
})

/**
 * D-016 — ledgers table and holdings.ledger_id (nullable, backfill lands in a
 * later migration before NOT NULL is applied).
 */
describe('drizzle/schema.ts — ledgers table', () => {
  it('maps to the ledgers table', () => {
    expect(getTableName(ledgers)).toBe('ledgers')
  })

  it('has the expected columns', () => {
    const columns = getTableColumns(ledgers)
    const expectedKeys = [
      'id',
      'householdId',
      'name',
      'ciphertext',
      'iv',
      'alg',
      'version',
      'isBaseline',
      'origin',
      'aiEditsUsed',
      'snapshotOf',
      'projectionHorizonYears',
      'createdAt',
      'updatedAt',
    ].sort()

    expect(Object.keys(columns).sort()).toEqual(expectedKeys)

    expect(columns.id.primary).toBe(true)
    expect(columns.id.notNull).toBe(true)

    expect(columns.householdId.notNull).toBe(true)
    // Nullable since D-020 (migration 0005): every non-baseline ledger's name
    // travels sealed in ciphertext/iv/alg instead. Only the baseline
    // "Current" row keeps a plain, non-null name.
    expect(columns.name.notNull).toBe(false)

    expect(columns.ciphertext.notNull).toBe(false)
    expect(columns.iv.notNull).toBe(false)
    expect(columns.alg.notNull).toBe(false)
    expect(columns.version.notNull).toBe(true)
    expect(columns.version.hasDefault).toBe(true)
    expect(columns.version.default).toBe(1)

    expect(columns.isBaseline.notNull).toBe(true)
    expect(columns.isBaseline.hasDefault).toBe(true)
    expect(columns.isBaseline.default).toBe(false)

    expect(columns.origin.notNull).toBe(true)
    expect(columns.origin.hasDefault).toBe(true)
    expect(columns.origin.default).toBe('manual')

    expect(columns.aiEditsUsed.notNull).toBe(true)
    expect(columns.aiEditsUsed.hasDefault).toBe(true)
    expect(columns.aiEditsUsed.default).toBe(0)

    // Nullable, self-referencing FK
    expect(columns.snapshotOf.notNull).toBe(false)

    expect(columns.projectionHorizonYears.notNull).toBe(false)

    expect(columns.createdAt.notNull).toBe(true)
    expect(columns.createdAt.hasDefault).toBe(true)
    expect(columns.updatedAt.notNull).toBe(true)
    expect(columns.updatedAt.hasDefault).toBe(true)
  })
})

describe('drizzle/schema.ts — holdings.ledger_id', () => {
  it('is NOT NULL — 0003 added it nullable, the backfill ran, 0004 locked it in', () => {
    const columns = getTableColumns(holdings)
    expect(columns.ledgerId).toBeDefined()
    expect(columns.ledgerId.notNull).toBe(true)
  })

  it('still has household_id, unchanged and NOT NULL', () => {
    const columns = getTableColumns(holdings)
    expect(columns.householdId).toBeDefined()
    expect(columns.householdId.notNull).toBe(true)
  })
})

describe('drizzle/migrations/0003 — ledgers table, additive only', () => {
  const migrationsDir = path.resolve(__dirname, 'migrations')

  function migration0003File(): string {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && f.startsWith('0003'))
      .sort()
    if (files.length === 0) {
      throw new Error('No migration SQL file starting with "0003" found — run `npm run db:generate` first.')
    }
    return files[0]
  }

  it('contains no DROP TABLE, DROP COLUMN, SET NOT NULL, RENAME, or TRUNCATE statements', () => {
    const file = migration0003File()
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8').toUpperCase()

    expect(sql).not.toMatch(/DROP\s+TABLE/)
    expect(sql).not.toMatch(/DROP\s+COLUMN/)
    expect(sql).not.toMatch(/SET\s+NOT\s+NULL/)
    expect(sql).not.toMatch(/RENAME/)
    expect(sql).not.toMatch(/TRUNCATE/)
  })

  it('creates the ledgers table and adds holdings.ledger_id without NOT NULL', () => {
    const file = migration0003File()
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8').toUpperCase()

    expect(sql).toMatch(/CREATE\s+TABLE\s+"?LEDGERS"?/)
    expect(sql).toMatch(/ADD\s+COLUMN\s+"?LEDGER_ID"?/)
    expect(sql).not.toMatch(/"LEDGER_ID"[^,]*NOT\s+NULL/)
  })

  it('creates a partial unique index on ledgers(household_id) WHERE is_baseline', () => {
    const file = migration0003File()
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8').toUpperCase()

    expect(sql).toMatch(/CREATE\s+UNIQUE\s+INDEX.*LEDGERS_HOUSEHOLD_BASELINE_IDX/)
    expect(sql).toMatch(/WHERE\s+"LEDGERS"\."IS_BASELINE"/)
  })
})

/**
 * The cutover half of the additive -> backfill -> cutover sequence. Kept as its
 * own migration deliberately: 0003 and 0004 are separated by a data step
 * (scripts/backfill-ledgers.mjs), and collapsing them into one file would make
 * the constraint fail on any database that already holds rows.
 */
describe('drizzle/migrations/0004 — holdings.ledger_id cutover', () => {
  const migrationsDir = path.resolve(__dirname, 'migrations')

  function migration0004File(): string {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && f.startsWith('0004'))
      .sort()
    if (files.length === 0) {
      throw new Error('No migration SQL file starting with "0004" found — run `npm run db:generate` first.')
    }
    return files[0]
  }

  it('sets ledger_id NOT NULL and does nothing else destructive', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, migration0004File()), 'utf-8').toUpperCase()

    expect(sql).toMatch(/ALTER\s+COLUMN\s+"?LEDGER_ID"?\s+SET\s+NOT\s+NULL/)
    expect(sql).not.toMatch(/DROP\s+TABLE/)
    expect(sql).not.toMatch(/DROP\s+COLUMN/)
    expect(sql).not.toMatch(/TRUNCATE/)
    expect(sql).not.toMatch(/DELETE\s+FROM/)
  })

  it('leaves holdings.household_id alone — it is retained, never dropped', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, migration0004File()), 'utf-8').toUpperCase()
    expect(sql).not.toMatch(/HOUSEHOLD_ID/)
  })
})

/**
 * E1 (D-024/D-025 AI import) — instrument-level published-rate catalog
 * columns, plaintext and nullable. Distinct from the pre-existing
 * `rateValue`/`rateAsOf` pair (library-display, 5 rows populated): these new
 * columns back the projection engine's per-instrument assumption and its
 * cited source, which the display fields never carried. The as-of column is
 * named `assumedRateAsOf` (db: assumed_rate_as_of), not `rateAsOf`, because
 * `instruments.rate_as_of` already exists — adding a second column with the
 * same db name would either collide or silently shadow it.
 */
describe('drizzle/schema.ts — instruments rate-assumption columns (E1)', () => {
  const columns = getTableColumns(instruments)

  it('has assumedAnnualRatePct as a nullable numeric(5,2)', () => {
    expect(columns.assumedAnnualRatePct).toBeDefined()
    expect(columns.assumedAnnualRatePct.notNull).toBe(false)
    expect(columns.assumedAnnualRatePct.dataType).toBe('string')
    expect((columns.assumedAnnualRatePct as unknown as { precision?: number }).precision).toBe(5)
    expect((columns.assumedAnnualRatePct as unknown as { scale?: number }).scale).toBe(2)
  })

  it('has rateSource as a nullable text column', () => {
    expect(columns.rateSource).toBeDefined()
    expect(columns.rateSource.notNull).toBe(false)
    expect(columns.rateSource.dataType).toBe('string')
  })

  it('has assumedRateAsOf as a nullable date column mapped to assumed_rate_as_of', () => {
    expect(columns.assumedRateAsOf).toBeDefined()
    expect(columns.assumedRateAsOf.notNull).toBe(false)
    expect(columns.assumedRateAsOf.name).toBe('assumed_rate_as_of')
  })

  it('leaves the pre-existing rateValue/rateAsOf columns untouched', () => {
    expect(columns.rateValue).toBeDefined()
    expect(columns.rateValue.notNull).toBe(false)
    expect(columns.rateAsOf).toBeDefined()
    expect(columns.rateAsOf.name).toBe('rate_as_of')
    expect(columns.rateAsOf.notNull).toBe(false)
  })
})

/**
 * E1 — ledger_projection_settings: specced during D-016, never built. First
 * consumer is a later step (E5). Plaintext assumptions, not holdings — no
 * ciphertext/iv/alg envelope here by design.
 */
describe('drizzle/schema.ts — ledgerProjectionSettings table (E1)', () => {
  it('maps to the ledger_projection_settings table', () => {
    expect(getTableName(ledgerProjectionSettings)).toBe('ledger_projection_settings')
  })

  it('has exactly the expected columns', () => {
    const columns = getTableColumns(ledgerProjectionSettings)
    const expectedKeys = [
      'id',
      'ledgerId',
      'assetClass',
      'annualRatePct',
      'createdAt',
      'updatedAt',
    ].sort()
    expect(Object.keys(columns).sort()).toEqual(expectedKeys)
  })

  it('has id as primary key, defaulted', () => {
    const columns = getTableColumns(ledgerProjectionSettings)
    expect(columns.id.primary).toBe(true)
    expect(columns.id.notNull).toBe(true)
    expect(columns.id.hasDefault).toBe(true)
  })

  it('has ledgerId as NOT NULL, cascading to ledgers.id', () => {
    const columns = getTableColumns(ledgerProjectionSettings)
    expect(columns.ledgerId).toBeDefined()
    expect(columns.ledgerId.notNull).toBe(true)
  })

  it('has assetClass as NOT NULL, restricted to the assetClassEnum values', () => {
    const columns = getTableColumns(ledgerProjectionSettings)
    expect(columns.assetClass).toBeDefined()
    expect(columns.assetClass.notNull).toBe(true)
    expect(columns.assetClass.enumValues).toEqual(['equity', 'debt', 'gold', 'hybrid', 'real-estate', 'alternative'])
  })

  it('has annualRatePct as a NOT NULL numeric(5,2)', () => {
    const columns = getTableColumns(ledgerProjectionSettings)
    expect(columns.annualRatePct).toBeDefined()
    expect(columns.annualRatePct.notNull).toBe(true)
    expect((columns.annualRatePct as unknown as { precision?: number }).precision).toBe(5)
    expect((columns.annualRatePct as unknown as { scale?: number }).scale).toBe(2)
  })

  it('has createdAt/updatedAt as NOT NULL with a default, matching neighbouring tables', () => {
    const columns = getTableColumns(ledgerProjectionSettings)
    expect(columns.createdAt.notNull).toBe(true)
    expect(columns.createdAt.hasDefault).toBe(true)
    expect(columns.updatedAt.notNull).toBe(true)
    expect(columns.updatedAt.hasDefault).toBe(true)
  })

  it('has no ciphertext/iv/alg/version envelope — plaintext assumptions, not holdings', () => {
    const columns = getTableColumns(ledgerProjectionSettings)
    expect(columns.ciphertext).toBeUndefined()
    expect(columns.iv).toBeUndefined()
    expect(columns.alg).toBeUndefined()
    expect(columns.version).toBeUndefined()
  })
})

describe('drizzle/migrations/0006 — instrument rate columns + ledger_projection_settings, additive only (E1)', () => {
  const migrationsDir = path.resolve(__dirname, 'migrations')

  function migration0006File(): string {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && f.startsWith('0006'))
      .sort()
    if (files.length === 0) {
      throw new Error('No migration SQL file starting with "0006" found — run `npm run db:generate` first.')
    }
    return files[0]
  }

  it('contains no DROP TABLE, DROP COLUMN, SET NOT NULL, RENAME, or TRUNCATE statements', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, migration0006File()), 'utf-8').toUpperCase()

    expect(sql).not.toMatch(/DROP\s+TABLE/)
    expect(sql).not.toMatch(/DROP\s+COLUMN/)
    expect(sql).not.toMatch(/SET\s+NOT\s+NULL/)
    expect(sql).not.toMatch(/RENAME/)
    expect(sql).not.toMatch(/TRUNCATE/)
  })

  it('adds the three new nullable instrument columns', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, migration0006File()), 'utf-8').toUpperCase()

    expect(sql).toMatch(/ADD\s+COLUMN\s+"?ASSUMED_ANNUAL_RATE_PCT"?/)
    expect(sql).toMatch(/ADD\s+COLUMN\s+"?RATE_SOURCE"?/)
    expect(sql).toMatch(/ADD\s+COLUMN\s+"?ASSUMED_RATE_AS_OF"?/)
  })

  it('creates the ledger_projection_settings table with a cascade FK and a unique (ledger_id, asset_class) index', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, migration0006File()), 'utf-8').toUpperCase()

    expect(sql).toMatch(/CREATE\s+TABLE\s+"?LEDGER_PROJECTION_SETTINGS"?/)
    expect(sql).toMatch(/REFERENCES\s+"?(PUBLIC"?\."?)?LEDGERS"?\("?ID"?\)\s+ON\s+DELETE\s+CASCADE/)
    expect(sql).toMatch(/CREATE\s+UNIQUE\s+INDEX.*LEDGER_PROJECTION_SETTINGS_LEDGER_ASSET_CLASS_IDX/)
  })
})

/**
 * R1 (D-024/D-025 AI import, Chunk R) — Migration B: `ai_call_reservations`
 * and `ai_global_usage`. Both plaintext, counters-only, no ciphertext/iv/alg
 * envelope by design (DATA_MODEL.md's `ai_call_reservations` and
 * `ai_global_usage` sections). Built and proven before any Anthropic call
 * exists in the codebase — this step only asserts shape, never wires cap
 * enforcement (that's R2-R4).
 */
describe('drizzle/schema.ts — ai_call_reservations table (R1)', () => {
  it('maps to the ai_call_reservations table', () => {
    expect(getTableName(aiCallReservations)).toBe('ai_call_reservations')
  })

  it('has exactly the expected columns', () => {
    const columns = getTableColumns(aiCallReservations)
    const expectedKeys = [
      'id',
      'householdId',
      'ledgerId',
      'idempotencyKey',
      'kind',
      'capType',
      'status',
      'createdAt',
    ].sort()
    expect(Object.keys(columns).sort()).toEqual(expectedKeys)
  })

  it('has id as a defaulted primary key', () => {
    const columns = getTableColumns(aiCallReservations)
    expect(columns.id.primary).toBe(true)
    expect(columns.id.notNull).toBe(true)
    expect(columns.id.hasDefault).toBe(true)
  })

  it('has householdId as NOT NULL, cascading to households.id', () => {
    const columns = getTableColumns(aiCallReservations)
    expect(columns.householdId).toBeDefined()
    expect(columns.householdId.notNull).toBe(true)
  })

  it('has ledgerId as nullable — null for a goal_plan call, set for a counsel call', () => {
    const columns = getTableColumns(aiCallReservations)
    expect(columns.ledgerId).toBeDefined()
    expect(columns.ledgerId.notNull).toBe(false)
  })

  it('has idempotencyKey as NOT NULL text', () => {
    const columns = getTableColumns(aiCallReservations)
    expect(columns.idempotencyKey).toBeDefined()
    expect(columns.idempotencyKey.notNull).toBe(true)
    expect(columns.idempotencyKey.dataType).toBe('string')
  })

  it('has kind restricted to exactly goal_plan and counsel', () => {
    const columns = getTableColumns(aiCallReservations)
    expect(columns.kind.notNull).toBe(true)
    expect(columns.kind.enumValues).toEqual(['goal_plan', 'counsel'])
    expect(aiCallKindEnum).toEqual(['goal_plan', 'counsel'])
  })

  it('has capType restricted to exactly plans and edits', () => {
    const columns = getTableColumns(aiCallReservations)
    expect(columns.capType.notNull).toBe(true)
    expect(columns.capType.enumValues).toEqual(['plans', 'edits'])
    expect(aiCallCapTypeEnum).toEqual(['plans', 'edits'])
  })

  it('has status restricted to exactly reserved, completed, failed, defaulting to reserved', () => {
    const columns = getTableColumns(aiCallReservations)
    expect(columns.status.notNull).toBe(true)
    expect(columns.status.enumValues).toEqual(['reserved', 'completed', 'failed'])
    expect(columns.status.hasDefault).toBe(true)
    expect(columns.status.default).toBe('reserved')
    expect(aiCallStatusEnum).toEqual(['reserved', 'completed', 'failed'])
  })

  it('has createdAt as NOT NULL with a default', () => {
    const columns = getTableColumns(aiCallReservations)
    expect(columns.createdAt.notNull).toBe(true)
    expect(columns.createdAt.hasDefault).toBe(true)
  })

  it('has no ciphertext/iv/alg/version envelope — plaintext counters, not household data', () => {
    const columns = getTableColumns(aiCallReservations)
    expect(columns.ciphertext).toBeUndefined()
    expect(columns.iv).toBeUndefined()
    expect(columns.alg).toBeUndefined()
    expect(columns.version).toBeUndefined()
  })
})

describe('drizzle/schema.ts — ai_global_usage table (R1)', () => {
  it('maps to the ai_global_usage table', () => {
    expect(getTableName(aiGlobalUsage)).toBe('ai_global_usage')
  })

  it('has exactly the expected columns, with period as the primary key', () => {
    const columns = getTableColumns(aiGlobalUsage)
    const expectedKeys = ['period', 'callsUsed', 'capCalls', 'updatedAt'].sort()
    expect(Object.keys(columns).sort()).toEqual(expectedKeys)

    expect(columns.period.primary).toBe(true)
    expect(columns.period.notNull).toBe(true)
    expect(columns.period.dataType).toBe('string')
  })

  it('has callsUsed as NOT NULL int, defaulting to 0', () => {
    const columns = getTableColumns(aiGlobalUsage)
    expect(columns.callsUsed.notNull).toBe(true)
    expect(columns.callsUsed.hasDefault).toBe(true)
    expect(columns.callsUsed.default).toBe(0)
  })

  it('has capCalls as NOT NULL int, no schema-level default — seeded per row from the server constant', () => {
    const columns = getTableColumns(aiGlobalUsage)
    expect(columns.capCalls.notNull).toBe(true)
  })

  it('has updatedAt as NOT NULL with a default', () => {
    const columns = getTableColumns(aiGlobalUsage)
    expect(columns.updatedAt.notNull).toBe(true)
    expect(columns.updatedAt.hasDefault).toBe(true)
  })

  it('has no ciphertext/iv/alg/version envelope', () => {
    const columns = getTableColumns(aiGlobalUsage)
    expect(columns.ciphertext).toBeUndefined()
    expect(columns.iv).toBeUndefined()
    expect(columns.alg).toBeUndefined()
    expect(columns.version).toBeUndefined()
  })
})

describe('drizzle/schema.ts — the two per-entity cap counters (R3)', () => {
  /**
   * `ai_edits_used` landed with the D-016 bundle in migration 0003.
   * `ai_plans_created` never did — it was specced in the D-019 data model and
   * carried as unverified in `SOLUTION_BRIEF.md` open item 7, and R3 found it
   * genuinely absent from both the schema and every migration. Pinned here
   * because the conditional UPDATE that enforces the plans cap is unwritable
   * without it, and a missing counter column fails as an unenforced cap rather
   * than as an error.
   */
  it('households has ai_plans_created as a NOT NULL int defaulting to 0', () => {
    const columns = getTableColumns(households)
    expect(columns.aiPlansCreated).toBeDefined()
    expect(columns.aiPlansCreated.name).toBe('ai_plans_created')
    expect(columns.aiPlansCreated.notNull).toBe(true)
    expect(columns.aiPlansCreated.hasDefault).toBe(true)
    expect(columns.aiPlansCreated.default).toBe(0)
  })

  it('ledgers has ai_edits_used as a NOT NULL int defaulting to 0', () => {
    const columns = getTableColumns(ledgers)
    expect(columns.aiEditsUsed).toBeDefined()
    expect(columns.aiEditsUsed.name).toBe('ai_edits_used')
    expect(columns.aiEditsUsed.notNull).toBe(true)
    expect(columns.aiEditsUsed.hasDefault).toBe(true)
    expect(columns.aiEditsUsed.default).toBe(0)
  })

  it('both counters are plaintext, outside the encryption envelope', () => {
    // They count how many times something happened, never what a household
    // owns — the "counters and structure" category of DATA_MODEL.md's field
    // classification, which has no third option for a column like this.
    expect(getTableColumns(households).aiPlansCreated.dataType).toBe('number')
    expect(getTableColumns(ledgers).aiEditsUsed.dataType).toBe('number')
  })
})

describe('server/lib/ai-usage.ts — global monthly cap constant (R1)', () => {
  it('is 50, resolved 2026-09-07', () => {
    expect(AI_GLOBAL_MONTHLY_CALL_CAP).toBe(50)
  })
})

describe('drizzle/migrations/0007 — Migration B, additive only (R1)', () => {
  const migrationsDir = path.resolve(__dirname, 'migrations')

  function migration0007File(): string {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && f.startsWith('0007'))
      .sort()
    if (files.length === 0) {
      throw new Error('No migration SQL file starting with "0007" found — run `npm run db:generate` first.')
    }
    return files[0]
  }

  it('contains no DROP TABLE, DROP COLUMN, SET NOT NULL, RENAME, or TRUNCATE statements', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, migration0007File()), 'utf-8').toUpperCase()

    expect(sql).not.toMatch(/DROP\s+TABLE/)
    expect(sql).not.toMatch(/DROP\s+COLUMN/)
    expect(sql).not.toMatch(/SET\s+NOT\s+NULL/)
    expect(sql).not.toMatch(/RENAME/)
    expect(sql).not.toMatch(/TRUNCATE/)
  })

  it('creates both new tables', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, migration0007File()), 'utf-8').toUpperCase()

    expect(sql).toMatch(/CREATE\s+TABLE\s+"?AI_CALL_RESERVATIONS"?/)
    expect(sql).toMatch(/CREATE\s+TABLE\s+"?AI_GLOBAL_USAGE"?/)
  })

  it('creates a composite UNIQUE index on ai_call_reservations(household_id, idempotency_key)', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, migration0007File()), 'utf-8').toUpperCase()

    const uniqueIdxMatch = sql.match(
      /CREATE\s+UNIQUE\s+INDEX\s+"?AI_CALL_RESERVATIONS_HOUSEHOLD_IDEMPOTENCY_IDX"?\s+ON\s+"?AI_CALL_RESERVATIONS"?[^;]*\("?HOUSEHOLD_ID"?,\s*"?IDEMPOTENCY_KEY"?\)/,
    )
    expect(uniqueIdxMatch).not.toBeNull()
  })

  it('adds both ON DELETE CASCADE edges — household_id and ledger_id', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, migration0007File()), 'utf-8').toUpperCase()

    expect(sql).toMatch(
      /"?AI_CALL_RESERVATIONS"?\s+ADD\s+CONSTRAINT[^;]*FOREIGN\s+KEY\s+\("?HOUSEHOLD_ID"?\)\s+REFERENCES\s+"?(PUBLIC"?\."?)?HOUSEHOLDS"?\("?ID"?\)\s+ON\s+DELETE\s+CASCADE/,
    )
    expect(sql).toMatch(
      /"?AI_CALL_RESERVATIONS"?\s+ADD\s+CONSTRAINT[^;]*FOREIGN\s+KEY\s+\("?LEDGER_ID"?\)\s+REFERENCES\s+"?(PUBLIC"?\."?)?LEDGERS"?\("?ID"?\)\s+ON\s+DELETE\s+CASCADE/,
    )
  })

  it('makes ai_global_usage.period the primary key', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, migration0007File()), 'utf-8').toUpperCase()

    expect(sql).toMatch(/"?PERIOD"?\s+TEXT\s+PRIMARY\s+KEY/)
  })
})
