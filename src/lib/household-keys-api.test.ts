import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import 'fake-indexeddb/auto'
import {
  fetchHouseholdKeys,
  createHouseholdKeys,
  HouseholdKeysApiError,
  type HouseholdKeyMaterial,
} from './household-keys-api'
import {
  setPendingKeyMaterial,
  getPendingKeyMaterial,
  clearPendingKeyMaterial,
} from './crypto/pending-key-material'
import { jsonResponse } from '@/test/encrypted-fixtures'

const MATERIAL: HouseholdKeyMaterial = {
  kdfAlg: 'PBKDF2-SHA256',
  kdfIterations: 600_000,
  passphraseSalt: 'c2FsdC1vbmU',
  wrappedDekPassphrase: 'd3JhcHBlZC1wYXNz',
  passphraseWrapIv: 'aXYtcGFzcw',
  recoverySalt: 'c2FsdC10d28',
  wrappedDekRecovery: 'd3JhcHBlZC1yZWM',
  recoveryWrapIv: 'aXYtcmVj',
}

describe('household-keys-api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('returns null on 404 — "not set up yet" is a state, not a failure', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'household_keys_not_found' }, 404))
    expect(await fetchHouseholdKeys('t')).toBeNull()
  })

  it('surfaces any other failure rather than pretending there is no key material', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'rate_limited' }, 429))
    await expect(fetchHouseholdKeys('t')).rejects.toBeInstanceOf(HouseholdKeysApiError)
  })

  it('sends the bearer token and never caches key material', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ householdKeys: { householdId: 'h1', ...MATERIAL } }))
    await fetchHouseholdKeys('token-abc')
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-abc')
    expect(init.cache).toBe('no-store')
  })

  it('reports a 409 as "already exists" instead of throwing', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'household_keys_exist' }, 409))
    expect(await createHouseholdKeys('t', MATERIAL)).toBe('already-exists')
  })

  it('reports a successful create', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ householdKeys: {} }, 201))
    expect(await createHouseholdKeys('t', MATERIAL)).toBe('created')
  })

  it('throws on a 400 rather than silently losing the key material', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'invalid_household_keys' }, 400))
    await expect(createHouseholdKeys('t', MATERIAL)).rejects.toBeInstanceOf(HouseholdKeysApiError)
  })
})

describe('pending key material', () => {
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    await clearPendingKeyMaterial()
  })

  it('round-trips the exact body the POST still owes the server', async () => {
    await setPendingKeyMaterial({ householdId: 'h1', material: MATERIAL })
    expect(await getPendingKeyMaterial()).toEqual({ householdId: 'h1', material: MATERIAL })
  })

  it('refuses to store an incomplete record', async () => {
    const incomplete = { ...MATERIAL, wrappedDekRecovery: '' } as HouseholdKeyMaterial
    await expect(setPendingKeyMaterial({ householdId: 'h1', material: incomplete })).rejects.toThrow()
    expect(await getPendingKeyMaterial()).toBeNull()
  })

  it('reports nothing pending once cleared', async () => {
    await setPendingKeyMaterial({ householdId: 'h1', material: MATERIAL })
    await clearPendingKeyMaterial()
    expect(await getPendingKeyMaterial()).toBeNull()
  })
})
