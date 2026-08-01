/**
 * Adversarial verification of the passphrase strength floor.
 *
 * Written independently of the screen that enforces it. A disabled submit
 * button is presentation, not a security control — anyone can call the
 * underlying function directly. These tests bypass the UI entirely and try to
 * get key material generated from a weak passphrase.
 *
 * The floor is the actual security parameter of the product: the wrapped data
 * key is handed to any authenticated session and can be ground offline, so
 * 600,000 PBKDF2 rounds buy time, not safety, if the passphrase is guessable.
 * If these assertions ever start failing, the product claim has quietly
 * stopped being true.
 */
import { describe, it, expect } from 'vitest'
import 'fake-indexeddb/auto'
import {
  scorePassphrase,
  assertPassphraseAcceptable,
  WeakPassphraseError,
  MIN_PASSPHRASE_LENGTH,
} from './passphrase-strength'
import { prepareKeySetup } from './key-setup'
import { getVault } from './crypto/key-store'

/** Values a real user plausibly types, that must never guard a net worth. */
const weak: Array<[string, string]> = [
  ['a breach-corpus staple', 'password1234'],
  ['the same, capitalised', 'Password1234'],
  ['the same, mixed case', 'PaSSworD123!'],
  ['the same, l33t-substituted', 'P@ssw0rd1234'],
  ['the same, padded with spaces', '  Password1234  '],
  ['this app’s own vocabulary', 'financialplanning'],
  ['app vocabulary, l33t', 'F1n4nc14lPl4nn1ng'],
  ['the xkcd phrase everyone reuses', 'correcthorsebatterystaple'],
  ['a keyboard run', 'qwertyuiop12'],
  ['an alphabet run', 'abcdefghijkl'],
  ['a digit run', '123456789012'],
  ['too few distinct characters', 'aaaaaaaaaaaa'],
  ['a repeated unit', 'passwordpassword'],
  ['a repeated unit, sentimental', 'iloveyouiloveyou'],
  ['under the length floor', 'Tr0ub4dor'],
  ['empty', ''],
]

describe('ADVERSARIAL: a weak passphrase cannot produce key material', () => {
  it.each(weak)('rejects %s', (_label, passphrase) => {
    expect(scorePassphrase(passphrase).acceptable).toBe(false)
    expect(() => assertPassphraseAcceptable(passphrase)).toThrow(WeakPassphraseError)
  })

  it.each(weak)('prepareKeySetup refuses %s and creates nothing', async (_label, passphrase) => {
    await expect(prepareKeySetup(passphrase)).rejects.toBeInstanceOf(WeakPassphraseError)
    // The refusal must happen before any key, code or vault entry exists.
    expect(await getVault()).toBeNull()
  })

  it('refuses every length below the floor, even with good variety', async () => {
    for (let n = 0; n < MIN_PASSPHRASE_LENGTH; n++) {
      const candidate = 'Tr0ub4dor&3xyz'.slice(0, n)
      expect(scorePassphrase(candidate).acceptable).toBe(false)
      await expect(prepareKeySetup(candidate)).rejects.toBeInstanceOf(WeakPassphraseError)
    }
    expect(await getVault()).toBeNull()
  })
})

describe('ADVERSARIAL: the floor is not so strict it blocks real passphrases', () => {
  // A floor nobody can satisfy gets removed by the next developer under
  // deadline, so the permissive direction matters as much as the strict one.
  const strong = [
    'quiet lantern rides the tide',
    'Bhat!ndaMonsoon2026x',
    'purple-badger-eats-97-plums',
    'my daughter started walking in november',
  ]

  it.each(strong)('accepts %s', (passphrase) => {
    expect(scorePassphrase(passphrase).acceptable).toBe(true)
    expect(() => assertPassphraseAcceptable(passphrase)).not.toThrow()
  })
})

describe('ADVERSARIAL: the strength check never leaks the secret', () => {
  it('does not put the passphrase in the error message or the result', () => {
    const secret = 'Password1234'
    let thrown: unknown
    try {
      assertPassphraseAcceptable(secret)
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(WeakPassphraseError)
    const serialised = JSON.stringify({
      message: (thrown as Error).message,
      score: scorePassphrase(secret),
    })
    expect(serialised).not.toContain(secret)
    expect(serialised).not.toContain('assword')
  })
})
