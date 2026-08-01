import { CryptoError } from './errors'
import { buildAad, type RowAad } from './aad'
import { fromBase64Url, toBase64Url, utf8Decode, utf8Encode } from './encoding'
import { padToBlock, unpadFromBlock } from './padding'
import { generateIv, IV_BYTES } from './keys'

/** Stored algorithm label for an encrypted row. Persisted with every row. */
export const ROW_ALG = 'AES-256-GCM'

/** AES-GCM's authentication tag, appended to the ciphertext by WebCrypto. */
const GCM_TAG_BYTES = 16

/**
 * The encrypted envelope as it is stored. `ciphertext` and `iv` are base64url;
 * `alg` and `version` are plaintext metadata, and `version` is also
 * authenticated via the AAD, so it cannot be edited without breaking the read.
 */
export interface EncryptedRow {
  ciphertext: string
  iv: string
  alg: string
  version: number
}

function assertSupportedAlg(alg: string): void {
  if (alg !== ROW_ALG) {
    throw new CryptoError(
      'UNSUPPORTED_ALG',
      `Unsupported row algorithm ${JSON.stringify(alg)}; this build only reads ${ROW_ALG}`,
    )
  }
}

function assertVersion(version: number): void {
  if (!Number.isInteger(version) || version < 0) {
    throw new CryptoError(
      'INVALID_INPUT',
      `Row version must be a non-negative integer, got ${String(version)}`,
    )
  }
}

/**
 * Encrypt one row.
 *
 * The plaintext is `JSON.stringify`d, UTF-8 encoded, padded to a 256-byte
 * multiple (see `padding.ts` for why), then sealed with AES-256-GCM under a
 * **fresh 96-bit IV generated on every call** — including updates to a row
 * that already has a ciphertext. The four-part `aad` is authenticated but not
 * encrypted, binding the ciphertext to its table, household, row and version.
 */
export async function encryptRow<T extends object>(
  plain: T,
  dataKey: CryptoKey,
  aad: RowAad,
): Promise<EncryptedRow> {
  // Build (and thereby validate) the AAD before doing any work.
  const aadBytes = buildAad(aad)

  let json: string
  try {
    json = JSON.stringify(plain)
  } catch (cause) {
    throw new CryptoError('INVALID_INPUT', 'Row could not be serialised to JSON', { cause })
  }
  if (typeof json !== 'string') {
    throw new CryptoError('INVALID_INPUT', 'Row serialised to undefined rather than JSON')
  }

  const padded = padToBlock(utf8Encode(json))
  const iv = generateIv()

  let ciphertext: ArrayBuffer
  try {
    ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aadBytes },
      dataKey,
      padded,
    )
  } catch (cause) {
    throw new CryptoError('INVALID_INPUT', 'Failed to encrypt row', { cause })
  } finally {
    // The padded plaintext is a private copy; clear it once it is sealed.
    padded.fill(0)
  }

  return {
    ciphertext: toBase64Url(new Uint8Array(ciphertext)),
    iv: toBase64Url(iv),
    alg: ROW_ALG,
    version: aad.version,
  }
}

/**
 * Decrypt one row.
 *
 * Returns `unknown` by default on purpose: AES-GCM proves the bytes are
 * authentic, not that they still match the shape this version of the app
 * expects. Callers should parse the result (zod) rather than trust a cast.
 *
 * Any authentication failure — wrong data key, a flipped bit, a tampered IV,
 * or an AAD naming a different table / household / row / version — rejects
 * with a `CryptoError` coded `DECRYPT_FAILED`. It never returns partial or
 * unauthenticated plaintext.
 *
 * Note that the envelope's own `version` field is *not* compared against
 * `aad.version` here. That comparison is AES-GCM's job: letting the cipher
 * reject the mismatch is what makes the replay defence cryptographic rather
 * than a check an attacker with write access could simply satisfy.
 */
export async function decryptRow<T = unknown>(
  row: EncryptedRow,
  dataKey: CryptoKey,
  aad: RowAad,
): Promise<T> {
  assertSupportedAlg(row.alg)
  assertVersion(row.version)
  const aadBytes = buildAad(aad)

  const iv = fromBase64Url(row.iv)
  if (iv.length !== IV_BYTES) {
    throw new CryptoError('INVALID_INPUT', `IV must be ${IV_BYTES} bytes, got ${iv.length}`)
  }

  const ciphertext = fromBase64Url(row.ciphertext)
  if (ciphertext.length <= GCM_TAG_BYTES) {
    throw new CryptoError(
      'INVALID_INPUT',
      `Ciphertext is too short to contain a ${GCM_TAG_BYTES}-byte authentication tag`,
    )
  }

  let plainBuffer: ArrayBuffer
  try {
    plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aadBytes },
      dataKey,
      ciphertext,
    )
  } catch (cause) {
    throw new CryptoError(
      'DECRYPT_FAILED',
      'Row failed authentication: wrong key, altered ciphertext, or an AAD that does not match the stored table/household/row/version',
      { cause },
    )
  }

  const padded = new Uint8Array(plainBuffer)
  const json = utf8Decode(unpadFromBlock(padded))
  padded.fill(0)

  try {
    return JSON.parse(json) as T
  } catch (cause) {
    // Authenticated bytes that are not valid JSON mean the row was written by
    // an incompatible format, not that an attacker got in — surface it as its
    // own condition rather than folding it into DECRYPT_FAILED.
    throw new CryptoError('INVALID_ENCODING', 'Decrypted row was not valid JSON', { cause })
  }
}
