import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { getHouseholdForOwner, createHouseholdForOwner } from './household.js'

function fakeDb(existingRows: unknown[]) {
  const insertedRows: unknown[] = []
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(existingRows)),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((row: unknown) => ({
        returning: vi.fn(() => {
          insertedRows.push(row)
          return Promise.resolve([{ id: 'new-id', createdAt: new Date(), updatedAt: new Date(), ...(row as object) }])
        }),
      })),
    })),
    _insertedRows: insertedRows,
  }
}

describe('getHouseholdForOwner', () => {
  it('returns the household row when one exists for the owner', async () => {
    const db = fakeDb([{ id: 'h1', ownerUserId: 'user_a', name: 'Gupta Family' }])
    const result = await getHouseholdForOwner(db as never, 'user_a')
    expect(result).toEqual({ id: 'h1', ownerUserId: 'user_a', name: 'Gupta Family' })
  })

  it('returns null when the owner has no household', async () => {
    const db = fakeDb([])
    const result = await getHouseholdForOwner(db as never, 'user_b')
    expect(result).toBeNull()
  })
})

describe('createHouseholdForOwner', () => {
  it('creates a new household scoped to the owner', async () => {
    const db = fakeDb([])
    const result = await createHouseholdForOwner(db as never, 'user_a', 'Gupta Family')
    expect(result.name).toBe('Gupta Family')
    expect(result.ownerUserId).toBe('user_a')
    expect(db._insertedRows).toHaveLength(1)
  })

  it('is idempotent — returns the existing household instead of inserting a duplicate', async () => {
    const db = fakeDb([{ id: 'h1', ownerUserId: 'user_a', name: 'Existing Family' }])
    const result = await createHouseholdForOwner(db as never, 'user_a', 'A Different Name')
    expect(result).toEqual({ id: 'h1', ownerUserId: 'user_a', name: 'Existing Family' })
    expect(db._insertedRows).toHaveLength(0)
  })

  it('rejects a blank household name with a ZodError, so callers can distinguish client input errors from server errors', async () => {
    const db = fakeDb([])
    await expect(createHouseholdForOwner(db as never, 'user_a', '   ')).rejects.toBeInstanceOf(z.ZodError)
    expect(db._insertedRows).toHaveLength(0)
  })

  it('rejects a household name over 100 characters', async () => {
    const db = fakeDb([])
    await expect(createHouseholdForOwner(db as never, 'user_a', 'x'.repeat(101))).rejects.toBeInstanceOf(z.ZodError)
    expect(db._insertedRows).toHaveLength(0)
  })
})
