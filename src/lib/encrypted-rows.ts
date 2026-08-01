import type { ZodType } from 'zod'
import { encryptRow, decryptRow, isCryptoError, type EncryptedRow } from './crypto'
import { requireVault, VaultLockedError, type Vault } from './crypto/key-store'

/**
 * The client half of the encryption boundary.
 *
 * Every row of `households`, `family_members`, `holdings` and `protection`
 * crosses the wire as `{ ciphertext, iv, alg, version }` plus the handful of
 * columns the server genuinely needs to route and scope it. This module owns
 * the two directions of that translation, so the four API clients contain no
 * crypto of their own.
 */

export { VaultLockedError }
export type { Vault }

/** The envelope exactly as the server returns it. All three blobs are nullable — see {@link RowOutcome}. */
export interface WireEnvelope {
  id: string
  householdId: string
  ciphertext: string | null
  iv: string | null
  alg: string | null
  version: number
  createdAt: string
  updatedAt: string
}

/**
 * What became of one row.
 *
 * `not-yet-encrypted` and `unreadable` are deliberately separate states, not
 * one "bad row" bucket. A row with no ciphertext was written before encryption
 * existed and is recoverable by re-entering it; a row that failed to decrypt
 * means the wrong key, a tampered blob, or a version that no longer matches —
 * a security-relevant event that deserves different words in the UI. Neither
 * ever carries the row's contents.
 */
export type RowOutcome<T> =
  | { status: 'decrypted'; id: string; row: T }
  | { status: 'not-yet-encrypted'; id: string }
  | { status: 'unreadable'; id: string; reason: string }

export interface DecryptedRows<T> {
  /** Only the rows that decrypted, in wire order. One bad row never costs the others. */
  rows: T[]
  /** Per-row outcomes, for a caller that wants to explain the gaps. */
  outcomes: Array<RowOutcome<T>>
  /** How many rows failed to decrypt. A count only — never their contents. */
  unreadableCount: number
  /** How many rows predate encryption and hold no ciphertext yet. */
  notYetEncryptedCount: number
}

/** A short, contents-free reason string for an unreadable row. */
function describeFailure(error: unknown): string {
  if (isCryptoError(error)) return error.code
  if (error instanceof Error && error.name === 'ZodError') return 'INVALID_PAYLOAD'
  return 'UNKNOWN'
}

/**
 * Decrypt one row, independently of every other row.
 *
 * The decrypted plaintext is parsed with a schema rather than cast: AES-GCM
 * proves the bytes are authentic, not that they still match the shape this
 * build expects (a row written by an older version of the app is authentic
 * and wrong at the same time).
 */
export async function decryptWireRow<TWire extends WireEnvelope, TPayload, T>(
  tableName: string,
  dataKey: CryptoKey,
  wire: TWire,
  payloadSchema: ZodType<TPayload>,
  assemble: (wire: TWire, payload: TPayload) => T,
): Promise<RowOutcome<T>> {
  if (wire.ciphertext === null || wire.iv === null || wire.alg === null) {
    return { status: 'not-yet-encrypted', id: wire.id }
  }

  const envelope: EncryptedRow = {
    ciphertext: wire.ciphertext,
    iv: wire.iv,
    alg: wire.alg,
    version: wire.version,
  }

  try {
    const plain = await decryptRow(envelope, dataKey, {
      tableName,
      householdId: wire.householdId,
      rowId: wire.id,
      version: wire.version,
    })
    return { status: 'decrypted', id: wire.id, row: assemble(wire, payloadSchema.parse(plain)) }
  } catch (err) {
    return { status: 'unreadable', id: wire.id, reason: describeFailure(err) }
  }
}

/** Decrypt a list, isolating failures per row. */
export async function decryptWireRows<TWire extends WireEnvelope, TPayload, T>(
  tableName: string,
  dataKey: CryptoKey,
  wire: TWire[],
  payloadSchema: ZodType<TPayload>,
  assemble: (wire: TWire, payload: TPayload) => T,
): Promise<DecryptedRows<T>> {
  const outcomes = await Promise.all(
    wire.map((row) => decryptWireRow(tableName, dataKey, row, payloadSchema, assemble)),
  )

  const rows: T[] = []
  let unreadableCount = 0
  let notYetEncryptedCount = 0
  for (const outcome of outcomes) {
    if (outcome.status === 'decrypted') rows.push(outcome.row)
    else if (outcome.status === 'unreadable') unreadableCount += 1
    else notYetEncryptedCount += 1
  }

  return { rows, outcomes, unreadableCount, notYetEncryptedCount }
}

/** The write half of the envelope: exactly the three fields that go on the wire. */
export interface SealedEnvelope {
  ciphertext: string
  iv: string
  alg: string
}

/**
 * Seal a row for storage.
 *
 * `version` is the version the row will have **once stored** — 1 for a create,
 * `expectedVersion + 1` for an update. The new version is never sent on the
 * wire; the server derives it from `expectedVersion`, so a client cannot claim
 * a version it did not earn, and a ciphertext sealed at the wrong version
 * simply fails to open.
 */
export async function sealRow<T extends object>(
  tableName: string,
  vault: Vault,
  rowId: string,
  version: number,
  payload: T,
): Promise<SealedEnvelope> {
  const { ciphertext, iv, alg } = await encryptRow(payload, vault.dataKey, {
    tableName,
    householdId: vault.householdId,
    rowId,
    version,
  })
  return { ciphertext, iv, alg }
}

/** The unlocked vault, or a {@link VaultLockedError} the UI can branch on. */
export async function openVault(): Promise<Vault> {
  return requireVault()
}

/** A fresh client-side row id. See server/lib/envelope.ts for why the client owns these. */
export function newRowId(): string {
  return crypto.randomUUID()
}

/** Shared bearer-token fetch. `no-store` matches the server's own header on these routes. */
export async function encryptedFetch(
  path: string,
  token: string | null,
  makeError: (status: number, message: string) => Error,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string }
    throw makeError(res.status, body.error ?? res.statusText)
  }
  return res
}
