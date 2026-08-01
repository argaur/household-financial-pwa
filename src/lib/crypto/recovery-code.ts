import { CROCKFORD_ALPHABET, decodeCrockford32, encodeCrockford32 } from './base32'
import { CryptoError } from './errors'

/**
 * The recovery code is the second way into a household's data key: 128 bits of
 * CSPRNG output shown to the user once, at setup, and typed back in if the
 * passphrase is forgotten. It is never stored anywhere — only a data key
 * wrapped under a key derived from it.
 */
export const RECOVERY_CODE_BYTES = 16
/** 128 bits / 5 bits per Crockford character, rounded up. */
export const RECOVERY_CODE_LENGTH = 26
/** Display grouping only; hyphens are stripped before anything cryptographic. */
export const RECOVERY_CODE_GROUP_SIZE = 4

/**
 * Crockford's decode aliases. A user reading a code off paper cannot reliably
 * tell `1` from `I`/`l`, or `0` from `O`, so those are folded rather than
 * rejected. `U` is deliberately NOT aliased — it is simply invalid, which is
 * what tells a user they have mistyped something the code could not contain.
 */
const ALIASES: Readonly<Record<string, string>> = { I: '1', L: '1', O: '0' }

/**
 * Fold a user-typed code to its canonical form: upper case, no hyphens, no
 * whitespace, decode aliases applied.
 *
 * Transformation only — it never throws. Validity is {@link isValidRecoveryCode}'s
 * job, so the UI can normalise as the user types without fighting errors.
 */
export function normalizeRecoveryCode(code: string): string {
  let out = ''
  for (const ch of code.toUpperCase()) {
    if (ch === '-' || /\s/.test(ch)) continue
    out += ALIASES[ch] ?? ch
  }
  return out
}

/** True when `code`, once normalised, is a well-formed 26-character recovery code. */
export function isValidRecoveryCode(code: string): boolean {
  const normalized = normalizeRecoveryCode(code)
  if (normalized.length !== RECOVERY_CODE_LENGTH) return false
  for (const ch of normalized) {
    if (!CROCKFORD_ALPHABET.includes(ch)) return false
  }
  return true
}

function assertValid(code: string): string {
  const normalized = normalizeRecoveryCode(code)
  if (!isValidRecoveryCode(normalized)) {
    // Deliberately does not echo the code itself — this string ends up in
    // error surfaces and logs, and the code is key material.
    throw new CryptoError(
      'INVALID_INPUT',
      `Recovery code must be ${RECOVERY_CODE_LENGTH} Crockford base32 characters`,
    )
  }
  return normalized
}

/** Generate a fresh 128-bit recovery code in hyphen-grouped display form. */
export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_BYTES))
  return formatRecoveryCode(encodeCrockford32(bytes))
}

/** Normalise then regroup for display, e.g. `0123-4567-…-RS`. */
export function formatRecoveryCode(code: string): string {
  const normalized = assertValid(code)
  const groups: string[] = []
  for (let i = 0; i < normalized.length; i += RECOVERY_CODE_GROUP_SIZE) {
    groups.push(normalized.slice(i, i + RECOVERY_CODE_GROUP_SIZE))
  }
  return groups.join('-')
}

/** Decode a recovery code (in any tolerated shape) back to its 16 raw bytes. */
export function recoveryCodeToBytes(code: string): Uint8Array {
  return decodeCrockford32(assertValid(code))
}

/**
 * The exact string fed to PBKDF2 as the password. Exported so the derivation
 * path is testable and obviously stable — changing it would silently lock
 * every existing household out of its recovery copy.
 */
export function recoveryCodeToDerivationInput(code: string): string {
  return assertValid(code)
}
