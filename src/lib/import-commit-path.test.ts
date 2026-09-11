import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { decryptRow } from './crypto'
import { VaultLockedError, type Vault } from './crypto/key-store'
import { createHolding, holdingPayloadSchema, type HoldingInput, type HoldingPayload } from './holdings-api'
import type { BucketedRow } from './import-bucketing'
import type { Instrument } from './instruments-api'
import { commitImportBatch, ImportCommitError, type CommitImportInput } from './import-commit'
import { unlockTestVault, lockTestVault, requestBody, rawRequestBody, jsonResponse } from '@/test/encrypted-fixtures'

/**
 * D-025 step I11 — the commit path. See `import-commit.ts`'s module doc.
 *
 * The cross-path parity test below derives the field list it compares from
 * `holdingPayloadSchema.shape` — the same Zod schema `holdings-api.ts` seals
 * a hand-entered holding against — rather than hand-listing the eleven
 * `HoldingPayload` fields. A field added to that schema later is picked up
 * automatically by every loop below; the key-set assertion in the same test
 * additionally FAILS if the import path's decrypted payload doesn't carry
 * every key the schema declares, which is what happens if a new field is
 * added to the type but the import path's builder (`toHoldingPayload`) is
 * never updated to populate it.
 */

function calls() {
  return vi.mocked(fetch).mock.calls as unknown as Array<[unknown, RequestInit | undefined]>
}

const INSTRUMENT: Instrument = {
  id: 'instr-1',
  slug: 'equity-nifty-50-index-fund',
  category: 1, // LIBRARY_SECTIONS category 1 -> assetClass 'equity'
  name: 'Nifty 50 Index Fund',
  summary: '',
  returns: '',
  tax: '',
  liquidity: '',
  risk: '',
  eligibility: '',
  minInvestment: '',
  rateValue: null,
  rateAsOf: null,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const MEMBER_ID = 'member-1'
const NOMINEE = 'Ananya Verma'
const NOTE = 'Synthetic sample note about this holding'

function readyRow(overrides: Partial<BucketedRow> = {}): BucketedRow {
  return {
    bucket: 'ready',
    member: { id: MEMBER_ID, name: 'Gaurav' },
    rowNumber: 2,
    instrumentLabel: INSTRUMENT.name,
    reasons: [],
    resolved: {
      instrumentId: INSTRUMENT.id,
      instrumentName: INSTRUMENT.name,
      investedAmount: 250000,
      currentValue: 312500,
      units: 1234,
      monthlySip: 18500,
      startDate: '2024-04-01',
      maturityDate: null,
      nominee: NOMINEE,
      isEmergencyFund: false,
      notes: NOTE,
    },
    ...overrides,
  }
}

describe('import-commit (D-025 I11)', () => {
  let vault: Vault

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn())
    vault = await unlockTestVault()
  })

  it('seals every Ready row and posts them in one batch call carrying only the wire envelope', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ status: 'ok', inserted: 1 }, 201))

    const input: CommitImportInput = {
      token: 'token',
      ledgerId: 'ledger-1',
      readyRows: [readyRow()],
      instruments: [INSTRUMENT],
    }
    const result = await commitImportBatch(input)
    expect(result).toEqual({ inserted: 1 })

    const body = requestBody(calls())
    expect(body.ledgerId).toBe('ledger-1')
    const holdings = body.holdings as Array<Record<string, string>>
    expect(holdings).toHaveLength(1)
    expect(Object.keys(holdings[0]).sort()).toEqual(['alg', 'ciphertext', 'id', 'iv', 'memberId'])
    expect(holdings[0].memberId).toBe(MEMBER_ID)

    const raw = rawRequestBody(calls())
    expect(raw).not.toContain('250000')
    expect(raw).not.toContain('312500')
    expect(raw).not.toContain('18500')
    expect(raw).not.toContain('equity')
    expect(raw).not.toContain(INSTRUMENT.id)
    expect(raw).not.toContain(NOMINEE)
    expect(raw).not.toContain(NOTE)
  })

  it('seals every row, not just the first, in a multi-row batch', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ status: 'ok', inserted: 3 }, 201))

    const rows = [readyRow(), readyRow({ rowNumber: 3 }), readyRow({ rowNumber: 4 })]
    await commitImportBatch({ token: 'token', ledgerId: 'ledger-1', readyRows: rows, instruments: [INSTRUMENT] })

    const holdings = requestBody(calls()).holdings as Array<Record<string, string>>
    expect(holdings).toHaveLength(3)
    // Every row sealed under its own fresh row id.
    expect(new Set(holdings.map((h) => h.id)).size).toBe(3)
  })

  it('seals each row with the AAD holdings-api.ts uses for a hand-entered holding', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ status: 'ok', inserted: 1 }, 201))

    await commitImportBatch({
      token: 'token',
      ledgerId: 'ledger-1',
      readyRows: [readyRow()],
      instruments: [INSTRUMENT],
    })

    const holdings = requestBody(calls()).holdings as Array<Record<string, string>>
    const sent = holdings[0]

    // Opens under the exact AAD holdings-api.ts's sealRow(HOLDINGS_TABLE, vault, id, 1, payload) binds to.
    await expect(
      decryptRow(
        { ciphertext: sent.ciphertext, iv: sent.iv, alg: sent.alg, version: 1 },
        vault.dataKey,
        { tableName: 'holdings', householdId: vault.householdId, rowId: sent.id, version: 1 },
      ),
    ).resolves.toMatchObject({ instrumentId: INSTRUMENT.id, investedAmount: '250000' })

    // A different table name in the AAD must not open it — proves the AAD is real, not a formality.
    await expect(
      decryptRow(
        { ciphertext: sent.ciphertext, iv: sent.iv, alg: sent.alg, version: 1 },
        vault.dataKey,
        { tableName: 'wrong-table', householdId: vault.householdId, rowId: sent.id, version: 1 },
      ),
    ).rejects.toThrow()
  })

  describe('cross-path parity with a hand-entered holding', () => {
    it('the import commit path and createHolding seal field-for-field identical payloads for the same inputs', async () => {
      // --- Hand-entered path: the same logical holding, typed into HoldingForm. ---
      vi.mocked(fetch).mockImplementation(async (_url, init) => {
        const sent = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>
        return jsonResponse(
          {
            holding: {
              id: sent.id,
              householdId: vault.householdId,
              memberId: sent.memberId,
              ciphertext: sent.ciphertext,
              iv: sent.iv,
              alg: sent.alg,
              version: 1,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          },
          201,
        )
      })
      const handEnteredInput: HoldingInput = {
        memberId: MEMBER_ID,
        instrumentId: INSTRUMENT.id,
        assetClass: 'equity',
        investedAmount: '250000',
        currentValue: '312500',
        units: '1234',
        monthlySip: '18500',
        startDate: '2024-04-01',
        nominee: NOMINEE,
        notes: NOTE,
      }
      await createHolding('token', handEnteredInput)
      const handEnteredSent = requestBody(calls())
      const handEnteredEnvelope = {
        ciphertext: String(handEnteredSent.ciphertext),
        iv: String(handEnteredSent.iv),
        alg: String(handEnteredSent.alg),
        version: 1,
      }
      const handEnteredPlain = (await decryptRow(handEnteredEnvelope, vault.dataKey, {
        tableName: 'holdings',
        householdId: vault.householdId,
        rowId: String(handEnteredSent.id),
        version: 1,
      })) as HoldingPayload

      // --- Import path: the identical logical holding, via the commit path. ---
      vi.mocked(fetch).mockReset()
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ status: 'ok', inserted: 1 }, 201))
      await commitImportBatch({
        token: 'token',
        ledgerId: 'ledger-1',
        readyRows: [readyRow()],
        instruments: [INSTRUMENT],
      })
      const importHoldings = requestBody(calls()).holdings as Array<Record<string, string>>
      const importSent = importHoldings[0]
      const importPlain = (await decryptRow(
        { ciphertext: importSent.ciphertext, iv: importSent.iv, alg: importSent.alg, version: 1 },
        vault.dataKey,
        { tableName: 'holdings', householdId: vault.householdId, rowId: importSent.id, version: 1 },
      )) as HoldingPayload

      // Field list derived from the schema itself, not hand-listed: a field
      // added to holdingPayloadSchema later is compared automatically.
      const fieldsFromSchema = Object.keys(holdingPayloadSchema.shape)
      expect(fieldsFromSchema.length).toBeGreaterThan(0)
      for (const field of fieldsFromSchema) {
        expect(importPlain[field as keyof HoldingPayload]).toEqual(handEnteredPlain[field as keyof HoldingPayload])
      }

      // Guard: the import path's decrypted payload must carry every key the
      // schema declares -- not a subset. A payload builder that forgets to
      // populate a newly added field fails HERE even before the per-field
      // loop above would, because JSON drops an `undefined` key silently.
      expect(Object.keys(importPlain).sort()).toEqual([...fieldsFromSchema].sort())
      expect(Object.keys(handEnteredPlain).sort()).toEqual([...fieldsFromSchema].sort())
    })
  })

  describe('the I10 contract, honoured rather than worked around', () => {
    it('an empty Ready set is still sent to the server, and its 400 propagates rather than being suppressed', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'invalid_batch' }, 400))

      await expect(
        commitImportBatch({ token: 'token', ledgerId: 'ledger-1', readyRows: [], instruments: [INSTRUMENT] }),
      ).rejects.toMatchObject({ name: 'ImportCommitError', status: 400, message: 'invalid_batch' })

      // The call was made -- no client-side short-circuit on an empty batch.
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
      const body = requestBody(calls())
      expect(body.holdings).toEqual([])
    })

    it('reads the `status` key a 409 ledger_full body actually uses, not `error`', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ status: 'ledger_full', currentCount: 199, cap: 200, attempted: 5 }, 409),
      )

      await expect(
        commitImportBatch({
          token: 'token',
          ledgerId: 'ledger-1',
          readyRows: [readyRow()],
          instruments: [INSTRUMENT],
        }),
      ).rejects.toMatchObject({ name: 'ImportCommitError', status: 409, message: 'ledger_full' })
    })

    it('reads the `error` key a 403 body uses', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'forbidden' }, 403))

      await expect(
        commitImportBatch({
          token: 'token',
          ledgerId: 'ledger-1',
          readyRows: [readyRow()],
          instruments: [INSTRUMENT],
        }),
      ).rejects.toMatchObject({ name: 'ImportCommitError', status: 403, message: 'forbidden' })
    })
  })

  describe('failure isolation before any byte is sent', () => {
    it('a row missing its resolved payload aborts the whole commit and sends nothing', async () => {
      await expect(
        commitImportBatch({
          token: 'token',
          ledgerId: 'ledger-1',
          readyRows: [readyRow({ resolved: undefined })],
          instruments: [INSTRUMENT],
        }),
      ).rejects.toBeInstanceOf(ImportCommitError)
      expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    })

    it('an instrument missing from the supplied library aborts the whole commit and sends nothing', async () => {
      await expect(
        commitImportBatch({ token: 'token', ledgerId: 'ledger-1', readyRows: [readyRow()], instruments: [] }),
      ).rejects.toBeInstanceOf(ImportCommitError)
      expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    })
  })

  describe('locked vault', () => {
    it('fails with VaultLockedError and sends nothing', async () => {
      await lockTestVault()
      await expect(
        commitImportBatch({
          token: 'token',
          ledgerId: 'ledger-1',
          readyRows: [readyRow()],
          instruments: [INSTRUMENT],
        }),
      ).rejects.toBeInstanceOf(VaultLockedError)
      expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    })
  })
})
