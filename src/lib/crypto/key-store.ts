/**
 * Where the unlocked household data key lives while a tab is open.
 *
 * WHY INDEXEDDB AND NOT localStorage/sessionStorage: those two can only hold
 * strings, so putting a key in either means exporting its raw bytes first —
 * and raw bytes in `localStorage` are readable by any script on the origin,
 * survive a browser restart, and show up in a devtools screenshot. IndexedDB
 * is the only web storage that can hold a live `CryptoKey` handle through the
 * structured-clone algorithm, so the key is persisted as a **non-extractable**
 * key object: the browser will let it encrypt and decrypt, and will refuse to
 * ever hand its bytes back — to us or to an XSS payload.
 *
 * The record is `{ householdId, dataKey }` rather than the key alone, because
 * an unlocked vault is always the vault *of one household*: the household id
 * is half of the AAD every row is bound to, and reading it from the same
 * record the key came from makes it impossible to decrypt rows of household A
 * with the key of household B.
 *
 * This module deliberately knows nothing about passphrases, recovery codes or
 * `/api/household-keys` — it is the store, not the unlock flow.
 */

const DB_NAME = 'fp-vault'
const DB_VERSION = 1
const STORE_NAME = 'vault'
/** Single-record store: one browser profile is signed into one household at a time. */
const RECORD_KEY = 'active'

/** The unlocked state of one household. */
export interface Vault {
  /** Household the key belongs to — the `householdId` half of every row's AAD. */
  householdId: string
  /** Non-extractable AES-GCM data key, as returned by `unwrapDataKey`. */
  dataKey: CryptoKey
}

/**
 * Thrown by every caller that needs the data key while the vault is locked.
 *
 * A single distinct type on purpose: the UI branches on exactly this to show
 * the unlock prompt, and must never confuse it with a network failure, a 401,
 * or a broken IndexedDB — all of which mean something different to a user.
 */
export class VaultLockedError extends Error {
  constructor(message = 'The household vault is locked. Unlock it with your passphrase to continue.') {
    super(message)
    this.name = 'VaultLockedError'
  }
}

function getIndexedDb(): IDBFactory {
  const factory = (globalThis as { indexedDB?: IDBFactory }).indexedDB
  if (!factory) {
    // Not a VaultLockedError: the vault may well be unlocked and simply
    // unreachable. Surfacing this as "locked" would send the user round an
    // unlock loop that can never succeed.
    throw new Error('IndexedDB is unavailable, so the household key cannot be read or stored in this environment.')
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
    request.onerror = () => reject(request.error ?? new Error('Failed to open the household key store.'))
    request.onblocked = () => reject(new Error('The household key store is blocked by another open tab.'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode)
      const request = run(tx.objectStore(STORE_NAME))
      let result: T
      request.onsuccess = () => {
        result = request.result
      }
      request.onerror = () => reject(request.error ?? new Error('The household key store rejected the request.'))
      tx.oncomplete = () => resolve(result)
      tx.onabort = () => reject(tx.error ?? new Error('The household key store transaction was aborted.'))
      tx.onerror = () => reject(tx.error ?? new Error('The household key store transaction failed.'))
    })
  } finally {
    db.close()
  }
}

function isVaultRecord(value: unknown): value is Vault {
  if (typeof value !== 'object' || value === null) return false
  const record = value as { householdId?: unknown; dataKey?: unknown }
  return (
    typeof record.householdId === 'string' &&
    record.householdId.length > 0 &&
    typeof record.dataKey === 'object' &&
    record.dataKey !== null &&
    (record.dataKey as CryptoKey).type === 'secret'
  )
}

/**
 * Persist the unlocked vault.
 *
 * Rejects an extractable key outright. `generateDataKey()` produces one on
 * purpose — it has to be extractable exactly once, to be wrapped at setup —
 * and storing that copy instead of the unwrapped one would silently downgrade
 * every later guarantee this module makes.
 */
export async function setVault(vault: Vault): Promise<void> {
  if (typeof vault.householdId !== 'string' || vault.householdId.length === 0) {
    throw new Error('setVault: householdId must be a non-empty string.')
  }
  if (!vault.dataKey || vault.dataKey.type !== 'secret') {
    throw new Error('setVault: dataKey must be a secret CryptoKey.')
  }
  if (vault.dataKey.extractable) {
    throw new Error(
      'setVault: refusing to persist an extractable data key — only the non-extractable key from unwrapDataKey() may be stored.',
    )
  }
  await withStore('readwrite', (store) =>
    store.put({ householdId: vault.householdId, dataKey: vault.dataKey }, RECORD_KEY),
  )
}

/** The unlocked vault, or `null` when the household is locked. */
export async function getVault(): Promise<Vault | null> {
  const stored = await withStore<unknown>('readonly', (store) => store.get(RECORD_KEY))
  if (stored === undefined) return null
  if (!isVaultRecord(stored)) {
    throw new Error('The stored household vault record is malformed; clear it and unlock again.')
  }
  return { householdId: stored.householdId, dataKey: stored.dataKey }
}

/** The unlocked vault, or a {@link VaultLockedError}. Every encrypted API call goes through this. */
export async function requireVault(): Promise<Vault> {
  const vault = await getVault()
  if (!vault) throw new VaultLockedError()
  return vault
}

/** Lock the vault — sign-out, account switch, or an explicit "lock" action. */
export async function clearVault(): Promise<void> {
  await withStore('readwrite', (store) => store.delete(RECORD_KEY))
}
