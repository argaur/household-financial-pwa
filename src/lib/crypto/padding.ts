import { CryptoError } from './errors'

/**
 * Length-hiding padding.
 *
 * WHY THIS EXISTS: AES-GCM ciphertext is exactly as long as its plaintext.
 * Without padding, the stored byte length of an encrypted row leaks how much
 * the household wrote — a one-word note is trivially distinguishable from a
 * long one, and a holdings row with three optional fields filled in is
 * distinguishable from one with none. Anyone with read access to the database
 * (which is the whole threat model for client-side encryption) can see that
 * without ever breaking the cipher. Bucketing every payload up to a 256-byte
 * multiple collapses that signal to "which 256-byte bucket".
 *
 * SCHEME: `[4-byte big-endian payload length][payload][zero filler]`, with the
 * total padded to the next multiple of 256.
 *
 * The explicit length header — rather than a PKCS#7-style trailing count — is
 * what makes the scheme unambiguous. It means:
 *   - a payload whose own trailing bytes are zero round-trips correctly,
 *     because the filler is never inspected;
 *   - embedded NUL bytes anywhere in the payload are fine;
 *   - a payload that already lands on an exact multiple of 256 needs **no**
 *     extra block. Schemes that must always append at least one pad byte spill
 *     into a second block at exactly that boundary; this one does not.
 */
export const PAD_BLOCK_SIZE = 256
export const PAD_HEADER_BYTES = 4

/** Largest payload the 4-byte header can describe. */
const MAX_PAYLOAD_BYTES = 0xffffffff

/** Pad a payload to a whole number of {@link PAD_BLOCK_SIZE}-byte blocks. */
export function padToBlock(payload: Uint8Array): Uint8Array<ArrayBuffer> {
  if (payload.length > MAX_PAYLOAD_BYTES) {
    throw new CryptoError(
      'INVALID_INPUT',
      `Payload of ${payload.length} bytes exceeds the maximum encodable length`,
    )
  }
  const total = PAD_HEADER_BYTES + payload.length
  const blocks = Math.ceil(total / PAD_BLOCK_SIZE)
  // A zero-length payload still occupies one block; never emit an empty buffer.
  const paddedLength = Math.max(blocks, 1) * PAD_BLOCK_SIZE

  const out = new Uint8Array(paddedLength)
  new DataView(out.buffer, out.byteOffset, out.byteLength).setUint32(0, payload.length, false)
  out.set(payload, PAD_HEADER_BYTES)
  // Remaining bytes are already zero from the Uint8Array allocation.
  return out
}

/** Recover the exact original payload from a padded buffer. */
export function unpadFromBlock(padded: Uint8Array): Uint8Array<ArrayBuffer> {
  if (padded.length === 0 || padded.length % PAD_BLOCK_SIZE !== 0) {
    throw new CryptoError(
      'INVALID_PADDING',
      `Padded buffer must be a positive multiple of ${PAD_BLOCK_SIZE} bytes, got ${padded.length}`,
    )
  }
  const declared = new DataView(
    padded.buffer,
    padded.byteOffset,
    padded.byteLength,
  ).getUint32(0, false)

  if (declared > padded.length - PAD_HEADER_BYTES) {
    throw new CryptoError(
      'INVALID_PADDING',
      `Padding header declares ${declared} bytes but only ${padded.length - PAD_HEADER_BYTES} are present`,
    )
  }
  // A copy, not a subarray view: the caller gets its own buffer, so the padded
  // plaintext can be zeroed and discarded without the result aliasing it.
  return new Uint8Array(padded.subarray(PAD_HEADER_BYTES, PAD_HEADER_BYTES + declared))
}
