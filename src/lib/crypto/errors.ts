/**
 * Domain error for every failure inside `src/lib/crypto`.
 *
 * WebCrypto signals authentication failure by rejecting with a bare
 * `OperationError` that carries no useful message. We convert that into a
 * `CryptoError` with a stable `code` so callers can branch on it — but the
 * original is always attached as `cause`, never swallowed. There is no
 * `catch {}` anywhere in this module.
 */
export type CryptoErrorCode =
  /** Caller passed something structurally invalid (bad version, empty id, wrong iv length). */
  | 'INVALID_INPUT'
  /** A base64url / base32 string could not be decoded. */
  | 'INVALID_ENCODING'
  /** A padded buffer was malformed (not a whole block, or a lying length header). */
  | 'INVALID_PADDING'
  /** AES-GCM refused to authenticate: wrong key, tampered bytes, or wrong AAD. */
  | 'DECRYPT_FAILED'
  /** AES-GCM key unwrap failed: wrong passphrase / recovery code, or tampered blob. */
  | 'UNWRAP_FAILED'
  /** The stored `alg` label is not one this build knows how to process. */
  | 'UNSUPPORTED_ALG'

export class CryptoError extends Error {
  readonly code: CryptoErrorCode

  constructor(code: CryptoErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'CryptoError'
    this.code = code
  }
}

/** Narrowing helper so callers do not have to `instanceof` inline. */
export function isCryptoError(value: unknown): value is CryptoError {
  return value instanceof CryptoError
}
