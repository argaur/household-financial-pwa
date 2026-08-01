import { CryptoError } from './errors'

/**
 * Crockford base32 — the encoding used for the human-typed recovery code.
 *
 * `I`, `L`, `O` and `U` are absent from the alphabet: the first three because
 * they are visually confusable with `1`/`0`, and `U` so a random code cannot
 * spell something the user would be embarrassed to read out.
 */
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const DECODE_TABLE: Int16Array = (() => {
  const table = new Int16Array(128).fill(-1)
  for (let i = 0; i < CROCKFORD_ALPHABET.length; i += 1) {
    table[CROCKFORD_ALPHABET.charCodeAt(i)] = i
  }
  return table
})()

/**
 * Encode bytes as Crockford base32.
 *
 * Bits are consumed most-significant first; a trailing partial group is left
 * shifted so its unused low bits are zero, which is what makes
 * `decode(encode(x)) === x` exact for every input length.
 */
export function encodeCrockford32(bytes: Uint8Array): string {
  let out = ''
  let acc = 0
  let bits = 0
  for (let i = 0; i < bytes.length; i += 1) {
    acc = (acc << 8) | bytes[i]
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += CROCKFORD_ALPHABET[(acc >>> bits) & 31]
    }
  }
  if (bits > 0) {
    out += CROCKFORD_ALPHABET[(acc << (5 - bits)) & 31]
  }
  return out
}

/**
 * Decode a **canonical** Crockford base32 string (upper-case, alphabet
 * characters only). Input that a human typed must be run through
 * `normalizeRecoveryCode` first — this function does not guess.
 */
export function decodeCrockford32(text: string): Uint8Array<ArrayBuffer> {
  const byteLength = Math.floor((text.length * 5) / 8)
  const out = new Uint8Array(byteLength)
  let acc = 0
  let bits = 0
  let outIndex = 0
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    const value = code < 128 ? DECODE_TABLE[code] : -1
    if (value < 0) {
      throw new CryptoError(
        'INVALID_ENCODING',
        `Invalid Crockford base32 character ${JSON.stringify(text[i])} at index ${i}`,
      )
    }
    acc = (acc << 5) | value
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out[outIndex] = (acc >>> bits) & 0xff
      outIndex += 1
    }
  }
  return out
}
