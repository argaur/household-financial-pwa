import { describe, it, expect } from 'vitest'
import * as cryptoModule from './index'
import {
  CryptoError,
  PBKDF2_ITERATIONS,
  KDF_ALG,
  KEY_WRAP_ALG,
  ROW_ALG,
  generateSalt,
  generateDataKey,
  generateRecoveryCode,
  deriveKeyFromPassphrase,
  deriveKeyFromRecoveryCode,
  wrapDataKey,
  unwrapDataKey,
  encryptRow,
  decryptRow,
  type RowAad,
} from './index'

const FAST = 1_000

describe('public surface', () => {
  it('exports exactly the documented API', () => {
    expect(Object.keys(cryptoModule).sort()).toEqual(
      [
        'AAD_FORMAT',
        'CROCKFORD_ALPHABET',
        'CryptoError',
        'DATA_KEY_BITS',
        'IV_BYTES',
        'KDF_ALG',
        'KEY_WRAP_ALG',
        'PAD_BLOCK_SIZE',
        'PAD_HEADER_BYTES',
        'PBKDF2_ITERATIONS',
        'RECOVERY_CODE_BYTES',
        'RECOVERY_CODE_GROUP_SIZE',
        'RECOVERY_CODE_LENGTH',
        'ROW_ALG',
        'SALT_BYTES',
        'buildAad',
        'decodeCrockford32',
        'decryptRow',
        'deriveKeyFromPassphrase',
        'deriveKeyFromRecoveryCode',
        'encodeCrockford32',
        'encryptRow',
        'formatRecoveryCode',
        'fromBase64Url',
        'generateDataKey',
        'generateIv',
        'generateRecoveryCode',
        'generateSalt',
        'isCryptoError',
        'isValidRecoveryCode',
        'normalizeRecoveryCode',
        'padToBlock',
        'recoveryCodeToBytes',
        'rewrapDataKey',
        'toBase64Url',
        'unpadFromBlock',
        'unwrapDataKey',
        'utf8Decode',
        'utf8Encode',
        'wrapDataKey',
      ].sort(),
    )
  })

  it('exports the labels that get persisted to household_keys', () => {
    expect(KDF_ALG).toBe('PBKDF2-SHA256')
    expect(KEY_WRAP_ALG).toBe('AES-256-GCM')
    expect(ROW_ALG).toBe('AES-256-GCM')
    expect(PBKDF2_ITERATIONS).toBe(600_000)
  })
})

describe('end-to-end household lifecycle', () => {
  it('sets up, locks, and unlocks via either credential', async () => {
    // --- setup ---
    const passphrase = 'a long household passphrase ₹'
    const recoveryCode = generateRecoveryCode()
    const passphraseSalt = generateSalt()
    const recoverySalt = generateSalt()

    const dataKey = await generateDataKey()
    const passphraseKey = await deriveKeyFromPassphrase(passphrase, passphraseSalt, FAST)
    const recoveryKey = await deriveKeyFromRecoveryCode(recoveryCode, recoverySalt, FAST)

    const passphraseCopy = await wrapDataKey(dataKey, passphraseKey)
    const recoveryCopy = await wrapDataKey(dataKey, recoveryKey)

    // The two copies of the same data key must never share an IV.
    expect(passphraseCopy.iv).not.toBe(recoveryCopy.iv)
    expect(passphraseSalt).not.toEqual(recoverySalt)

    // --- write a row ---
    const aad: RowAad = {
      tableName: 'holdings',
      householdId: 'hh_e2e',
      rowId: 'hold_1',
      version: 1,
    }
    const stored = await encryptRow({ instrument: 'SSY', amount: 3000, note: '₹3k/mo' }, dataKey, aad)

    // --- unlock with the passphrase ---
    const viaPassphrase = await unwrapDataKey(
      passphraseCopy.wrapped,
      passphraseCopy.iv,
      await deriveKeyFromPassphrase(passphrase, passphraseSalt, FAST),
    )
    expect(await decryptRow(stored, viaPassphrase, aad)).toEqual({
      instrument: 'SSY',
      amount: 3000,
      note: '₹3k/mo',
    })

    // --- unlock with a sloppily typed recovery code ---
    const viaRecovery = await unwrapDataKey(
      recoveryCopy.wrapped,
      recoveryCopy.iv,
      await deriveKeyFromRecoveryCode(recoveryCode.toLowerCase(), recoverySalt, FAST),
    )
    expect(await decryptRow(stored, viaRecovery, aad)).toEqual({
      instrument: 'SSY',
      amount: 3000,
      note: '₹3k/mo',
    })

    // --- update the row: version bumps, old ciphertext no longer readable ---
    const nextAad: RowAad = { ...aad, version: 2 }
    const updated = await encryptRow(
      { instrument: 'SSY', amount: 3500, note: '₹3.5k/mo' },
      viaPassphrase,
      nextAad,
    )
    expect(updated.version).toBe(2)
    expect(await decryptRow(updated, viaRecovery, nextAad)).toMatchObject({ amount: 3500 })
    await expect(decryptRow(stored, viaPassphrase, nextAad)).rejects.toThrow(CryptoError)
  })

  it('a wrong passphrase cannot reach any row', async () => {
    const salt = generateSalt()
    const dataKey = await generateDataKey()
    const copy = await wrapDataKey(dataKey, await deriveKeyFromPassphrase('right', salt, FAST))
    const attempt = unwrapDataKey(
      copy.wrapped,
      copy.iv,
      await deriveKeyFromPassphrase('wrong', salt, FAST),
    )
    await expect(attempt).rejects.toThrow(CryptoError)
  })
})
