import { describe, it, expect } from 'vitest'
import { buildHouseholdExport, exportFilename, serializeExport } from './export'
import type { Household } from './household-api'
import type { FamilyMember } from './family-members-api'
import type { Holding } from './holdings-api'
import type { Protection } from './protection-api'

/**
 * The export exists because a lost passphrase is unrecoverable by design
 * (D-014: no server-side copy, no account recovery). It is the only copy of a
 * household's data that survives losing the key.
 *
 * That makes silence the dangerous failure. An export that quietly omits rows
 * it could not decrypt looks like a complete backup and is not one — and the
 * moment it matters is the moment the original is already gone.
 */

const EMPTY = {
  household: { state: 'absent' as const },
  members: { members: [], unreadableCount: 0, notYetEncryptedCount: 0 },
  holdings: { holdings: [], unreadableCount: 0, notYetEncryptedCount: 0 },
  protection: { protection: [], unreadableCount: 0, notYetEncryptedCount: 0 },
  exportedAt: new Date('2026-08-02T10:00:00.000Z'),
}

describe('buildHouseholdExport', () => {
  it('marks the export incomplete and counts what is missing when rows could not be decrypted', () => {
    const result = buildHouseholdExport({
      ...EMPTY,
      holdings: { holdings: [], unreadableCount: 3, notYetEncryptedCount: 0 },
    })

    expect(result.complete).toBe(false)
    expect(result.missing.unreadable.holdings).toBe(3)
    expect(result.missing.total).toBe(3)
  })

  it('counts an unreadable household, which is a whole export nobody can name', () => {
    const result = buildHouseholdExport({
      ...EMPTY,
      household: { state: 'unreadable', id: 'h1', reason: 'bad ciphertext' },
    })

    expect(result.complete).toBe(false)
    expect(result.missing.unreadable.household).toBe(true)
    expect(result.missing.total).toBe(1)
  })

  it('reports rows still stored as plaintext separately, since those are readable but not encrypted', () => {
    const result = buildHouseholdExport({
      ...EMPTY,
      holdings: { holdings: [], unreadableCount: 0, notYetEncryptedCount: 2 },
    })

    // Not "missing" — they exist and are readable. But the export must not
    // imply everything it carries was encrypted at rest.
    expect(result.missing.total).toBe(0)
    expect(result.complete).toBe(true)
    expect(result.notYetEncrypted.holdings).toBe(2)
  })

  it('counts every kind of unreadable row, not just some of them', () => {
    // Distinct primes, so a dropped or duplicated term changes the total.
    // Written after a mutation that stopped counting protection survived the
    // rest of this suite: the earlier cases all left three of the four terms
    // at zero, which made them individually unobservable.
    const result = buildHouseholdExport({
      household: { state: 'unreadable', id: 'h1', reason: 'bad ciphertext' },
      members: { members: [], unreadableCount: 2, notYetEncryptedCount: 0 },
      holdings: { holdings: [], unreadableCount: 3, notYetEncryptedCount: 0 },
      protection: { protection: [], unreadableCount: 5, notYetEncryptedCount: 0 },
      exportedAt: new Date('2026-08-02T10:00:00.000Z'),
    })

    expect(result.missing.unreadable.household).toBe(true)
    expect(result.missing.unreadable.familyMembers).toBe(2)
    expect(result.missing.unreadable.holdings).toBe(3)
    expect(result.missing.unreadable.protection).toBe(5)
    expect(result.missing.total).toBe(11)
    expect(result.complete).toBe(false)
  })

  it('counts plaintext rows of every kind too', () => {
    const result = buildHouseholdExport({
      ...EMPTY,
      members: { members: [], unreadableCount: 0, notYetEncryptedCount: 2 },
      holdings: { holdings: [], unreadableCount: 0, notYetEncryptedCount: 3 },
      protection: { protection: [], unreadableCount: 0, notYetEncryptedCount: 5 },
    })

    expect(result.notYetEncrypted).toEqual({ familyMembers: 2, holdings: 3, protection: 5 })
  })

  it('is complete when nothing failed', () => {
    const result = buildHouseholdExport(EMPTY)

    expect(result.complete).toBe(true)
    expect(result.missing.total).toBe(0)
  })

  it('carries the decrypted values themselves, which is the entire point', () => {
    const result = buildHouseholdExport({
      ...EMPTY,
      household: { state: 'ok', household: household({ name: 'The Sharma Household' }) },
      members: {
        members: [member({ name: 'Asha', dateOfBirth: '1990-04-11' })],
        unreadableCount: 0,
        notYetEncryptedCount: 0,
      },
      holdings: {
        holdings: [holding({ investedAmount: '250000', nominee: 'Asha' })],
        unreadableCount: 0,
        notYetEncryptedCount: 0,
      },
      protection: {
        protection: [protection({ coverAmount: '10000000', provider: 'Example Life' })],
        unreadableCount: 0,
        notYetEncryptedCount: 0,
      },
    })

    expect(result.household?.name).toBe('The Sharma Household')
    expect(result.familyMembers[0].name).toBe('Asha')
    expect(result.familyMembers[0].dateOfBirth).toBe('1990-04-11')
    expect(result.holdings[0].investedAmount).toBe('250000')
    expect(result.holdings[0].nominee).toBe('Asha')
    expect(result.protection[0].coverAmount).toBe('10000000')
    expect(result.protection[0].provider).toBe('Example Life')
  })

  it('stamps when it was taken, because a backup of unknown age is nearly useless', () => {
    const result = buildHouseholdExport(EMPTY)
    expect(result.exportedAt).toBe('2026-08-02T10:00:00.000Z')
  })

  it('records a format version, so a future reader can tell what it is holding', () => {
    expect(buildHouseholdExport(EMPTY).formatVersion).toBe(1)
  })
})

describe('serializeExport', () => {
  it('carries no key material, ciphertext or wrapped key anywhere in the file', () => {
    const json = serializeExport(
      buildHouseholdExport({
        ...EMPTY,
        household: { state: 'ok', household: household({ name: 'Household' }) },
        holdings: {
          holdings: [holding({ investedAmount: '1' })],
          unreadableCount: 0,
          notYetEncryptedCount: 0,
        },
      }),
    )

    // The export is deliberately plaintext — that is what makes it a usable
    // backup. What it must never do is carry the material that unlocks the
    // *server's* copy, which would turn a downloaded file into a full compromise.
    for (const forbidden of [
      'ciphertext',
      'wrappedDek',
      'wrapped_dek',
      'passphraseSalt',
      'recoverySalt',
      'dataKey',
      'kdfAlg',
    ]) {
      expect(json).not.toContain(forbidden)
    }
  })

  it('produces readable JSON rather than a single line, since a human may need to read it', () => {
    const json = serializeExport(buildHouseholdExport(EMPTY))
    expect(json).toContain('\n')
    expect(() => JSON.parse(json) as unknown).not.toThrow()
  })
})

describe('exportFilename', () => {
  it('is dated, so two exports do not overwrite each other in a downloads folder', () => {
    expect(exportFilename(new Date('2026-08-02T10:00:00.000Z'))).toBe(
      'household-financial-plan-2026-08-02.json',
    )
  })
})

function household(over: Partial<Household>): Household {
  return {
    id: 'h1',
    ownerUserId: 'user_1',
    name: 'A Household',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function member(over: Partial<FamilyMember>): FamilyMember {
  return {
    id: 'm1',
    householdId: 'h1',
    name: 'A Member',
    relationship: 'self',
    dateOfBirth: '1990-01-01',
    riskProfile: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function holding(over: Partial<Holding>): Holding {
  return {
    id: 'ho1',
    householdId: 'h1',
    memberId: 'm1',
    instrumentId: 'ppf',
    assetClass: 'debt',
    investedAmount: '1000',
    currentValue: '1100',
    units: null,
    monthlySip: null,
    startDate: null,
    maturityDate: null,
    nominee: null,
    isEmergencyFund: false,
    notes: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function protection(over: Partial<Protection>): Protection {
  return {
    id: 'p1',
    householdId: 'h1',
    memberId: 'm1',
    type: 'term-life',
    coverAmount: '5000000',
    premium: null,
    provider: null,
    status: 'active',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}
