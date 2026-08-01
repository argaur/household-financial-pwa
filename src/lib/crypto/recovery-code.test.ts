import { describe, it, expect } from 'vitest'
import {
  RECOVERY_CODE_BYTES,
  RECOVERY_CODE_LENGTH,
  generateRecoveryCode,
  normalizeRecoveryCode,
  isValidRecoveryCode,
  formatRecoveryCode,
  recoveryCodeToBytes,
} from './recovery-code'
import { encodeCrockford32 } from './base32'
import { CryptoError } from './errors'

describe('recovery code generation', () => {
  it('is 128 bits encoded as 26 Crockford characters', () => {
    expect(RECOVERY_CODE_BYTES).toBe(16)
    expect(RECOVERY_CODE_LENGTH).toBe(26)
    const code = generateRecoveryCode()
    expect(normalizeRecoveryCode(code)).toHaveLength(26)
    expect(recoveryCodeToBytes(code)).toHaveLength(16)
  })

  it('returns a hyphen-grouped display form', () => {
    const code = generateRecoveryCode()
    expect(code).toContain('-')
    expect(code.replace(/-/g, '')).toHaveLength(26)
    expect(isValidRecoveryCode(code)).toBe(true)
  })

  it('never contains the excluded letters I, L, O or U', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateRecoveryCode()).not.toMatch(/[ILOU]/)
    }
  })

  it('does not repeat', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i += 1) seen.add(normalizeRecoveryCode(generateRecoveryCode()))
    expect(seen.size).toBe(200)
  })

  it('round-trips through bytes exactly', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateRecoveryCode()
      const bytes = recoveryCodeToBytes(code)
      expect(encodeCrockford32(bytes)).toBe(normalizeRecoveryCode(code))
    }
  })
})

describe('normalizeRecoveryCode', () => {
  const canonical = '0123456789ABCDEFGHJKMNPQRS'

  it('leaves a canonical code untouched', () => {
    expect(normalizeRecoveryCode(canonical)).toBe(canonical)
  })

  it('upper-cases', () => {
    expect(normalizeRecoveryCode(canonical.toLowerCase())).toBe(canonical)
  })

  it('strips hyphens and every kind of whitespace', () => {
    expect(normalizeRecoveryCode('0123-4567-89AB-CDEF-GHJK-MN-PQRS')).toBe(canonical)
    expect(normalizeRecoveryCode(' 0123 4567\t89AB\nCDEF GHJKMNPQRS ')).toBe(canonical)
  })

  it("applies Crockford's decode aliases: I and L become 1, O becomes 0", () => {
    expect(normalizeRecoveryCode('IL')).toBe('11')
    expect(normalizeRecoveryCode('il')).toBe('11')
    expect(normalizeRecoveryCode('O')).toBe('0')
    expect(normalizeRecoveryCode('o')).toBe('0')
    expect(normalizeRecoveryCode('OIL-oil')).toBe('011011')
  })

  it('does not alias U, which is simply not a valid character', () => {
    expect(normalizeRecoveryCode('U')).toBe('U')
    expect(isValidRecoveryCode('U')).toBe(false)
  })

  it('unlocks a code the user mistyped in every tolerated way', () => {
    // 0 typed as O, 1 typed as I/l, lower case, odd spacing and grouping.
    const stored = '01ABCDEFGH01JKMNPQ01RSTVWX'
    const typed = ' oi-abc defgh Ol jkmnpq 0l rstvwx '
    expect(normalizeRecoveryCode(typed)).toBe(stored)
    expect(recoveryCodeToBytes(typed)).toEqual(recoveryCodeToBytes(stored))
  })
})

describe('isValidRecoveryCode', () => {
  it('accepts a well-formed code in any tolerated shape', () => {
    const code = generateRecoveryCode()
    expect(isValidRecoveryCode(code)).toBe(true)
    expect(isValidRecoveryCode(code.toLowerCase())).toBe(true)
    expect(isValidRecoveryCode(normalizeRecoveryCode(code))).toBe(true)
  })

  it('rejects wrong length', () => {
    expect(isValidRecoveryCode('')).toBe(false)
    expect(isValidRecoveryCode('0123456789ABCDEFGHJKMNPQR')).toBe(false)
    expect(isValidRecoveryCode('0123456789ABCDEFGHJKMNPQRST')).toBe(false)
  })

  it('rejects characters outside the alphabet', () => {
    expect(isValidRecoveryCode('0123456789ABCDEFGHJKMNPQR$')).toBe(false)
    expect(isValidRecoveryCode('0123456789ABCDEFGHJKMNPQRU')).toBe(false)
  })
})

describe('formatRecoveryCode', () => {
  it('groups in fours and is idempotent under normalise', () => {
    const formatted = formatRecoveryCode('0123456789ABCDEFGHJKMNPQRS')
    expect(formatted).toBe('0123-4567-89AB-CDEF-GHJK-MNPQ-RS')
    expect(normalizeRecoveryCode(formatted)).toBe('0123456789ABCDEFGHJKMNPQRS')
  })

  it('normalises before grouping', () => {
    expect(formatRecoveryCode('oi23-4567-89ab-cdef-ghjk-mnpq-rs')).toBe(
      '0123-4567-89AB-CDEF-GHJK-MNPQ-RS',
    )
  })

  it('rejects a code that is not valid', () => {
    expect(() => formatRecoveryCode('too-short')).toThrow(CryptoError)
  })
})

describe('recoveryCodeToBytes', () => {
  it('rejects an invalid code rather than deriving from garbage', () => {
    expect(() => recoveryCodeToBytes('nope')).toThrow(CryptoError)
    expect(() => recoveryCodeToBytes('0123456789ABCDEFGHJKMNPQRU')).toThrow(CryptoError)
  })
})
