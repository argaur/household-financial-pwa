import { describe, it, expect, vi } from 'vitest'
import {
  listFamilyMembers,
  createFamilyMember,
  updateFamilyMember,
  removeFamilyMember,
  type CreateFamilyMemberInput,
} from './family-members.js'

/** Same shape as server/lib/holdings.test.ts's fake — see the note there. */
function fakeDb(existingRows: unknown[], options: { updateMatches?: boolean } = {}) {
  const insertedRows: Array<Record<string, unknown>> = []
  const updatedPatches: Array<Record<string, unknown>> = []
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
    delete: vi.fn(() => ({
      where: vi.fn((cond: unknown) => {
        deletedCalls.push(cond)
        return Promise.resolve([])
      }),
    })),
    _insertedRows: insertedRows,
    _updatedPatches: updatedPatches,
    _deletedCalls: deletedCalls,
  }
}

const envelope = {
  ciphertext: 'Y2lwaGVydGV4dC1ieXRlcw',
  iv: 'aXYtYnl0ZXMtMTIx',
  alg: 'AES-256-GCM' as const,
}

const validInput: CreateFamilyMemberInput = { id: 'member-1', ...envelope }

describe('createFamilyMember', () => {
  it('stores the envelope under the caller household and nothing else', async () => {
    const db = fakeDb([])
    const result = await createFamilyMember(db as never, 'h1', validInput)

    expect(result.householdId).toBe('h1')
    // No name, relationship, date of birth or risk profile can reach the
    // database from here — they only exist inside the ciphertext.
    expect(Object.keys(db._insertedRows[0]).sort()).toEqual(['alg', 'ciphertext', 'householdId', 'id', 'iv'])
  })
})

describe('listFamilyMembers', () => {
  it('returns the household members', async () => {
    const db = fakeDb([{ id: 'member-1', householdId: 'h1' }])
    await expect(listFamilyMembers(db as never, 'h1')).resolves.toHaveLength(1)
  })
})

describe('updateFamilyMember', () => {
  const updateInput = { ...envelope, expectedVersion: 1 }

  it('writes the new envelope and bumps the version to expectedVersion + 1', async () => {
    const db = fakeDb([{ id: 'member-1', householdId: 'h1', version: 1 }])
    const outcome = await updateFamilyMember(db as never, 'h1', 'member-1', updateInput)
    expect(outcome.status).toBe('updated')
    expect(db._updatedPatches[0].version).toBe(2)
    expect(db._updatedPatches[0].ciphertext).toBe(envelope.ciphertext)
  })

  it("reports not_found when the member does not belong to the caller's household", async () => {
    const db = fakeDb([])
    await expect(updateFamilyMember(db as never, 'h1', 'member-other', updateInput)).resolves.toEqual({
      status: 'not_found',
    })
    expect(db._updatedPatches).toHaveLength(0)
  })

  it('reports a conflict when the conditional update matches no row', async () => {
    const db = fakeDb([{ id: 'member-1', householdId: 'h1', version: 5 }], { updateMatches: false })
    await expect(updateFamilyMember(db as never, 'h1', 'member-1', updateInput)).resolves.toEqual({
      status: 'conflict',
    })
  })
})

describe('removeFamilyMember', () => {
  it('removes a member that belongs to the household', async () => {
    const db = fakeDb([{ id: 'member-1', householdId: 'h1' }])
    await expect(removeFamilyMember(db as never, 'h1', 'member-1')).resolves.toBe(true)
    expect(db._deletedCalls).toHaveLength(1)
  })

  it("refuses to remove a member from another household and issues no delete", async () => {
    const db = fakeDb([])
    await expect(removeFamilyMember(db as never, 'h1', 'member-other')).resolves.toBe(false)
    expect(db._deletedCalls).toHaveLength(0)
  })
})
