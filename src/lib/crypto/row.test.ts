import { describe, it, expect, beforeAll } from 'vitest'
import { ROW_ALG, encryptRow, decryptRow, type EncryptedRow } from './row'
import { generateDataKey, IV_BYTES } from './keys'
import { type RowAad } from './aad'
import { fromBase64Url, toBase64Url } from './encoding'
import { PAD_BLOCK_SIZE } from './padding'
import { CryptoError } from './errors'

/** AES-GCM appends a 128-bit authentication tag to the ciphertext. */
const GCM_TAG_BYTES = 16

const aad: RowAad = {
  tableName: 'holdings',
  householdId: 'hh_2f7c',
  rowId: 'hold_91',
  version: 3,
}

const holding = {
  instrument: 'Parag Parikh Flexi Cap',
  units: 1234.5678,
  investedAmount: 250000,
  currentValue: null,
  folio: 'PPFAS/0091',
  purchasedOn: '2026-06-13T00:00:00.000Z',
  isSip: true,
  maturesOn: null,
  note: 'synthetic sample note — ₹1,000/mo',
}

let dataKey: CryptoKey
let otherKey: CryptoKey

beforeAll(async () => {
  dataKey = await generateDataKey()
  otherKey = await generateDataKey()
})

describe('encryptRow / decryptRow happy path', () => {
  it('round-trips a realistic holdings row exactly', async () => {
    const row = await encryptRow(holding, dataKey, aad)
    const back = await decryptRow<typeof holding>(row, dataKey, aad)
    expect(back).toEqual(holding)
    expect(back.units).toBe(1234.5678)
    expect(back.currentValue).toBeNull()
    expect(back.isSip).toBe(true)
    expect(back.purchasedOn).toBe('2026-06-13T00:00:00.000Z')
    expect(back.note).toContain('₹1,000')
  })

  it('records the stored algorithm label and the bound version', async () => {
    const row = await encryptRow(holding, dataKey, aad)
    expect(row.alg).toBe('AES-256-GCM')
    expect(ROW_ALG).toBe('AES-256-GCM')
    expect(row.version).toBe(aad.version)
    expect(fromBase64Url(row.iv)).toHaveLength(IV_BYTES)
  })

  it('round-trips nested objects, arrays and empty objects', async () => {
    const payloads = [
      {},
      { a: [] },
      { a: [1, 2, { b: null }], c: { d: { e: 'ok' } } },
      { zero: 0, negative: -1.5, big: 9007199254740991 },
    ]
    for (const payload of payloads) {
      const row = await encryptRow(payload, dataKey, aad)
      expect(await decryptRow(row, dataKey, aad)).toEqual(payload)
    }
  })

  it('uses a fresh IV on every write, including an update of the same row', async () => {
    const ivs = new Set<string>()
    const cts = new Set<string>()
    for (let i = 0; i < 50; i += 1) {
      const row = await encryptRow(holding, dataKey, aad)
      ivs.add(row.iv)
      cts.add(row.ciphertext)
    }
    expect(ivs.size).toBe(50)
    expect(cts.size).toBe(50)
  })
})

describe('length hiding', () => {
  it('emits a ciphertext that is a padded block plus the GCM tag', async () => {
    const row = await encryptRow(holding, dataKey, aad)
    const length = fromBase64Url(row.ciphertext).length
    expect((length - GCM_TAG_BYTES) % PAD_BLOCK_SIZE).toBe(0)
  })

  it('gives two very differently sized rows in the same bucket identical ciphertext lengths', async () => {
    const short = await encryptRow({ note: 'ok' }, dataKey, aad)
    const long = await encryptRow({ note: 'x'.repeat(180) }, dataKey, aad)
    expect(fromBase64Url(short.ciphertext).length).toBe(fromBase64Url(long.ciphertext).length)
  })

  it('grows the ciphertext in 256-byte steps, not byte by byte', async () => {
    const lengths: number[] = []
    for (const size of [0, 100, 300, 600]) {
      const row = await encryptRow({ note: 'x'.repeat(size) }, dataKey, aad)
      lengths.push(fromBase64Url(row.ciphertext).length - GCM_TAG_BYTES)
    }
    for (const length of lengths) expect(length % PAD_BLOCK_SIZE).toBe(0)
    expect(new Set(lengths).size).toBeGreaterThan(1)
    for (let i = 1; i < lengths.length; i += 1) {
      expect(lengths[i]).toBeGreaterThanOrEqual(lengths[i - 1])
    }
  })
})

describe('decryptRow rejects — it must never return garbage', () => {
  async function expectRejects(
    row: EncryptedRow,
    key: CryptoKey,
    withAad: RowAad,
  ): Promise<CryptoError> {
    const error = await decryptRow(row, key, withAad).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CryptoError)
    return error as CryptoError
  }

  it('the wrong data key', async () => {
    const row = await encryptRow(holding, dataKey, aad)
    const error = await expectRejects(row, otherKey, aad)
    expect(error.code).toBe('DECRYPT_FAILED')
    expect(error.cause).toBeDefined()
  })

  it('a tampered ciphertext (one flipped bit)', async () => {
    const row = await encryptRow(holding, dataKey, aad)
    const bytes = fromBase64Url(row.ciphertext)
    bytes[10] ^= 0x01
    await expectRejects({ ...row, ciphertext: toBase64Url(bytes) }, dataKey, aad)
  })

  it('a tampered authentication tag', async () => {
    const row = await encryptRow(holding, dataKey, aad)
    const bytes = fromBase64Url(row.ciphertext)
    bytes[bytes.length - 1] ^= 0x80
    await expectRejects({ ...row, ciphertext: toBase64Url(bytes) }, dataKey, aad)
  })

  it('a tampered IV', async () => {
    const row = await encryptRow(holding, dataKey, aad)
    const iv = fromBase64Url(row.iv)
    iv[0] ^= 0xff
    await expectRejects({ ...row, iv: toBase64Url(iv) }, dataKey, aad)
  })

  it('an AAD with a different table_name', async () => {
    const row = await encryptRow(holding, dataKey, aad)
    await expectRejects(row, dataKey, { ...aad, tableName: 'protection' })
  })

  it('an AAD with a different household_id', async () => {
    const row = await encryptRow(holding, dataKey, aad)
    await expectRejects(row, dataKey, { ...aad, householdId: 'hh_attacker' })
  })

  it('an AAD with a different row_id', async () => {
    const row = await encryptRow(holding, dataKey, aad)
    await expectRejects(row, dataKey, { ...aad, rowId: 'hold_92' })
  })

  it('an AAD with an older version — the replay defence', async () => {
    // Scenario: the row is at version 3. An attacker with write access to the
    // database pastes back the ciphertext they captured when it was at
    // version 2, hoping to roll the row's contents back. The version is bound
    // into the AAD, so the stale ciphertext cannot authenticate against the
    // row's current version and the read fails loudly.
    const atV2 = await encryptRow({ ...holding, units: 1 }, dataKey, { ...aad, version: 2 })
    const atV3 = await encryptRow({ ...holding, units: 2 }, dataKey, { ...aad, version: 3 })

    // Each authenticates only under the version it was written at.
    expect(await decryptRow<typeof holding>(atV2, dataKey, { ...aad, version: 2 })).toMatchObject({
      units: 1,
    })
    expect(await decryptRow<typeof holding>(atV3, dataKey, { ...aad, version: 3 })).toMatchObject({
      units: 2,
    })

    // Replaying the v2 ciphertext into a row now at v3 fails.
    const replay = await expectRejects(atV2, dataKey, { ...aad, version: 3 })
    expect(replay.code).toBe('DECRYPT_FAILED')

    // And so does the reverse (a rolled-forward version tag).
    await expectRejects(atV3, dataKey, { ...aad, version: 2 })
    await expectRejects(atV3, dataKey, { ...aad, version: 4 })
  })

  it('an unsupported stored algorithm label', async () => {
    const row = await encryptRow(holding, dataKey, aad)
    const error = await expectRejects({ ...row, alg: 'AES-128-CBC' }, dataKey, aad)
    expect(error.code).toBe('UNSUPPORTED_ALG')
  })

  it('a structurally invalid envelope', async () => {
    const row = await encryptRow(holding, dataKey, aad)
    await expectRejects({ ...row, iv: toBase64Url(new Uint8Array(8)) }, dataKey, aad)
    await expectRejects({ ...row, ciphertext: '' }, dataKey, aad)
    await expectRejects({ ...row, version: -1 }, dataKey, { ...aad, version: -1 })
  })
})

describe('encryptRow input validation', () => {
  it('rejects a value that cannot be serialised to JSON', async () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    await expect(encryptRow(circular, dataKey, aad)).rejects.toThrow(CryptoError)
  })

  it('rejects an invalid AAD before touching the cipher', async () => {
    await expect(encryptRow(holding, dataKey, { ...aad, tableName: '' })).rejects.toThrow(
      CryptoError,
    )
    await expect(encryptRow(holding, dataKey, { ...aad, version: -1 })).rejects.toThrow(CryptoError)
  })
})
