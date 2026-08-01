import { CryptoError } from './errors'
import { utf8Encode } from './encoding'

/**
 * The four-part binding that every encrypted row is authenticated against.
 *
 * WHY `version` IS IN HERE: it is the replay defence. AES-GCM authenticates
 * the AAD without encrypting it, so a ciphertext produced at version 3 will
 * only ever decrypt when the caller supplies version 3. Someone with write
 * access to the database cannot roll a row back by pasting an older
 * ciphertext into it — the row's current version no longer matches what was
 * bound at encryption time and authentication fails. The other three parts
 * stop a ciphertext being moved between tables, between households, or
 * between rows of the same table.
 */
export interface RowAad {
  /** Physical table the row lives in, e.g. `'holdings'`. */
  tableName: string
  /** Owning household id — the tenancy boundary. */
  householdId: string
  /** Primary key of the row. */
  rowId: string
  /** Monotonic row version, incremented on every write. */
  version: number
}

/**
 * Format tag. Bumping this invalidates every existing ciphertext, so it only
 * changes if the AAD layout below changes.
 */
export const AAD_FORMAT = 'FPAAD1'

const MAX_VERSION = 0xffffffff

function assertNonEmpty(value: string, field: keyof RowAad): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CryptoError('INVALID_INPUT', `RowAad.${field} must be a non-empty string`)
  }
}

/**
 * Serialise a {@link RowAad} to the exact bytes fed to AES-GCM as additional
 * authenticated data.
 *
 * ENCODING: `"FPAAD1"` followed by, for each of tableName / householdId /
 * rowId, a 4-byte big-endian UTF-8 byte length then those bytes; then the
 * version as a 4-byte big-endian integer.
 *
 * Length-prefixed rather than delimiter-joined, on purpose. Naive
 * concatenation lets different tuples produce identical bytes — `("a","bc")`
 * and `("ab","c")` both become `"abc"` — and a delimiter alone only moves the
 * problem to whichever field can contain the delimiter. With an explicit
 * length in front of every field the mapping from tuple to bytes is
 * injective, so no two distinct tuples can share an AAD.
 */
export function buildAad(aad: RowAad): Uint8Array<ArrayBuffer> {
  assertNonEmpty(aad.tableName, 'tableName')
  assertNonEmpty(aad.householdId, 'householdId')
  assertNonEmpty(aad.rowId, 'rowId')

  if (!Number.isInteger(aad.version) || aad.version < 0 || aad.version > MAX_VERSION) {
    throw new CryptoError(
      'INVALID_INPUT',
      `RowAad.version must be an integer in [0, ${MAX_VERSION}], got ${String(aad.version)}`,
    )
  }

  const magic = utf8Encode(AAD_FORMAT)
  const fields = [
    utf8Encode(aad.tableName),
    utf8Encode(aad.householdId),
    utf8Encode(aad.rowId),
  ]

  const total =
    magic.length + fields.reduce((sum, f) => sum + 4 + f.length, 0) + 4
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength)

  out.set(magic, 0)
  let offset = magic.length
  for (const field of fields) {
    view.setUint32(offset, field.length, false)
    offset += 4
    out.set(field, offset)
    offset += field.length
  }
  view.setUint32(offset, aad.version, false)

  return out
}
