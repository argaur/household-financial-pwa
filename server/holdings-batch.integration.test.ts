import { describe, it, expect, beforeEach, vi } from 'vitest'

process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_ZmFrZS5jbGVyay5hY2NvdW50cy5kZXYk'

/**
 * POST /api/holdings-batch — D-025 I10.
 *
 * The whole point of this suite is that a uniformly-invalid batch proves
 * almost nothing. An endpoint that authorizes `holdings[0]` and nothing else
 * passes every homogeneous test in this file; the heterogeneous ones below are
 * what catch it, and each of them asserts against the fake data layer (both the
 * row store AND the recorded insert attempts), never against the status code
 * alone. A 403 with rows already written is still a breach.
 *
 * Fake token verification: the bearer token IS the userId, so two distinct
 * "signed in" users can be driven through the real Hono app without Clerk's
 * JWKS. Same pattern as server/ledgers.integration.test.ts, which this file's
 * fake db is adapted from.
 */
vi.mock('jose', () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: async (token: string) => {
    if (token === 'invalid') throw new Error('signature verification failed')
    return { payload: { sub: token } }
  },
}))

interface EnvelopeRow {
  id: string
  ciphertext: string | null
  iv: string | null
  alg: string | null
  version: number
}
interface HouseholdRow extends EnvelopeRow {
  ownerUserId: string
}
interface MemberRow extends EnvelopeRow {
  householdId: string
  createdAt: Date
  updatedAt: Date
}
interface LedgerRow extends EnvelopeRow {
  householdId: string
  name: string | null
  isBaseline: boolean
  origin: string
  snapshotOf: string | null
  createdAt: Date
  updatedAt: Date
}
interface HoldingRow extends EnvelopeRow {
  householdId: string
  memberId: string
  ledgerId: string
  createdAt: Date
  updatedAt: Date
}

let households: HouseholdRow[] = []
let members: MemberRow[] = []
let ledgerRows: LedgerRow[] = []
let holdingRows: HoldingRow[] = []
let ledgerCounter = 0
let clock = 0

/**
 * Every batch of rows the route handed to `insert(holdings)`, recorded at the
 * moment the statement runs.
 *
 * `holdingRows` alone cannot tell "nothing was written" apart from "something
 * was written and then compensated away". This can: a refused request must
 * leave this array untouched, meaning the route never even reached for the
 * table.
 */
let holdingsInsertAttempts: Array<Array<Record<string, unknown>>> = []

/** Monotonic, so created_at ordering is deterministic instead of millisecond-tied. */
function nextTimestamp() {
  clock += 1000
  return new Date(clock)
}

type Filter = [{ name?: string }, unknown]

function matcher(cond: { __eq?: Filter; __and?: Filter[] }, fieldMap: Record<string, string>) {
  const raw: Filter[] = cond.__and ?? (cond.__eq ? [cond.__eq] : [])
  const filters = raw.map(([col, value]) => [col?.name, value] as [string | undefined, unknown])
  return (row: object) => {
    const record = row as Record<string, unknown>
    return filters.every(([column, value]) => {
      const field = column ? fieldMap[column] : undefined
      return field ? record[field] === value : true
    })
  }
}

const HOUSEHOLD_FIELDS = { id: 'id', owner_user_id: 'ownerUserId', version: 'version' }
const MEMBER_FIELDS = { id: 'id', household_id: 'householdId', version: 'version' }
const LEDGER_FIELDS = { id: 'id', household_id: 'householdId', is_baseline: 'isBaseline' }
const HOLDING_FIELDS = { id: 'id', household_id: 'householdId', member_id: 'memberId', ledger_id: 'ledgerId' }

vi.mock('./lib/db.js', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (cond: { __eq?: Filter; __and?: Filter[] }) => {
          function all(): unknown[] {
            if (table === householdsTableRef) return households.filter(matcher(cond, HOUSEHOLD_FIELDS))
            if (table === familyMembersTableRef) return members.filter(matcher(cond, MEMBER_FIELDS))
            if (table === ledgersTableRef) return ledgerRows.filter(matcher(cond, LEDGER_FIELDS))
            if (table === holdingsTableRef) return holdingRows.filter(matcher(cond, HOLDING_FIELDS))
            throw new Error('fake db: unhandled table in select()')
          }
          const rows = all()
          const result = Promise.resolve(rows) as Promise<unknown[]> & { limit: (n: number) => Promise<unknown[]> }
          result.limit = (n: number) => Promise.resolve(rows.slice(0, n))
          return result
        },
      }),
    }),
    insert: (table: unknown) => ({
      // Accepts either a single row or an array — the batch route writes every
      // holding in ONE multi-row insert, and the fake has to model that as one
      // all-or-nothing statement for the atomicity tests to mean anything.
      values: (input: Record<string, unknown> | Array<Record<string, unknown>>) => {
        const rows = Array.isArray(input) ? input : [input]

        function apply(): unknown[] {
          if (table === ledgersTableRef) {
            return rows.map((row) => {
              const created: LedgerRow = {
                // uuid-shaped, not `ledger-1`: `ensureBaselineLedger` sends no
                // id, and the real column is a uuid. A synthetic id that
                // isn't would make every route taking `ledgerId` as a uuid
                // untestable against a household's own Current ledger.
                id: (row.id as string) ?? uuid(900_000 + ++ledgerCounter),
                householdId: String(row.householdId),
                name: (row.name as string | undefined) ?? null,
                ciphertext: (row.ciphertext as string | undefined) ?? null,
                iv: (row.iv as string | undefined) ?? null,
                alg: (row.alg as string | undefined) ?? null,
                version: 1,
                isBaseline: Boolean(row.isBaseline),
                origin: String(row.origin),
                snapshotOf: (row.snapshotOf as string | null) ?? null,
                createdAt: nextTimestamp(),
                updatedAt: nextTimestamp(),
              }
              ledgerRows.push(created)
              return created
            })
          }

          if (table === holdingsTableRef) {
            holdingsInsertAttempts.push(rows)
            // Primary key. A duplicate id fails the whole statement, exactly as
            // Postgres would — and as one statement, so nothing in it lands.
            const seen = new Set(holdingRows.map((h) => h.id))
            for (const row of rows) {
              if (seen.has(String(row.id))) throw new Error('fake db: duplicate holding id')
              seen.add(String(row.id))
            }
            return rows.map((row) => {
              const created: HoldingRow = {
                id: String(row.id),
                householdId: String(row.householdId),
                memberId: String(row.memberId),
                ledgerId: String(row.ledgerId),
                ciphertext: (row.ciphertext as string) ?? null,
                iv: (row.iv as string) ?? null,
                alg: (row.alg as string) ?? null,
                version: 1,
                createdAt: nextTimestamp(),
                updatedAt: nextTimestamp(),
              }
              holdingRows.push(created)
              return created
            })
          }

          return rows.map((row) => {
            const envelope = {
              id: String(row.id),
              ciphertext: (row.ciphertext as string) ?? null,
              iv: (row.iv as string) ?? null,
              alg: (row.alg as string) ?? null,
              version: 1,
            }
            if (table === householdsTableRef) {
              const created: HouseholdRow = { ...envelope, ownerUserId: String(row.ownerUserId) }
              households.push(created)
              return created
            }
            if (table === familyMembersTableRef) {
              const created: MemberRow = {
                ...envelope,
                householdId: String(row.householdId),
                createdAt: nextTimestamp(),
                updatedAt: nextTimestamp(),
              }
              members.push(created)
              return created
            }
            throw new Error('fake db: unhandled table in insert()')
          })
        }

        // Drizzle's insert builder is thenable with or without .returning();
        // the batch insert awaits it directly, so both paths must execute.
        const run = () => Promise.resolve(apply())
        return {
          returning: run,
          then: (...args: Parameters<Promise<unknown[]>['then']>) => run().then(...args),
        }
      },
    }),
    delete: (table: unknown) => ({
      where: (cond: { __eq?: Filter; __and?: Filter[] }) => {
        if (table === ledgersTableRef) {
          const match = matcher(cond, LEDGER_FIELDS)
          const doomed = ledgerRows.filter(match).map((row) => row.id)
          ledgerRows = ledgerRows.filter((row) => !match(row))
          holdingRows = holdingRows.filter((row) => !doomed.includes(row.ledgerId))
          return Promise.resolve([])
        }
        if (table === familyMembersTableRef) {
          const match = matcher(cond, MEMBER_FIELDS)
          members = members.filter((row) => !match(row))
          return Promise.resolve([])
        }
        throw new Error('fake db: unhandled table in delete()')
      },
    }),
    update: () => ({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([]) }),
      }),
    }),
  },
}))

vi.mock('../drizzle/schema.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../drizzle/schema.js')>()
  return actual
})

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    eq: (col: { name?: string }, value: unknown) => ({ __eq: [col, value] as Filter }),
    and: (...conds: Array<{ __eq: Filter }>) => ({ __and: conds.map((c) => c.__eq) }),
  }
})

const schema = await import('../drizzle/schema.js')
const householdsTableRef = schema.households
const familyMembersTableRef = schema.familyMembers
const ledgersTableRef = schema.ledgers
const holdingsTableRef = schema.holdings

const { app } = await import('./app.js')
const { MAX_LEDGER_HOLDINGS } = await import('./lib/ledgers.js')

const HOUSEHOLD_A = '11111111-1111-4111-8111-111111111111'
const HOUSEHOLD_B = '22222222-2222-4222-8222-222222222222'
const MEMBER_A1 = 'aaaaaaaa-1111-4111-8111-111111111111'
const MEMBER_A2 = 'aaaaaaaa-2222-4222-8222-222222222222'
const MEMBER_B = 'bbbbbbbb-2222-4222-8222-222222222222'

const envelope = { ciphertext: 'Y2lwaGVydGV4dC1vbmU', iv: 'aXYtYnl0ZXMtMTIx', alg: 'AES-256-GCM' }
const sealed = { ciphertext: 'Y2lwaGVydGV4dC1jb3B5', iv: 'aXYtYnl0ZXMtOTk5', alg: 'AES-256-GCM' }

function nameEnvelope(label: string) {
  return { ciphertext: `Y2lwaGVy-${label}`, iv: `aXYtYnl0-${label}`, alg: 'AES-256-GCM' }
}

/** Deterministic v4-shaped uuids, so bulk payloads pass rowIdSchema. */
function uuid(n: number) {
  const hex = n.toString(16).padStart(12, '0')
  return `deadbeef-0000-4000-8000-${hex}`
}

interface BatchResponse {
  status?: string
  inserted?: number
  currentCount?: number
  cap?: number
  attempted?: number
  error?: string
}

function batch(token: string | null, body: unknown) {
  return app.request('/api/holdings-batch', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  })
}

async function createHousehold(token: string, id: string) {
  await app.request('/api/household', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, ...envelope }),
  })
}

async function createMember(token: string, id: string) {
  await app.request('/api/family-members', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, ...envelope }),
  })
}

/** Creates a non-baseline ledger through the real route and returns its id. */
async function createLedger(token: string, id: string, seed: Array<Record<string, unknown>> = []) {
  const res = await app.request('/api/ledgers', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      id,
      ...nameEnvelope(id.slice(-4)),
      source: seed.length > 0 ? 'copy' : 'blank',
      holdings: seed,
    }),
  })
  if (res.status !== 201) throw new Error(`test setup: ledger create returned ${res.status}`)
  return id
}

function baselineFor(householdId: string) {
  const row = ledgerRows.find((l) => l.householdId === householdId && l.isBaseline)
  if (!row) throw new Error('test setup: household has no baseline ledger')
  return row
}

function holdingsIn(ledgerId: string) {
  return holdingRows.filter((h) => h.ledgerId === ledgerId)
}

/** One sealed batch element for the given member. */
function row(n: number, memberId: string) {
  return { id: uuid(n), memberId, ...sealed }
}

beforeEach(() => {
  households = []
  members = []
  ledgerRows = []
  holdingRows = []
  holdingsInsertAttempts = []
  ledgerCounter = 0
  clock = 0
})

/** Household A with two members and one non-baseline ledger, ready to receive a batch. */
async function seedHouseholdA() {
  await createHousehold('user_a', HOUSEHOLD_A)
  await createMember('user_a', MEMBER_A1)
  await createMember('user_a', MEMBER_A2)
  return createLedger('user_a', uuid(1))
}

describe('POST /api/holdings-batch — auth', () => {
  it('rejects a request with no Authorization header, and writes nothing', async () => {
    const ledgerId = await seedHouseholdA()
    const res = await batch(null, { ledgerId, holdings: [row(10, MEMBER_A1)] })

    expect(res.status).toBe(401)
    expect(holdingsInsertAttempts).toHaveLength(0)
    expect(holdingRows).toHaveLength(0)
  })

  it('rejects an invalid token, and writes nothing', async () => {
    const ledgerId = await seedHouseholdA()
    const res = await batch('invalid', { ledgerId, holdings: [row(10, MEMBER_A1)] })

    expect(res.status).toBe(401)
    expect(holdingsInsertAttempts).toHaveLength(0)
    expect(holdingRows).toHaveLength(0)
  })

  it('refuses a signed-in user with no household at all with 403', async () => {
    const res = await batch('user_no_household', {
      ledgerId: uuid(1),
      holdings: [row(10, MEMBER_A1)],
    })

    expect(res.status).toBe(403)
    expect(holdingsInsertAttempts).toHaveLength(0)
  })

  it('sets Cache-Control: no-store on every response, denials included', async () => {
    const ledgerId = await seedHouseholdA()

    const denied = await batch(null, { ledgerId, holdings: [row(10, MEMBER_A1)] })
    expect(denied.headers.get('cache-control')).toBe('no-store')

    const ok = await batch('user_a', { ledgerId, holdings: [row(11, MEMBER_A1)] })
    expect(ok.headers.get('cache-control')).toBe('no-store')
  })
})

describe('POST /api/holdings-batch — the body is opaque and strict', () => {
  it('rejects an element carrying a plaintext field, and writes nothing', async () => {
    const ledgerId = await seedHouseholdA()

    const res = await batch('user_a', {
      ledgerId,
      holdings: [{ ...row(10, MEMBER_A1), currentValue: 250000 }],
    })

    expect(res.status).toBe(400)
    expect(holdingsInsertAttempts).toHaveLength(0)
    expect(holdingRows).toHaveLength(0)
  })

  it('rejects a plaintext field on a LATER element, not just the first', async () => {
    const ledgerId = await seedHouseholdA()

    const res = await batch('user_a', {
      ledgerId,
      holdings: [row(10, MEMBER_A1), row(11, MEMBER_A1), { ...row(12, MEMBER_A1), instrumentId: 'ppfas-flexi' }],
    })

    expect(res.status).toBe(400)
    expect(holdingsInsertAttempts).toHaveLength(0)
    expect(holdingRows).toHaveLength(0)
  })

  it('rejects a per-element ledgerId — the ledger is named once, at the top level, and checked once', async () => {
    const ledgerId = await seedHouseholdA()
    const other = await createLedger('user_a', uuid(2))

    // There is no heterogeneous-ledger batch to defend against, because the
    // schema gives an element nowhere to name a ledger. That is the structural
    // reason, and this test is what keeps it true.
    const res = await batch('user_a', {
      ledgerId,
      holdings: [row(10, MEMBER_A1), { ...row(11, MEMBER_A1), ledgerId: other }],
    })

    expect(res.status).toBe(400)
    expect(holdingsInsertAttempts).toHaveLength(0)
    expect(holdingRows).toHaveLength(0)
  })

  it('rejects a client-supplied householdId at the top level', async () => {
    const ledgerId = await seedHouseholdA()
    await createHousehold('user_b', HOUSEHOLD_B)

    const res = await batch('user_b', {
      ledgerId,
      householdId: HOUSEHOLD_A,
      holdings: [row(10, MEMBER_A1)],
    })

    expect(res.status).toBe(400)
    expect(holdingsInsertAttempts).toHaveLength(0)
  })

  it('rejects an element missing the envelope entirely', async () => {
    const ledgerId = await seedHouseholdA()
    const res = await batch('user_a', {
      ledgerId,
      holdings: [{ id: uuid(10), memberId: MEMBER_A1 }],
    })

    expect(res.status).toBe(400)
    expect(holdingsInsertAttempts).toHaveLength(0)
  })

  it('rejects ciphertext that is not base64url', async () => {
    const ledgerId = await seedHouseholdA()
    const res = await batch('user_a', {
      ledgerId,
      holdings: [{ id: uuid(10), memberId: MEMBER_A1, ciphertext: 'SBI Gold Fund', iv: sealed.iv, alg: sealed.alg }],
    })

    expect(res.status).toBe(400)
    expect(holdingsInsertAttempts).toHaveLength(0)
  })

  it('rejects an empty batch', async () => {
    const ledgerId = await seedHouseholdA()
    const res = await batch('user_a', { ledgerId, holdings: [] })

    expect(res.status).toBe(400)
    expect(holdingsInsertAttempts).toHaveLength(0)
  })

  it('rejects a missing ledgerId', async () => {
    await seedHouseholdA()
    const res = await batch('user_a', { holdings: [row(10, MEMBER_A1)] })

    expect(res.status).toBe(400)
    expect(holdingsInsertAttempts).toHaveLength(0)
  })

  it(`rejects more than ${MAX_LEDGER_HOLDINGS} elements in one call`, async () => {
    const ledgerId = await seedHouseholdA()
    const tooMany = Array.from({ length: MAX_LEDGER_HOLDINGS + 1 }, (_, i) => row(1000 + i, MEMBER_A1))

    const res = await batch('user_a', { ledgerId, holdings: tooMany })

    expect(res.status).toBe(400)
    expect(holdingsInsertAttempts).toHaveLength(0)
    expect(holdingRows).toHaveLength(0)
  })
})

describe('POST /api/holdings-batch — ledger ownership', () => {
  it("refuses another household's ledger with 403, and writes nothing", async () => {
    const ledgerA = await seedHouseholdA()
    await createHousehold('user_b', HOUSEHOLD_B)
    await createMember('user_b', MEMBER_B)

    const res = await batch('user_b', { ledgerId: ledgerA, holdings: [row(10, MEMBER_B)] })

    expect(res.status).toBe(403)
    expect(holdingsInsertAttempts).toHaveLength(0)
    expect(holdingsIn(ledgerA)).toHaveLength(0)
  })

  it("refuses another household's BASELINE ledger with 403", async () => {
    await seedHouseholdA()
    await createHousehold('user_b', HOUSEHOLD_B)
    await createMember('user_b', MEMBER_B)

    const res = await batch('user_b', {
      ledgerId: baselineFor(HOUSEHOLD_A).id,
      holdings: [row(10, MEMBER_B)],
    })

    expect(res.status).toBe(403)
    expect(holdingsInsertAttempts).toHaveLength(0)
  })

  it('refuses a ledger id that exists in no household at all with 403', async () => {
    await seedHouseholdA()
    const res = await batch('user_a', { ledgerId: uuid(777), holdings: [row(10, MEMBER_A1)] })

    expect(res.status).toBe(403)
    expect(holdingsInsertAttempts).toHaveLength(0)
  })

  it("accepts the caller's own baseline ledger", async () => {
    await seedHouseholdA()
    const baseline = baselineFor(HOUSEHOLD_A).id

    const res = await batch('user_a', { ledgerId: baseline, holdings: [row(10, MEMBER_A1)] })

    expect(res.status).toBe(201)
    expect(holdingsIn(baseline).map((h) => h.id)).toEqual([uuid(10)])
  })
})

describe('POST /api/holdings-batch — EVERY memberId is checked, not just the first', () => {
  it('refuses a heterogeneous batch whose FIRST element is legitimate and a LATER one is foreign, writing zero rows', async () => {
    const ledgerId = await seedHouseholdA()
    await createHousehold('user_b', HOUSEHOLD_B)
    await createMember('user_b', MEMBER_B)

    const res = await batch('user_a', {
      ledgerId,
      holdings: [
        // Genuinely household A's — an endpoint that validates array[0] alone
        // sails past this one.
        row(10, MEMBER_A1),
        row(11, MEMBER_A2),
        // Household B's member. The FK would accept it; tenancy must not.
        row(12, MEMBER_B),
      ],
    })

    expect(res.status).toBe(403)
    // Not "the two valid ones landed" — and not even an attempt.
    expect(holdingsInsertAttempts).toHaveLength(0)
    expect(holdingRows).toHaveLength(0)
    expect(holdingsIn(ledgerId)).toHaveLength(0)
  })

  it('refuses when the foreign member is the very LAST element of a long batch', async () => {
    const ledgerId = await seedHouseholdA()
    await createHousehold('user_b', HOUSEHOLD_B)
    await createMember('user_b', MEMBER_B)

    const holdings = [
      ...Array.from({ length: 49 }, (_, i) => row(200 + i, MEMBER_A1)),
      row(999, MEMBER_B),
    ]

    const res = await batch('user_a', { ledgerId, holdings })

    expect(res.status).toBe(403)
    expect(holdingsInsertAttempts).toHaveLength(0)
    expect(holdingRows).toHaveLength(0)
  })

  it('refuses a memberId that exists in no household at all, wherever it sits in the array', async () => {
    const ledgerId = await seedHouseholdA()

    const res = await batch('user_a', {
      ledgerId,
      holdings: [row(10, MEMBER_A1), row(11, uuid(555)), row(12, MEMBER_A2)],
    })

    expect(res.status).toBe(403)
    expect(holdingsInsertAttempts).toHaveLength(0)
    expect(holdingRows).toHaveLength(0)
  })

  it('accepts a batch spanning several of the household’s own members', async () => {
    const ledgerId = await seedHouseholdA()

    const res = await batch('user_a', {
      ledgerId,
      holdings: [row(10, MEMBER_A1), row(11, MEMBER_A2), row(12, MEMBER_A1)],
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as BatchResponse
    expect(body.status).toBe('ok')
    expect(body.inserted).toBe(3)

    const landed = holdingsIn(ledgerId)
    expect(landed.map((h) => h.id)).toEqual([uuid(10), uuid(11), uuid(12)])
    expect(landed.every((h) => h.householdId === HOUSEHOLD_A)).toBe(true)
    expect(landed.map((h) => h.memberId)).toEqual([MEMBER_A1, MEMBER_A2, MEMBER_A1])
    // The server stores what the browser sealed and never re-derives it.
    expect(landed.every((h) => h.ciphertext === sealed.ciphertext)).toBe(true)
  })

  it('writes into the named ledger only, leaving Current untouched', async () => {
    const ledgerId = await seedHouseholdA()
    const baseline = baselineFor(HOUSEHOLD_A).id

    const res = await batch('user_a', { ledgerId, holdings: [row(10, MEMBER_A1), row(11, MEMBER_A2)] })

    expect(res.status).toBe(201)
    expect(holdingsIn(baseline)).toHaveLength(0)
    expect(holdingsIn(ledgerId)).toHaveLength(2)
  })
})

describe('POST /api/holdings-batch — the row cap inserts zero rows when crossed', () => {
  it(`answers 409 with currentCount, cap and attempted when the batch would cross ${MAX_LEDGER_HOLDINGS} partway through`, async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A1)
    // 198 already in the ledger, so a batch of 5 crosses the cap on its third
    // element — the exact shape a per-element cap check would commit partially.
    const seed = Array.from({ length: 198 }, (_, i) => row(2000 + i, MEMBER_A1))
    const ledgerId = await createLedger('user_a', uuid(1), seed)
    expect(holdingsIn(ledgerId)).toHaveLength(198)

    const attemptsBefore = holdingsInsertAttempts.length
    const res = await batch('user_a', {
      ledgerId,
      holdings: Array.from({ length: 5 }, (_, i) => row(3000 + i, MEMBER_A1)),
    })

    expect(res.status).toBe(409)
    const body = (await res.json()) as BatchResponse
    expect(body.status).toBe('ledger_full')
    expect(body.currentCount).toBe(198)
    expect(body.cap).toBe(MAX_LEDGER_HOLDINGS)
    expect(body.attempted).toBe(5)

    // Zero rows, not two. And no insert was even attempted.
    expect(holdingsInsertAttempts).toHaveLength(attemptsBefore)
    expect(holdingsIn(ledgerId)).toHaveLength(198)
    expect(holdingRows.some((h) => h.id === uuid(3000))).toBe(false)
  })

  it('accepts a batch that lands exactly on the cap', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A1)
    const seed = Array.from({ length: MAX_LEDGER_HOLDINGS - 3 }, (_, i) => row(2000 + i, MEMBER_A1))
    const ledgerId = await createLedger('user_a', uuid(1), seed)

    const res = await batch('user_a', {
      ledgerId,
      holdings: [row(3000, MEMBER_A1), row(3001, MEMBER_A1), row(3002, MEMBER_A1)],
    })

    expect(res.status).toBe(201)
    expect(((await res.json()) as BatchResponse).inserted).toBe(3)
    expect(holdingsIn(ledgerId)).toHaveLength(MAX_LEDGER_HOLDINGS)
  })

  it('refuses a single row that would be one over the cap', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A1)
    const seed = Array.from({ length: MAX_LEDGER_HOLDINGS }, (_, i) => row(2000 + i, MEMBER_A1))
    const ledgerId = await createLedger('user_a', uuid(1), seed)

    const res = await batch('user_a', { ledgerId, holdings: [row(3000, MEMBER_A1)] })

    expect(res.status).toBe(409)
    expect(((await res.json()) as BatchResponse).currentCount).toBe(MAX_LEDGER_HOLDINGS)
    expect(holdingsIn(ledgerId)).toHaveLength(MAX_LEDGER_HOLDINGS)
  })

  it("counts only the named ledger's rows toward its cap, not the household's other ledgers", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A1)
    const full = Array.from({ length: MAX_LEDGER_HOLDINGS, }, (_, i) => row(2000 + i, MEMBER_A1))
    await createLedger('user_a', uuid(1), full)
    const empty = await createLedger('user_a', uuid(2))

    const res = await batch('user_a', { ledgerId: empty, holdings: [row(3000, MEMBER_A1)] })

    expect(res.status).toBe(201)
    expect(holdingsIn(empty)).toHaveLength(1)
  })
})

describe('POST /api/holdings-batch — all or nothing within one statement', () => {
  it('writes every row in ONE insert statement, which is the only atomicity neon-http offers', async () => {
    const ledgerId = await seedHouseholdA()
    const attemptsBefore = holdingsInsertAttempts.length

    const res = await batch('user_a', {
      ledgerId,
      holdings: [row(10, MEMBER_A1), row(11, MEMBER_A1), row(12, MEMBER_A2)],
    })

    expect(res.status).toBe(201)
    // Not three statements. One.
    expect(holdingsInsertAttempts).toHaveLength(attemptsBefore + 1)
    expect(holdingsInsertAttempts[attemptsBefore]).toHaveLength(3)
  })

  it('lands nothing when the single statement fails — a duplicate row id takes the whole batch with it', async () => {
    const ledgerId = await seedHouseholdA()
    const first = await batch('user_a', { ledgerId, holdings: [row(10, MEMBER_A1)] })
    expect(first.status).toBe(201)

    const res = await batch('user_a', {
      ledgerId,
      holdings: [row(20, MEMBER_A1), row(10, MEMBER_A1), row(21, MEMBER_A1)],
    })

    expect(res.status).toBe(500)
    // The two innocent rows did not land: the statement is the unit, not the row.
    expect(holdingsIn(ledgerId).map((h) => h.id)).toEqual([uuid(10)])
  })
})
