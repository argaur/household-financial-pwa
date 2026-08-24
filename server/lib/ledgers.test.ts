import { describe, it, expect } from 'vitest'
import { ledgers, holdings, familyMembers } from '../../drizzle/schema.js'
import {
  ensureBaselineLedger,
  getBaselineLedger,
  listLedgers,
  createLedger,
  deleteLedger,
  createLedgerSchema,
  BASELINE_LEDGER_NAME,
  MAX_NON_BASELINE_LEDGERS,
  MAX_LEDGER_HOLDINGS,
} from './ledgers.js'

/**
 * `ensureBaselineLedger` is the single point that decides what "Current" means
 * for a household, and both the v1 holdings-create path and household creation
 * now depend on it. The behaviour worth pinning is not that it inserts a row —
 * it is that it inserts *at most one*, and only when the household has none.
 */

type LedgerRow = {
  id: string
  householdId: string
  name: string
  isBaseline: boolean
  origin: string
}

/**
 * Minimal stand-in for the Drizzle chain the function actually calls. It throws
 * on any table it does not model rather than falling through to a default —
 * a silent fall-through in the integration fakes is what made this change's
 * first failure hard to read, so this one refuses to guess.
 */
function fakeDb(seed: LedgerRow[] = []) {
  const rows = [...seed]
  let inserts = 0

  const db = {
    select: () => ({
      from: (table: unknown) => {
        if (table !== ledgers) throw new Error('fake db: unexpected table in select()')
        return {
          where: (_cond: unknown) => {
            const matching = rows.filter((r) => r.isBaseline)
            const result = Promise.resolve(matching) as Promise<LedgerRow[]> & {
              limit: (n: number) => Promise<LedgerRow[]>
            }
            result.limit = (n: number) => Promise.resolve(matching.slice(0, n))
            return result
          },
        }
      },
    }),
    insert: (table: unknown) => {
      if (table !== ledgers) throw new Error('fake db: unexpected table in insert()')
      return {
        values: (row: Record<string, unknown>) => ({
          returning: () => {
            inserts += 1
            const created: LedgerRow = {
              id: `ledger-${inserts}`,
              householdId: String(row.householdId),
              name: String(row.name),
              isBaseline: Boolean(row.isBaseline),
              origin: String(row.origin),
            }
            rows.push(created)
            return Promise.resolve([created])
          },
        }),
      }
    },
  }

  return { db: db as never, rows, insertCount: () => inserts }
}

const HOUSEHOLD = '11111111-1111-4111-8111-111111111111'

describe('ensureBaselineLedger', () => {
  it("creates the household's Current ledger when it has none", async () => {
    const { db, insertCount } = fakeDb()

    const ledger = await ensureBaselineLedger(db, HOUSEHOLD)

    expect(insertCount()).toBe(1)
    expect(ledger.householdId).toBe(HOUSEHOLD)
    expect(ledger.name).toBe(BASELINE_LEDGER_NAME)
    expect(ledger.isBaseline).toBe(true)
    // Only an AI-originated ledger counts against the D-017 AI plan cap, so the
    // baseline must never be minted as one.
    expect(ledger.origin).toBe('manual')
  })

  it('returns the existing baseline instead of creating a second one', async () => {
    const existing: LedgerRow = {
      id: 'ledger-existing',
      householdId: HOUSEHOLD,
      name: BASELINE_LEDGER_NAME,
      isBaseline: true,
      origin: 'manual',
    }
    const { db, insertCount } = fakeDb([existing])

    const ledger = await ensureBaselineLedger(db, HOUSEHOLD)

    expect(ledger.id).toBe('ledger-existing')
    expect(insertCount()).toBe(0)
  })

  it('is idempotent across repeated calls — one Current, never a duplicate', async () => {
    const { db, insertCount } = fakeDb()

    const first = await ensureBaselineLedger(db, HOUSEHOLD)
    const second = await ensureBaselineLedger(db, HOUSEHOLD)
    const third = await ensureBaselineLedger(db, HOUSEHOLD)

    expect(insertCount()).toBe(1)
    expect(second.id).toBe(first.id)
    expect(third.id).toBe(first.id)
  })
})

describe('getBaselineLedger', () => {
  it('returns null when the household has no baseline ledger', async () => {
    const { db } = fakeDb()
    expect(await getBaselineLedger(db, HOUSEHOLD)).toBeNull()
  })

  it('never writes — it is a read path', async () => {
    const { db, insertCount } = fakeDb()
    await getBaselineLedger(db, HOUSEHOLD)
    expect(insertCount()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// D-016 Chunk 2 — list, create, delete
// ---------------------------------------------------------------------------

interface FullLedgerRow {
  id: string
  householdId: string
  // null for every non-baseline row — its real value lives only in the
  // envelope below, exactly as drizzle/schema.ts now models it.
  name: string | null
  ciphertext: string | null
  iv: string | null
  alg: string | null
  version: number
  isBaseline: boolean
  origin: string
  snapshotOf: string | null
  createdAt: Date
  updatedAt: Date
}
interface FakeMemberRow {
  id: string
  householdId: string
}
interface FakeHoldingRow {
  id: string
  householdId: string
  memberId: string
  ledgerId: string
}

/**
 * A second fake, richer than `fakeDb` above because these functions touch three
 * tables. Like that one it throws on any table it does not model rather than
 * guessing.
 *
 * It deliberately does NOT interpret the WHERE clause — every function under
 * test is called with a single household's rows seeded, and condition-aware
 * filtering is proven end to end in server/ledgers.integration.test.ts against
 * two households at once. What this fake pins instead is the *shape* of the
 * calls: how many statements, in what order, and whether a compensating delete
 * was issued at all.
 */
function fakeStore(seed: {
  ledgers?: FullLedgerRow[]
  members?: FakeMemberRow[]
  failHoldingsInsert?: boolean
}) {
  const ledgerRows = [...(seed.ledgers ?? [])]
  const memberRows = [...(seed.members ?? [])]
  const holdingRows: FakeHoldingRow[] = []
  let ledgerDeleteCalls = 0
  let holdingsInsertCalls = 0
  let clock = 0

  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: (_cond: unknown) => {
          let rows: unknown[]
          if (table === ledgers) rows = ledgerRows
          else if (table === familyMembers) rows = memberRows
          else if (table === holdings) rows = holdingRows
          else throw new Error('fake store: unexpected table in select()')
          const result = Promise.resolve(rows) as Promise<unknown[]> & { limit: (n: number) => Promise<unknown[]> }
          result.limit = (n: number) => Promise.resolve(rows.slice(0, n))
          return result
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (input: Record<string, unknown> | Array<Record<string, unknown>>) => {
        const rows = Array.isArray(input) ? input : [input]
        const run = () => {
          if (table === ledgers) {
            const created = rows.map((row) => {
              clock += 1000
              const built: FullLedgerRow = {
                id: String(row.id),
                householdId: String(row.householdId),
                // Only ensureBaselineLedger ever sends a literal `name`; a
                // non-baseline create sends ciphertext/iv/alg instead and no
                // `name` at all — this must not coerce `undefined` into "undefined".
                name: (row.name as string | undefined) ?? null,
                ciphertext: (row.ciphertext as string | undefined) ?? null,
                iv: (row.iv as string | undefined) ?? null,
                alg: (row.alg as string | undefined) ?? null,
                version: 1,
                isBaseline: Boolean(row.isBaseline),
                origin: String(row.origin),
                snapshotOf: (row.snapshotOf as string | null) ?? null,
                createdAt: new Date(clock),
                updatedAt: new Date(clock),
              }
              ledgerRows.push(built)
              return built
            })
            return Promise.resolve(created)
          }
          if (table === holdings) {
            holdingsInsertCalls += 1
            if (seed.failHoldingsInsert) return Promise.reject(new Error('fake store: holdings insert failed'))
            const created = rows.map((row) => {
              const built: FakeHoldingRow = {
                id: String(row.id),
                householdId: String(row.householdId),
                memberId: String(row.memberId),
                ledgerId: String(row.ledgerId),
              }
              holdingRows.push(built)
              return built
            })
            return Promise.resolve(created)
          }
          throw new Error('fake store: unexpected table in insert()')
        }
        return {
          returning: run,
          then: (...args: Parameters<Promise<unknown[]>['then']>) => run().then(...args),
        }
      },
    }),
    delete: (table: unknown) => ({
      where: (_cond: unknown) => {
        if (table !== ledgers) throw new Error('fake store: unexpected table in delete()')
        ledgerDeleteCalls += 1
        return Promise.resolve([])
      },
    }),
  }

  return {
    db: db as never,
    ledgerRows,
    holdingRows,
    ledgerDeleteCalls: () => ledgerDeleteCalls,
    holdingsInsertCalls: () => holdingsInsertCalls,
  }
}

function ledgerRow(overrides: Partial<FullLedgerRow> & { id: string }): FullLedgerRow {
  return {
    householdId: HOUSEHOLD,
    // A non-baseline row's real shape: name null, envelope populated. Callers
    // that want the baseline's plain name override both explicitly.
    name: null,
    ciphertext: 'ZmFrZS1jaXBoZXJ0ZXh0',
    iv: 'ZmFrZS1pdi1ieXRlcw',
    alg: 'AES-256-GCM',
    version: 1,
    isBaseline: false,
    origin: 'manual',
    snapshotOf: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  }
}

const MEMBER = 'aaaaaaaa-1111-4111-8111-111111111111'
const OTHER_MEMBER = 'cccccccc-3333-4333-8333-333333333333'
const NEW_LEDGER = 'dddddddd-4444-4444-8444-444444444444'
const envelope = { ciphertext: 'Y2lwaGVydGV4dC1vbmU', iv: 'aXYtYnl0ZXMtMTIx', alg: 'AES-256-GCM' as const }

describe('listLedgers', () => {
  it('puts the baseline first, then orders by created_at ascending', async () => {
    const { db } = fakeStore({
      ledgers: [
        ledgerRow({ id: 'newer', name: 'Newer', createdAt: new Date(3000) }),
        ledgerRow({ id: 'base', name: BASELINE_LEDGER_NAME, isBaseline: true, createdAt: new Date(9000) }),
        ledgerRow({ id: 'older', name: 'Older', createdAt: new Date(1000) }),
      ],
    })

    const rows = await listLedgers(db, HOUSEHOLD)
    // The baseline is oldest-created last and still leads — is_baseline outranks
    // created_at, it is not a happy accident of insertion order.
    expect(rows.map((r) => r.id)).toEqual(['base', 'older', 'newer'])
  })

  it('breaks a created_at tie by id, so the order is total', async () => {
    const { db } = fakeStore({
      ledgers: [
        ledgerRow({ id: 'bbb', createdAt: new Date(1000) }),
        ledgerRow({ id: 'aaa', createdAt: new Date(1000) }),
      ],
    })
    expect((await listLedgers(db, HOUSEHOLD)).map((r) => r.id)).toEqual(['aaa', 'bbb'])
  })

  it('never writes', async () => {
    const { db, ledgerRows } = fakeStore({ ledgers: [] })
    await listLedgers(db, HOUSEHOLD)
    expect(ledgerRows).toHaveLength(0)
  })
})

describe('createLedgerSchema', () => {
  const valid = { id: NEW_LEDGER, ...envelope, source: 'blank' as const, holdings: [] }

  it('accepts the agreed body', () => {
    expect(createLedgerSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a plaintext name — the server never accepts one, only the sealed envelope', () => {
    expect(createLedgerSchema.safeParse({ ...valid, name: 'Aggressive' }).success).toBe(false)
  })

  it('rejects ciphertext that is not base64url', () => {
    expect(createLedgerSchema.safeParse({ ...valid, ciphertext: 'Aggressive growth' }).success).toBe(false)
  })

  it('rejects a create body missing the envelope entirely', () => {
    expect(createLedgerSchema.safeParse({ id: NEW_LEDGER, source: 'blank', holdings: [] }).success).toBe(false)
  })

  it('rejects every plaintext field a holding could smuggle', () => {
    for (const extra of [
      { currentValue: 1 },
      { assetClass: 'equity' },
      { instrumentId: NEW_LEDGER },
      { startDate: '2026-01-01' },
      { notes: 'a note' },
    ]) {
      const body = { ...valid, source: 'copy', holdings: [{ id: NEW_LEDGER, memberId: MEMBER, ...envelope, ...extra }] }
      expect(createLedgerSchema.safeParse(body).success).toBe(false)
    }
  })

  it('rejects server-owned fields a client must never choose', () => {
    for (const extra of [
      { isBaseline: true },
      { origin: 'ai_suggestion' },
      { snapshotOf: NEW_LEDGER },
      { householdId: HOUSEHOLD },
      { aiEditsUsed: 0 },
    ]) {
      expect(createLedgerSchema.safeParse({ ...valid, ...extra }).success).toBe(false)
    }
  })

  it(`caps holdings at ${MAX_LEDGER_HOLDINGS}`, () => {
    const holdingsAt = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `deadbeef-0000-4000-8000-${i.toString(16).padStart(12, '0')}`,
        memberId: MEMBER,
        ...envelope,
      }))
    expect(createLedgerSchema.safeParse({ ...valid, holdings: holdingsAt(MAX_LEDGER_HOLDINGS) }).success).toBe(true)
    expect(createLedgerSchema.safeParse({ ...valid, holdings: holdingsAt(MAX_LEDGER_HOLDINGS + 1) }).success).toBe(false)
  })
})

describe('createLedger', () => {
  const baseline = ledgerRow({ id: 'base', name: BASELINE_LEDGER_NAME, isBaseline: true })

  it('never mints a baseline, whatever the request says', async () => {
    const { db } = fakeStore({ ledgers: [baseline] })
    const outcome = await createLedger(db, HOUSEHOLD, {
      id: NEW_LEDGER,
      ...envelope,
      source: 'blank',
      holdings: [],
    })

    expect(outcome.status).toBe('created')
    if (outcome.status !== 'created') return
    expect(outcome.ledger.isBaseline).toBe(false)
    expect(outcome.ledger.origin).toBe('manual')
  })

  it("records snapshotOf as the household's baseline for a copy, and null for a blank", async () => {
    const copy = fakeStore({ ledgers: [baseline], members: [{ id: MEMBER, householdId: HOUSEHOLD }] })
    const copied = await createLedger(copy.db, HOUSEHOLD, {
      id: NEW_LEDGER,
      ...envelope,
      source: 'copy',
      holdings: [{ id: MEMBER, memberId: MEMBER, ...envelope }],
    })
    expect(copied.status === 'created' && copied.ledger.snapshotOf).toBe('base')

    const blank = fakeStore({ ledgers: [baseline] })
    const made = await createLedger(blank.db, HOUSEHOLD, {
      id: NEW_LEDGER,
      ...envelope,
      source: 'blank',
      holdings: [],
    })
    expect(made.status === 'created' && made.ledger.snapshotOf).toBeNull()
  })

  it(`reports cap_reached at ${MAX_NON_BASELINE_LEDGERS} non-baseline ledgers, counting the baseline for none of it`, async () => {
    const atCap = fakeStore({
      ledgers: [baseline, ...Array.from({ length: MAX_NON_BASELINE_LEDGERS }, (_, i) => ledgerRow({ id: `l${i}` }))],
    })
    expect(
      (await createLedger(atCap.db, HOUSEHOLD, { id: NEW_LEDGER, ...envelope, source: 'blank', holdings: [] })).status,
    ).toBe('cap_reached')

    const oneBelow = fakeStore({
      ledgers: [baseline, ...Array.from({ length: MAX_NON_BASELINE_LEDGERS - 1 }, (_, i) => ledgerRow({ id: `l${i}` }))],
    })
    expect(
      (await createLedger(oneBelow.db, HOUSEHOLD, { id: NEW_LEDGER, ...envelope, source: 'blank', holdings: [] })).status,
    ).toBe('created')
  })

  it('writes nothing at all when the cap is reached', async () => {
    const store = fakeStore({
      ledgers: [baseline, ...Array.from({ length: MAX_NON_BASELINE_LEDGERS }, (_, i) => ledgerRow({ id: `l${i}` }))],
      members: [{ id: MEMBER, householdId: HOUSEHOLD }],
    })
    await createLedger(store.db, HOUSEHOLD, {
      id: NEW_LEDGER,
      ...envelope,
      source: 'copy',
      holdings: [{ id: MEMBER, memberId: MEMBER, ...envelope }],
    })

    expect(store.ledgerRows).toHaveLength(MAX_NON_BASELINE_LEDGERS + 1)
    expect(store.holdingsInsertCalls()).toBe(0)
  })

  it('reports invalid_member for a member outside the household, before any write', async () => {
    const store = fakeStore({ ledgers: [baseline], members: [{ id: MEMBER, householdId: HOUSEHOLD }] })

    const outcome = await createLedger(store.db, HOUSEHOLD, {
      id: NEW_LEDGER,
      ...envelope,
      source: 'copy',
      holdings: [{ id: MEMBER, memberId: OTHER_MEMBER, ...envelope }],
    })

    expect(outcome.status).toBe('invalid_member')
    // No ledger row, so nothing to compensate for.
    expect(store.ledgerRows).toHaveLength(1)
    expect(store.holdingsInsertCalls()).toBe(0)
    expect(store.ledgerDeleteCalls()).toBe(0)
  })

  it('checks every memberId in one query, not one per holding', async () => {
    const store = fakeStore({ ledgers: [baseline], members: [{ id: MEMBER, householdId: HOUSEHOLD }] })
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `deadbeef-0000-4000-8000-${i.toString(16).padStart(12, '0')}`,
      memberId: MEMBER,
      ...envelope,
    }))

    const outcome = await createLedger(store.db, HOUSEHOLD, {
      id: NEW_LEDGER,
      ...envelope,
      source: 'copy',
      holdings: many,
    })

    expect(outcome.status).toBe('created')
    // One statement for all 20 rows: single-statement atomicity is the only
    // atomicity neon-http offers.
    expect(store.holdingsInsertCalls()).toBe(1)
    expect(store.holdingRows).toHaveLength(20)
    expect(store.holdingRows.every((h) => h.ledgerId === NEW_LEDGER)).toBe(true)
    expect(store.holdingRows.every((h) => h.householdId === HOUSEHOLD)).toBe(true)
  })

  it('skips the holdings statement entirely for a blank ledger', async () => {
    const store = fakeStore({ ledgers: [baseline] })
    await createLedger(store.db, HOUSEHOLD, { id: NEW_LEDGER, ...envelope, source: 'blank', holdings: [] })
    expect(store.holdingsInsertCalls()).toBe(0)
  })

  it('issues a compensating delete and rethrows when the holdings insert fails', async () => {
    const store = fakeStore({
      ledgers: [baseline],
      members: [{ id: MEMBER, householdId: HOUSEHOLD }],
      failHoldingsInsert: true,
    })

    await expect(
      createLedger(store.db, HOUSEHOLD, {
        id: NEW_LEDGER,
        ...envelope,
        source: 'copy',
        holdings: [{ id: MEMBER, memberId: MEMBER, ...envelope }],
      }),
    ).rejects.toThrow('holdings insert failed')

    // A half-populated ledger would be compared against as if it were whole.
    expect(store.ledgerDeleteCalls()).toBe(1)
  })
})

describe('deleteLedger', () => {
  it('refuses the baseline without deleting anything', async () => {
    const store = fakeStore({ ledgers: [ledgerRow({ id: 'base', isBaseline: true })] })
    expect(await deleteLedger(store.db, HOUSEHOLD, 'base')).toBe('baseline')
    expect(store.ledgerDeleteCalls()).toBe(0)
  })

  it('deletes a non-baseline ledger', async () => {
    const store = fakeStore({ ledgers: [ledgerRow({ id: 'plan' })] })
    expect(await deleteLedger(store.db, HOUSEHOLD, 'plan')).toBe('deleted')
    expect(store.ledgerDeleteCalls()).toBe(1)
  })

  it('reports not_found without deleting when the lookup returns nothing', async () => {
    const store = fakeStore({ ledgers: [] })
    expect(await deleteLedger(store.db, HOUSEHOLD, 'missing')).toBe('not_found')
    expect(store.ledgerDeleteCalls()).toBe(0)
  })
})
