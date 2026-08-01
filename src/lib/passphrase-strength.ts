/**
 * The passphrase strength floor.
 *
 * This is not a UX nicety. The household data key is wrapped under a key
 * derived from this passphrase, and the wrapped blob is served by
 * `/api/household-keys` to any authenticated session — so anyone who ever
 * obtains it can grind guesses **offline**, at whatever rate their hardware
 * allows, with no server to rate-limit them. PBKDF2 at 600,000 rounds raises
 * the cost per guess; it does nothing about a passphrase that only needs a few
 * thousand guesses. The floor below is what actually bounds that attack.
 *
 * Everything here runs in the browser. The server cannot check any of it — it
 * never sees the passphrase, by design — so this module is the only gate that
 * exists, and both the UI and the setup orchestration must go through it.
 */

/**
 * Minimum passphrase length.
 *
 * NIST 800-63B §5.1.1.2 puts the floor for user-chosen secrets at 8, but that
 * floor assumes a *verifier* that can throttle and lock out online guessing.
 * There is no verifier here: the wrapped key is the whole attack surface and
 * it is attacked offline. This guards a household's entire net worth, and the
 * cost of a wrong answer is permanent — there is no reset, no support desk, no
 * way back. 12 is the shortest length at which a passphrase with any real
 * variety costs meaningfully more than a commodity GPU-hours budget at 600k
 * PBKDF2 rounds, and it is short enough that a four-word phrase clears it
 * without the user fighting the form. The meter above this floor pushes for
 * 16+; the floor itself refuses below 12.
 */
export const MIN_PASSPHRASE_LENGTH = 12

/** Below this many distinct characters, length is padding rather than entropy. */
const MIN_DISTINCT_CHARACTERS = 5

/**
 * Values that are never acceptable, however they are dressed up.
 *
 * Two groups, both deliberate:
 *  1. Passwords that top every breach corpus. Anything derived from a leaked
 *     list is the first thing an offline attacker tries.
 *  2. Values a user of *this* app would reach for — the product's own
 *     vocabulary. A generic common-password list would miss all of these, and
 *     they are exactly as guessable in context.
 *
 * Entries are stored in normalised form (lower case, letters and digits only).
 * Matching is done against several normalisations of the input — see
 * {@link blocklistCandidates} — so case, punctuation, l33t substitutions and
 * trailing digits do not buy a way past.
 */
const BLOCKLIST: ReadonlySet<string> = new Set([
  // Breach-corpus staples.
  'password',
  'passwd',
  'letmein',
  'iloveyou',
  'welcome',
  'monkey',
  'dragon',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'superman',
  'batman',
  'starwars',
  'michael',
  'jordan',
  'shadow',
  'master',
  'trustno',
  'changeme',
  'secret',
  'whatever',
  'admin',
  'administrator',
  'root',
  'guest',
  'default',
  'qwerty',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
  'qazwsxedc',
  'qazwsx',
  'zaqwsx',
  'abc',
  'test',
  'demo',
  'sample',
  'example',
  // The xkcd 936 phrase. Famous enough to be in every wordlist on earth, and
  // people type it precisely because they read the comic about entropy.
  'correcthorsebatterystaple',
  // This app's own vocabulary. Obvious in context, invisible to a generic list.
  'financialplanning',
  'financialplan',
  'financeplan',
  'financeapp',
  'myfinances',
  'myfinancialplan',
  'householdfinance',
  'householdplanning',
  'myhouseholdplan',
  'household',
  'familyfinances',
  'familyplan',
  'familyplanning',
  'networth',
  'networthtracker',
  'myportfolio',
  'portfolio',
  'moneymoney',
  'mymoney',
  'savings',
  'investments',
  'mutualfunds',
  'passphrase',
  'mypassphrase',
  'recoverycode',
  'myrecoverycode',
  'openthevault',
  'unlockmyvault',
  'letmeinplease',
  'gauravgdev',
  'financegauravgdev',
])

/** Runs a keyboard or an alphabet walks. A slice of any of these is not a secret. */
const SEQUENCES: readonly string[] = [
  'abcdefghijklmnopqrstuvwxyz',
  '01234567890123456789',
  'qwertyuiopasdfghjklzxcvbnm',
  '1qaz2wsx3edc4rfv',
  '1q2w3e4r5t6y7u8i9o0p',
]

/** Symbol-for-letter substitutions, undone before the blocklist is consulted. */
const SYMBOL_LEET: ReadonlyMap<string, string> = new Map([
  ['@', 'a'],
  ['$', 's'],
  ['!', 'i'],
  ['+', 't'],
  ['|', 'l'],
  ['(', 'c'],
])

/** Digit-for-letter substitutions, undone before the blocklist is consulted. */
const DIGIT_LEET: ReadonlyMap<string, string> = new Map([
  ['0', 'o'],
  ['1', 'i'],
  ['3', 'e'],
  ['4', 'a'],
  ['5', 's'],
  ['7', 't'],
  ['8', 'b'],
  ['9', 'g'],
])

function foldSymbols(value: string): string {
  let out = ''
  for (const ch of value) out += SYMBOL_LEET.get(ch) ?? ch
  return out
}

function foldDigits(value: string): string {
  let out = ''
  for (const ch of value) out += DIGIT_LEET.get(ch) ?? ch
  return out
}

function alphanumericOnly(value: string): string {
  return value.replace(/[^a-z0-9]/g, '')
}

function stripEdgeDigits(value: string): string {
  return value.replace(/^\d+/, '').replace(/\d+$/, '')
}

/**
 * Every normalisation of the input the blocklist is checked against.
 *
 * Checking one canonical form is not enough: "Password123!" and "P@ssw0rd1234"
 * canonicalise differently depending on whether digits are read as letters or
 * as padding, and both must be caught. Generating the small set of plausible
 * readings and testing all of them is cheaper and more honest than pretending
 * one fold covers every case.
 */
function blocklistCandidates(passphrase: string): Set<string> {
  const lowered = passphrase.normalize('NFKC').trim().toLowerCase()
  // Two readings of the symbols: dropped as punctuation, or folded back to the
  // letters they stand in for ("P@ssw0rd" is the same word as "password").
  const roots = [alphanumericOnly(lowered), alphanumericOnly(foldSymbols(lowered))]

  const candidates = new Set<string>()
  for (const root of roots) {
    if (root.length === 0) continue
    // Digits are ambiguous: they can be padding ("password1234") or stand-ins
    // for letters ("f1n4nc14l"). Both readings are generated, and stripping
    // the padding must happen BEFORE folding, or "1234" folds to "i2ea" and
    // the word it was padding is never recognised.
    for (const value of [root, stripEdgeDigits(root)]) {
      if (value.length === 0) continue
      candidates.add(value)
      candidates.add(foldDigits(value))
      candidates.add(stripEdgeDigits(foldDigits(value)))
    }
  }
  candidates.delete('')
  return candidates
}

/** The shortest unit the whole string is a repetition of, or the string itself. */
function smallestRepeatingUnit(value: string): string {
  for (let size = 1; size <= value.length / 2; size += 1) {
    if (value.length % size !== 0) continue
    const unit = value.slice(0, size)
    if (unit.repeat(value.length / size) === value) return unit
  }
  return value
}

function isSequenceSlice(value: string): boolean {
  if (value.length < 4) return false
  for (const sequence of SEQUENCES) {
    if (sequence.includes(value)) return true
    if ([...sequence].reverse().join('').includes(value)) return true
  }
  return false
}

export type PassphraseScore = 0 | 1 | 2 | 3 | 4

export interface PassphraseStrength {
  /** 0–4, for the meter. Forced to 0 whenever `acceptable` is false. */
  score: PassphraseScore
  /** Human label for the score. */
  label: string
  /**
   * The hard gate. When false the passphrase must never be submittable and
   * must never reach any key-derivation path.
   */
  acceptable: boolean
  /** Why it was refused. Never contains the passphrase itself. */
  problems: string[]
}

const LABELS: Record<PassphraseScore, string> = {
  0: 'Too weak',
  1: 'Weak',
  2: 'Fair',
  3: 'Strong',
  4: 'Very strong',
}

function characterClasses(passphrase: string): number {
  let classes = 0
  if (/[a-z]/.test(passphrase)) classes += 1
  if (/[A-Z]/.test(passphrase)) classes += 1
  if (/\d/.test(passphrase)) classes += 1
  if (/[^A-Za-z0-9]/.test(passphrase)) classes += 1
  return classes
}

function wordCount(passphrase: string): number {
  return passphrase.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Length dominates; variety only rescues a short passphrase.
 *
 * Character-class rules are a well-documented failure mode — they push people
 * to "Password1!" and cap real entropy — so a mixed-case-plus-symbol bonus is
 * available only below 24 characters, where the phrase genuinely needs it. A
 * long phrase is never marked down for being all lower case, and a short one
 * can never reach the top band by adding punctuation.
 */
function rawScore(passphrase: string): PassphraseScore {
  const length = passphrase.trim().length
  let score: PassphraseScore = 1
  if (length >= 16) score = 2
  if (length >= 24) score = 3
  if (length >= 32) score = 4
  if (score <= 2 && (characterClasses(passphrase) >= 3 || wordCount(passphrase) >= 4)) {
    score = (score + 1) as PassphraseScore
  }
  return score
}

/**
 * Score a candidate passphrase and decide whether it clears the floor.
 *
 * Pure and synchronous — safe to call on every keystroke, and callable from a
 * submit handler as the second of the two enforcement layers.
 */
export function scorePassphrase(passphrase: string): PassphraseStrength {
  const trimmed = passphrase.trim()
  const problems: string[] = []

  if (trimmed.length < MIN_PASSPHRASE_LENGTH) {
    problems.push(`Use at least ${MIN_PASSPHRASE_LENGTH} characters.`)
  }

  const distinct = new Set(trimmed.toLowerCase()).size
  if (trimmed.length > 0 && distinct < MIN_DISTINCT_CHARACTERS) {
    problems.push('Use a wider mix of characters — this repeats too few of them.')
  }

  const candidates = blocklistCandidates(trimmed)
  for (const candidate of candidates) {
    if (BLOCKLIST.has(candidate) || BLOCKLIST.has(smallestRepeatingUnit(candidate))) {
      problems.push('This is a well-known phrase, or an obvious one for a financial app. Pick something else.')
      break
    }
  }

  for (const candidate of candidates) {
    if (isSequenceSlice(candidate)) {
      problems.push('This is a straight run along the keyboard or the alphabet.')
      break
    }
  }

  if (trimmed.length > 0) {
    const unit = smallestRepeatingUnit(alphanumericOnly(trimmed.toLowerCase()))
    if (unit.length > 0 && unit.length <= alphanumericOnly(trimmed.toLowerCase()).length / 2) {
      problems.push('This is one short piece repeated — it is only as strong as that piece.')
    }
  }

  const acceptable = problems.length === 0
  const score = acceptable ? rawScore(passphrase) : 0
  return { score, label: LABELS[score], acceptable, problems }
}

/**
 * Thrown when a passphrase below the floor reaches a key-derivation path.
 *
 * Deliberately carries the problems and not the passphrase: this error is
 * rendered, and could be captured by Sentry — the passphrase must never travel
 * with it.
 */
export class WeakPassphraseError extends Error {
  readonly problems: string[]

  constructor(problems: string[]) {
    super(`Passphrase does not meet the minimum strength required: ${problems.join(' ')}`)
    this.name = 'WeakPassphraseError'
    this.problems = problems
  }
}

/**
 * The second enforcement layer.
 *
 * A disabled button is a UI state, and UI state can be bypassed — by a form
 * submitted with Enter, by devtools, by a future refactor that forgets the
 * `disabled` prop. This runs inside the setup path itself, so no weak
 * passphrase can produce key material regardless of what the UI did.
 */
export function assertPassphraseAcceptable(passphrase: string): void {
  const { acceptable, problems } = scorePassphrase(passphrase)
  if (!acceptable) throw new WeakPassphraseError(problems)
}
