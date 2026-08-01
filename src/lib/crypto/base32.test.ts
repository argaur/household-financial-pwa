import { describe, it, expect } from 'vitest'
import { CROCKFORD_ALPHABET, encodeCrockford32, decodeCrockford32 } from './base32'
import { CryptoError } from './errors'

describe('Crockford base32', () => {
  it('uses the Crockford alphabet with no I, L, O or U', () => {
    expect(CROCKFORD_ALPHABET).toBe('0123456789ABCDEFGHJKMNPQRSTVWXYZ')
    for (const excluded of ['I', 'L', 'O', 'U']) {
      expect(CROCKFORD_ALPHABET).not.toContain(excluded)
    }
  })

  it('round-trips the empty array', () => {
    expect(encodeCrockford32(new Uint8Array(0))).toBe('')
    expect(decodeCrockford32('')).toEqual(new Uint8Array(0))
  })

  it('round-trips 16 random bytes to 26 characters, exactly', () => {
    for (let trial = 0; trial < 50; trial += 1) {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      const encoded = encodeCrockford32(bytes)
      expect(encoded).toHaveLength(26)
      expect(decodeCrockford32(encoded)).toEqual(bytes)
    }
  })

  it('round-trips every length from 1 to 20 bytes', () => {
    for (let len = 1; len <= 20; len += 1) {
      const bytes = crypto.getRandomValues(new Uint8Array(len))
      expect(decodeCrockford32(encodeCrockford32(bytes))).toEqual(bytes)
    }
  })

  it('encodes known vectors', () => {
    expect(encodeCrockford32(new Uint8Array([0x00]))).toBe('00')
    expect(encodeCrockford32(new Uint8Array([0xff]))).toBe('ZW')
    expect(decodeCrockford32('ZW')).toEqual(new Uint8Array([0xff]))
  })

  it('only emits alphabet characters', () => {
    const encoded = encodeCrockford32(crypto.getRandomValues(new Uint8Array(64)))
    for (const ch of encoded) expect(CROCKFORD_ALPHABET).toContain(ch)
  })

  it('rejects characters outside the alphabet', () => {
    expect(() => decodeCrockford32('AAU')).toThrow(CryptoError)
    expect(() => decodeCrockford32('A-A')).toThrow(CryptoError)
    expect(() => decodeCrockford32('aa')).toThrow(CryptoError)
  })
})
