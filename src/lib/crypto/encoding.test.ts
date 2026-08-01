import { describe, it, expect } from 'vitest'
import { toBase64Url, fromBase64Url, utf8Encode, utf8Decode } from './encoding'
import { CryptoError } from './errors'

describe('base64url encoding', () => {
  it('round-trips the empty array', () => {
    expect(toBase64Url(new Uint8Array(0))).toBe('')
    expect(fromBase64Url('')).toEqual(new Uint8Array(0))
  })

  it('round-trips every byte value 0..255', () => {
    const bytes = new Uint8Array(256)
    for (let i = 0; i < 256; i += 1) bytes[i] = i
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes)
  })

  it('round-trips each of the three length-mod-3 cases', () => {
    for (const len of [1, 2, 3, 4, 5, 6, 7]) {
      const bytes = new Uint8Array(len).fill(0xab)
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes)
    }
  })

  it('emits url-safe unpadded output (no +, /, or =)', () => {
    // 0xfb 0xff encodes to "+/8" in standard base64.
    const bytes = new Uint8Array([0xfb, 0xff, 0xfe, 0xff, 0xbf])
    const encoded = toBase64Url(bytes)
    expect(encoded).not.toMatch(/[+/=]/)
    expect(fromBase64Url(encoded)).toEqual(bytes)
  })

  it('tolerates padded standard-base64 input on decode', () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xfe])
    expect(fromBase64Url('+//+')).toEqual(bytes)
    expect(fromBase64Url('-__-')).toEqual(bytes)
    expect(fromBase64Url('AQID')).toEqual(new Uint8Array([1, 2, 3]))
    expect(fromBase64Url('AQI=')).toEqual(new Uint8Array([1, 2]))
    expect(fromBase64Url('AQ==')).toEqual(new Uint8Array([1]))
  })

  it('rejects invalid characters', () => {
    expect(() => fromBase64Url('AQI*')).toThrow(CryptoError)
    expect(() => fromBase64Url('a b')).toThrow(CryptoError)
  })

  it('rejects an impossible length', () => {
    // 5 chars = 4 + 1 leftover; a single base64 char cannot encode a byte.
    expect(() => fromBase64Url('AAAAA')).toThrow(CryptoError)
  })

  it('handles a large buffer without stack overflow', () => {
    const bytes = new Uint8Array(100_000)
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i & 0xff
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes)
  })
})

describe('utf8 helpers', () => {
  it('round-trips ascii, Indian names, the rupee sign and emoji', () => {
    for (const text of ['', 'hello', 'Priya Sharma', 'आरव शर्मा', '₹1,23,456', String.fromCharCode(97, 0, 98)]) {
      expect(utf8Decode(utf8Encode(text))).toBe(text)
    }
  })

  it('encodes the rupee sign as three bytes', () => {
    expect(Array.from(utf8Encode('₹'))).toEqual([0xe2, 0x82, 0xb9])
  })
})
