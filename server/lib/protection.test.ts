import { describe, it, expect, vi } from 'vitest'
import { familyMembers, protection } from '../../drizzle/schema.js'
import { listProtection, createProtection, updateProtection, ProtectionError, type CreateProtectionInput } from './protection.js'

function invalid(input: Record<string, unknown>): CreateProtectionInput {
  return input as unknown as CreateProtectionInput
}

function fakeDb(rows: { members: unknown[]; protection: unknown[] }) {
  const inserted: unknown[] = []
  const updated: unknown[] = []
  function pickRows(table: unknown): unknown[] {
    if (table === familyMembers) return rows.members
    if (table === protection) return rows.protection
    return []
  }
  return {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => {
          const all = pickRows(table)
          const result = Promise.resolve(all) as Promise<unknown[]> & { limit: (n: number) => Promise<unknown[]> }
          result.limit = (n: number) => Promise.resolve(all.slice(0, n))
          return result
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((row: unknown) => ({
        returning: vi.fn(() => {
          const created = { id: 'new-protection', createdAt: new Date(), updatedAt: new Date(), ...(row as object) }
          inserted.push(created)
          return Promise.resolve([created])
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((patch: unknown) => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => {
            const existing = rows.protection[0] as Record<string, unknown>
            const merged = { ...existing, ...(patch as object), updatedAt: new Date() }
            updated.push(merged)
            return Promise.resolve([merged])
          }),
        })),
      })),
    })),
    _inserted: inserted,
    _updated: updated,
  }
}

const member = { id: 'm1', householdId: 'h1', name: 'Gaurav' }

describe('createProtection', () => {
  const validInput: CreateProtectionInput = {
    memberId: 'm1',
    type: 'term-life',
    coverAmount: '5000000',
    status: 'active',
  }

  it('creates a protection record scoped to the household', async () => {
    const db = fakeDb({ members: [member], protection: [] })
    const result = await createProtection(db as never, 'h1', validInput)
    expect(result.householdId).toBe('h1')
    expect(result.memberId).toBe('m1')
    expect(db._inserted).toHaveLength(1)
  })

  it("rejects when the member does not belong to the caller's household", async () => {
    const db = fakeDb({ members: [], protection: [] })
    await expect(createProtection(db as never, 'h1', validInput)).rejects.toBeInstanceOf(ProtectionError)
    expect(db._inserted).toHaveLength(0)
  })

  it('rejects a negative cover amount', async () => {
    const db = fakeDb({ members: [member], protection: [] })
    await expect(createProtection(db as never, 'h1', invalid({ ...validInput, coverAmount: '-5' }))).rejects.toBeInstanceOf(
      Error,
    )
    expect(db._inserted).toHaveLength(0)
  })

  it('rejects an invalid type enum', async () => {
    const db = fakeDb({ members: [member], protection: [] })
    await expect(createProtection(db as never, 'h1', invalid({ ...validInput, type: 'car' }))).rejects.toBeInstanceOf(Error)
    expect(db._inserted).toHaveLength(0)
  })

  it('rejects an invalid status enum', async () => {
    const db = fakeDb({ members: [member], protection: [] })
    await expect(
      createProtection(db as never, 'h1', invalid({ ...validInput, status: 'expired' })),
    ).rejects.toBeInstanceOf(Error)
    expect(db._inserted).toHaveLength(0)
  })

  it('accepts optional premium and provider', async () => {
    const db = fakeDb({ members: [member], protection: [] })
    const result = await createProtection(db as never, 'h1', {
      ...validInput,
      premium: '12000',
      provider: 'HDFC Life',
    })
    expect(result.premium).toBe('12000')
    expect(result.provider).toBe('HDFC Life')
  })
})

describe('listProtection', () => {
  it('returns protection records for the household', async () => {
    const db = fakeDb({ members: [], protection: [{ id: 'p1', householdId: 'h1' }] })
    const result = await listProtection(db as never, 'h1')
    expect(result).toHaveLength(1)
  })
})

describe('updateProtection', () => {
  const validInput: CreateProtectionInput = {
    memberId: 'm1',
    type: 'health',
    coverAmount: '1000000',
    status: 'active',
  }

  it('updates a protection record that belongs to the household', async () => {
    const existing = { id: 'p1', householdId: 'h1', type: 'term-life' }
    const db = fakeDb({ members: [member], protection: [existing] })
    const result = await updateProtection(db as never, 'h1', 'p1', validInput)
    expect(result?.type).toBe('health')
  })

  it("returns null when the record does not belong to the caller's household", async () => {
    const db = fakeDb({ members: [member], protection: [] })
    const result = await updateProtection(db as never, 'h1', 'p-other', validInput)
    expect(result).toBeNull()
  })

  it("rejects when the member does not belong to the caller's household", async () => {
    const existing = { id: 'p1', householdId: 'h1', type: 'term-life' }
    const db = fakeDb({ members: [], protection: [existing] })
    await expect(updateProtection(db as never, 'h1', 'p1', validInput)).rejects.toBeInstanceOf(ProtectionError)
  })
})
