/**
 * Client-side encryption for household data.
 *
 * Everything sensitive is encrypted in the browser under a per-household data
 * key that the server never sees. The data key itself is stored only in
 * wrapped form, under a key derived from the user's passphrase and, as a
 * second copy, from a one-time recovery code.
 *
 * Typical setup:
 * ```ts
 * const dataKey = await generateDataKey()
 * const passSalt = generateSalt()
 * const passCopy = await wrapDataKey(dataKey, await deriveKeyFromPassphrase(pass, passSalt))
 * // …store { wrapped, iv, salt: passSalt, kdfAlg: KDF_ALG, iterations: PBKDF2_ITERATIONS }
 * ```
 *
 * Typical write:
 * ```ts
 * const row = await encryptRow(holding, dataKey, {
 *   tableName: 'holdings', householdId, rowId, version: nextVersion,
 * })
 * ```
 *
 * Re-exports are explicit rather than `export *` so the public surface is a
 * deliberate list; it is asserted in `index.test.ts`.
 */

export { CryptoError, isCryptoError, type CryptoErrorCode } from './errors'

export { toBase64Url, fromBase64Url, utf8Encode, utf8Decode } from './encoding'

export { CROCKFORD_ALPHABET, encodeCrockford32, decodeCrockford32 } from './base32'

export { PAD_BLOCK_SIZE, PAD_HEADER_BYTES, padToBlock, unpadFromBlock } from './padding'

export { AAD_FORMAT, buildAad, type RowAad } from './aad'

export {
  RECOVERY_CODE_BYTES,
  RECOVERY_CODE_LENGTH,
  RECOVERY_CODE_GROUP_SIZE,
  generateRecoveryCode,
  normalizeRecoveryCode,
  isValidRecoveryCode,
  formatRecoveryCode,
  recoveryCodeToBytes,
} from './recovery-code'

export {
  PBKDF2_ITERATIONS,
  KDF_ALG,
  KEY_WRAP_ALG,
  DATA_KEY_BITS,
  SALT_BYTES,
  IV_BYTES,
  generateSalt,
  generateIv,
  deriveKeyFromPassphrase,
  deriveKeyFromRecoveryCode,
  generateDataKey,
  wrapDataKey,
  unwrapDataKey,
  rewrapDataKey,
  type WrappedDataKey,
} from './keys'

export { ROW_ALG, encryptRow, decryptRow, type EncryptedRow } from './row'
