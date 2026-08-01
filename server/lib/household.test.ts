import { describe, it, expect, vi } from 'vitest'
import { getHouseholdForOwner, createHouseholdForOwner, updateHousehold } from './household.js'

function fakeDb(existingRows: unknown[], options: { updateMatches?: boolean } = {}) {
  const insertedRows: Array<Record<string, unknown>> = []
  const updatedPatches: Array<Record<string, unknown>> = []
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(existingRows)),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((row: Record<string, unknown>) => ({
        returning: vi.fn(() => {
          insertedRows.push(row)
          return Promise.resolve([{ version: 1, createdAt: new Date(), updatedAt: new Date(), ...row }])
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((patch: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => {
            if (options.updateMatches === false) return Promise.resolve([])
            updatedPatches.push(patch)
            const existing = (existingRows[0] ?? {}) as Record<string, unknown>
            return Promise.resolve([{ ...existing, ...patch }])
          }),
        })),
      })),
    })),
    _insertedRows: insertedRows,
    _updatedPatches: updatedPatches,
  }
}

const envelope = {
  ciphertext: 'Y2lwaGVydGV4dC1ieXRlcw',
  iv: 'aXYtYnl0ZXMtMTIx',
  alg: 'AES-256-GCM' as const,
}

describe('getHouseholdForOwner', () => {
  it('returns the household row when one exists for the owner', async () => {
    const db = fakeDb([{ id: 'h1', ownerUserId: 'user_a' }])
    await expect(getHouseholdForOwner(db as never, 'user_a')).resolves.toEqual({ id: 'h1', ownerUserId: 'user_a' })
  })

  it('returns null when the owner has no household', async () => {
    const db = fakeDb([])
    await expect(getHouseholdForOwner(db as never, 'user_b')).resolves.toBeNull()
  })
})

describe('createHouseholdForOwner', () => {
  it('creates a household from the client-supplied id and the session owner, and nothing else', async () => {
    const db = fakeDb([])
    const result = await createHouseholdForOwner(db as never, 'user_a', { id: 'h1', ...envelope })

    expect(result.ownerUserId).toBe('user_a')
    // The name is inside the ciphertext — no `name` column is ever written.
    expect(Object.keys(db._insertedRows[0]).sort()).toEqual(['alg', 'ciphertext', 'id', 'iv', 'ownerUserId'])
    expect(db._insertedRows[0].id).toBe('h1')
  })

  it('is idempotent — returns the existing household instead of inserting a duplicate', async () => {
    const db = fakeDb([{ id: 'h1', ownerUserId: 'user_a' }])
    const result = await createHouseholdForOwner(db as never, 'user_a', { id: 'h2', ...envelope })
    expect(result).toEqual({ id: 'h1', ownerUserId: 'user_a' })
    expect(db._insertedRows).toHaveLength(0)
  })

  it('never takes the owner from client input', async () => {
    const db = fakeDb([])
    await createHouseholdForOwner(db as never, 'user_a', { id: 'h1', ...envelope })
    expect(db._insertedRows[0].ownerUserId).toBe('user_a')
  })
})

describe('updateHousehold', () => {
  it('writes the new envelope and bumps the version to expectedVersion + 1', async () => {
    const db = fakeDb([{ id: 'h1', ownerUserId: 'user_a', version: 4 }])
    const outcome = await updateHousehold(db as never, 'h1', { ...envelope, expectedVersion: 4 })
    expect(outcome.status).toBe('updated')
    expect(db._updatedPatches[0].version).toBe(5)
  })

  it('reports a conflict when the stored version has already moved on', async () => {
    const db = fakeDb([{ id: 'h1', ownerUserId: 'user_a', version: 9 }], { updateMatches: false })
    await expect(updateHousehold(db as never, 'h1', { ...envelope, expectedVersion: 4 })).resolves.toEqual({
      status: 'conflict',
    })
  })
})
