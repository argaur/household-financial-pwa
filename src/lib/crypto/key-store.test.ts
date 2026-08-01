import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { generateDataKey } from './keys'
import { VaultLockedError, getVault, setVault, requireVault, clearVault } from './key-store'

/** A non-extractable AES-GCM key, i.e. what unwrapDataKey() hands back. */
async function nonExtractableKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

describe('crypto/key-store', () => {
  beforeEach(() => {
    // Each test gets a pristine IndexedDB — no cross-test leakage of a key.
    globalThis.indexedDB = new IDBFactory()
  })

  it('getVault returns null when nothing has been unlocked', async () => {
    expect(await getVault()).toBeNull()
  })

  it('requireVault throws VaultLockedError when nothing has been unlocked', async () => {
    await expect(requireVault()).rejects.toBeInstanceOf(VaultLockedError)
  })

  it('round-trips the household id and a working data key', async () => {
    const dataKey = await nonExtractableKey()
    await setVault({ householdId: 'hh-1', dataKey })

    const vault = await requireVault()
    expect(vault.householdId).toBe('hh-1')

    const iv = crypto.getRandomValues(new Uint8Array(12))
    const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vault.dataKey, new Uint8Array([1, 2, 3]))
    const opened = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, vault.dataKey, sealed))
    expect(Array.from(opened)).toEqual([1, 2, 3])
  })

  it('stores a CryptoKey, never raw bytes — the stored key cannot be exported', async () => {
    await setVault({ householdId: 'hh-1', dataKey: await nonExtractableKey() })
    const vault = await requireVault()

    expect(vault.dataKey).toBeInstanceOf(CryptoKey)
    expect(vault.dataKey.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', vault.dataKey)).rejects.toThrow()
  })

  it('refuses an extractable key, so raw material can never be persisted', async () => {
    // generateDataKey() is extractable on purpose — it exists to be wrapped.
    // Persisting that copy would defeat the whole non-extractable guarantee.
    const extractable = await generateDataKey()
    expect(extractable.extractable).toBe(true)
    await expect(setVault({ householdId: 'hh-1', dataKey: extractable })).rejects.toThrow(/extractable/i)
    expect(await getVault()).toBeNull()
  })

  it('refuses an empty household id', async () => {
    await expect(setVault({ householdId: '', dataKey: await nonExtractableKey() })).rejects.toThrow(/householdId/)
  })

  it('setVault replaces a previously unlocked vault', async () => {
    await setVault({ householdId: 'hh-1', dataKey: await nonExtractableKey() })
    await setVault({ householdId: 'hh-2', dataKey: await nonExtractableKey() })
    expect((await requireVault()).householdId).toBe('hh-2')
  })

  it('clearVault locks it again', async () => {
    await setVault({ householdId: 'hh-1', dataKey: await nonExtractableKey() })
    await clearVault()
    expect(await getVault()).toBeNull()
    await expect(requireVault()).rejects.toBeInstanceOf(VaultLockedError)
  })

  it('clearVault on an already-locked vault is a no-op, not an error', async () => {
    await expect(clearVault()).resolves.toBeUndefined()
  })

  it('surfaces a real error when IndexedDB is unavailable rather than pretending to be locked', async () => {
    const original = globalThis.indexedDB
    // @ts-expect-error — deliberately removing the global to model a hostile environment
    delete globalThis.indexedDB
    try {
      await expect(getVault()).rejects.toThrow(/IndexedDB/)
      // Critically NOT a VaultLockedError: "storage is broken" and "the user
      // has not unlocked yet" must not be the same signal to a caller.
      await expect(getVault()).rejects.not.toBeInstanceOf(VaultLockedError)
    } finally {
      globalThis.indexedDB = original
    }
  })
})
