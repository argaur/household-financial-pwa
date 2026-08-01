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
  return unwrap(wrapped, iv, wrappingKey, false)
}

/**
 * The shared unwrap. `extractable` is a private parameter on purpose: it is
 * never exposed as an option on {@link unwrapDataKey}, because a boolean any
 * caller can flip is one autocomplete away from persisting an extractable data
 * key. The only path that may set it is {@link rewrapDataKey}, which keeps the
 * resulting key as a local and returns bytes rather than a `CryptoKey`.
 */
async function unwrap(
  wrapped: string,
  iv: string,
  wrappingKey: CryptoKey,
  extractable: boolean,
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
      extractable,
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

/**
 * Re-wrap the household data key under a new credential.
 *
 * This is what a passphrase change and a recovery-code reset both do. Neither
 * touches a single stored row: the data key stays the same, only the wrapper
 * around it changes. That is the entire reason the data key exists separately
 * from the passphrase.
 *
 * WebCrypto will not wrap a non-extractable key, and every key handed out by
 * {@link unwrapDataKey} is non-extractable — so the rewrap has to open its own
 * short-lived extractable copy. That copy is a local inside this function: it
 * is never returned, never stored, and never reachable from the caller, so the
 * key at rest in IndexedDB remains non-extractable at all times. The caller
 * gets bytes back, not a key handle.
 *
 * Requires the *current* credential, so a passphrase change cannot be driven by
 * someone who merely has an unlocked tab.
 */
export async function rewrapDataKey(
  current: WrappedDataKey,
  currentWrappingKey: CryptoKey,
  newWrappingKey: CryptoKey,
): Promise<WrappedDataKey> {
  const extractableDataKey = await unwrap(
    current.wrapped,
    current.iv,
    currentWrappingKey,
    true,
  )
  // A fresh IV, because this is a new wrap under a different key.
  return wrapDataKey(extractableDataKey, newWrappingKey)
}
