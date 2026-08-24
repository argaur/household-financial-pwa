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
} from './schema'

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
