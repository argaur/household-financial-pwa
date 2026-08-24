import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { decryptRow } from './crypto'
import { VaultLockedError, type Vault } from './crypto/key-store'
import { listHoldings, createHolding, updateHolding, deleteHolding, HoldingsApiError, type HoldingInput } from './holdings-api'
import {
  unlockTestVault,
  lockTestVault,
  wireRow,
  legacyWireRow,
  corrupt,
  requestBody,
  rawRequestBody,
  jsonResponse,
} from '@/test/encrypted-fixtures'

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

const input: HoldingInput = {
  memberId: 'member-1',
  instrumentId: payload.instrumentId,
  assetClass: payload.assetClass,
  investedAmount: payload.investedAmount,
  currentValue: payload.currentValue,
  units: payload.units,
  monthlySip: payload.monthlySip,
  startDate: payload.startDate,
  nominee: NOMINEE,
  notes: NOTE,
}

function calls() {
  return vi.mocked(fetch).mock.calls as unknown as Array<[unknown, RequestInit | undefined]>
}

describe('holdings-api', () => {
  let vault: Vault

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn())
    vault = await unlockTestVault()
  })

  describe('round trip', () => {
    it('decrypts a stored holding back to the identical object', async () => {
      const row = await wireRow('holdings', vault, { id: 'hold-1', payload, extra: { memberId: 'member-1' } })
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ holdings: [row] }))

      const result = await listHoldings('token')
      expect(result.holdings).toHaveLength(1)
      expect(result.holdings[0]).toEqual({
        ...payload,
        id: 'hold-1',
        householdId: vault.householdId,
        memberId: 'member-1',
        version: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      expect(result.unreadableCount).toBe(0)
      expect(result.notYetEncryptedCount).toBe(0)
    })

    it('returns an empty list when no holdings exist', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ holdings: [] }))
      await expect(listHoldings('token')).resolves.toEqual({
        holdings: [],
        unreadableCount: 0,
        notYetEncryptedCount: 0,
      })
    })
  })

  describe('the wire carries no plaintext', () => {
    it('a create body contains no amount, asset class, nominee or note', async () => {
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

      await createHolding('token', input)

      const raw = rawRequestBody(calls())
      expect(raw).not.toContain('250000')
      expect(raw).not.toContain('312500')
      expect(raw).not.toContain('18500')
      expect(raw).not.toContain('equity')
      expect(raw).not.toContain('instr-1')
      expect(raw).not.toContain(NOMINEE)
      expect(raw).not.toContain(NOTE)
      expect(raw).not.toContain('2024-04-01')
    })

    it('a create body carries only the id, the member and the envelope', async () => {
      vi.mocked(fetch).mockImplementation(async (_url, init) => {
        const sent = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>
        return jsonResponse(
          {
            holding: {
              ...sent,
              householdId: vault.householdId,
              version: 1,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          },
          201,
        )
      })

      await createHolding('token', input)
      expect(Object.keys(requestBody(calls())).sort()).toEqual(['alg', 'ciphertext', 'id', 'iv', 'memberId'])
    })

    it('an update body carries only the envelope and expectedVersion', async () => {
      vi.mocked(fetch).mockImplementation(async (_url, init) => {
        const sent = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>
        return jsonResponse({
          holding: {
            id: 'hold-1',
            householdId: vault.householdId,
            memberId: 'member-1',
            ciphertext: sent.ciphertext,
            iv: sent.iv,
            alg: sent.alg,
            version: 4,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        })
      })

      await updateHolding('token', 'hold-1', input, 3)

      const body = requestBody(calls())
      expect(Object.keys(body).sort()).toEqual(['alg', 'ciphertext', 'expectedVersion', 'iv'])
      expect(body.expectedVersion).toBe(3)
      const raw = rawRequestBody(calls())
      expect(raw).not.toContain('250000')
      expect(raw).not.toContain(NOMINEE)
    })
  })

  describe('versioning', () => {
    it('seals an update at expectedVersion + 1, the version the row will have once stored', async () => {
      vi.mocked(fetch).mockImplementation(async (_url, init) => {
        const sent = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>
        return jsonResponse({
          holding: {
            id: 'hold-1',
            householdId: vault.householdId,
            memberId: 'member-1',
            ciphertext: sent.ciphertext,
            iv: sent.iv,
            alg: sent.alg,
            version: 4,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        })
      })

      await updateHolding('token', 'hold-1', input, 3)
      const body = requestBody(calls())
      const envelope = {
        ciphertext: String(body.ciphertext),
        iv: String(body.iv),
        alg: String(body.alg),
        version: 4,
      }

      await expect(
        decryptRow(envelope, vault.dataKey, {
          tableName: 'holdings',
          householdId: vault.householdId,
          rowId: 'hold-1',
          version: 4,
        }),
      ).resolves.toMatchObject({ investedAmount: '250000' })

      // The version it replaces must NOT open it — that is the replay defence.
      await expect(
        decryptRow(
          { ...envelope, version: 3 },
          vault.dataKey,
          { tableName: 'holdings', householdId: vault.householdId, rowId: 'hold-1', version: 3 },
        ),
      ).rejects.toThrow()
    })

    it('surfaces a 409 from the server as a version conflict rather than retrying blindly', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'version_conflict' }, 409))
      await expect(updateHolding('token', 'hold-1', input, 3)).rejects.toMatchObject({
        name: 'HoldingsApiError',
        status: 409,
        message: 'version_conflict',
      })
    })

    it('a replayed older ciphertext fails to decrypt because the AAD version moved on', async () => {
      // The row says version 2; the bytes were sealed at version 1 — exactly
      // what someone with write access to the database would paste back.
      const replayed = await wireRow('holdings', vault, {
        id: 'hold-1',
        version: 2,
        sealAtVersion: 1,
        payload,
        extra: { memberId: 'member-1' },
      })
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ holdings: [replayed] }))

      const result = await listHoldings('token')
      expect(result.holdings).toEqual([])
      expect(result.unreadableCount).toBe(1)
    })
  })

  describe('per-row failure isolation', () => {
    it('one corrupt row never costs the others', async () => {
      const good1 = await wireRow('holdings', vault, { id: 'hold-1', payload, extra: { memberId: 'member-1' } })
      const bad = corrupt(
        await wireRow('holdings', vault, { id: 'hold-2', payload, extra: { memberId: 'member-1' } }),
      )
      const good2 = await wireRow('holdings', vault, { id: 'hold-3', payload, extra: { memberId: 'member-1' } })
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ holdings: [good1, bad, good2] }))

      const result = await listHoldings('token')
      expect(result.holdings.map((h) => h.id)).toEqual(['hold-1', 'hold-3'])
      expect(result.unreadableCount).toBe(1)
      expect(result.notYetEncryptedCount).toBe(0)
    })

    it('a legacy row with no ciphertext is "not yet encrypted", not a decrypt failure', async () => {
      const good = await wireRow('holdings', vault, { id: 'hold-1', payload, extra: { memberId: 'member-1' } })
      const legacy = legacyWireRow('hold-legacy', vault.householdId, { memberId: 'member-1' })
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ holdings: [good, legacy] }))

      const result = await listHoldings('token')
      expect(result.holdings.map((h) => h.id)).toEqual(['hold-1'])
      expect(result.notYetEncryptedCount).toBe(1)
      expect(result.unreadableCount).toBe(0)
    })
  })

  describe('locked vault', () => {
    it('every call fails with VaultLockedError, and nothing is sent', async () => {
      await lockTestVault()
      await expect(listHoldings('token')).rejects.toBeInstanceOf(VaultLockedError)
      await expect(createHolding('token', input)).rejects.toBeInstanceOf(VaultLockedError)
      await expect(updateHolding('token', 'hold-1', input, 1)).rejects.toBeInstanceOf(VaultLockedError)
      expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    })
  })

  it('throws HoldingsApiError with the server error code on failure', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'invalid_holding' }, 400))
    await expect(createHolding('token', input)).rejects.toBeInstanceOf(HoldingsApiError)
  })

  it('sends the id as a query param on update, not a path segment', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ holding: null }))
    await expect(updateHolding('token', 'hold-1', input, 1)).rejects.toBeInstanceOf(HoldingsApiError)
    expect(calls()[0][0]).toBe('/api/holdings?id=hold-1')
    expect(calls()[0][1]?.method).toBe('PATCH')
  })

  describe('ledger scoping', () => {
    it('lists the household baseline when no ledgerId is passed, unchanged', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ holdings: [] }))
      await listHoldings('token')
      expect(calls()[0][0]).toBe('/api/holdings')
    })

    it('fetches a specific ledger when ledgerId is passed', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ holdings: [] }))
      await listHoldings('token', 'ledger-1')
      expect(calls()[0][0]).toBe('/api/holdings?ledgerId=ledger-1')
    })

    it('encodes a ledgerId containing reserved characters', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ holdings: [] }))
      await listHoldings('token', 'ledger/1&x')
      expect(calls()[0][0]).toBe('/api/holdings?ledgerId=ledger%2F1%26x')
    })

    it('creates into the baseline when no ledgerId is passed, unchanged', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'invalid_holding' }, 400))
      await expect(createHolding('token', input)).rejects.toBeInstanceOf(HoldingsApiError)
      expect(calls()[0][0]).toBe('/api/holdings')
    })

    it('creates into the given ledger when ledgerId is passed', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'invalid_holding' }, 400))
      await expect(createHolding('token', input, 'ledger-1')).rejects.toBeInstanceOf(HoldingsApiError)
      expect(calls()[0][0]).toBe('/api/holdings?ledgerId=ledger-1')
      expect(calls()[0][1]?.method).toBe('POST')
    })
  })

  describe('deleteHolding', () => {
    it('sends the id as a query param, never a ?ledgerId=', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }))
      await deleteHolding('token', 'hold-1')
      expect(calls()[0][0]).toBe('/api/holdings?id=hold-1')
      expect(calls()[0][1]?.method).toBe('DELETE')
    })

    it('throws HoldingsApiError with the server error code on failure', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'not_found' }, 404))
      await expect(deleteHolding('token', 'hold-1')).rejects.toMatchObject({
        name: 'HoldingsApiError',
        status: 404,
        message: 'not_found',
      })
    })
  })
})
