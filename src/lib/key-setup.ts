import {
  deriveKeyFromPassphrase,
  deriveKeyFromRecoveryCode,
  generateDataKey,
  generateRecoveryCode,
  generateSalt,
  fromBase64Url,
  toBase64Url,
  unwrapDataKey,
  wrapDataKey,
  KDF_ALG,
  PBKDF2_ITERATIONS,
} from './crypto'
import { getVault, setVault, type Vault } from './crypto/key-store'
import {
  clearPendingKeyMaterial,
  getPendingKeyMaterial,
  setPendingKeyMaterial,
} from './crypto/pending-key-material'
import { assertPassphraseAcceptable } from './passphrase-strength'
import {
  createHouseholdKeys,
  fetchHouseholdKeys,
  type HouseholdKeyMaterial,
  type HouseholdKeys,
} from './household-keys-api'
import { probeHousehold } from './household-api'

/**
 * Setting up, completing, and opening a household's key material.
 *
 * This module owns the ordering problem that the schema forces:
 * `household_keys.household_id` references `households.id`, so the household
 * row must exist first — but the household's name is encrypted, so the data key
 * must exist before the household row can be written. The only order that
 * satisfies both is:
 *
 *   1. {@link prepareKeySetup}  — generate and wrap in the browser, unlock the vault
 *   2. `createHousehold(...)`   — the encrypted household row, under the id from step 1
 *   3. {@link completeKeySetup} — persist the wrapped copies server-side
 *
 * Steps 2 and 3 cannot be made atomic from a browser, so every state they can
 * be interrupted in is named and routed by {@link resolveVaultState}. None of
 * those paths deletes anything.
 */

export interface PreparedKeySetup {
  /** Client-generated household id. Already half of every AAD this household will produce. */
  householdId: string
  /**
   * The one-time recovery code, in display form.
   *
   * Returned so the setup screen can show it — once. It is never stored, never
   * logged, and never sent anywhere; only a data key wrapped under a key
   * derived from it is persisted.
   */
  recoveryCode: string
}

/**
 * Generate the household's key material and unlock the vault with it.
 *
 * Refuses a passphrase below the strength floor before generating anything.
 * This is the second of the two enforcement layers described in
 * `passphrase-strength.ts`: the setup screen also disables its submit control,
 * but this check is what makes it true that no weak passphrase can ever produce
 * key material, regardless of what the UI did or did not do.
 */
export async function prepareKeySetup(passphrase: string): Promise<PreparedKeySetup> {
  assertPassphraseAcceptable(passphrase)

  const householdId = crypto.randomUUID()
  const recoveryCode = generateRecoveryCode()

  const passphraseSalt = generateSalt()
  const recoverySalt = generateSalt()
  const passphraseWrappingKey = await deriveKeyFromPassphrase(passphrase, passphraseSalt)
  const recoveryWrappingKey = await deriveKeyFromRecoveryCode(recoveryCode, recoverySalt)

  // Extractable exactly once, here, so it can be wrapped twice. Every handle
  // that leaves this function is the non-extractable one from unwrapDataKey.
  const dataKey = await generateDataKey()
  const passphraseCopy = await wrapDataKey(dataKey, passphraseWrappingKey)
  // Separate call, therefore a separate IV — the two copies must never share
  // one, since that is nonce reuse under two related wraps of the same bytes.
  const recoveryCopy = await wrapDataKey(dataKey, recoveryWrappingKey)

  const material: HouseholdKeyMaterial = {
    kdfAlg: KDF_ALG,
    kdfIterations: PBKDF2_ITERATIONS,
    passphraseSalt: toBase64Url(passphraseSalt),
    wrappedDekPassphrase: passphraseCopy.wrapped,
    passphraseWrapIv: passphraseCopy.iv,
    recoverySalt: toBase64Url(recoverySalt),
    wrappedDekRecovery: recoveryCopy.wrapped,
    recoveryWrapIv: recoveryCopy.iv,
  }

  // Persisted BEFORE the vault, so an interruption can never leave an unlocked
  // household whose key material was lost with the tab.
  await setPendingKeyMaterial({ householdId, material })

  // Round-trips the passphrase copy on the way in: the key that ends up in the
  // vault is the one the stored blob actually produces, so a bad wrap fails
  // here rather than on the next device.
  const unlocked = await unwrapDataKey(passphraseCopy.wrapped, passphraseCopy.iv, passphraseWrappingKey)
  await setVault({ householdId, dataKey: unlocked })

  return { householdId, recoveryCode }
}

export type CompleteKeySetupOutcome = 'created' | 'already-exists' | 'nothing-pending'

/**
 * Hand the pending wrapped copies to the server.
 *
 * Safe to call on every load: with nothing pending it is a no-op and makes no
 * request. A 409 means the server already has key material for this household —
 * that is the create-only route working, not a failure, and it is never
 * retried. The pending copy is dropped in both the 201 and the 409 case,
 * because in both cases the server's row is the authoritative one.
 */
export async function completeKeySetup(token: string | null): Promise<CompleteKeySetupOutcome> {
  const pending = await getPendingKeyMaterial()
  if (!pending) return 'nothing-pending'

  const outcome = await createHouseholdKeys(token, pending.material)
  await clearPendingKeyMaterial()
  return outcome
}

async function unlockWith(keys: HouseholdKeys, wrappingKey: CryptoKey, wrapped: string, iv: string): Promise<void> {
  // Throws CryptoError('UNWRAP_FAILED') on a wrong credential *and* on a
  // tampered blob, with one message for both — AES-GCM cannot tell them apart
  // and neither should the UI.
  const dataKey = await unwrapDataKey(wrapped, iv, wrappingKey)
  await setVault({ householdId: keys.householdId, dataKey })
}

/** Open the household with its passphrase. No strength floor here — an existing passphrase is taken as-is. */
export async function unlockWithPassphrase(keys: HouseholdKeys, passphrase: string): Promise<void> {
  const wrappingKey = await deriveKeyFromPassphrase(
    passphrase,
    fromBase64Url(keys.passphraseSalt),
    keys.kdfIterations,
  )
  await unlockWith(keys, wrappingKey, keys.wrappedDekPassphrase, keys.passphraseWrapIv)
}

/** Open the household with the one-time recovery code. Case, spacing and grouping are all tolerated. */
export async function unlockWithRecoveryCode(keys: HouseholdKeys, recoveryCode: string): Promise<void> {
  const wrappingKey = await deriveKeyFromRecoveryCode(
    recoveryCode,
    fromBase64Url(keys.recoverySalt),
    keys.kdfIterations,
  )
  await unlockWith(keys, wrappingKey, keys.wrappedDekRecovery, keys.recoveryWrapIv)
}

/**
 * Where a signed-in user should land, given what the server holds and what this
 * browser holds.
 *
 * The five outcomes are the complete state space of a setup that is not atomic.
 * Each is named rather than folded into a generic error, because they need
 * genuinely different words and genuinely different actions.
 */
export type VaultState =
  /** No household, no key material, nothing pending — a first run. */
  | { state: 'key-setup' }
  /** Key material exists and this browser cannot open it: new device, cleared storage, or a lock. */
  | { state: 'unlock'; keys: HouseholdKeys }
  /**
   * Household created, key row never written, but this browser still holds both
   * the vault and the wrapped copies. Self-healing: post them, no user action.
   */
  | { state: 'completing-setup'; householdId: string }
  /**
   * A household exists whose key material was never stored, and nothing in this
   * browser can rebuild it. Its rows are permanently unreadable. Presented
   * honestly; never repaired silently, and never deleted without the user
   * explicitly going through account deletion.
   */
  | { state: 'unrecoverable'; householdId: string }
  /** Vault open for the right household — carry on into the normal flow. */
  | { state: 'ready'; vault: Vault }

export async function resolveVaultState(token: string | null): Promise<VaultState> {
  const [vault, keys] = await Promise.all([getVault(), fetchHouseholdKeys(token)])

  if (keys) {
    // The id check matters: a vault left behind for another household would
    // otherwise decrypt nothing and look like corruption instead of a lock.
    if (vault && vault.householdId === keys.householdId) return { state: 'ready', vault }
    return { state: 'unlock', keys }
  }

  // No key material server-side. Which of the two gaps is it?
  const household = await probeHousehold(token)
  const pending = await getPendingKeyMaterial()

  if (!household.exists) {
    // Interrupted after prepareKeySetup, before the household was created —
    // both halves are still here, so the household is simply created next and
    // completeKeySetup runs after it. Otherwise: a genuine first run.
    if (vault && pending && pending.householdId === vault.householdId) return { state: 'ready', vault }
    return { state: 'key-setup' }
  }

  const householdId = household.id as string
  if (vault?.householdId === householdId && pending?.householdId === householdId) {
    return { state: 'completing-setup', householdId }
  }

  // Includes the case where the vault is open but the wrapped copies are gone:
  // the data key in the vault is non-extractable and can never be re-wrapped,
  // so there is no honest way to rebuild the key row from here either.
  return { state: 'unrecoverable', householdId }
}
