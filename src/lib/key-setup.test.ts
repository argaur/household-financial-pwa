import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import 'fake-indexeddb/auto'
import {
  deriveKeyFromPassphrase,
  deriveKeyFromRecoveryCode,
  fromBase64Url,
  unwrapDataKey,
  isCryptoError,
  KDF_ALG,
  PBKDF2_ITERATIONS,
} from './crypto'
import { getVault, setVault, clearVault } from './crypto/key-store'
import { getPendingKeyMaterial, clearPendingKeyMaterial } from './crypto/pending-key-material'
import { WeakPassphraseError } from './passphrase-strength'
import {
  prepareKeySetup,
  completeKeySetup,
  unlockWithPassphrase,
  unlockWithRecoveryCode,
  resolveVaultState,
} from './key-setup'
import type { HouseholdKeys } from './household-keys-api'
import { jsonResponse } from '@/test/encrypted-fixtures'

const STRONG = 'quiet lantern rutabaga sundial 41'
const TOKEN = 'test-token'

function calls() {
  return vi.mocked(fetch).mock.calls as unknown as Array<[string, RequestInit | undefined]>
}

function bodyOf(index: number): Record<string, unknown> {
  return JSON.parse(String(calls()[index][1]?.body)) as Record<string, unknown>
}

/** A fresh browser: empty IndexedDB, no vault, no pending material. */
async function freshBrowser() {
  globalThis.indexedDB = new IDBFactory()
  await clearVault()
  await clearPendingKeyMaterial()
}

describe('key setup', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn())
    await freshBrowser()
  })

  describe('the strength floor is enforced inside the setup path', () => {
    // Same table as passphrase-strength.test.ts, re-asserted one layer down:
    // the UI's disabled button is not the only thing standing between a weak
    // passphrase and real key material.
    const WEAK = ['', 'short', 'password1234', 'P@ssw0rd1234', 'F1n4nc14lPl4nn1ng', 'aaaaaaaaaaaaaa']

    it.each(WEAK)('refuses %j and creates no key material at all', async (weak) => {
      await expect(prepareKeySetup(weak)).rejects.toBeInstanceOf(WeakPassphraseError)
      expect(await getVault()).toBeNull()
      expect(await getPendingKeyMaterial()).toBeNull()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('never puts the rejected passphrase in the error', async () => {
      await expect(prepareKeySetup('password1234')).rejects.toSatisfy(
        (err: unknown) => !String(err).includes('password1234'),
      )
    })
  })

  it('unlocks the vault with a non-extractable key for a client-generated household id', async () => {
    const prepared = await prepareKeySetup(STRONG)

    const vault = await getVault()
    expect(vault).not.toBeNull()
    expect(vault?.householdId).toBe(prepared.householdId)
    expect(vault?.dataKey.extractable).toBe(false)
  })

  it('wraps the data key twice, under separate salts and separate IVs', async () => {
    await prepareKeySetup(STRONG)
    const pending = await getPendingKeyMaterial()
    expect(pending).not.toBeNull()
    const m = pending!.material

    expect(m.kdfAlg).toBe(KDF_ALG)
    expect(m.kdfIterations).toBe(PBKDF2_ITERATIONS)
    // Nonce reuse across two wraps under different keys is the exact mistake
    // this asserts against.
    expect(m.passphraseWrapIv).not.toBe(m.recoveryWrapIv)
    expect(m.passphraseSalt).not.toBe(m.recoverySalt)
    expect(m.wrappedDekPassphrase).not.toBe(m.wrappedDekRecovery)
  })

  it('produces a passphrase copy that the passphrase actually opens', async () => {
    await prepareKeySetup(STRONG)
    const m = (await getPendingKeyMaterial())!.material

    const wrappingKey = await deriveKeyFromPassphrase(STRONG, fromBase64Url(m.passphraseSalt), m.kdfIterations)
    const dataKey = await unwrapDataKey(m.wrappedDekPassphrase, m.passphraseWrapIv, wrappingKey)
    expect(dataKey.type).toBe('secret')
    expect(dataKey.extractable).toBe(false)
  })

  it('produces a recovery copy that the code shown on screen actually opens', async () => {
    const prepared = await prepareKeySetup(STRONG)
    const m = (await getPendingKeyMaterial())!.material

    const wrappingKey = await deriveKeyFromRecoveryCode(
      prepared.recoveryCode,
      fromBase64Url(m.recoverySalt),
      m.kdfIterations,
    )
    const dataKey = await unwrapDataKey(m.wrappedDekRecovery, m.recoveryWrapIv, wrappingKey)
    expect(dataKey.type).toBe('secret')
  })

  it('shows the recovery code in readable hyphen-grouped Crockford base32', async () => {
    const { recoveryCode } = await prepareKeySetup(STRONG)
    expect(recoveryCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{1,4}){5,6}$/)
  })

  it('gives a different household id, code and key to every setup', async () => {
    const first = await prepareKeySetup(STRONG)
    await freshBrowser()
    const second = await prepareKeySetup(STRONG)
    expect(first.householdId).not.toBe(second.householdId)
    expect(first.recoveryCode).not.toBe(second.recoveryCode)
  })
})

describe('completeKeySetup', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn())
    await freshBrowser()
  })

  it('does nothing when there is no pending material', async () => {
    expect(await completeKeySetup(TOKEN)).toBe('nothing-pending')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('posts the wrapped key material and clears the pending copy', async () => {
    await prepareKeySetup(STRONG)
    const material = (await getPendingKeyMaterial())!.material
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ householdKeys: {} }, 201))

    expect(await completeKeySetup(TOKEN)).toBe('created')
    expect(calls()[0][0]).toBe('/api/household-keys')
    expect(calls()[0][1]?.method).toBe('POST')
    expect(bodyOf(0)).toEqual({ ...material })
    expect(await getPendingKeyMaterial()).toBeNull()
  })

  it('never sends the passphrase or the recovery code to the server', async () => {
    const { recoveryCode } = await prepareKeySetup(STRONG)
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ householdKeys: {} }, 201))
    await completeKeySetup(TOKEN)

    const raw = String(calls()[0][1]?.body)
    expect(raw).not.toContain(STRONG)
    expect(raw).not.toContain(recoveryCode)
    expect(raw).not.toContain(recoveryCode.replace(/-/g, ''))
  })

  it('treats a 409 as "already set up" and never retries with force', async () => {
    await prepareKeySetup(STRONG)
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'household_keys_exist' }, 409))

    expect(await completeKeySetup(TOKEN)).toBe('already-exists')
    // Exactly one request. Overwriting existing key material would make every
    // encrypted row in the household unreadable forever.
    expect(fetch).toHaveBeenCalledTimes(1)
    // The pending copy is dropped: the server's row is authoritative.
    expect(await getPendingKeyMaterial()).toBeNull()
  })

  it('keeps the pending material when the POST fails for any other reason', async () => {
    await prepareKeySetup(STRONG)
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'boom' }, 500))

    await expect(completeKeySetup(TOKEN)).rejects.toThrow()
    expect(await getPendingKeyMaterial()).not.toBeNull()
  })
})

describe('unlocking', () => {
  let keys: HouseholdKeys
  let recoveryCode: string
  let householdId: string

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn())
    await freshBrowser()
    const prepared = await prepareKeySetup(STRONG)
    recoveryCode = prepared.recoveryCode
    householdId = prepared.householdId
    keys = {
      householdId,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...(await getPendingKeyMaterial())!.material,
    }
    // Simulate the return visit: server has the key material, browser does not.
    await freshBrowser()
  })

  it('restores the vault with the correct passphrase', async () => {
    await unlockWithPassphrase(keys, STRONG)
    const vault = await getVault()
    expect(vault?.householdId).toBe(householdId)
    expect(vault?.dataKey.extractable).toBe(false)
  })

  it('leaves the vault locked on a wrong passphrase, with an indistinguishable failure', async () => {
    await expect(unlockWithPassphrase(keys, 'a different quiet lantern 42')).rejects.toSatisfy(
      (err: unknown) => isCryptoError(err) && err.code === 'UNWRAP_FAILED',
    )
    expect(await getVault()).toBeNull()
  })

  it('fails identically on a tampered blob — the message cannot tell them apart', async () => {
    const wrapped = keys.wrappedDekPassphrase
    const tampered: HouseholdKeys = {
      ...keys,
      wrappedDekPassphrase: (wrapped[0] === 'A' ? 'B' : 'A') + wrapped.slice(1),
    }

    let wrongPassphraseMessage = ''
    let tamperedMessage = ''
    await unlockWithPassphrase(keys, 'a different quiet lantern 42').catch((e: Error) => {
      wrongPassphraseMessage = e.message
    })
    await unlockWithPassphrase(tampered, STRONG).catch((e: Error) => {
      tamperedMessage = e.message
    })
    expect(wrongPassphraseMessage).toBe(tamperedMessage)
    expect(await getVault()).toBeNull()
  })

  it('unlocks with the recovery code', async () => {
    await unlockWithRecoveryCode(keys, recoveryCode)
    expect((await getVault())?.householdId).toBe(householdId)
  })

  it('unlocks with a lowercase, regrouped retype of the recovery code', async () => {
    const retyped = recoveryCode.replace(/-/g, '').toLowerCase().replace(/(.{6})/g, '$1 ').trim()
    await unlockWithRecoveryCode(keys, retyped)
    expect((await getVault())?.householdId).toBe(householdId)
  })

  it('rejects a wrong recovery code and leaves the vault locked', async () => {
    const wrong = recoveryCode.replace(/[0-9A-Z]/, (c) => (c === 'Z' ? 'Y' : 'Z'))
    await expect(unlockWithRecoveryCode(keys, wrong)).rejects.toThrow()
    expect(await getVault()).toBeNull()
  })
})

describe('resolveVaultState — the interrupted-setup paths', () => {
  const HOUSEHOLD_ID = '11111111-2222-3333-4444-555555555555'

  function serverResponses(options: { keys: unknown; household: unknown }) {
    vi.mocked(fetch).mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.startsWith('/api/household-keys')) {
        return Promise.resolve(
          options.keys ? jsonResponse({ householdKeys: options.keys }) : jsonResponse({ error: 'household_keys_not_found' }, 404),
        )
      }
      return Promise.resolve(jsonResponse({ household: options.household }))
    })
  }

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn())
    await freshBrowser()
  })

  it('routes a brand-new user to key setup', async () => {
    serverResponses({ keys: null, household: null })
    expect((await resolveVaultState(TOKEN)).state).toBe('key-setup')
  })

  it('routes a return visit with key material and an empty vault to unlock', async () => {
    serverResponses({ keys: { householdId: HOUSEHOLD_ID, kdfAlg: KDF_ALG }, household: { id: HOUSEHOLD_ID } })
    const resolved = await resolveVaultState(TOKEN)
    expect(resolved.state).toBe('unlock')
  })

  it('routes an unlocked vault whose household has key material to ready', async () => {
    const dataKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    await setVault({ householdId: HOUSEHOLD_ID, dataKey })
    serverResponses({ keys: { householdId: HOUSEHOLD_ID, kdfAlg: KDF_ALG }, household: { id: HOUSEHOLD_ID } })
    expect((await resolveVaultState(TOKEN)).state).toBe('ready')
  })

  it('routes a vault holding a DIFFERENT household to unlock, not ready', async () => {
    const dataKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    await setVault({ householdId: 'some-other-household', dataKey })
    serverResponses({ keys: { householdId: HOUSEHOLD_ID, kdfAlg: KDF_ALG }, household: { id: HOUSEHOLD_ID } })
    expect((await resolveVaultState(TOKEN)).state).toBe('unlock')
  })

  it('routes an interrupted setup that never reached the household to ready, so the household is created next', async () => {
    // prepareKeySetup ran, the POST /api/household never did.
    const prepared = await prepareKeySetup(STRONG)
    serverResponses({ keys: null, household: null })
    const resolved = await resolveVaultState(TOKEN)
    expect(resolved.state).toBe('ready')
    expect(resolved.state === 'ready' && resolved.vault.householdId).toBe(prepared.householdId)
  })

  it('self-heals an interrupted setup that created the household but not the key row', async () => {
    const prepared = await prepareKeySetup(STRONG)
    serverResponses({ keys: null, household: { id: prepared.householdId } })
    expect((await resolveVaultState(TOKEN)).state).toBe('completing-setup')
  })

  it('names the unrecoverable state when the household exists but nothing in the browser can open it', async () => {
    serverResponses({ keys: null, household: { id: HOUSEHOLD_ID } })
    const resolved = await resolveVaultState(TOKEN)
    expect(resolved.state).toBe('unrecoverable')
    expect(resolved.state === 'unrecoverable' && resolved.householdId).toBe(HOUSEHOLD_ID)
  })

  it('does not delete anything when it reports unrecoverable', async () => {
    serverResponses({ keys: null, household: { id: HOUSEHOLD_ID } })
    await resolveVaultState(TOKEN)
    const methods = calls().map((c) => c[1]?.method ?? 'GET')
    expect(methods.every((m) => m === 'GET')).toBe(true)
  })
})
