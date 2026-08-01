import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { VaultLockedError, type Vault } from './crypto/key-store'
import { listProtection, createProtection, updateProtection, ProtectionApiError, type ProtectionInput } from './protection-api'
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

const PROVIDER = 'Example Life Insurance'

const payload = {
  type: 'term-life' as const,
  coverAmount: '10000000',
  premium: '14500',
  provider: PROVIDER,
  status: 'active' as const,
}

const input: ProtectionInput = {
  memberId: 'member-1',
  type: 'term-life',
  coverAmount: payload.coverAmount,
  premium: payload.premium,
  provider: PROVIDER,
  status: 'active',
}

function calls() {
  return vi.mocked(fetch).mock.calls as unknown as Array<[unknown, RequestInit | undefined]>
}

describe('protection-api', () => {
  let vault: Vault

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn())
    vault = await unlockTestVault()
  })

  it('decrypts a stored protection record back to the identical object', async () => {
    const row = await wireRow('protection', vault, { id: 'prot-1', payload, extra: { memberId: 'member-1' } })
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ protection: [row] }))

    const result = await listProtection('token')
    expect(result.protection).toEqual([
      {
        ...payload,
        id: 'prot-1',
        householdId: vault.householdId,
        memberId: 'member-1',
        version: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ])
  })

  it('a create body contains no cover amount, premium, provider or status', async () => {
    vi.mocked(fetch).mockImplementation((async (_url: unknown, init: unknown) => {
      const sent = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>
      return jsonResponse(
        {
          protection: {
            id: sent.id,
            householdId: vault.householdId,
            memberId: sent.memberId,
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

    await createProtection('token', input)

    const raw = rawRequestBody(calls())
    expect(raw).not.toContain('10000000')
    expect(raw).not.toContain('14500')
    expect(raw).not.toContain(PROVIDER)
    expect(raw).not.toContain('term-life')
    expect(raw).not.toContain('active')
    expect(Object.keys(requestBody(calls())).sort()).toEqual(['alg', 'ciphertext', 'id', 'iv', 'memberId'])
  })

  it('an update sends the id as a query param plus expectedVersion', async () => {
    vi.mocked(fetch).mockImplementation((async (_url: unknown, init: unknown) => {
      const sent = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>
      return jsonResponse({
        protection: {
          id: 'prot-1',
          householdId: vault.householdId,
          memberId: 'member-1',
          ciphertext: sent.ciphertext,
          iv: sent.iv,
          alg: sent.alg,
          version: 6,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      })
    }) as typeof fetch)

    const updated = await updateProtection('token', 'prot-1', input, 5)
    expect(updated.version).toBe(6)
    expect(calls()[0][0]).toBe('/api/protection?id=prot-1')
    expect(calls()[0][1]?.method).toBe('PATCH')
    expect(requestBody(calls()).expectedVersion).toBe(5)
    expect(rawRequestBody(calls())).not.toContain(PROVIDER)
  })

  it('surfaces a 409 as a version conflict', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'version_conflict' }, 409))
    await expect(updateProtection('token', 'prot-1', input, 5)).rejects.toMatchObject({ status: 409 })
  })

  it('isolates a corrupt row and reports a legacy row separately', async () => {
    const good = await wireRow('protection', vault, { id: 'prot-1', payload, extra: { memberId: 'member-1' } })
    const bad = corrupt(
      await wireRow('protection', vault, { id: 'prot-2', payload, extra: { memberId: 'member-1' } }),
    )
    const legacy = legacyWireRow('prot-legacy', vault.householdId, { memberId: 'member-1' })
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ protection: [good, bad, legacy] }))

    const result = await listProtection('token')
    expect(result.protection.map((p) => p.id)).toEqual(['prot-1'])
    expect(result.unreadableCount).toBe(1)
    expect(result.notYetEncryptedCount).toBe(1)
  })

  it('fails with VaultLockedError when nothing is unlocked', async () => {
    await lockTestVault()
    await expect(listProtection('token')).rejects.toBeInstanceOf(VaultLockedError)
    await expect(createProtection('token', input)).rejects.toBeInstanceOf(VaultLockedError)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('throws ProtectionApiError with the server error code on failure', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'invalid_protection' }, 400))
    await expect(createProtection('token', input)).rejects.toBeInstanceOf(ProtectionApiError)
  })
})
