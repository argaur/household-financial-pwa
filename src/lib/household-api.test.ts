import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { VaultLockedError, type Vault } from './crypto/key-store'
import { fetchHousehold, createHousehold, updateHousehold, HouseholdApiError } from './household-api'
import {
  unlockTestVault,
  lockTestVault,
  wireRow,
  corrupt,
  requestBody,
  rawRequestBody,
  jsonResponse,
} from '@/test/encrypted-fixtures'

const HOUSEHOLD_NAME = 'Verma Family'

function calls() {
  return vi.mocked(fetch).mock.calls as unknown as Array<[unknown, RequestInit | undefined]>
}

/** The household's AAD householdId is its own id, so the fixture id must be the vault's. */
async function householdWire(vault: Vault, overrides: { version?: number; sealAtVersion?: number } = {}) {
  const row = await wireRow('households', vault, {
    id: vault.householdId,
    payload: { name: HOUSEHOLD_NAME },
    ...overrides,
  })
  const { householdId: _householdId, ...rest } = row
  return { ...rest, ownerUserId: 'user_1' }
}

describe('household-api', () => {
  let vault: Vault

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn())
    vault = await unlockTestVault()
  })

  it('reports state "absent" when the user has no household yet', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ household: null }))
    await expect(fetchHousehold('token')).resolves.toEqual({ state: 'absent' })
  })

  it('decrypts the household name back', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ household: await householdWire(vault) }))
    const result = await fetchHousehold('token')
    expect(result).toEqual({
      state: 'ok',
      household: {
        id: vault.householdId,
        ownerUserId: 'user_1',
        name: HOUSEHOLD_NAME,
        version: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    })
  })

  it('reports an unreadable household distinctly from an absent one', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ household: corrupt(await householdWire(vault)) }))
    const result = await fetchHousehold('token')
    expect(result.state).toBe('unreadable')
  })

  it('reports a legacy household row as not-yet-encrypted, not as absent', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        household: {
          id: vault.householdId,
          ownerUserId: 'user_1',
          ciphertext: null,
          iv: null,
          alg: null,
          version: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    )
    const result = await fetchHousehold('token')
    expect(result).toEqual({ state: 'not-yet-encrypted', id: vault.householdId })
  })

  it('attaches the bearer token', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ household: null }))
    await fetchHousehold('abc123')
    expect((calls()[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer abc123')
  })

  it('a create body contains no household name', async () => {
    vi.mocked(fetch).mockImplementation((async (_url: unknown, init: unknown) => {
      const sent = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>
      return jsonResponse(
        {
          household: {
            id: sent.id,
            ownerUserId: 'user_1',
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

    const created = await createHousehold('token', HOUSEHOLD_NAME)
    expect(created.name).toBe(HOUSEHOLD_NAME)
    // The new household takes the id the vault was unlocked for.
    expect(created.id).toBe(vault.householdId)

    expect(rawRequestBody(calls())).not.toContain(HOUSEHOLD_NAME)
    expect(Object.keys(requestBody(calls())).sort()).toEqual(['alg', 'ciphertext', 'id', 'iv'])
  })

  it('an update sends expectedVersion, no name, and no ?id=', async () => {
    vi.mocked(fetch).mockImplementation((async (_url: unknown, init: unknown) => {
      const sent = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>
      return jsonResponse({
        household: {
          id: vault.householdId,
          ownerUserId: 'user_1',
          ciphertext: sent.ciphertext,
          iv: sent.iv,
          alg: sent.alg,
          version: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      })
    }) as typeof fetch)

    const updated = await updateHousehold('token', 'Renamed Household', 2)
    expect(updated.name).toBe('Renamed Household')
    expect(updated.version).toBe(3)
    expect(calls()[0][0]).toBe('/api/household')
    expect(calls()[0][1]?.method).toBe('PATCH')
    expect(requestBody(calls()).expectedVersion).toBe(2)
    expect(rawRequestBody(calls())).not.toContain('Renamed Household')
  })

  it('surfaces a 409 as a version conflict', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'version_conflict' }, 409))
    await expect(updateHousehold('token', 'Renamed Household', 2)).rejects.toMatchObject({ status: 409 })
  })

  it('fails with VaultLockedError when nothing is unlocked', async () => {
    await lockTestVault()
    await expect(fetchHousehold('token')).rejects.toBeInstanceOf(VaultLockedError)
    await expect(createHousehold('token', HOUSEHOLD_NAME)).rejects.toBeInstanceOf(VaultLockedError)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('throws HouseholdApiError with the server error code on failure', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'invalid_household' }, 400))
    await expect(createHousehold('token', '')).rejects.toBeInstanceOf(HouseholdApiError)
  })
})
