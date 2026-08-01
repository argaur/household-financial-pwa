import { CryptoError } from './errors'
import { fromBase64Url, toBase64Url, utf8Encode } from './encoding'
import { recoveryCodeToDerivationInput } from './recovery-code'

/**
 * Key hierarchy for a household.
 *
 *   passphrase ──PBKDF2──┐
 *                        ├─> wrapping key ──AES-GCM wrap──> stored blob ──> data key
 *   recovery code ─PBKDF2┘
 *
 * There is exactly one data key per household. It is wrapped twice — once
 * under the passphrase-derived key and once under the recovery-code-derived
 * key — so either credential opens the same data, and changing the passphrase
 * only rewraps, never re-encrypts every row.
 */

/**
 * OWASP's 2023 floor for PBKDF2-HMAC-SHA256. Persisted alongside the salt in
 * the `household_keys` row so it can be raised later without stranding
 * existing households: unwrap at the stored count, rewrap at the new one.
 */
export const PBKDF2_ITERATIONS = 600_000

/** Stored KDF label. Persisted; read back to pick the derivation path. */
export const KDF_ALG = 'PBKDF2-SHA256'

/** Stored label for the key-wrapping algorithm. */
export const KEY_WRAP_ALG = 'AES-256-GCM'

export const DATA_KEY_BITS = 256
export const SALT_BYTES = 16
/** 96 bits — the only IV length AES-GCM is actually specified for. */
export const IV_BYTES = 12

/** A data key wrapped under one credential. Both fields are base64url. */
export interface WrappedDataKey {
  /** The wrapped (encrypted) raw data key. */
  wrapped: string
  /** The IV used for this wrap. Unique per wrap — never shared between copies. */
  iv: string
}

function assertPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CryptoError('INVALID_INPUT', `${label} must be a positive integer, got ${String(value)}`)
  }
}

/** Random salt for PBKDF2. Stored in plaintext next to the wrapped key. */
export function generateSalt(byteLength: number = SALT_BYTES): Uint8Array<ArrayBuffer> {
  assertPositiveInt(byteLength, 'salt byteLength')
  return crypto.getRandomValues(new Uint8Array(byteLength))
}

/** Fresh 96-bit AES-GCM IV. Called on every single encrypt and every wrap. */
export function generateIv(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(IV_BYTES))
}

async function derive(
  secret: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  if (salt.length === 0) {
    throw new CryptoError('INVALID_INPUT', 'salt must not be empty')
  }
  assertPositiveInt(iterations, 'iterations')

  // Copy the caller's salt into a buffer we know is not SharedArrayBuffer-
  // backed, which is what WebCrypto's BufferSource requires.
  const saltBytes = new Uint8Array(salt)

  const baseKey = await crypto.subtle.importKey('raw', utf8Encode(secret), 'PBKDF2', false, [
    'deriveKey',
  ])
  // extractable: false — the wrapping key exists only to wrap/unwrap; nothing
  // in the app ever needs its raw bytes, so WebCrypto is told never to hand
  // them over.
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: DATA_KEY_BITS },
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

/**
 * Derive the passphrase wrapping key.
 *
 * @param iterations defaults to {@link PBKDF2_ITERATIONS}; pass the value
 * stored on the household_keys row when unwrapping an existing household.
 */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  if (passphrase.length === 0) {
    throw new CryptoError('INVALID_INPUT', 'passphrase must not be empty')
  }
  return derive(passphrase, salt, iterations)
}

/**
 * Derive the recovery-code wrapping key.
 *
 * The code is normalised first, so case, hyphens, spacing and the
 * `O`/`0`, `I`/`L`/`1` confusions do not change the derived key. A code that
 * is not well-formed is rejected outright rather than silently deriving a key
 * that could never unwrap anything.
 */
export async function deriveKeyFromRecoveryCode(
  code: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  return derive(recoveryCodeToDerivationInput(code), salt, iterations)
}

/**
 * Generate the household data key.
 *
 * `extractable: true` on purpose and only here — the raw bytes must leave
 * WebCrypto exactly once, to be wrapped under each credential at setup. Every
 * key produced by {@link unwrapDataKey} afterwards is non-extractable.
 */
export async function generateDataKey(): Promise<CryptoKey> {
  const raw = crypto.getRandomValues(new Uint8Array(DATA_KEY_BITS / 8))
  try {
    return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, [
      'encrypt',
      'decrypt',
    ])
  } finally {
    // Drop the raw material from the JS heap as soon as WebCrypto owns it.
    raw.fill(0)
  }
}

/**
 * Wrap the data key under a credential-derived key.
 *
 * A fresh IV is generated per call. Nonce reuse under a single AES-GCM key is
 * catastrophic, and the passphrase copy and recovery copy are two separate
 * wraps — so the IV must never be hoisted out of this function or shared
 * between the two rows.
 */
export async function wrapDataKey(
  dataKey: CryptoKey,
  wrappingKey: CryptoKey,
): Promise<WrappedDataKey> {
  const iv = generateIv()
  let wrapped: ArrayBuffer
  try {
    wrapped = await crypto.subtle.wrapKey('raw', dataKey, wrappingKey, { name: 'AES-GCM', iv })
  } catch (cause) {
    throw new CryptoError(
      'INVALID_INPUT',
      'Failed to wrap the data key (is it extractable, and does the wrapping key allow wrapKey?)',
      { cause },
    )
  }
  return { wrapped: toBase64Url(new Uint8Array(wrapped)), iv: toBase64Url(iv) }
}

/**
 * Unwrap the data key.
 *
 * The result is **non-extractable**: from here on the household's data key
 * lives only inside WebCrypto. An XSS payload or a stray `console.log` can
 * make it encrypt and decrypt, but cannot exfiltrate the key itself.
 *
 * Rejects with a `CryptoError` carrying code `UNWRAP_FAILED` when the
 * credential is wrong or the blob has been tampered with — the two are
 * indistinguishable to AES-GCM, and deliberately so. The underlying
 * `OperationError` is preserved as `cause`.
 */
export async function unwrapDataKey(
  wrapped: string,
  iv: string,
  wrappingKey: CryptoKey,
): Promise<CryptoKey> {
  const ivBytes = fromBase64Url(iv)
  if (ivBytes.length !== IV_BYTES) {
    throw new CryptoError(
      'INVALID_INPUT',
      `IV must be ${IV_BYTES} bytes, got ${ivBytes.length}`,
    )
  }
  const wrappedBytes = fromBase64Url(wrapped)
  if (wrappedBytes.length === 0) {
    throw new CryptoError('INVALID_INPUT', 'wrapped data key must not be empty')
  }

  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      wrappedBytes,
      wrappingKey,
      { name: 'AES-GCM', iv: ivBytes },
      { name: 'AES-GCM', length: DATA_KEY_BITS },
      false,
      ['encrypt', 'decrypt'],
    )
  } catch (cause) {
    throw new CryptoError(
      'UNWRAP_FAILED',
      'Could not unwrap the data key: wrong passphrase or recovery code, or the stored key was altered',
      { cause },
    )
  }
}
