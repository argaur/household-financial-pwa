import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchHousehold, createHousehold, HouseholdApiError } from './household-api'

describe('household-api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('fetchHousehold returns null when the user has no household yet', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ household: null }), { status: 200 }))
    const result = await fetchHousehold('token')
    expect(result).toBeNull()
  })

  it('fetchHousehold attaches the bearer token', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ household: null }), { status: 200 }))
    await fetchHousehold('abc123')
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer abc123')
  })

  it('createHousehold returns the created household on success', async () => {
    const household = { id: '1', ownerUserId: 'u1', name: 'Gupta Family', createdAt: '', updatedAt: '' }
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ household }), { status: 201 }))
    const result = await createHousehold('token', 'Gupta Family')
    expect(result).toEqual(household)
  })

  it('throws HouseholdApiError with the server error code on failure', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_name' }), { status: 400 }))
    await expect(createHousehold('token', '')).rejects.toBeInstanceOf(HouseholdApiError)
  })
})
