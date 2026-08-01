import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import 'fake-indexeddb/auto'
import {
  deriveKeyFromPassphrase,
  deriveKeyFromRecoveryCode,
  encryptRow,
  decryptRow,
  fromBase64Url,
  generateDataKey,
  generateRecoveryCode,
  generateSalt,
  isCryptoError,
  toBase64Url,
  unwrapDataKey,
  wrapDataKey,
  KDF_ALG,
  type EncryptedRow,
} from './crypto'
import { getVault, setVault, clearVault } from './crypto/key-store'
import { WeakPassphraseError } from './passphrase-strength'
import { changePassphrase, resetRecoveryCode } from './credential-change'
import { HouseholdKeysApiError, type HouseholdKeys } from './household-keys-api'
import { jsonResponse } from '@/test/encrypted-fixtures'

/**
 * Passphrase change and recovery-code reset.
 *
 * Every assertion here is about one property: the household's DATA KEY is the
 * same object before and after. Nothing is re-encrypted, so a row sealed before
 * the change has to open after it — and if it does not, a user has lost their
 * entire financial history with no way back. That is why the round-trip of a
 * pre-change row appears in most of these tests rather than just one.
 */

// Real PBKDF2 at a cheap iteration count: these tests exercise the rewrap and
// the persistence contract, not PBKDF2's cost. The implementation derives at
// whatever `kdfIterations` the stored row carries, so this stays honest.
const ITER = 1000
const HOUSEHOLD_ID = '11111111-1111-4111-8111-111111111111'
const OLD_PASSPHRASE = 'quiet lantern rutabaga sundial 41'
const NEW_PASSPHRASE = 'amber trellis quartz meridian 77'
const TOKEN = 'test-token'
const ROW_AAD = { tableName: 'holdings', householdId: HOUSEHOLD_ID, rowId: 'row-1', version: 1 }

interface Fixture {
  keys: HouseholdKeys
  recoveryCode: string
  /** A row sealed BEFORE any credential change — the thing that must survive. */
  row: EncryptedRow
}

/** Build key material exactly as `prepareKeySetup` would, but cheaply. */
async function fixture(): Promise<Fixture> {
  const dataKey = await generateDataKey()
  const passphraseSalt = generateSalt()
  const recoverySalt = generateSalt()
  const recoveryCode = generateRecoveryCode()

  const passphraseCopy = await wrapDataKey(dataKey, await deriveKeyFromPassphrase(OLD_PASSPHRASE, passphraseSalt, ITER))
  const recoveryCopy = await wrapDataKey(dataKey, await deriveKeyFromRecoveryCode(recoveryCode, recoverySalt, ITER))
  const row = await encryptRow({ investedAmount: '250000', note: 'sample' }, dataKey, ROW_AAD)

  return {
    recoveryCode,
    row,
    keys: {
      householdId: HOUSEHOLD_ID,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      kdfAlg: KDF_ALG,
      kdfIterations: ITER,
      passphraseSalt: toBase64Url(passphraseSalt),
      wrappedDekPassphrase: passphraseCopy.wrapped,
      passphraseWrapIv: passphraseCopy.iv,
      recoverySalt: toBase64Url(recoverySalt),
      wrappedDekRecovery: recoveryCopy.wrapped,
      recoveryWrapIv: recoveryCopy.iv,
    },
  }
}

/**
 * A stand-in for the server that applies the PATCH the way the real single
 * UPDATE statement does — only the fields in the body, everything else
 * untouched. Returns the stored row so the test can inspect what persisted.
 */
function server(keys: HouseholdKeys): { stored: HouseholdKeys; bodies: Array<Record<string, unknown>> } {
  const state = { stored: { ...keys }, bodies: [] as Array<Record<string, unknown>> }
  vi.mocked(fetch).mockImplementation((_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    state.bodies.push(body)
    const { credential, ...fields } = body
    expect(credential === 'passphrase' || credential === 'recovery').toBe(true)
    state.stored = { ...state.stored, ...(fields as Partial<HouseholdKeys>), updatedAt: '2026-02-02T00:00:00.000Z' }
    return Promise.resolve(jsonResponse({ householdKeys: state.stored }))
  })
  return state
}

async function opensWithPassphrase(keys: HouseholdKeys, passphrase: string): Promise<CryptoKey> {
  const kek = await deriveKeyFromPassphrase(passphrase, fromBase64Url(keys.passphraseSalt), keys.kdfIterations)
  return unwrapDataKey(keys.wrappedDekPassphrase, keys.passphraseWrapIv, kek)
}

async function opensWithRecoveryCode(keys: HouseholdKeys, code: string): Promise<CryptoKey> {
  const kek = await deriveKeyFromRecoveryCode(code, fromBase64Url(keys.recoverySalt), keys.kdfIterations)
  return unwrapDataKey(keys.wrappedDekRecovery, keys.recoveryWrapIv, kek)
}

beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn())
  globalThis.indexedDB = new IDBFactory()
  await clearVault()
})

describe('changePassphrase', () => {
  it('leaves the same data key in place — a row sealed before the change still decrypts', async () => {
    const { keys, row } = await fixture()
    const state = server(keys)

    const updated = await changePassphrase(TOKEN, keys, OLD_PASSPHRASE, NEW_PASSPHRASE)

    const dataKey = await opensWithPassphrase(updated, NEW_PASSPHRASE)
    expect(await decryptRow(row, dataKey, ROW_AAD)).toEqual({ investedAmount: '250000', note: 'sample' })
    // And the same is true of what actually persisted, not just what was returned.
    const stored = await opensWithPassphrase(state.stored, NEW_PASSPHRASE)
    expect(await decryptRow(row, stored, ROW_AAD)).toEqual({ investedAmount: '250000', note: 'sample' })
  })

  it('stops the old passphrase from opening anything', async () => {
    const { keys } = await fixture()
    const state = server(keys)
    await changePassphrase(TOKEN, keys, OLD_PASSPHRASE, NEW_PASSPHRASE)

    await expect(opensWithPassphrase(state.stored, OLD_PASSPHRASE)).rejects.toSatisfy(
      (err: unknown) => isCryptoError(err) && err.code === 'UNWRAP_FAILED',
    )
  })

  it('leaves the recovery code working — it is not collateral damage', async () => {
    const { keys, recoveryCode, row } = await fixture()
    const state = server(keys)
    await changePassphrase(TOKEN, keys, OLD_PASSPHRASE, NEW_PASSPHRASE)

    expect(state.stored.wrappedDekRecovery).toBe(keys.wrappedDekRecovery)
    expect(state.stored.recoveryWrapIv).toBe(keys.recoveryWrapIv)
    expect(state.stored.recoverySalt).toBe(keys.recoverySalt)

    const viaRecovery = await opensWithRecoveryCode(state.stored, recoveryCode)
    expect(await decryptRow(row, viaRecovery, ROW_AAD)).toEqual({ investedAmount: '250000', note: 'sample' })
  })

  it('sends ONLY the passphrase fields — the recovery columns are structurally out of reach', async () => {
    const { keys } = await fixture()
    const state = server(keys)
    await changePassphrase(TOKEN, keys, OLD_PASSPHRASE, NEW_PASSPHRASE)

    expect(state.bodies).toHaveLength(1)
    expect(Object.keys(state.bodies[0]).sort()).toEqual([
      'credential',
      'passphraseSalt',
      'passphraseWrapIv',
      'wrappedDekPassphrase',
    ])
    expect(state.bodies[0].credential).toBe('passphrase')
  })

  it('uses PATCH on the single-segment route, with the bearer token and no caching', async () => {
    const { keys } = await fixture()
    server(keys)
    await changePassphrase(TOKEN, keys, OLD_PASSPHRASE, NEW_PASSPHRASE)

    const [url, init] = vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/household-keys')
    expect(init.method).toBe('PATCH')
    expect(init.cache).toBe('no-store')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it.each([
    ['', 'empty'],
    ['short', 'too short'],
    ['password1234', 'a breach staple'],
    ['P@ssw0rd1234', 'a leetspoken breach staple'],
    ['F1n4nc14lPl4nn1ng', "this app's own vocabulary"],
    ['aaaaaaaaaaaaaa', 'one character repeated'],
  ])('refuses the weak new passphrase %j (%s) and sends NOTHING to the server', async (weak) => {
    const { keys } = await fixture()
    server(keys)

    await expect(changePassphrase(TOKEN, keys, OLD_PASSPHRASE, weak)).rejects.toBeInstanceOf(WeakPassphraseError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('never puts the rejected passphrase in the error it throws', async () => {
    const { keys } = await fixture()
    server(keys)
    await expect(changePassphrase(TOKEN, keys, OLD_PASSPHRASE, 'password1234')).rejects.toSatisfy(
      (err: unknown) => !String(err).includes('password1234'),
    )
  })

  it('refuses a wrong current passphrase and changes nothing server-side', async () => {
    const { keys } = await fixture()
    const state = server(keys)

    await expect(changePassphrase(TOKEN, keys, 'not the old one at all', NEW_PASSPHRASE)).rejects.toSatisfy(
      (err: unknown) => isCryptoError(err) && err.code === 'UNWRAP_FAILED',
    )
    expect(fetch).not.toHaveBeenCalled()
    expect(state.stored).toEqual(keys)
  })

  it('fails identically on a tampered stored blob — the message cannot tell them apart', async () => {
    const { keys } = await fixture()
    server(keys)
    const wrapped = keys.wrappedDekPassphrase
    const tampered = { ...keys, wrappedDekPassphrase: (wrapped[0] === 'A' ? 'B' : 'A') + wrapped.slice(1) }

    let wrongPassphrase = ''
    let tamperedBlob = ''
    await changePassphrase(TOKEN, keys, 'not the old one at all', NEW_PASSPHRASE).catch((e: Error) => {
      wrongPassphrase = e.message
    })
    await changePassphrase(TOKEN, tampered, OLD_PASSPHRASE, NEW_PASSPHRASE).catch((e: Error) => {
      tamperedBlob = e.message
    })
    expect(wrongPassphrase).toBe(tamperedBlob)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('never sends either passphrase to the server', async () => {
    const { keys } = await fixture()
    server(keys)
    await changePassphrase(TOKEN, keys, OLD_PASSPHRASE, NEW_PASSPHRASE)

    const raw = String((vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit])[1].body)
    expect(raw).not.toContain(OLD_PASSPHRASE)
    expect(raw).not.toContain(NEW_PASSPHRASE)
  })

  it('gives the wrapped copy a fresh salt and a fresh IV', async () => {
    const { keys } = await fixture()
    const state = server(keys)
    await changePassphrase(TOKEN, keys, OLD_PASSPHRASE, NEW_PASSPHRASE)

    expect(state.stored.passphraseSalt).not.toBe(keys.passphraseSalt)
    expect(state.stored.passphraseWrapIv).not.toBe(keys.passphraseWrapIv)
    expect(state.stored.wrappedDekPassphrase).not.toBe(keys.wrappedDekPassphrase)
    // The recovery copy's IV is a different wrap and must stay distinct.
    expect(state.stored.passphraseWrapIv).not.toBe(state.stored.recoveryWrapIv)
  })

  it('leaves the vault open on the same household, holding a non-extractable key', async () => {
    const { keys, row } = await fixture()
    server(keys)
    await changePassphrase(TOKEN, keys, OLD_PASSPHRASE, NEW_PASSPHRASE)

    const vault = await getVault()
    expect(vault?.householdId).toBe(HOUSEHOLD_ID)
    expect(vault?.dataKey.extractable).toBe(false)
    expect(await decryptRow(row, vault!.dataKey, ROW_AAD)).toEqual({ investedAmount: '250000', note: 'sample' })
  })

  it('proves the new blob against the ALREADY OPEN vault key, catching a swapped data key', async () => {
    const { keys } = await fixture()
    server(keys)
    // A vault holding a different key for this household — if the verification
    // step were cosmetic, this would sail through.
    const stranger = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    await setVault({ householdId: HOUSEHOLD_ID, dataKey: stranger })

    await expect(changePassphrase(TOKEN, keys, OLD_PASSPHRASE, NEW_PASSPHRASE)).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('surfaces a server rejection instead of pretending the change happened', async () => {
    const { keys } = await fixture()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'invalid_household_keys' }, 400))
    await expect(changePassphrase(TOKEN, keys, OLD_PASSPHRASE, NEW_PASSPHRASE)).rejects.toBeInstanceOf(
      HouseholdKeysApiError,
    )
  })
})

describe('resetRecoveryCode', () => {
  it('issues a code that opens the same data key, and a row sealed earlier still decrypts', async () => {
    const { keys, row } = await fixture()
    const state = server(keys)

    const { keys: updated, recoveryCode } = await resetRecoveryCode(TOKEN, keys, OLD_PASSPHRASE)

    const viaNew = await opensWithRecoveryCode(updated, recoveryCode)
    expect(await decryptRow(row, viaNew, ROW_AAD)).toEqual({ investedAmount: '250000', note: 'sample' })
    const viaStored = await opensWithRecoveryCode(state.stored, recoveryCode)
    expect(await decryptRow(row, viaStored, ROW_AAD)).toEqual({ investedAmount: '250000', note: 'sample' })
  })

  it('stops the old recovery code from opening anything', async () => {
    const { keys, recoveryCode: old } = await fixture()
    const state = server(keys)
    await resetRecoveryCode(TOKEN, keys, OLD_PASSPHRASE)

    await expect(opensWithRecoveryCode(state.stored, old)).rejects.toSatisfy(
      (err: unknown) => isCryptoError(err) && err.code === 'UNWRAP_FAILED',
    )
  })

  it('leaves the passphrase working', async () => {
    const { keys, row } = await fixture()
    const state = server(keys)
    await resetRecoveryCode(TOKEN, keys, OLD_PASSPHRASE)

    expect(state.stored.wrappedDekPassphrase).toBe(keys.wrappedDekPassphrase)
    expect(state.stored.passphraseWrapIv).toBe(keys.passphraseWrapIv)
    expect(state.stored.passphraseSalt).toBe(keys.passphraseSalt)

    const viaPassphrase = await opensWithPassphrase(state.stored, OLD_PASSPHRASE)
    expect(await decryptRow(row, viaPassphrase, ROW_AAD)).toEqual({ investedAmount: '250000', note: 'sample' })
  })

  it('sends ONLY the recovery fields — the passphrase columns are structurally out of reach', async () => {
    const { keys } = await fixture()
    const state = server(keys)
    await resetRecoveryCode(TOKEN, keys, OLD_PASSPHRASE)

    expect(state.bodies).toHaveLength(1)
    expect(Object.keys(state.bodies[0]).sort()).toEqual([
      'credential',
      'recoverySalt',
      'recoveryWrapIv',
      'wrappedDekRecovery',
    ])
    expect(state.bodies[0].credential).toBe('recovery')
  })

  it('requires the current passphrase — a wrong one changes nothing server-side', async () => {
    const { keys } = await fixture()
    const state = server(keys)

    await expect(resetRecoveryCode(TOKEN, keys, 'not the old one at all')).rejects.toSatisfy(
      (err: unknown) => isCryptoError(err) && err.code === 'UNWRAP_FAILED',
    )
    expect(fetch).not.toHaveBeenCalled()
    expect(state.stored).toEqual(keys)
  })

  it('never sends the new recovery code or the passphrase to the server', async () => {
    const { keys } = await fixture()
    server(keys)
    const { recoveryCode } = await resetRecoveryCode(TOKEN, keys, OLD_PASSPHRASE)

    const raw = String((vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit])[1].body)
    expect(raw).not.toContain(OLD_PASSPHRASE)
    expect(raw).not.toContain(recoveryCode)
    expect(raw).not.toContain(recoveryCode.replace(/-/g, ''))
  })

  it('shows the code in the same readable hyphen-grouped Crockford base32 as setup', async () => {
    const { keys } = await fixture()
    server(keys)
    const { recoveryCode } = await resetRecoveryCode(TOKEN, keys, OLD_PASSPHRASE)
    expect(recoveryCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{1,4}){5,6}$/)
  })

  it('gives a different code every time', async () => {
    const { keys } = await fixture()
    server(keys)
    const first = await resetRecoveryCode(TOKEN, keys, OLD_PASSPHRASE)
    const second = await resetRecoveryCode(TOKEN, first.keys, OLD_PASSPHRASE)
    expect(first.recoveryCode).not.toBe(second.recoveryCode)
  })
})
