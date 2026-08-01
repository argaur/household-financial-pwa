import { describe, it, expect, vi } from 'vitest'
import { familyMembers, protection } from '../../drizzle/schema.js'
import { listProtection, createProtection, updateProtection, ProtectionError, type CreateProtectionInput } from './protection.js'

/** Same shape as server/lib/holdings.test.ts's fake — see the note there. */
function fakeDb(rows: { members: unknown[]; protection: unknown[] }, options: { updateMatches?: boolean } = {}) {
  const inserted: Array<Record<string, unknown>> = []
  const updated: Array<Record<string, unknown>> = []
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
      values: vi.fn((row: Record<string, unknown>) => ({
        returning: vi.fn(() => {
          inserted.push(row)
          return Promise.resolve([{ version: 1, createdAt: new Date(), updatedAt: new Date(), ...row }])
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((patch: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => {
            if (options.updateMatches === false) return Promise.resolve([])
            const existing = (rows.protection[0] ?? {}) as Record<string, unknown>
            const merged = { ...existing, ...patch }
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

const member = { id: 'member-1', householdId: 'h1' }

const envelope = {
  ciphertext: 'Y2lwaGVydGV4dC1ieXRlcw',
  iv: 'aXYtYnl0ZXMtMTIx',
  alg: 'AES-256-GCM' as const,
}

const validInput: CreateProtectionInput = { id: 'prot-1', memberId: 'member-1', ...envelope }

describe('createProtection', () => {
  it('stores the envelope under the caller household and nothing else', async () => {
    const db = fakeDb({ members: [member], protection: [] })
    const result = await createProtection(db as never, 'h1', validInput)

    expect(result.householdId).toBe('h1')
    expect(Object.keys(db._inserted[0]).sort()).toEqual([
      'alg',
      'ciphertext',
      'householdId',
      'id',
      'iv',
      'memberId',
    ])
  })

  it("rejects when the member does not belong to the caller's household", async () => {
    const db = fakeDb({ members: [], protection: [] })
    await expect(createProtection(db as never, 'h1', validInput)).rejects.toBeInstanceOf(ProtectionError)
    expect(db._inserted).toHaveLength(0)
  })
})

describe('listProtection', () => {
  it('returns protection records for the household', async () => {
    const db = fakeDb({ members: [], protection: [{ id: 'prot-1', householdId: 'h1' }] })
    await expect(listProtection(db as never, 'h1')).resolves.toHaveLength(1)
  })
})

describe('updateProtection', () => {
  const updateInput = { ...envelope, expectedVersion: 2 }

  it('writes the new envelope and bumps the version to expectedVersion + 1', async () => {
    const db = fakeDb({ members: [member], protection: [{ id: 'prot-1', householdId: 'h1', version: 2 }] })
    const outcome = await updateProtection(db as never, 'h1', 'prot-1', updateInput)
    expect(outcome.status).toBe('updated')
    expect(db._updated[0].version).toBe(3)
  })

  it("reports not_found when the record does not belong to the caller's household", async () => {
    const db = fakeDb({ members: [member], protection: [] })
    await expect(updateProtection(db as never, 'h1', 'prot-other', updateInput)).resolves.toEqual({
      status: 'not_found',
    })
  })

  it('reports a conflict when the conditional update matches no row', async () => {
    const db = fakeDb(
      { members: [member], protection: [{ id: 'prot-1', householdId: 'h1', version: 7 }] },
      { updateMatches: false },
    )
    await expect(updateProtection(db as never, 'h1', 'prot-1', updateInput)).resolves.toEqual({ status: 'conflict' })
  })
})
