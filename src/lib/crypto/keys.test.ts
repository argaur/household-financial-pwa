import { describe, it, expect } from 'vitest'
import {
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
} from './keys'
import { generateRecoveryCode, normalizeRecoveryCode } from './recovery-code'
import { fromBase64Url, toBase64Url, utf8Encode, utf8Decode } from './encoding'
import { CryptoError } from './errors'

// Real PBKDF2 at 600k iterations takes ~0.5s per call. The security parameter
// is asserted once (below); every other test derives at a low count so the
// suite stays fast while still exercising the real WebCrypto primitive.
const FAST = 1_000

const passphrase = 'correct horse battery staple ₹'

async function roundTripsWith(dataKey: CryptoKey, other: CryptoKey): Promise<boolean> {
  const iv = generateIv()
  const message = utf8Encode('holdings row')
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dataKey, message)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, other, ct)
  return utf8Decode(new Uint8Array(pt)) === 'holdings row'
}

describe('persisted constants', () => {
  it('exports the values that get written to a household_keys row', () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000)
    expect(KDF_ALG).toBe('PBKDF2-SHA256')
    expect(KEY_WRAP_ALG).toBe('AES-256-GCM')
    expect(DATA_KEY_BITS).toBe(256)
    expect(SALT_BYTES).toBe(16)
    expect(IV_BYTES).toBe(12)
  })
})

describe('generateSalt / generateIv', () => {
  it('produces salts of the documented length', () => {
    expect(generateSalt()).toHaveLength(SALT_BYTES)
    expect(generateSalt(32)).toHaveLength(32)
  })

  it('produces a fresh salt every call', () => {
    const seen = new Set(Array.from({ length: 100 }, () => toBase64Url(generateSalt())))
    expect(seen.size).toBe(100)
  })

  it('produces 96-bit IVs, fresh every call', () => {
    expect(generateIv()).toHaveLength(12)
    const seen = new Set(Array.from({ length: 100 }, () => toBase64Url(generateIv())))
    expect(seen.size).toBe(100)
  })

  it('rejects a nonsensical salt length', () => {
    expect(() => generateSalt(0)).toThrow(CryptoError)
    expect(() => generateSalt(-1)).toThrow(CryptoError)
    expect(() => generateSalt(1.5)).toThrow(CryptoError)
  })
})

describe('deriveKeyFromPassphrase', () => {
  it('produces a non-extractable AES-256 key usable only for wrapping', async () => {
    const key = await deriveKeyFromPassphrase(passphrase, generateSalt(), FAST)
    expect(key.type).toBe('secret')
    expect(key.extractable).toBe(false)
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 })
    expect([...key.usages].sort()).toEqual(['unwrapKey', 'wrapKey'])
  })

  it('is deterministic for the same passphrase, salt and iteration count', async () => {
    const salt = generateSalt()
    const a = await deriveKeyFromPassphrase(passphrase, salt, FAST)
    const b = await deriveKeyFromPassphrase(passphrase, salt, FAST)
    const dataKey = await generateDataKey()
    const { wrapped, iv } = await wrapDataKey(dataKey, a)
    const unwrapped = await unwrapDataKey(wrapped, iv, b)
    expect(await roundTripsWith(dataKey, unwrapped)).toBe(true)
  })

  it('gives a different key for a different passphrase', async () => {
    const salt = generateSalt()
    const a = await deriveKeyFromPassphrase(passphrase, salt, FAST)
    const b = await deriveKeyFromPassphrase(`${passphrase}!`, salt, FAST)
    const { wrapped, iv } = await wrapDataKey(await generateDataKey(), a)
    await expect(unwrapDataKey(wrapped, iv, b)).rejects.toThrow(CryptoError)
  })

  it('gives a different key for a different salt', async () => {
    const a = await deriveKeyFromPassphrase(passphrase, generateSalt(), FAST)
    const b = await deriveKeyFromPassphrase(passphrase, generateSalt(), FAST)
    const { wrapped, iv } = await wrapDataKey(await generateDataKey(), a)
    await expect(unwrapDataKey(wrapped, iv, b)).rejects.toThrow(CryptoError)
  })

  it('gives a different key for a different iteration count', async () => {
    const salt = generateSalt()
    const a = await deriveKeyFromPassphrase(passphrase, salt, FAST)
    const b = await deriveKeyFromPassphrase(passphrase, salt, FAST + 1)
    const { wrapped, iv } = await wrapDataKey(await generateDataKey(), a)
    await expect(unwrapDataKey(wrapped, iv, b)).rejects.toThrow(CryptoError)
  })

  it('defaults to PBKDF2_ITERATIONS when the count is omitted', async () => {
    const salt = generateSalt()
    const implicit = await deriveKeyFromPassphrase(passphrase, salt)
    const explicit = await deriveKeyFromPassphrase(passphrase, salt, PBKDF2_ITERATIONS)
    const dataKey = await generateDataKey()
    const { wrapped, iv } = await wrapDataKey(dataKey, implicit)
    const unwrapped = await unwrapDataKey(wrapped, iv, explicit)
    expect(await roundTripsWith(dataKey, unwrapped)).toBe(true)
  }, 60_000)

  it('validates its inputs at the boundary', async () => {
    await expect(deriveKeyFromPassphrase('', generateSalt(), FAST)).rejects.toThrow(CryptoError)
    await expect(deriveKeyFromPassphrase(passphrase, new Uint8Array(0), FAST)).rejects.toThrow(
      CryptoError,
    )
    await expect(deriveKeyFromPassphrase(passphrase, generateSalt(), 0)).rejects.toThrow(CryptoError)
    await expect(deriveKeyFromPassphrase(passphrase, generateSalt(), -5)).rejects.toThrow(
      CryptoError,
    )
    await expect(deriveKeyFromPassphrase(passphrase, generateSalt(), 1.5)).rejects.toThrow(
      CryptoError,
    )
  })
})

describe('deriveKeyFromRecoveryCode', () => {
  it('unwraps regardless of how the user typed the code', async () => {
    const salt = generateSalt()
    const code = generateRecoveryCode()
    const dataKey = await generateDataKey()
    const wrappingKey = await deriveKeyFromRecoveryCode(code, salt, FAST)
    const { wrapped, iv } = await wrapDataKey(dataKey, wrappingKey)

    const variants = [
      code,
      code.toLowerCase(),
      normalizeRecoveryCode(code),
      `  ${code.replace(/-/g, ' ')}  `,
      normalizeRecoveryCode(code).replace(/0/g, 'O').replace(/1/g, 'I').toLowerCase(),
    ]
    for (const variant of variants) {
      const key = await deriveKeyFromRecoveryCode(variant, salt, FAST)
      const unwrapped = await unwrapDataKey(wrapped, iv, key)
      expect(await roundTripsWith(dataKey, unwrapped)).toBe(true)
    }
  })

  it('fails on the wrong recovery code', async () => {
    const salt = generateSalt()
    const wrappingKey = await deriveKeyFromRecoveryCode(generateRecoveryCode(), salt, FAST)
    const { wrapped, iv } = await wrapDataKey(await generateDataKey(), wrappingKey)
    const other = await deriveKeyFromRecoveryCode(generateRecoveryCode(), salt, FAST)
    await expect(unwrapDataKey(wrapped, iv, other)).rejects.toThrow(CryptoError)
  })

  it('rejects a malformed recovery code instead of deriving from garbage', async () => {
    await expect(deriveKeyFromRecoveryCode('not-a-code', generateSalt(), FAST)).rejects.toThrow(
      CryptoError,
    )
    await expect(
      deriveKeyFromRecoveryCode('0123456789ABCDEFGHJKMNPQRU', generateSalt(), FAST),
    ).rejects.toThrow(CryptoError)
  })
})

describe('generateDataKey', () => {
  it('is a 256-bit AES-GCM key', async () => {
    const key = await generateDataKey()
    expect(key.type).toBe('secret')
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 })
    expect([...key.usages].sort()).toEqual(['decrypt', 'encrypt'])
  })

  it('is extractable at generation time, because it has to be wrapped', async () => {
    const key = await generateDataKey()
    expect(key.extractable).toBe(true)
    const raw = await crypto.subtle.exportKey('raw', key)
    expect(raw.byteLength).toBe(32)
  })

  it('is different every time', async () => {
    const seen = new Set<string>()
    for (let i = 0; i < 20; i += 1) {
      const raw = await crypto.subtle.exportKey('raw', await generateDataKey())
      seen.add(toBase64Url(new Uint8Array(raw)))
    }
    expect(seen.size).toBe(20)
  })
})

describe('wrapDataKey / unwrapDataKey', () => {
  it('round-trips the data key through a passphrase-derived wrapping key', async () => {
    const dataKey = await generateDataKey()
    const wrappingKey = await deriveKeyFromPassphrase(passphrase, generateSalt(), FAST)
    const { wrapped, iv } = await wrapDataKey(dataKey, wrappingKey)
    expect(typeof wrapped).toBe('string')
    expect(typeof iv).toBe('string')
    expect(fromBase64Url(iv)).toHaveLength(IV_BYTES)
    const unwrapped = await unwrapDataKey(wrapped, iv, wrappingKey)
    expect(await roundTripsWith(dataKey, unwrapped)).toBe(true)
  })

  it('never reuses an IV across wraps of the same data key', async () => {
    // The passphrase copy and the recovery copy of the same data key are two
    // separate wraps. Reusing one IV under one wrapping key would be a
    // catastrophic AES-GCM nonce reuse, so each wrap must generate its own.
    const dataKey = await generateDataKey()
    const wrappingKey = await deriveKeyFromPassphrase(passphrase, generateSalt(), FAST)
    const first = await wrapDataKey(dataKey, wrappingKey)
    const second = await wrapDataKey(dataKey, wrappingKey)
    expect(first.iv).not.toBe(second.iv)
    expect(first.wrapped).not.toBe(second.wrapped)

    const ivs = new Set<string>()
    for (let i = 0; i < 50; i += 1) ivs.add((await wrapDataKey(dataKey, wrappingKey)).iv)
    expect(ivs.size).toBe(50)

    // both copies still unwrap to the same key material
    expect(await roundTripsWith(dataKey, await unwrapDataKey(first.wrapped, first.iv, wrappingKey))).toBe(true)
    expect(
      await roundTripsWith(dataKey, await unwrapDataKey(second.wrapped, second.iv, wrappingKey)),
    ).toBe(true)
  })

  it('returns a NON-EXTRACTABLE data key from unwrap', async () => {
    // Asymmetry on purpose: generateDataKey() is extractable so it can be
    // wrapped once at setup. Everything unwrapped afterwards lives only inside
    // WebCrypto, so no application bug, XSS payload or console session can
    // read the raw household data key back out.
    const dataKey = await generateDataKey()
    const wrappingKey = await deriveKeyFromPassphrase(passphrase, generateSalt(), FAST)
    const { wrapped, iv } = await wrapDataKey(dataKey, wrappingKey)
    const unwrapped = await unwrapDataKey(wrapped, iv, wrappingKey)

    expect(unwrapped.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', unwrapped)).rejects.toThrow()
  })

  it('fails on a tampered wrapped blob', async () => {
    const dataKey = await generateDataKey()
    const wrappingKey = await deriveKeyFromPassphrase(passphrase, generateSalt(), FAST)
    const { wrapped, iv } = await wrapDataKey(dataKey, wrappingKey)
    const bytes = fromBase64Url(wrapped)
    bytes[3] ^= 0x01
    await expect(unwrapDataKey(toBase64Url(bytes), iv, wrappingKey)).rejects.toThrow(CryptoError)
  })

  it('fails on a tampered iv', async () => {
    const dataKey = await generateDataKey()
    const wrappingKey = await deriveKeyFromPassphrase(passphrase, generateSalt(), FAST)
    const { wrapped, iv } = await wrapDataKey(dataKey, wrappingKey)
    const ivBytes = fromBase64Url(iv)
    ivBytes[0] ^= 0xff
    await expect(unwrapDataKey(wrapped, toBase64Url(ivBytes), wrappingKey)).rejects.toThrow(
      CryptoError,
    )
  })

  it('rejects a wrong-length iv at the boundary', async () => {
    const dataKey = await generateDataKey()
    const wrappingKey = await deriveKeyFromPassphrase(passphrase, generateSalt(), FAST)
    const { wrapped } = await wrapDataKey(dataKey, wrappingKey)
    await expect(
      unwrapDataKey(wrapped, toBase64Url(new Uint8Array(8)), wrappingKey),
    ).rejects.toThrow(CryptoError)
  })

  it('surfaces an UNWRAP_FAILED code and keeps the underlying cause', async () => {
    const dataKey = await generateDataKey()
    const good = await deriveKeyFromPassphrase(passphrase, generateSalt(), FAST)
    const bad = await deriveKeyFromPassphrase('wrong', generateSalt(), FAST)
    const { wrapped, iv } = await wrapDataKey(dataKey, good)
    const error = await unwrapDataKey(wrapped, iv, bad).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CryptoError)
    expect((error as CryptoError).code).toBe('UNWRAP_FAILED')
    expect((error as CryptoError).cause).toBeDefined()
  })
})
