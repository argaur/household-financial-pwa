import { describe, it, expect, vi } from 'vitest'
import { familyMembers, holdings } from '../../drizzle/schema.js'
import { listHoldings, createHolding, updateHolding, HoldingError, type CreateHoldingInput } from './holdings.js'

/**
 * The lib layer now stores and returns opaque envelopes. What is worth testing
 * here is the tenancy check and the shape of what reaches the database — that
 * no plaintext column is ever written. The 404-vs-409 behaviour of the
 * conditional update is asserted end-to-end in holdings.integration.test.ts,
 * where the WHERE clause is observable.
 */
function fakeDb(rows: { members: unknown[]; holdings: unknown[] }, options: { updateMatches?: boolean } = {}) {
  const inserted: Array<Record<string, unknown>> = []
  const updated: Array<Record<string, unknown>> = []
  function pickRows(table: unknown): unknown[] {
    if (table === familyMembers) return rows.members
    if (table === holdings) return rows.holdings
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
          // `inserted` records the raw values() payload, so a test can assert
          // exactly which columns the lib layer writes.
          inserted.push(row)
          return Promise.resolve([{ version: 1, createdAt: new Date(), updatedAt: new Date(), ...row }])
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((patch: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => {
            // `updateMatches: false` models the conditional UPDATE matching no
            // row because the stored version has moved on.
            if (options.updateMatches === false) return Promise.resolve([])
            const existing = (rows.holdings[0] ?? {}) as Record<string, unknown>
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

const validInput: CreateHoldingInput = {
  id: 'hold-1',
  memberId: 'member-1',
  ...envelope,
}

describe('createHolding', () => {
  it('stores the envelope under the caller household and nothing else', async () => {
    const db = fakeDb({ members: [member], holdings: [] })
    const result = await createHolding(db as never, 'h1', validInput)

    expect(result.householdId).toBe('h1')
    expect(db._inserted).toHaveLength(1)
    // Exactly the readable columns plus the envelope — no amount, no asset
    // class, no instrument, no note can reach the database from here.
    expect(Object.keys(db._inserted[0]).sort()).toEqual([
      'alg',
      'ciphertext',
      'householdId',
      'id',
      'iv',
      'memberId',
    ])
  })

  it('leaves the version to the column default of 1 rather than accepting one', async () => {
    const db = fakeDb({ members: [member], holdings: [] })
    await createHolding(db as never, 'h1', validInput)
    expect(db._inserted[0].version).toBeUndefined()
  })

  it("rejects when the member does not belong to the caller's household", async () => {
    const db = fakeDb({ members: [], holdings: [] })
    await expect(createHolding(db as never, 'h1', validInput)).rejects.toBeInstanceOf(HoldingError)
    expect(db._inserted).toHaveLength(0)
  })
})

describe('listHoldings', () => {
  it('returns holdings for the household', async () => {
    const db = fakeDb({ members: [], holdings: [{ id: 'hold-1', householdId: 'h1' }] })
    const result = await listHoldings(db as never, 'h1')
    expect(result).toHaveLength(1)
  })
})

describe('updateHolding', () => {
  const updateInput = { ...envelope, expectedVersion: 3 }

  it('writes the new envelope and bumps the version to expectedVersion + 1', async () => {
    const db = fakeDb({ members: [member], holdings: [{ id: 'hold-1', householdId: 'h1', version: 3 }] })
    const outcome = await updateHolding(db as never, 'h1', 'hold-1', updateInput)

    expect(outcome.status).toBe('updated')
    expect(db._updated[0].version).toBe(4)
    expect(db._updated[0].ciphertext).toBe(envelope.ciphertext)
  })

  it("reports not_found when the holding does not belong to the caller's household", async () => {
    const db = fakeDb({ members: [member], holdings: [] })
    const outcome = await updateHolding(db as never, 'h1', 'hold-other', updateInput)
    expect(outcome).toEqual({ status: 'not_found' })
    expect(db._updated).toHaveLength(0)
  })

  it('reports a conflict when the conditional update matches no row', async () => {
    const db = fakeDb({ members: [member], holdings: [{ id: 'hold-1', householdId: 'h1', version: 9 }] }, { updateMatches: false })
    const outcome = await updateHolding(db as never, 'h1', 'hold-1', updateInput)
    expect(outcome).toEqual({ status: 'conflict' })
  })
})
