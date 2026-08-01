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
