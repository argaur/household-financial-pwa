import type { HouseholdKeyMaterial } from '../household-keys-api'

/**
 * The wrapped key material of a household that has been generated in this
 * browser but not yet accepted by the server.
 *
 * WHY THIS EXISTS: `household_keys.household_id` is a foreign key to
 * `households.id`, and the household's name is encrypted — so the data key must
 * exist before the household row can be written, and the household row must
 * exist before the key row can be. That forces three steps in one order:
 *
 *   1. generate + wrap in the browser   2. POST /api/household   3. POST /api/household-keys
 *
 * Steps 2 and 3 are not atomic. If the tab closes between them, the household
 * exists and its key material does not. The unlocked vault alone cannot repair
 * that: it holds a **non-extractable** data key, which by construction can
 * never be wrapped again. The only way the next page load can finish the job
 * without asking the user for anything is if the two wrapped copies — made at
 * step 1, while the key was still extractable — survived the reload.
 *
 * WHAT IS STORED: exactly the bytes step 3 would have sent, which are exactly
 * the bytes the server would be holding had it succeeded. No passphrase, no
 * recovery code, no unwrapped key — each blob is opaque without a credential
 * and PBKDF2 at 600,000 rounds stands between it and one. Kept in IndexedDB
 * rather than localStorage for the same reason as the vault itself, and in its
 * own database so the vault's store stays a single-purpose one-record store.
 *
 * LIFETIME: written once at setup, deleted the moment the server has the row —
 * whether that POST created it (201) or found it already there (409).
 */

const DB_NAME = 'fp-key-setup'
const DB_VERSION = 1
const STORE_NAME = 'pending'
const RECORD_KEY = 'active'

export interface PendingKeyMaterial {
  /** Household the material belongs to. Checked against the vault before it is used. */
  householdId: string
  /** The exact body of the POST that has not happened yet. */
  material: HouseholdKeyMaterial
}

function getIndexedDb(): IDBFactory {
  const factory = (globalThis as { indexedDB?: IDBFactory }).indexedDB
  if (!factory) {
    throw new Error('IndexedDB is unavailable, so pending key material cannot be read or stored in this environment.')
  }
  return factory
}

function openDb(): Promise<IDBDatabase> {
  const factory = getIndexedDb()
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open the pending key-material store.'))
    request.onblocked = () => reject(new Error('The pending key-material store is blocked by another open tab.'))
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode)
      const request = run(tx.objectStore(STORE_NAME))
      let result: T
      request.onsuccess = () => {
        result = request.result
      }
      request.onerror = () => reject(request.error ?? new Error('The pending key-material store rejected the request.'))
      tx.oncomplete = () => resolve(result)
      tx.onabort = () => reject(tx.error ?? new Error('The pending key-material transaction was aborted.'))
      tx.onerror = () => reject(tx.error ?? new Error('The pending key-material transaction failed.'))
    })
  } finally {
    db.close()
  }
}

const MATERIAL_FIELDS = [
  'kdfAlg',
  'passphraseSalt',
  'wrappedDekPassphrase',
  'passphraseWrapIv',
  'recoverySalt',
  'wrappedDekRecovery',
  'recoveryWrapIv',
] as const

function isPendingRecord(value: unknown): value is PendingKeyMaterial {
  if (typeof value !== 'object' || value === null) return false
  const record = value as { householdId?: unknown; material?: unknown }
  if (typeof record.householdId !== 'string' || record.householdId.length === 0) return false
  if (typeof record.material !== 'object' || record.material === null) return false
  const material = record.material as Record<string, unknown>
  if (typeof material.kdfIterations !== 'number') return false
  return MATERIAL_FIELDS.every((field) => typeof material[field] === 'string' && (material[field] as string).length > 0)
}

export async function setPendingKeyMaterial(pending: PendingKeyMaterial): Promise<void> {
  if (!isPendingRecord(pending)) {
    throw new Error('setPendingKeyMaterial: refusing to store an incomplete key-material record.')
  }
  await withStore('readwrite', (store) => store.put(pending, RECORD_KEY))
}

/**
 * The material still owed to the server, or `null`.
 *
 * A malformed record returns `null` rather than throwing: a half-written blob
 * cannot complete a setup, and the caller's next branch — "the household
 * cannot be opened" — is the honest one either way.
 */
export async function getPendingKeyMaterial(): Promise<PendingKeyMaterial | null> {
  const stored = await withStore<unknown>('readonly', (store) => store.get(RECORD_KEY))
  if (stored === undefined) return null
  if (!isPendingRecord(stored)) return null
  return { householdId: stored.householdId, material: stored.material }
}

/** Drop the pending copy once the server holds the row. */
export async function clearPendingKeyMaterial(): Promise<void> {
  await withStore('readwrite', (store) => store.delete(RECORD_KEY))
}
