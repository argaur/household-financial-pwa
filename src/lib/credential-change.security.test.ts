/**
 * Adversarial verification of passphrase change and recovery-code reset.
 *
 * Written independently of the implementation. These operations overwrite the
 * only route back to a household's data, so a wrong or partial one is
 * permanently unrecoverable — there is no server-side copy and no reset.
 *
 * The three attacks these assert against are:
 *   (a) pushing a weak new passphrase through
 *   (b) changing a passphrase without knowing the current one
 *   (c) damaging the recovery copy while changing the passphrase (or vice versa)
 *
 * The load-bearing invariant, and the reason the data key exists separately
 * from the passphrase at all: rotating a credential must re-wrap the SAME data
 * key, so rows encrypted before the change still decrypt afterwards. If that
 * ever stops holding, a passphrase change silently destroys the user's history.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

const rewrapHouseholdKeys = vi.fn()
vi.mock('./household-keys-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./household-keys-api')>()
  return { ...actual, rewrapHouseholdKeys: (...a: unknown[]) => rewrapHouseholdKeys(...a) }
})

const {
  generateDataKey,
  generateSalt,
  generateRecoveryCode,
  deriveKeyFromPassphrase,
  deriveKeyFromRecoveryCode,
  wrapDataKey,
  unwrapDataKey,
  encryptRow,
  decryptRow,
  toBase64Url,
  KDF_ALG,
} = await import('./crypto/index')
const { changePassphrase, resetRecoveryCode } = await import('./credential-change')
const { clearVault } = await import('./crypto/key-store')

const ITER = 1000
const HOUSEHOLD = '22222222-2222-4222-8222-222222222222'
const aad = { tableName: 'holdings', householdId: HOUSEHOLD, rowId: 'row-1', version: 1 }
const OLD_PASSPHRASE = 'quiet lantern rides the tide'
const NEW_PASSPHRASE = 'copper kettle sings at dawn'

async function seed() {
  const dataKey = await generateDataKey()
  const pSalt = generateSalt()
  const rSalt = generateSalt()
  const recoveryCode = generateRecoveryCode()
  const pKey = await deriveKeyFromPassphrase(OLD_PASSPHRASE, pSalt, ITER)
  const rKey = await deriveKeyFromRecoveryCode(recoveryCode, rSalt, ITER)
  const pCopy = await wrapDataKey(dataKey, pKey)
  const rCopy = await wrapDataKey(dataKey, rKey)

  // A row sealed BEFORE any rotation. It must survive every rotation below.
  const legacyRow = await encryptRow({ investedAmount: '250000', note: 'before rotation' }, dataKey, aad)

  return {
    recoveryCode,
    legacyRow,
    keys: {
      householdId: HOUSEHOLD,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      kdfAlg: KDF_ALG,
      kdfIterations: ITER,
      passphraseSalt: toBase64Url(pSalt),
      wrappedDekPassphrase: pCopy.wrapped,
      passphraseWrapIv: pCopy.iv,
      recoverySalt: toBase64Url(rSalt),
      wrappedDekRecovery: rCopy.wrapped,
      recoveryWrapIv: rCopy.iv,
    },
  }
}

/** Applies whatever the client sent, exactly as the server would. */
function applyRewrap(keys: Record<string, unknown>, body: Record<string, unknown>) {
  const { credential, ...fields } = body
  return { ...keys, ...fields }
}

beforeEach(async () => {
  rewrapHouseholdKeys.mockReset()
  await clearVault()
})

describe('ADVERSARIAL (a): a weak new passphrase never reaches the server', () => {
  it.each([
    'password1234',
    'P@ssw0rd1234',
    'financialplanning',
    'abcdefghijkl',
    'short',
    '',
  ])('refuses %s and sends nothing', async (weak) => {
    const { keys } = await seed()
    await expect(changePassphrase(null, keys, OLD_PASSPHRASE, weak)).rejects.toThrow()
    expect(rewrapHouseholdKeys).not.toHaveBeenCalled()
  })
})

describe('ADVERSARIAL (b): the current passphrase is required', () => {
  it('refuses a wrong current passphrase and sends nothing', async () => {
    const { keys } = await seed()
    await expect(
      changePassphrase(null, keys, 'not the current passphrase', NEW_PASSPHRASE),
    ).rejects.toThrow()
    expect(rewrapHouseholdKeys).not.toHaveBeenCalled()
  })

  it('refuses a recovery-code reset without the current passphrase', async () => {
    const { keys } = await seed()
    await expect(resetRecoveryCode(null, keys, 'wrong passphrase')).rejects.toThrow()
    expect(rewrapHouseholdKeys).not.toHaveBeenCalled()
  })
})

describe('ADVERSARIAL (c): rotating one credential cannot damage the other', () => {
  it('a passphrase change sends ONLY passphrase fields', async () => {
    const { keys } = await seed()
    rewrapHouseholdKeys.mockImplementation(async (_t, body) => applyRewrap(keys, body))
    await changePassphrase(null, keys, OLD_PASSPHRASE, NEW_PASSPHRASE)

    const [, body] = rewrapHouseholdKeys.mock.calls[0]
    expect(body.credential).toBe('passphrase')
    for (const forbidden of ['recoverySalt', 'wrappedDekRecovery', 'recoveryWrapIv', 'kdfIterations', 'kdfAlg', 'householdId']) {
      expect(body).not.toHaveProperty(forbidden)
    }
  })

  it('a recovery reset sends ONLY recovery fields', async () => {
    const { keys } = await seed()
    rewrapHouseholdKeys.mockImplementation(async (_t, body) => applyRewrap(keys, body))
    await resetRecoveryCode(null, keys, OLD_PASSPHRASE)

    const [, body] = rewrapHouseholdKeys.mock.calls[0]
    expect(body.credential).toBe('recovery')
    for (const forbidden of ['passphraseSalt', 'wrappedDekPassphrase', 'passphraseWrapIv', 'kdfIterations', 'kdfAlg', 'householdId']) {
      expect(body).not.toHaveProperty(forbidden)
    }
  })
})

describe('ADVERSARIAL: the data key survives rotation — no silent data loss', () => {
  it('after a passphrase change: new works, old dies, recovery survives, old row still decrypts', async () => {
    const { keys, recoveryCode, legacyRow } = await seed()
    rewrapHouseholdKeys.mockImplementation(async (_t, body) => applyRewrap(keys, body))

    const after = await changePassphrase(null, keys, OLD_PASSPHRASE, NEW_PASSPHRASE)

    // New passphrase opens it, and the row sealed before the change still reads.
    const viaNew = await unwrapDataKey(
      after.wrappedDekPassphrase,
      after.passphraseWrapIv,
      await deriveKeyFromPassphrase(NEW_PASSPHRASE, (await import('./crypto/index')).fromBase64Url(after.passphraseSalt), ITER),
    )
    expect(await decryptRow(legacyRow, viaNew, aad)).toEqual({
      investedAmount: '250000',
      note: 'before rotation',
    })

    // The old passphrase is genuinely dead.
    await expect(
      unwrapDataKey(
        after.wrappedDekPassphrase,
        after.passphraseWrapIv,
        await deriveKeyFromPassphrase(OLD_PASSPHRASE, (await import('./crypto/index')).fromBase64Url(after.passphraseSalt), ITER),
      ),
    ).rejects.toThrow()

    // The recovery code was NOT collateral damage.
    const viaRecovery = await unwrapDataKey(
      after.wrappedDekRecovery,
      after.recoveryWrapIv,
      await deriveKeyFromRecoveryCode(recoveryCode, (await import('./crypto/index')).fromBase64Url(after.recoverySalt), ITER),
    )
    expect(await decryptRow(legacyRow, viaRecovery, aad)).toHaveProperty('investedAmount', '250000')
  })

  it('after a recovery reset: new code works, old code dies, passphrase survives', async () => {
    const { keys, recoveryCode: oldCode, legacyRow } = await seed()
    rewrapHouseholdKeys.mockImplementation(async (_t, body) => applyRewrap(keys, body))
    const { fromBase64Url } = await import('./crypto/index')

    const { keys: after, recoveryCode: newCode } = await resetRecoveryCode(null, keys, OLD_PASSPHRASE)
    expect(newCode).not.toBe(oldCode)

    const viaNewCode = await unwrapDataKey(
      after.wrappedDekRecovery,
      after.recoveryWrapIv,
      await deriveKeyFromRecoveryCode(newCode, fromBase64Url(after.recoverySalt), ITER),
    )
    expect(await decryptRow(legacyRow, viaNewCode, aad)).toHaveProperty('note', 'before rotation')

    await expect(
      unwrapDataKey(
        after.wrappedDekRecovery,
        after.recoveryWrapIv,
        await deriveKeyFromRecoveryCode(oldCode, fromBase64Url(after.recoverySalt), ITER),
      ),
    ).rejects.toThrow()

    // The passphrase copy was untouched.
    const viaPassphrase = await unwrapDataKey(
      after.wrappedDekPassphrase,
      after.passphraseWrapIv,
      await deriveKeyFromPassphrase(OLD_PASSPHRASE, fromBase64Url(after.passphraseSalt), ITER),
    )
    expect(await decryptRow(legacyRow, viaPassphrase, aad)).toHaveProperty('investedAmount', '250000')
  })
})
