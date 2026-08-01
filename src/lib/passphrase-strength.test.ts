import { describe, it, expect } from 'vitest'
import {
  MIN_PASSPHRASE_LENGTH,
  scorePassphrase,
  assertPassphraseAcceptable,
  WeakPassphraseError,
} from './passphrase-strength'

/**
 * The strength floor is the security parameter of the whole product: PBKDF2 at
 * 600,000 rounds buys nothing if the passphrase is guessable, because the
 * wrapped data key is served to any authenticated session and can be ground
 * offline. These tests are the specification of that floor.
 */

// Every value here MUST be rejected. Table-driven on purpose — the interesting
// cases are the near-misses (case variants, l33t substitutions, padding digits)
// that a naive `blocklist.has(value)` sails straight past.
const WEAK: Array<[label: string, value: string]> = [
  ['empty', ''],
  ['one character short of the floor', 'a'.repeat(MIN_PASSPHRASE_LENGTH - 1)],
  ['classic weak password padded to length', 'password1234'],
  ['case variant of a blocklisted value', 'Password1234'],
  ['mixed case + punctuation variant', 'PaSSworD123!'],
  ['l33t-substituted blocklist entry', 'P@ssw0rd1234'],
  ['l33t-substituted app-context value', 'F1n4nc14lPl4nn1ng'],
  ['app-context value in plain form', 'financialplanning'],
  ['the famous xkcd passphrase', 'correcthorsebatterystaple'],
  ['keyboard run', 'qwertyuiopas'],
  ['alphabet run', 'abcdefghijkl'],
  ['digit run', '012345678901'],
  ['single repeated character', 'aaaaaaaaaaaaaa'],
  ['too few distinct characters', 'abababababab'],
  ['a short word repeated to reach the length floor', 'iloveyouiloveyou'],
  ['leading/trailing whitespace around a weak value', '  Password1234  '],
]

// Every value here MUST be accepted. If the floor rejects one of these it is
// not a floor, it is an obstacle course.
const STRONG: string[] = [
  'quiet lantern rutabaga 41',
  'MonsoonLedger-Verandah-1998',
  'thali kachori jantar mantar dusk',
  'x7#Kq2mLv9Zt4Rw8',
]

describe('passphrase strength floor', () => {
  it('has a floor above the NIST 800-63B minimum of 8', () => {
    expect(MIN_PASSPHRASE_LENGTH).toBeGreaterThanOrEqual(12)
  })

  describe.each(WEAK)('rejects %s', (_label, value) => {
    it('is not acceptable', () => {
      expect(scorePassphrase(value).acceptable).toBe(false)
    })

    it('scores zero so the meter cannot look reassuring', () => {
      expect(scorePassphrase(value).score).toBe(0)
    })

    it('explains why without echoing the value back', () => {
      const { problems } = scorePassphrase(value)
      expect(problems.length).toBeGreaterThan(0)
      if (value.trim().length > 0) {
        expect(problems.join(' ')).not.toContain(value.trim())
      }
    })

    it('throws a WeakPassphraseError from assertPassphraseAcceptable', () => {
      expect(() => assertPassphraseAcceptable(value)).toThrow(WeakPassphraseError)
    })

    it('never puts the passphrase in the thrown error message', () => {
      try {
        assertPassphraseAcceptable(value)
        expect.unreachable('assertPassphraseAcceptable should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(WeakPassphraseError)
        if (value.trim().length > 0) {
          expect(String(err)).not.toContain(value.trim())
        }
      }
    })
  })

  describe.each(STRONG)('accepts %s', (value) => {
    it('is acceptable', () => {
      expect(scorePassphrase(value).acceptable).toBe(true)
    })

    it('scores at least 2 and reports no problems', () => {
      const strength = scorePassphrase(value)
      expect(strength.score).toBeGreaterThanOrEqual(2)
      expect(strength.problems).toEqual([])
    })

    it('does not throw', () => {
      expect(() => assertPassphraseAcceptable(value)).not.toThrow()
    })
  })

  it('rewards length with a higher score', () => {
    const shorter = scorePassphrase('quiet lantern rutabaga 41')
    const longer = scorePassphrase('quiet lantern rutabaga marmalade sundial 41')
    expect(longer.score).toBeGreaterThan(shorter.score)
  })

  it('gives every score a distinct human label', () => {
    const labels = new Set(
      ['', 'a'.repeat(12), 'quiet lantern rutabaga 41', 'quiet lantern rutabaga marmalade sundial 41'].map(
        (v) => scorePassphrase(v).label,
      ),
    )
    expect(labels.size).toBeGreaterThanOrEqual(3)
  })
})
