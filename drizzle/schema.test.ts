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

describe('generated migration SQL is additive-only', () => {
  const migrationsDir = path.resolve(__dirname, 'migrations')

  function latestMigrationFile(): string {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    if (files.length === 0) {
      throw new Error('No migration SQL files found — run `npm run db:generate` first.')
    }
    return files[files.length - 1]
  }

  it('contains no DROP TABLE, DROP COLUMN, or SET NOT NULL statements', () => {
    const file = latestMigrationFile()
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8').toUpperCase()

    expect(sql).not.toMatch(/DROP\s+TABLE/)
    expect(sql).not.toMatch(/DROP\s+COLUMN/)
    expect(sql).not.toMatch(/SET\s+NOT\s+NULL/)
  })

  it('contains ADD COLUMN statements for the new encryption-prep columns', () => {
    const file = latestMigrationFile()
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8').toUpperCase()

    expect(sql).toMatch(/ADD\s+COLUMN\s+"?CIPHERTEXT"?/)
    expect(sql).toMatch(/ADD\s+COLUMN\s+"?IV"?/)
    expect(sql).toMatch(/ADD\s+COLUMN\s+"?ALG"?/)
    expect(sql).toMatch(/ADD\s+COLUMN\s+"?VERSION"?/)
    expect(sql).toMatch(/CREATE\s+TABLE\s+"?HOUSEHOLD_KEYS"?/)
  })
})
