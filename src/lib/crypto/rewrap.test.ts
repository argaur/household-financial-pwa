import { describe, it, expect } from 'vitest'
import {
  generateDataKey,
  generateSalt,
  deriveKeyFromPassphrase,
  deriveKeyFromRecoveryCode,
  generateRecoveryCode,
  wrapDataKey,
  unwrapDataKey,
  rewrapDataKey,
  encryptRow,
  decryptRow,
  CryptoError,
} from './index'

// Cheap iteration count: these tests exercise the rewrap logic, not PBKDF2's cost.
const ITER = 1000
const aad = { tableName: 'holdings', householdId: 'hh-1', rowId: 'row-1', version: 1 }

async function setup() {
  const dataKey = await generateDataKey()
  const salt = generateSalt()
  const oldKek = await deriveKeyFromPassphrase('old passphrase', salt, ITER)
  const stored = await wrapDataKey(dataKey, oldKek)
  // A row written before the passphrase ever changed.
  const row = await encryptRow({ investedAmount: '250000', note: 'sample' }, dataKey, aad)
  return { dataKey, salt, oldKek, stored, row }
}

describe('rewrapDataKey', () => {
  it('produces a new wrapped copy that opens the SAME data key', async () => {
    const { salt, oldKek, stored, row } = await setup()

    const newSalt = generateSalt()
    const newKek = await deriveKeyFromPassphrase('new passphrase', newSalt, ITER)
    const rewrapped = await rewrapDataKey(stored, oldKek, newKek)

    // The row was encrypted before the change and must still decrypt after it,
    // which is the whole point: rewrapping touches no stored row.
    const viaNew = await unwrapDataKey(rewrapped.wrapped, rewrapped.iv, newKek)
    expect(await decryptRow(row, viaNew, aad)).toEqual({
      investedAmount: '250000',
      note: 'sample',
    })
    expect(salt).toBeDefined()
  })

  it('uses a fresh IV, never the old one', async () => {
    const { oldKek, stored } = await setup()
    const newKek = await deriveKeyFromPassphrase('new passphrase', generateSalt(), ITER)
    const a = await rewrapDataKey(stored, oldKek, newKek)
    const b = await rewrapDataKey(stored, oldKek, newKek)
    expect(a.iv).not.toBe(stored.iv)
    expect(a.iv).not.toBe(b.iv)
    expect(a.wrapped).not.toBe(b.wrapped)
  })

  it('rejects when the old credential is wrong, and does not emit a new copy', async () => {
    const { stored } = await setup()
    const wrongKek = await deriveKeyFromPassphrase('not the old one', generateSalt(), ITER)
    const newKek = await deriveKeyFromPassphrase('new passphrase', generateSalt(), ITER)
    await expect(rewrapDataKey(stored, wrongKek, newKek)).rejects.toBeInstanceOf(CryptoError)
  })

  it('works with a recovery code as the opening credential', async () => {
    const dataKey = await generateDataKey()
    const recSalt = generateSalt()
    const code = generateRecoveryCode()
    const recKek = await deriveKeyFromRecoveryCode(code, recSalt, ITER)
    const stored = await wrapDataKey(dataKey, recKek)
    const row = await encryptRow({ note: 'via recovery' }, dataKey, aad)

    const newKek = await deriveKeyFromPassphrase('chosen after recovery', generateSalt(), ITER)
    const rewrapped = await rewrapDataKey(stored, recKek, newKek)

    const viaNew = await unwrapDataKey(rewrapped.wrapped, rewrapped.iv, newKek)
    expect(await decryptRow(row, viaNew, aad)).toEqual({ note: 'via recovery' })
  })

  it('never returns or exposes an extractable data key', async () => {
    const { oldKek, stored } = await setup()
    const newKek = await deriveKeyFromPassphrase('new passphrase', generateSalt(), ITER)
    const rewrapped = await rewrapDataKey(stored, oldKek, newKek)

    // The return value is inert data, not a CryptoKey — there is no handle an
    // XSS payload could grab and export.
    expect(Object.keys(rewrapped).sort()).toEqual(['iv', 'wrapped'])
    for (const value of Object.values(rewrapped)) {
      expect(typeof value).toBe('string')
    }

    // And the key reachable through the normal path stays non-extractable.
    const viaNew = await unwrapDataKey(rewrapped.wrapped, rewrapped.iv, newKek)
    expect(viaNew.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', viaNew)).rejects.toThrow()
  })

  it('the ordinary unwrap path is still non-extractable and still cannot be rewrapped by hand', async () => {
    const { oldKek, stored } = await setup()
    const dek = await unwrapDataKey(stored.wrapped, stored.iv, oldKek)
    const newKek = await deriveKeyFromPassphrase('new passphrase', generateSalt(), ITER)
    // This is why rewrapDataKey has to exist at all.
    await expect(wrapDataKey(dek, newKek)).rejects.toBeInstanceOf(CryptoError)
  })
})
