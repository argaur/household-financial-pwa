import { describe, it, expect } from 'vitest'
import { PAD_BLOCK_SIZE, PAD_HEADER_BYTES, padToBlock, unpadFromBlock } from './padding'
import { utf8Encode, utf8Decode } from './encoding'
import { CryptoError } from './errors'

const bytesOf = (len: number, fill = 0x41) => new Uint8Array(len).fill(fill)
const NUL = String.fromCharCode(0)

describe('block padding', () => {
  it('pads to a 256-byte block size', () => {
    expect(PAD_BLOCK_SIZE).toBe(256)
    expect(PAD_HEADER_BYTES).toBe(4)
  })

  it('pads the empty payload to exactly one block', () => {
    const padded = padToBlock(new Uint8Array(0))
    expect(padded.length).toBe(256)
    expect(unpadFromBlock(padded)).toEqual(new Uint8Array(0))
  })

  it('always produces a multiple of the block size', () => {
    for (const len of [0, 1, 100, 251, 252, 253, 255, 256, 511, 512, 513, 1000]) {
      expect(padToBlock(bytesOf(len)).length % PAD_BLOCK_SIZE).toBe(0)
    }
  })

  it('handles the exact-multiple boundary without an extra block', () => {
    // header (4) + 252 payload bytes == 256 exactly. The classic off-by-one:
    // a naive "always add at least one pad byte" scheme spills into a second
    // block here; a length-prefixed scheme does not need to.
    expect(padToBlock(bytesOf(252)).length).toBe(256)
    expect(padToBlock(bytesOf(251)).length).toBe(256)
    expect(padToBlock(bytesOf(253)).length).toBe(512)
    expect(padToBlock(bytesOf(508)).length).toBe(512)
    expect(padToBlock(bytesOf(509)).length).toBe(768)
    // and each of those still round-trips
    for (const len of [251, 252, 253, 508, 509]) {
      expect(unpadFromBlock(padToBlock(bytesOf(len)))).toEqual(bytesOf(len))
    }
  })

  it('grows in 256-byte steps', () => {
    const sizes = [0, 252, 253, 508, 509, 764, 765].map((n) => padToBlock(bytesOf(n)).length)
    expect(sizes).toEqual([256, 256, 512, 512, 768, 768, 1024])
  })

  it('gives two very different payloads in the same bucket identical padded lengths', () => {
    const short = utf8Encode('{"note":"ok"}')
    const long = utf8Encode(`{"note":"${'x'.repeat(200)}"}`)
    expect(short.length).not.toBe(long.length)
    expect(padToBlock(short).length).toBe(padToBlock(long).length)
  })

  it('preserves content byte-for-byte, including non-ASCII and embedded nulls', () => {
    const text = `आरव शर्मा — ₹1,23,456 ${NUL}${NUL} tail ${NUL}`
    const round = utf8Decode(unpadFromBlock(padToBlock(utf8Encode(text))))
    expect(round).toBe(text)
  })

  it('round-trips a payload whose trailing bytes are zero', () => {
    const payload = new Uint8Array([1, 2, 3, 0, 0, 0])
    expect(unpadFromBlock(padToBlock(payload))).toEqual(payload)
  })

  it('rejects a padded buffer that is not a whole number of blocks', () => {
    expect(() => unpadFromBlock(new Uint8Array(255))).toThrow(CryptoError)
    expect(() => unpadFromBlock(new Uint8Array(0))).toThrow(CryptoError)
  })

  it('rejects a declared length that overflows the buffer', () => {
    const corrupt = new Uint8Array(256)
    // declare 9999 bytes of payload inside a 256-byte block
    new DataView(corrupt.buffer).setUint32(0, 9999, false)
    expect(() => unpadFromBlock(corrupt)).toThrow(CryptoError)
  })
})
