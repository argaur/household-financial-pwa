import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listProtection, createProtection, updateProtection, ProtectionApiError } from './protection-api'

const protectionRecord = {
  id: 'prot1',
  householdId: 'h1',
  memberId: 'm1',
  type: 'term-life' as const,
  coverAmount: '5000000',
  premium: null,
  provider: null,
  status: 'active' as const,
  createdAt: '',
  updatedAt: '',
}

describe('protection-api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('listProtection returns an empty array when no records exist', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ protection: [] }), { status: 200 }))
    const result = await listProtection('token')
    expect(result).toEqual([])
  })

  it('createProtection returns the created record on success', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ protection: protectionRecord }), { status: 201 }))
    const result = await createProtection('token', {
      memberId: 'm1',
      type: 'term-life',
      coverAmount: '5000000',
      status: 'active',
    })
    expect(result).toEqual(protectionRecord)
  })

  it('updateProtection sends the id as a query param, not a path segment', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ protection: protectionRecord }), { status: 200 }))
    await updateProtection('token', 'prot1', {
      memberId: 'm1',
      type: 'health',
      coverAmount: '1000000',
      status: 'active',
    })
    const [path, init] = vi.mocked(fetch).mock.calls[0]
    expect(path).toBe('/api/protection?id=prot1')
    expect(init?.method).toBe('PATCH')
  })

  it('throws ProtectionApiError with the server error code on failure', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_protection' }), { status: 400 }))
    await expect(
      createProtection('token', { memberId: 'm1', type: 'term-life', coverAmount: '-5', status: 'active' }),
    ).rejects.toBeInstanceOf(ProtectionApiError)
  })
})
