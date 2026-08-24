import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { decryptRow } from './crypto'
import { VaultLockedError, type Vault } from './crypto/key-store'
import type { Holding } from './holdings-api'
import {
  listLedgers,
  deleteLedger,
  createBlankLedger,
  createLedgerFromCurrent,
  LedgersApiError,
  LedgerCapReachedError,
  LedgerCopyError,
  type Ledger,
} from './ledgers-api'
import { unlockTestVault, lockTestVault, requestBody, rawRequestBody, jsonResponse } from '@/test/encrypted-fixtures'

const HOUSEHOLD_ID = '11111111-1111-4111-8111-111111111111'
const MEMBER_A = '22222222-2222-4222-8222-222222222222'
const MEMBER_B = '33333333-3333-4333-8333-333333333333'
const SOURCE_ID_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const SOURCE_ID_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'

const NOMINEE = 'Ananya Verma'
const NOTE = 'Synthetic sample note about this holding'

const payload = {
  instrumentId: 'instr-1',
  assetClass: 'equity' as const,
  investedAmount: '250000',
  currentValue: '312500',
  units: '1234.5678',
  monthlySip: '18500',
  startDate: '2024-04-01',
  maturityDate: null,
  nominee: NOMINEE,
  isEmergencyFund: false,
  notes: NOTE,
}

/** A decrypted Current holding, exactly as `listHoldings` hands one to the UI. */
function sourceHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    ...payload,
    id: SOURCE_ID_1,
    householdId: HOUSEHOLD_ID,
    memberId: MEMBER_A,
    // Deliberately not 1: the copy must start at version 1 regardless of how
    // many times the source row has been edited.
    version: 7,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  }
}

const ledger: Ledger = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  householdId: HOUSEHOLD_ID,
  name: 'Aggressive equity',
  isBaseline: false,
  origin: 'manual',
  snapshotOf: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
}

/** The error a promise rejected with. Fails the test if it resolved instead. */
async function rejection<T>(promise: Promise<unknown>): Promise<T> {
  try {
    await promise
  } catch (err) {
    return err as T
  }
  throw new Error('expected the promise to reject, but it resolved')
}

function calls() {
  return vi.mocked(fetch).mock.calls as unknown as Array<[unknown, RequestInit | undefined]>
}

/** The `holdings` array of the POST body that was actually sent. */
function sentHoldings(): Array<Record<string, string>> {
  return requestBody(calls()).holdings as Array<Record<string, string>>
}

describe('ledgers-api', () => {
  let vault: Vault

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn())
    vault = await unlockTestVault(HOUSEHOLD_ID)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('listLedgers', () => {
    it('returns the ledgers in the order the server sent them, baseline first', async () => {
      const baseline: Ledger = { ...ledger, id: 'ddd', name: 'Current', isBaseline: true, snapshotOf: null }
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ ledgers: [baseline, ledger] }))

      await expect(listLedgers('token')).resolves.toEqual([baseline, ledger])
      expect(calls()[0][0]).toBe('/api/ledgers')
    })

    it('returns an empty list for a household with no ledgers', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ ledgers: [] }))
      await expect(listLedgers('token')).resolves.toEqual([])
    })
  })

  describe('deleteLedger', () => {
    it('sends the id as a query param, not a path segment', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }))

      await deleteLedger('token', ledger.id)

      expect(calls()[0][0]).toBe(`/api/ledgers?id=${ledger.id}`)
      expect(calls()[0][1]?.method).toBe('DELETE')
    })

    it('surfaces the server refusing to delete Current', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'cannot_delete_baseline' }, 400))
      await expect(deleteLedger('token', ledger.id)).rejects.toMatchObject({
        name: 'LedgersApiError',
        status: 400,
        message: 'cannot_delete_baseline',
      })
    })
  })

  describe('createBlankLedger', () => {
    it("sends source 'blank' and an empty holdings array", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ ledger }, 201))

      await expect(createBlankLedger('token', 'Aggressive equity')).resolves.toEqual(ledger)

      const body = requestBody(calls())
      expect(Object.keys(body).sort()).toEqual(['holdings', 'id', 'name', 'source'])
      expect(body.source).toBe('blank')
      expect(body.holdings).toEqual([])
      expect(body.name).toBe('Aggressive equity')
      expect(calls()[0][1]?.method).toBe('POST')
    })

    it('rejects a name the server would reject, without asking it', async () => {
      await expect(createBlankLedger('token', '   ')).rejects.toBeInstanceOf(LedgersApiError)
      await expect(createBlankLedger('token', 'x'.repeat(61))).rejects.toBeInstanceOf(LedgersApiError)
      expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    })
  })

  describe('the snapshot copy re-encrypts, and never re-uses a ciphertext', () => {
    beforeEach(() => {
      // A fresh Response per call: a Response body can only be read once, and
      // one test here posts twice.
      vi.mocked(fetch).mockImplementation(async () => jsonResponse({ ledger }, 201))
    })

    it("re-seals each holding under the NEW row id's AAD, back to the identical payload", async () => {
      await createLedgerFromCurrent('token', 'Aggressive equity', [sourceHolding()])

      const [copied] = sentHoldings()
      await expect(
        decryptRow(
          { ciphertext: copied.ciphertext, iv: copied.iv, alg: copied.alg, version: 1 },
          vault.dataKey,
          { tableName: 'holdings', householdId: HOUSEHOLD_ID, rowId: copied.id, version: 1 },
        ),
      ).resolves.toEqual(payload)
    })

    it("does NOT decrypt under the SOURCE row id's AAD — the binding was genuinely rebound", async () => {
      await createLedgerFromCurrent('token', 'Aggressive equity', [sourceHolding()])

      const [copied] = sentHoldings()
      await expect(
        decryptRow(
          { ciphertext: copied.ciphertext, iv: copied.iv, alg: copied.alg, version: 1 },
          vault.dataKey,
          { tableName: 'holdings', householdId: HOUSEHOLD_ID, rowId: SOURCE_ID_1, version: 1 },
        ),
      ).rejects.toThrow()
    })

    it("seals at version 1, not the source row's version", async () => {
      await createLedgerFromCurrent('token', 'Aggressive equity', [sourceHolding({ version: 7 })])

      const [copied] = sentHoldings()
      const envelope = { ciphertext: copied.ciphertext, iv: copied.iv, alg: copied.alg, version: 7 }
      await expect(
        decryptRow(envelope, vault.dataKey, {
          tableName: 'holdings',
          householdId: HOUSEHOLD_ID,
          rowId: copied.id,
          version: 7,
        }),
      ).rejects.toThrow()
    })

    it('mints a new id and a fresh envelope for every row', async () => {
      const source = sourceHolding()
      await createLedgerFromCurrent('token', 'Aggressive equity', [source])

      const [copied] = sentHoldings()
      expect(copied.id).not.toBe(source.id)
      expect(copied.id).toMatch(/^[0-9a-f-]{36}$/i)
      // There is no source ciphertext to compare against here by construction —
      // the caller hands over decrypted rows — so the proof that nothing was
      // byte-copied is that these fields exist at all and open only under the
      // new binding, which the two tests above establish.
      expect(copied.iv).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(copied.ciphertext).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(copied.alg).toBe('AES-256-GCM')
    })

    it('gives two copies of the same holding different ids and different ciphertext', async () => {
      const source = sourceHolding()
      await createLedgerFromCurrent('token', 'One', [source])
      const first = sentHoldings()[0]

      vi.mocked(fetch).mockClear()
      await createLedgerFromCurrent('token', 'Two', [source])
      const second = sentHoldings()[0]

      expect(second.id).not.toBe(first.id)
      expect(second.iv).not.toBe(first.iv)
      expect(second.ciphertext).not.toBe(first.ciphertext)
    })

    it('preserves memberId unchanged, so each row still points at the same family member', async () => {
      await createLedgerFromCurrent('token', 'Aggressive equity', [
        sourceHolding({ id: SOURCE_ID_1, memberId: MEMBER_A }),
        sourceHolding({ id: SOURCE_ID_2, memberId: MEMBER_B }),
      ])

      expect(sentHoldings().map((row) => row.memberId)).toEqual([MEMBER_A, MEMBER_B])
    })

    it('sends every source holding in one POST', async () => {
      await createLedgerFromCurrent('token', 'Aggressive equity', [
        sourceHolding({ id: SOURCE_ID_1 }),
        sourceHolding({ id: SOURCE_ID_2, memberId: MEMBER_B }),
      ])

      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
      expect(sentHoldings()).toHaveLength(2)
      expect(requestBody(calls()).source).toBe('copy')
    })

    it('carries no plaintext on the wire', async () => {
      // The ledger name is readable by design, so it must not itself contain any
      // of the strings this test looks for — "Aggressive equity" would.
      await createLedgerFromCurrent('token', 'Plan B', [sourceHolding()])

      const raw = rawRequestBody(calls())
      expect(raw).not.toContain('250000')
      expect(raw).not.toContain('312500')
      expect(raw).not.toContain('18500')
      expect(raw).not.toContain('equity')
      expect(raw).not.toContain('instr-1')
      expect(raw).not.toContain(NOMINEE)
      expect(raw).not.toContain(NOTE)
      expect(raw).not.toContain('2024-04-01')
      expect(Object.keys(sentHoldings()[0]).sort()).toEqual(['alg', 'ciphertext', 'id', 'iv', 'memberId'])
    })
  })

  describe('a copy that cannot be made in full is not made at all', () => {
    beforeEach(() => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ ledger }, 201))
    })

    it('aborts the whole copy when one source holding is unusable, and sends nothing', async () => {
      const broken = { ...sourceHolding({ id: SOURCE_ID_2 }), assetClass: 'moon-rocks' } as unknown as Holding

      await expect(
        createLedgerFromCurrent('token', 'Aggressive equity', [sourceHolding({ id: SOURCE_ID_1 }), broken]),
      ).rejects.toBeInstanceOf(LedgerCopyError)

      expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    })

    it('names every failed row without leaking its contents', async () => {
      const broken = { ...sourceHolding({ id: SOURCE_ID_2 }), assetClass: 'moon-rocks' } as unknown as Holding

      const error = await rejection<LedgerCopyError>(
        createLedgerFromCurrent('token', 'Aggressive equity', [sourceHolding({ id: SOURCE_ID_1 }), broken]),
      )

      expect(error.failures).toEqual([{ id: SOURCE_ID_2, reason: 'INVALID_PAYLOAD' }])
      expect(error.sourceCount).toBe(2)
      expect(error.message).not.toContain(NOMINEE)
      expect(error.message).not.toContain('250000')
    })

    it('aborts when re-encryption itself fails, and sends nothing', async () => {
      vi.spyOn(crypto.subtle, 'encrypt').mockRejectedValue(new Error('device crypto unavailable'))

      await expect(
        createLedgerFromCurrent('token', 'Aggressive equity', [sourceHolding()]),
      ).rejects.toBeInstanceOf(LedgerCopyError)

      expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    })

    it('refuses a source holding from another household rather than rebinding it', async () => {
      const foreign = sourceHolding({ householdId: '99999999-9999-4999-8999-999999999999' })

      const error = await rejection<LedgerCopyError>(
        createLedgerFromCurrent('token', 'Aggressive equity', [foreign]),
      )

      expect(error).toBeInstanceOf(LedgerCopyError)
      expect(error.failures[0].reason).toBe('HOUSEHOLD_MISMATCH')
      expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    })

    it('refuses a source holding whose memberId the server would reject', async () => {
      const error = await rejection<LedgerCopyError>(
        createLedgerFromCurrent('token', 'Aggressive equity', [sourceHolding({ memberId: 'member-1' })]),
      )

      expect(error.failures[0].reason).toBe('INVALID_MEMBER_ID')
      expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    })

    it('refuses more holdings than the route accepts, rather than being truncated by a 400', async () => {
      const many = Array.from({ length: 201 }, () => sourceHolding())

      const error = await rejection<LedgerCopyError>(createLedgerFromCurrent('token', 'Aggressive equity', many))

      expect(error.failures).toEqual([{ id: null, reason: 'TOO_MANY_HOLDINGS' }])
      expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    })
  })

  describe('server errors', () => {
    it('surfaces a 409 as the cap error, distinguishable from any other failure', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'ledger_cap_reached' }, 409))

      const error = await rejection<unknown>(createBlankLedger('token', 'Aggressive equity'))

      expect(error).toBeInstanceOf(LedgerCapReachedError)
      expect(error).toBeInstanceOf(LedgersApiError)
      expect(error).toMatchObject({ status: 409, message: 'ledger_cap_reached' })
    })

    it('surfaces invalid_member as a plain LedgersApiError, not the cap error', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'invalid_member' }, 400))

      const error = await rejection<unknown>(
        createLedgerFromCurrent('token', 'Aggressive equity', [sourceHolding()]),
      )

      expect(error).toBeInstanceOf(LedgersApiError)
      expect(error).not.toBeInstanceOf(LedgerCapReachedError)
      expect(error).toMatchObject({ status: 400, message: 'invalid_member' })
    })

    it('treats a 201 with no ledger in it as a failure rather than returning undefined', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ ledger: null }, 201))
      await expect(createBlankLedger('token', 'Aggressive equity')).rejects.toMatchObject({
        name: 'LedgersApiError',
        message: 'ledger_missing_in_response',
      })
    })
  })

  describe('locked vault', () => {
    it('a copy fails with VaultLockedError and sends nothing', async () => {
      await lockTestVault()
      await expect(createLedgerFromCurrent('token', 'Aggressive equity', [sourceHolding()])).rejects.toBeInstanceOf(
        VaultLockedError,
      )
      expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    })
  })
})
