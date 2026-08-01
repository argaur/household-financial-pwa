import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { VaultLockedError, type Vault } from './crypto/key-store'
import {
  listFamilyMembers,
  createFamilyMember,
  updateFamilyMember,
  removeFamilyMember,
  FamilyMembersApiError,
  type CreateFamilyMemberInput,
} from './family-members-api'
import {
  unlockTestVault,
  lockTestVault,
  wireRow,
  legacyWireRow,
  corrupt,
  requestBody,
  rawRequestBody,
  jsonResponse,
} from '@/test/encrypted-fixtures'

const NAME = 'Ananya Verma'
const DOB = '1991-03-14'

const payload = {
  name: NAME,
  relationship: 'spouse' as const,
  dateOfBirth: DOB,
  riskProfile: 'moderate' as const,
}

const input: CreateFamilyMemberInput = {
  name: NAME,
  relationship: 'spouse',
  dateOfBirth: DOB,
  riskProfile: 'moderate',
}

function calls() {
  return vi.mocked(fetch).mock.calls as unknown as Array<[unknown, RequestInit | undefined]>
}

describe('family-members-api', () => {
  let vault: Vault

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn())
    vault = await unlockTestVault()
  })

  it('decrypts a stored member back to the identical object', async () => {
    const row = await wireRow('family_members', vault, { id: 'member-1', payload })
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ members: [row] }))

    const result = await listFamilyMembers('token')
    expect(result.members).toEqual([
      {
        ...payload,
        id: 'member-1',
        householdId: vault.householdId,
        version: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    expect(result.unreadableCount).toBe(0)
  })

  it('attaches the bearer token', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ members: [] }))
    await listFamilyMembers('abc123')
    expect((calls()[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer abc123')
  })

  it('a create body contains no name, relationship or date of birth', async () => {
    vi.mocked(fetch).mockImplementation((async (_url: unknown, init: unknown) => {
      const sent = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>
      return jsonResponse(
        {
          member: {
            id: sent.id,
            householdId: vault.householdId,
            ciphertext: sent.ciphertext,
            iv: sent.iv,
            alg: sent.alg,
            version: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
        201,
      )
    }) as typeof fetch)

    const created = await createFamilyMember('token', input)
    expect(created.name).toBe(NAME)

    const raw = rawRequestBody(calls())
    expect(raw).not.toContain(NAME)
    expect(raw).not.toContain(DOB)
    expect(raw).not.toContain('spouse')
    expect(raw).not.toContain('moderate')
    expect(Object.keys(requestBody(calls())).sort()).toEqual(['alg', 'ciphertext', 'id', 'iv'])
  })

  it('an update sends expectedVersion and no plaintext', async () => {
    vi.mocked(fetch).mockImplementation((async (_url: unknown, init: unknown) => {
      const sent = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>
      return jsonResponse({
        member: {
          id: 'member-1',
          householdId: vault.householdId,
          ciphertext: sent.ciphertext,
          iv: sent.iv,
          alg: sent.alg,
          version: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      })
    }) as typeof fetch)

    const updated = await updateFamilyMember('token', 'member-1', input, 2)
    expect(updated.version).toBe(3)

    const body = requestBody(calls())
    expect(Object.keys(body).sort()).toEqual(['alg', 'ciphertext', 'expectedVersion', 'iv'])
    expect(body.expectedVersion).toBe(2)
    expect(rawRequestBody(calls())).not.toContain(NAME)
    expect(calls()[0][0]).toBe('/api/family-members?id=member-1')
    expect(calls()[0][1]?.method).toBe('PATCH')
  })

  it('surfaces a 409 as a version conflict', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'version_conflict' }, 409))
    await expect(updateFamilyMember('token', 'member-1', input, 2)).rejects.toMatchObject({ status: 409 })
  })

  it('isolates a corrupt row and reports a legacy row separately', async () => {
    const good = await wireRow('family_members', vault, { id: 'member-1', payload })
    const bad = corrupt(await wireRow('family_members', vault, { id: 'member-2', payload }))
    const legacy = legacyWireRow('member-legacy', vault.householdId)
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ members: [good, bad, legacy] }))

    const result = await listFamilyMembers('token')
    expect(result.members.map((m) => m.id)).toEqual(['member-1'])
    expect(result.unreadableCount).toBe(1)
    expect(result.notYetEncryptedCount).toBe(1)
  })

  it('fails with VaultLockedError when nothing is unlocked', async () => {
    await lockTestVault()
    await expect(listFamilyMembers('token')).rejects.toBeInstanceOf(VaultLockedError)
    await expect(createFamilyMember('token', input)).rejects.toBeInstanceOf(VaultLockedError)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('throws FamilyMembersApiError with the server error code on failure', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'invalid_member' }, 400))
    await expect(createFamilyMember('token', input)).rejects.toBeInstanceOf(FamilyMembersApiError)
  })

  it('removes a member via the ?id= query-param URL', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }))
    await removeFamilyMember('token', 'member-1')
    expect(calls()[0][0]).toBe('/api/family-members?id=member-1')
    expect(calls()[0][1]?.method).toBe('DELETE')
  })
})
