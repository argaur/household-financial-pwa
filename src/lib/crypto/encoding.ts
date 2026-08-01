import { CryptoError } from './errors'

/**
 * Binary <-> text encoding for this module.
 *
 * The chosen wire encoding is **base64url without padding** (RFC 4648 §5,
 * alphabet `A-Za-z0-9-_`). Everything this module persists — ciphertext, IVs,
 * salts, wrapped keys — is emitted in that form, so a value can be dropped
 * into JSON, a URL, or a query string without any escaping step.
 *
 * The decoder is deliberately more permissive than the encoder: it also
 * accepts the standard `+` / `/` alphabet and trailing `=` padding, so a value
 * that was written by some other tool still reads back.
 */
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

const DECODE_TABLE: Int16Array = (() => {
  const table = new Int16Array(128).fill(-1)
  for (let i = 0; i < BASE64URL_ALPHABET.length; i += 1) {
    table[BASE64URL_ALPHABET.charCodeAt(i)] = i
  }
  // Standard-base64 aliases, accepted on decode only.
  table['+'.charCodeAt(0)] = 62
  table['/'.charCodeAt(0)] = 63
  return table
})()

/** Encode bytes as unpadded base64url. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  // Chunked so a large buffer never builds a huge intermediate string array.
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out +=
      BASE64URL_ALPHABET[(n >> 18) & 63] +
      BASE64URL_ALPHABET[(n >> 12) & 63] +
      BASE64URL_ALPHABET[(n >> 6) & 63] +
      BASE64URL_ALPHABET[n & 63]
  }
  const remaining = bytes.length - i
  if (remaining === 1) {
    const n = bytes[i] << 16
    out += BASE64URL_ALPHABET[(n >> 18) & 63] + BASE64URL_ALPHABET[(n >> 12) & 63]
  } else if (remaining === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out +=
      BASE64URL_ALPHABET[(n >> 18) & 63] +
      BASE64URL_ALPHABET[(n >> 12) & 63] +
      BASE64URL_ALPHABET[(n >> 6) & 63]
  }
  return out
}

/**
 * Decode base64url (padding and the `+`/`/` alphabet tolerated).
 *
 * Returns `Uint8Array<ArrayBuffer>` rather than the wider default
 * `Uint8Array<ArrayBufferLike>`: WebCrypto's `BufferSource` excludes
 * SharedArrayBuffer-backed views, so every byte-producing function in this
 * module pins the concrete buffer type. That is what lets results flow
 * straight into `crypto.subtle.*` without a cast.
 */
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (typeof text !== 'string') {
    throw new CryptoError('INVALID_ENCODING', 'Expected a base64url string')
  }
  let end = text.length
  while (end > 0 && text[end - 1] === '=') end -= 1

  const remainder = end % 4
  if (remainder === 1) {
    throw new CryptoError(
      'INVALID_ENCODING',
      `Invalid base64url length: ${end} characters cannot encode a whole number of bytes`,
    )
  }

  const byteLength = ((end / 4) | 0) * 3 + (remainder === 2 ? 1 : remainder === 3 ? 2 : 0)
  const out = new Uint8Array(byteLength)

  let acc = 0
  let bits = 0
  let outIndex = 0
  for (let i = 0; i < end; i += 1) {
    const code = text.charCodeAt(i)
    const value = code < 128 ? DECODE_TABLE[code] : -1
    if (value < 0) {
      throw new CryptoError(
        'INVALID_ENCODING',
        `Invalid base64url character ${JSON.stringify(text[i])} at index ${i}`,
      )
    }
    acc = (acc << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[outIndex] = (acc >> bits) & 0xff
      outIndex += 1
    }
  }
  return out
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder('utf-8', { fatal: false })

/** UTF-8 encode a string. */
export function utf8Encode(text: string): Uint8Array<ArrayBuffer> {
  return textEncoder.encode(text)
}

/** UTF-8 decode bytes produced by {@link utf8Encode}. */
export function utf8Decode(bytes: Uint8Array): string {
  return textDecoder.decode(bytes)
}
