import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import {
  listFamilyMembers,
  createFamilyMember,
  updateFamilyMember,
  removeFamilyMember,
  type CreateFamilyMemberInput,
} from './family-members.js'

// Tests below deliberately pass invalid enum/date values to verify runtime
// rejection — cast past the narrow input type, which correctly rejects them
// at compile time too.
function invalid(input: Record<string, unknown>): CreateFamilyMemberInput {
  return input as unknown as CreateFamilyMemberInput
}

function fakeDb(existingRows: unknown[]) {
  const insertedRows: unknown[] = []
  const updatedPatches: unknown[] = []
  const deletedCalls: unknown[] = []
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const result = Promise.resolve(existingRows) as Promise<unknown[]> & { limit: (n: number) => Promise<unknown[]> }
          result.limit = (n: number) => Promise.resolve(existingRows.slice(0, n))
          return result
        }),
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
    update: vi.fn(() => ({
      set: vi.fn((patch: unknown) => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => {
            updatedPatches.push(patch)
            const existing = existingRows[0] as Record<string, unknown> | undefined
            if (!existing) return Promise.resolve([])
            return Promise.resolve([{ ...existing, ...(patch as object) }])
          }),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => {
        deletedCalls.push(true)
        return Promise.resolve([])
      }),
    })),
    _insertedRows: insertedRows,
    _updatedPatches: updatedPatches,
    _deletedCalls: deletedCalls,
  }
}

describe('listFamilyMembers', () => {
  it('returns the members for a household', async () => {
    const db = fakeDb([{ id: 'm1', householdId: 'h1', name: 'Gaurav Gupta', relationship: 'self' }])
    const result = await listFamilyMembers(db as never, 'h1')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Gaurav Gupta')
  })

  it('returns an empty array when the household has no members', async () => {
    const db = fakeDb([])
    const result = await listFamilyMembers(db as never, 'h1')
    expect(result).toEqual([])
  })
})

describe('createFamilyMember', () => {
  const validInput: CreateFamilyMemberInput = { name: 'Gaurav Gupta', relationship: 'self', dateOfBirth: '1990-01-01' }

  it('creates a member scoped to the household', async () => {
    const db = fakeDb([])
    const result = await createFamilyMember(db as never, 'h1', validInput)
    expect(result.name).toBe('Gaurav Gupta')
    expect(db._insertedRows).toHaveLength(1)
    expect((db._insertedRows[0] as { householdId: string }).householdId).toBe('h1')
  })

  it('accepts an optional risk profile', async () => {
    const db = fakeDb([])
    const result = await createFamilyMember(db as never, 'h1', { ...validInput, riskProfile: 'moderate' })
    expect(result.riskProfile).toBe('moderate')
  })

  it('rejects a blank name with a ZodError', async () => {
    const db = fakeDb([])
    await expect(createFamilyMember(db as never, 'h1', { ...validInput, name: '  ' })).rejects.toBeInstanceOf(z.ZodError)
    expect(db._insertedRows).toHaveLength(0)
  })

  it('rejects an invalid relationship value', async () => {
    const db = fakeDb([])
    await expect(
      createFamilyMember(db as never, 'h1', invalid({ ...validInput, relationship: 'sibling' })),
    ).rejects.toBeInstanceOf(z.ZodError)
    expect(db._insertedRows).toHaveLength(0)
  })

  it('rejects a missing date of birth', async () => {
    const db = fakeDb([])
    await expect(
      createFamilyMember(db as never, 'h1', { ...validInput, dateOfBirth: '' }),
    ).rejects.toBeInstanceOf(z.ZodError)
    expect(db._insertedRows).toHaveLength(0)
  })

  it('rejects a malformed date of birth', async () => {
    const db = fakeDb([])
    await expect(
      createFamilyMember(db as never, 'h1', { ...validInput, dateOfBirth: 'not-a-date' }),
    ).rejects.toBeInstanceOf(z.ZodError)
    expect(db._insertedRows).toHaveLength(0)
  })

  it('rejects a future date of birth', async () => {
    const db = fakeDb([])
    const future = new Date()
    future.setFullYear(future.getFullYear() + 1)
    const futureDate = future.toISOString().slice(0, 10)
    await expect(
      createFamilyMember(db as never, 'h1', { ...validInput, dateOfBirth: futureDate }),
    ).rejects.toBeInstanceOf(z.ZodError)
    expect(db._insertedRows).toHaveLength(0)
  })

  it('rejects an invalid risk profile value', async () => {
    const db = fakeDb([])
    await expect(
      createFamilyMember(db as never, 'h1', invalid({ ...validInput, riskProfile: 'reckless' })),
    ).rejects.toBeInstanceOf(z.ZodError)
    expect(db._insertedRows).toHaveLength(0)
  })
})

describe('updateFamilyMember', () => {
  const validInput: CreateFamilyMemberInput = { name: 'Gaurav Gupta', relationship: 'self', dateOfBirth: '1990-01-01' }

  it('updates a member that belongs to the household', async () => {
    const db = fakeDb([{ id: 'm1', householdId: 'h1', name: 'Old Name', relationship: 'self', dateOfBirth: '1990-01-01' }])
    const result = await updateFamilyMember(db as never, 'h1', 'm1', { ...validInput, name: 'New Name' })
    expect(result?.name).toBe('New Name')
    expect(db._updatedPatches).toHaveLength(1)
  })

  it('returns null when the member does not belong to this household (cross-household isolation)', async () => {
    const db = fakeDb([])
    const result = await updateFamilyMember(db as never, 'h1', 'm-from-another-household', validInput)
    expect(result).toBeNull()
    expect(db._updatedPatches).toHaveLength(0)
  })

  it('rejects an invalid relationship value with a ZodError', async () => {
    const db = fakeDb([{ id: 'm1', householdId: 'h1', name: 'Old Name', relationship: 'self', dateOfBirth: '1990-01-01' }])
    await expect(
      updateFamilyMember(db as never, 'h1', 'm1', invalid({ ...validInput, relationship: 'sibling' })),
    ).rejects.toBeInstanceOf(z.ZodError)
    expect(db._updatedPatches).toHaveLength(0)
  })
})

describe('removeFamilyMember', () => {
  it('removes a member that belongs to the household', async () => {
    const db = fakeDb([{ id: 'm1', householdId: 'h1', name: 'Gaurav Gupta' }])
    const removed = await removeFamilyMember(db as never, 'h1', 'm1')
    expect(removed).toBe(true)
    expect(db._deletedCalls).toHaveLength(1)
  })

  it('returns false and never deletes when the member does not belong to this household', async () => {
    const db = fakeDb([])
    const removed = await removeFamilyMember(db as never, 'h1', 'm-from-another-household')
    expect(removed).toBe(false)
    expect(db._deletedCalls).toHaveLength(0)
  })
})
