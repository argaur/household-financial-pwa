import {
  decryptRow,
  deriveKeyFromPassphrase,
  deriveKeyFromRecoveryCode,
  encryptRow,
  fromBase64Url,
  generateRecoveryCode,
  generateSalt,
  rewrapDataKey,
  toBase64Url,
  unwrapDataKey,
  type WrappedDataKey,
} from './crypto'
import { getVault, setVault } from './crypto/key-store'
import { assertPassphraseAcceptable } from './passphrase-strength'
import { rewrapHouseholdKeys, type HouseholdKeys } from './household-keys-api'

/**
 * Changing a passphrase, and resetting a recovery code.
 *
 * Both operations do exactly one thing: take the household's data key out from
 * under the old credential and put it back under the new one. No stored row is
 * touched, nothing is re-encrypted, and the data key is bit-for-bit the same
 * afterwards — which is the entire reason the data key exists separately from
 * the passphrase in the first place.
 *
 * THE RISK, STATED PLAINLY. Each of these overwrites a wrapped copy that is one
 * of only two ways back into a household's entire financial history. There is
 * no server-side recovery, no reset link and no support desk — a wrong or
 * half-applied write locks the user out permanently. Three things follow, and
 * every one of them is load-bearing:
 *
 *  1. NOTHING IS PERSISTED UNTIL IT IS PROVEN. The new blob is unwrapped again
 *     with the newly derived key and a row is round-tripped through the result
 *     before a single byte goes to the server. See {@link proveBlobOpens}.
 *  2. ONE CREDENTIAL AT A TIME. The request body is a union of two disjoint
 *     shapes; the other credential's columns are not expressible, and the server
 *     applies the change in a single UPDATE statement.
 *  3. THE CURRENT PASSPHRASE IS REQUIRED. `rewrapDataKey` cannot open the stored
 *     copy without it, so an unlocked tab alone is never enough — for either
 *     operation.
 *
 * Nothing in this module logs, returns or serialises a passphrase, a recovery
 * code or raw key bytes. The new recovery code is returned to the caller once,
 * to be shown once, and is never persisted anywhere.
 */

/** The table name the local verification probe is bound to. Never stored. */
const PROBE_TABLE = 'credential-change-probe'

/**
 * Thrown when the newly wrapped copy fails to prove itself locally.
 *
 * Reaching this means the rewrap produced something that does not open, or
 * opens into a different key than the one the household's rows are sealed
 * under. Nothing has been sent to the server at that point and nothing will be.
 */
export class CredentialVerificationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'CredentialVerificationError'
  }
}

/**
 * Prove the new wrapped copy before anyone commits to it.
 *
 * Two checks, and the second is the one that matters:
 *
 *  - Unwrap the fresh blob with the freshly derived key and round-trip an
 *    `encryptRow`/`decryptRow` through the result. This proves the blob opens
 *    into a key that actually works, rather than a handle that merely exists.
 *  - If this browser already holds an open vault for the same household,
 *    encrypt under the VAULT's key and decrypt under the new one. AES-GCM only
 *    succeeds if the two are the same key, so this is a direct assertion that
 *    the rewrap preserved the household's data key instead of substituting one.
 *    That is precisely the failure that would silently orphan every stored row.
 *
 * Returns the verified, non-extractable data key.
 */
async function proveBlobOpens(
  householdId: string,
  fresh: WrappedDataKey,
  freshWrappingKey: CryptoKey,
): Promise<CryptoKey> {
  const dataKey = await unwrapDataKey(fresh.wrapped, fresh.iv, freshWrappingKey)

  const probe = { probe: crypto.randomUUID() }
  const aad = { tableName: PROBE_TABLE, householdId, rowId: crypto.randomUUID(), version: 1 }

  try {
    const sealed = await encryptRow(probe, dataKey, aad)
    const opened = await decryptRow<typeof probe>(sealed, dataKey, aad)
    if (opened.probe !== probe.probe) {
      throw new CredentialVerificationError('The new key did not survive a round trip.')
    }
  } catch (cause) {
    if (cause instanceof CredentialVerificationError) throw cause
    throw new CredentialVerificationError(
      'The new wrapped key could not be verified on this device, so nothing was changed.',
      { cause },
    )
  }

  const vault = await getVault()
  if (vault && vault.householdId === householdId) {
    const crossAad = { ...aad, rowId: crypto.randomUUID() }
    try {
      const sealedByVault = await encryptRow(probe, vault.dataKey, crossAad)
      const opened = await decryptRow<typeof probe>(sealedByVault, dataKey, crossAad)
      if (opened.probe !== probe.probe) {
        throw new CredentialVerificationError('The new key is not this household’s data key.')
      }
    } catch (cause) {
      if (cause instanceof CredentialVerificationError) throw cause
      throw new CredentialVerificationError(
        'The new wrapped key does not open this household’s data, so nothing was changed.',
        { cause },
      )
    }
  }

  return dataKey
}

/** The stored passphrase copy, in the shape `rewrapDataKey` takes. */
function passphraseCopy(keys: HouseholdKeys): WrappedDataKey {
  return { wrapped: keys.wrappedDekPassphrase, iv: keys.passphraseWrapIv }
}

/**
 * Derive the wrapping key for the CURRENT passphrase.
 *
 * Uses the salt and iteration count stored on the row, never the current
 * defaults — an older household may have been created at different parameters,
 * and deriving at today's constants would fail to open a perfectly good blob.
 */
function currentPassphraseKey(keys: HouseholdKeys, passphrase: string): Promise<CryptoKey> {
  return deriveKeyFromPassphrase(passphrase, fromBase64Url(keys.passphraseSalt), keys.kdfIterations)
}

/**
 * Change the household passphrase.
 *
 * Order matters and is deliberate:
 *  1. Refuse a weak new passphrase before anything else happens. This is the
 *     same second enforcement layer `prepareKeySetup` applies — a disabled
 *     button is a UI state and UI state can be bypassed.
 *  2. Re-wrap under a NEW salt and a fresh IV. Reusing either would leak the
 *     relationship between the old and new copies.
 *  3. Prove the result locally.
 *  4. Only then persist, as the passphrase credential alone.
 *
 * Throws `WeakPassphraseError` for a new passphrase below the floor (carrying
 * the reasons, never the passphrase); `CryptoError` with code `UNWRAP_FAILED`
 * when the current passphrase is wrong OR the stored blob was altered — the two
 * are indistinguishable to AES-GCM and the message must not distinguish them
 * either; `CredentialVerificationError` if the new copy fails its local proof;
 * and `HouseholdKeysApiError` if the server refuses the write.
 *
 * The recovery code is untouched and keeps working.
 *
 * @returns the household's key material as it now stands on the server.
 */
export async function changePassphrase(
  token: string | null,
  keys: HouseholdKeys,
  currentPassphrase: string,
  newPassphrase: string,
): Promise<HouseholdKeys> {
  assertPassphraseAcceptable(newPassphrase)

  const currentKey = await currentPassphraseKey(keys, currentPassphrase)
  const newSalt = generateSalt()
  const newKey = await deriveKeyFromPassphrase(newPassphrase, newSalt, keys.kdfIterations)

  // Throws UNWRAP_FAILED on a wrong current passphrase, before any new copy
  // exists and long before anything could be sent.
  const fresh = await rewrapDataKey(passphraseCopy(keys), currentKey, newKey)

  const dataKey = await proveBlobOpens(keys.householdId, fresh, newKey)

  const updated = await rewrapHouseholdKeys(token, {
    credential: 'passphrase',
    passphraseSalt: toBase64Url(newSalt),
    wrappedDekPassphrase: fresh.wrapped,
    passphraseWrapIv: fresh.iv,
  })

  // The data key did not change, so this is not a re-key — it just makes sure
  // the tab is left holding the key it has now proven, including on the path
  // where the vault was locked when the change began.
  await setVault({ householdId: keys.householdId, dataKey })

  return updated
}

export interface RecoveryCodeReset {
  /** Key material as it now stands on the server. */
  keys: HouseholdKeys
  /**
   * The new code, in display form, returned exactly once.
   *
   * Show it, let the user save it, then drop it. It is not stored anywhere —
   * only a data key wrapped under a key derived from it is persisted — so once
   * this string is gone it cannot be produced again by anyone, including us.
   */
  recoveryCode: string
}

/**
 * Issue a new recovery code, invalidating the old one.
 *
 * Requires the current passphrase, not merely an unlocked tab: the new copy is
 * re-wrapped out of the PASSPHRASE copy, so someone who walked up to an open
 * session still cannot mint themselves a way in.
 *
 * The passphrase copy is untouched and keeps working. The previous recovery
 * code stops working the moment the server accepts this.
 */
export async function resetRecoveryCode(
  token: string | null,
  keys: HouseholdKeys,
  currentPassphrase: string,
): Promise<RecoveryCodeReset> {
  const currentKey = await currentPassphraseKey(keys, currentPassphrase)

  const recoveryCode = generateRecoveryCode()
  const newSalt = generateSalt()
  const newKey = await deriveKeyFromRecoveryCode(recoveryCode, newSalt, keys.kdfIterations)

  const fresh = await rewrapDataKey(passphraseCopy(keys), currentKey, newKey)

  const dataKey = await proveBlobOpens(keys.householdId, fresh, newKey)

  const updated = await rewrapHouseholdKeys(token, {
    credential: 'recovery',
    recoverySalt: toBase64Url(newSalt),
    wrappedDekRecovery: fresh.wrapped,
    recoveryWrapIv: fresh.iv,
  })

  await setVault({ householdId: keys.householdId, dataKey })

  return { keys: updated, recoveryCode }
}
