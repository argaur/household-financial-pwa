import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listHoldings, createHolding, updateHolding, HoldingsApiError } from './holdings-api'

const holding = {
  id: 'hold1',
  householdId: 'h1',
  memberId: 'm1',
  instrumentId: 'i1',
  assetClass: 'equity' as const,
  investedAmount: '10000',
  currentValue: '10500',
  units: null,
  monthlySip: null,
  startDate: null,
  maturityDate: null,
  nominee: null,
  priceSource: 'manual',
  isEmergencyFund: false,
  notes: null,
  createdAt: '',
  updatedAt: '',
}

describe('holdings-api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('listHoldings returns an empty array when no holdings exist', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ holdings: [] }), { status: 200 }))
    const result = await listHoldings('token')
    expect(result).toEqual([])
  })

  it('createHolding returns the created holding on success', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ holding }), { status: 201 }))
    const result = await createHolding('token', {
      memberId: 'm1',
      instrumentId: 'i1',
      investedAmount: '10000',
      currentValue: '10500',
    })
    expect(result).toEqual(holding)
  })

  it('updateHolding sends the id as a query param, not a path segment', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ holding }), { status: 200 }))
    await updateHolding('token', 'hold1', {
      memberId: 'm1',
      instrumentId: 'i1',
      investedAmount: '10000',
      currentValue: '12000',
    })
    const [path, init] = vi.mocked(fetch).mock.calls[0]
    expect(path).toBe('/api/holdings?id=hold1')
    expect(init?.method).toBe('PATCH')
  })

  it('throws HoldingsApiError with the server error code on failure', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_holding' }), { status: 400 }))
    await expect(
      createHolding('token', { memberId: 'm1', instrumentId: 'i1', investedAmount: '-5', currentValue: '10' }),
    ).rejects.toBeInstanceOf(HoldingsApiError)
  })
})
