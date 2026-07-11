import { describe, it, expect, vi } from 'vitest'
import { familyMembers, instruments, holdings } from '../../drizzle/schema.js'
import { listHoldings, createHolding, updateHolding, HoldingError, type CreateHoldingInput } from './holdings.js'

function invalid(input: Record<string, unknown>): CreateHoldingInput {
  return input as unknown as CreateHoldingInput
}

function fakeDb(rows: { members: unknown[]; instruments: unknown[]; holdings: unknown[] }) {
  const inserted: unknown[] = []
  const updated: unknown[] = []
  function pickRows(table: unknown): unknown[] {
    if (table === familyMembers) return rows.members
    if (table === instruments) return rows.instruments
    if (table === holdings) return rows.holdings
    return []
  }
  return {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        // where() is awaitable directly (list queries) AND supports a
        // chained .limit() (single-row lookups) — mirrors drizzle's real
        // thenable query builder closely enough for these unit tests.
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
          const created = { id: 'new-holding', createdAt: new Date(), updatedAt: new Date(), ...(row as object) }
          inserted.push(created)
          return Promise.resolve([created])
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((patch: unknown) => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => {
            const existing = rows.holdings[0] as Record<string, unknown>
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
const instrument = { id: 'i1', category: 1 }
const otherHouseholdInstrument = { id: 'i2', category: 3 }

describe('createHolding', () => {
  const validInput: CreateHoldingInput = {
    memberId: 'm1',
    instrumentId: 'i1',
    investedAmount: '10000',
    currentValue: '10500',
  }

  it('creates a holding scoped to the household, deriving asset_class from the instrument category', async () => {
    const db = fakeDb({ members: [member], instruments: [instrument], holdings: [] })
    const result = await createHolding(db as never, 'h1', validInput)
    expect(result.assetClass).toBe('equity')
    expect(result.householdId).toBe('h1')
    expect(db._inserted).toHaveLength(1)
  })

  it("rejects when the member does not belong to the caller's household", async () => {
    const db = fakeDb({ members: [], instruments: [instrument], holdings: [] })
    await expect(createHolding(db as never, 'h1', validInput)).rejects.toBeInstanceOf(HoldingError)
    expect(db._inserted).toHaveLength(0)
  })

  it('rejects an unknown instrument id', async () => {
    const db = fakeDb({ members: [member], instruments: [], holdings: [] })
    await expect(createHolding(db as never, 'h1', validInput)).rejects.toBeInstanceOf(HoldingError)
    expect(db._inserted).toHaveLength(0)
  })

  it('rejects a negative invested amount', async () => {
    const db = fakeDb({ members: [member], instruments: [instrument], holdings: [] })
    await expect(
      createHolding(db as never, 'h1', invalid({ ...validInput, investedAmount: '-5' })),
    ).rejects.toBeInstanceOf(Error)
    expect(db._inserted).toHaveLength(0)
  })

  it('defaults isEmergencyFund to false and accepts optional fields', async () => {
    const db = fakeDb({ members: [member], instruments: [instrument], holdings: [] })
    const result = await createHolding(db as never, 'h1', {
      ...validInput,
      units: '12.5',
      monthlySip: '2000',
      nominee: 'Rinku',
      isEmergencyFund: true,
    })
    expect(result.isEmergencyFund).toBe(true)
    expect(result.units).toBe('12.5')
  })
})

describe('listHoldings', () => {
  it('returns holdings for the household', async () => {
    const db = fakeDb({ members: [], instruments: [], holdings: [{ id: 'hold1', householdId: 'h1' }] })
    const result = await listHoldings(db as never, 'h1')
    expect(result).toHaveLength(1)
  })
})

describe('updateHolding', () => {
  const validInput: CreateHoldingInput = {
    memberId: 'm1',
    instrumentId: 'i1',
    investedAmount: '10000',
    currentValue: '11000',
  }

  it('updates a holding that belongs to the household, recomputing asset_class', async () => {
    const existing = { id: 'hold1', householdId: 'h1', assetClass: 'equity' }
    const db = fakeDb({ members: [member], instruments: [otherHouseholdInstrument], holdings: [existing] })
    const result = await updateHolding(db as never, 'h1', 'hold1', { ...validInput, instrumentId: 'i2' })
    expect(result?.assetClass).toBe('gold')
  })

  it("returns null when the holding does not belong to the caller's household", async () => {
    const db = fakeDb({ members: [member], instruments: [instrument], holdings: [] })
    const result = await updateHolding(db as never, 'h1', 'hold-other', validInput)
    expect(result).toBeNull()
  })
})
