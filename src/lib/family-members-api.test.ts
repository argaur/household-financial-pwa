import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listFamilyMembers, createFamilyMember, FamilyMembersApiError } from './family-members-api'

describe('family-members-api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('listFamilyMembers returns an empty array when no members exist', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ members: [] }), { status: 200 }))
    const result = await listFamilyMembers('token')
    expect(result).toEqual([])
  })

  it('listFamilyMembers attaches the bearer token', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ members: [] }), { status: 200 }))
    await listFamilyMembers('abc123')
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer abc123')
  })

  it('createFamilyMember returns the created member on success', async () => {
    const member = {
      id: 'm1',
      householdId: 'h1',
      name: 'Gaurav Gupta',
      relationship: 'self' as const,
      dateOfBirth: '1990-01-01',
      createdAt: '',
      updatedAt: '',
    }
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ member }), { status: 201 }))
    const result = await createFamilyMember('token', {
      name: 'Gaurav Gupta',
      relationship: 'self',
      dateOfBirth: '1990-01-01',
    })
    expect(result).toEqual(member)
  })

  it('throws FamilyMembersApiError with the server error code on failure', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_member' }), { status: 400 }))
    await expect(
      createFamilyMember('token', { name: '', relationship: 'self', dateOfBirth: '1990-01-01' }),
    ).rejects.toBeInstanceOf(FamilyMembersApiError)
  })
})
