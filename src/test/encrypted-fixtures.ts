import { IDBFactory } from 'fake-indexeddb'
import { encryptRow } from '@/lib/crypto'
import { setVault, clearVault, type Vault } from '@/lib/crypto/key-store'

/**
 * Test-only helpers for the encrypted API clients.
 *
 * Everything here uses the real crypto module and the real key store — the
 * point of these tests is that a row sealed in a browser and stored as an
 * opaque blob comes back identical, so faking either end would prove nothing.
 */

/** Fresh IndexedDB + an unlocked, non-extractable data key. Call in `beforeEach`. */
export async function unlockTestVault(householdId = 'household-1'): Promise<Vault> {
  globalThis.indexedDB = new IDBFactory()
  const dataKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await setVault({ householdId, dataKey })
  return { householdId, dataKey }
}

/** A locked browser: storage works, no key in it. */
export async function lockTestVault(): Promise<void> {
  globalThis.indexedDB = new IDBFactory()
  await clearVault()
}

export interface WireRowOptions<T extends object> {
  id: string
  version?: number
  payload: T
  /** Seal against a different version than the row claims — models a replayed ciphertext. */
  sealAtVersion?: number
  /** Readable columns the table carries beyond the envelope, e.g. `memberId`. */
  extra?: Record<string, unknown>
  /** Household the AAD is bound to; defaults to the vault's. */
  householdId?: string
}

/** Build a wire row exactly as the server would return one. */
export async function wireRow<T extends object>(
  tableName: string,
  vault: Vault,
  options: WireRowOptions<T>,
): Promise<Record<string, unknown>> {
  const version = options.version ?? 1
  const householdId = options.householdId ?? vault.householdId
  const sealed = await encryptRow(options.payload, vault.dataKey, {
    tableName,
    householdId,
    rowId: options.id,
    version: options.sealAtVersion ?? version,
  })
  return {
    id: options.id,
    householdId,
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    alg: sealed.alg,
    version,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...(options.extra ?? {}),
  }
}

/** A row written before encryption existed: readable columns, no envelope. */
export function legacyWireRow(id: string, householdId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    householdId,
    ciphertext: null,
    iv: null,
    alg: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  }
}

/** Flip the ciphertext of a wire row so AES-GCM refuses to authenticate it. */
export function corrupt(row: Record<string, unknown>): Record<string, unknown> {
  const ciphertext = row.ciphertext as string
  const flipped = (ciphertext[0] === 'A' ? 'B' : 'A') + ciphertext.slice(1)
  return { ...row, ciphertext: flipped }
}

/** The JSON body of the Nth fetch call, parsed. */
export function requestBody(calls: Array<[unknown, RequestInit | undefined]>, index = 0): Record<string, unknown> {
  const init = calls[index][1]
  return JSON.parse(String(init?.body)) as Record<string, unknown>
}

/** The raw serialised body of the Nth fetch call — what actually crosses the wire. */
export function rawRequestBody(calls: Array<[unknown, RequestInit | undefined]>, index = 0): string {
  return String(calls[index][1]?.body)
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
