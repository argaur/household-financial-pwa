import { describe, it, expect, beforeEach, vi } from 'vitest'

process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_ZmFrZS5jbGVyay5hY2NvdW50cy5kZXYk'

// Same fake-token pattern as family-members.integration.test.ts: the bearer
// token IS the userId, so two distinct "signed in" users can drive the real
// Hono app without a real Clerk-signed JWT.
vi.mock('jose', () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: async (token: string) => {
    if (token === 'invalid') throw new Error('signature verification failed')
    return { payload: { sub: token } }
  },
}))

interface HouseholdRow {
  id: string
  ownerUserId: string
  ciphertext: string | null
  iv: string | null
  alg: string | null
  version: number
}
interface MemberRow {
  id: string
  householdId: string
  ciphertext: string | null
  iv: string | null
  alg: string | null
  version: number
}
interface HoldingRow {
  id: string
  householdId: string
  memberId: string
  /** Absent on the one legacy row this file deliberately pushes with no ledger. */
  ledgerId?: string
  ciphertext: string | null
  iv: string | null
  alg: string | null
  version: number
  createdAt: Date
  updatedAt: Date
  /** Legacy plaintext column, present on rows written before encryption. */
  investedAmount?: string | null
}
interface LedgerRow {
  id: string
  householdId: string
  name: string
  isBaseline: boolean
  origin: string
}

let households: HouseholdRow[] = []
let members: MemberRow[] = []
let holdingsRows: HoldingRow[] = []
let ledgerRows: LedgerRow[] = []
let ledgerCounter = 0

type Filter = [{ name?: string }, unknown]

function filtersOf(cond: { __eq?: Filter; __and?: Filter[] }): Array<[string | undefined, unknown]> {
  const raw: Filter[] = cond.__and ?? (cond.__eq ? [cond.__eq] : [])
  return raw.map(([col, value]) => [col?.name, value])
}

function matcher(cond: { __eq?: Filter; __and?: Filter[] }, fieldMap: Record<string, string>) {
  const filters = filtersOf(cond)
  return (row: object) => {
    const record = row as Record<string, unknown>
    return filters.every(([column, value]) => {
      const field = column ? fieldMap[column] : undefined
      return field ? record[field] === value : true
    })
  }
}

const HOLDING_FIELDS = {
  id: 'id',
  household_id: 'householdId',
  member_id: 'memberId',
  ledger_id: 'ledgerId',
  version: 'version',
}
const LEDGER_FIELDS = { household_id: 'householdId', is_baseline: 'isBaseline', id: 'id' }

vi.mock('./lib/db.js', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (cond: { __eq?: Filter; __and?: Filter[] }) => {
          function all(): unknown[] {
            if (table === householdsTableRef) return households.filter(matcher(cond, { owner_user_id: 'ownerUserId' }))
            if (table === familyMembersTableRef)
              return members.filter(matcher(cond, { id: 'id', household_id: 'householdId' }))
            if (table === holdingsTableRef) return holdingsRows.filter(matcher(cond, HOLDING_FIELDS))
            if (table === ledgersTableRef) return ledgerRows.filter(matcher(cond, LEDGER_FIELDS))
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
      values: (row: Record<string, unknown>) => ({
        returning: () => {
          if (table === householdsTableRef) {
            const created: HouseholdRow = {
              id: String(row.id),
              ownerUserId: String(row.ownerUserId),
              ciphertext: (row.ciphertext as string) ?? null,
              iv: (row.iv as string) ?? null,
              alg: (row.alg as string) ?? null,
              version: 1,
            }
            households.push(created)
            return Promise.resolve([created])
          }
          if (table === familyMembersTableRef) {
            const created: MemberRow = {
              id: String(row.id),
              householdId: String(row.householdId),
              ciphertext: (row.ciphertext as string) ?? null,
              iv: (row.iv as string) ?? null,
              alg: (row.alg as string) ?? null,
              version: 1,
            }
            members.push(created)
            return Promise.resolve([created])
          }
          if (table === holdingsTableRef) {
            const created: HoldingRow = {
              id: String(row.id),
              householdId: String(row.householdId),
              memberId: String(row.memberId),
              ledgerId: String(row.ledgerId),
              ciphertext: (row.ciphertext as string) ?? null,
              iv: (row.iv as string) ?? null,
              alg: (row.alg as string) ?? null,
              // The column default — the route never accepts a version.
              version: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
            holdingsRows.push(created)
            return Promise.resolve([created])
          }
          if (table === ledgersTableRef) {
            const created: LedgerRow = {
              id: (row.id as string) ?? `ledger-${++ledgerCounter}`,
              householdId: String(row.householdId),
              name: String(row.name),
              isBaseline: Boolean(row.isBaseline),
              origin: String(row.origin),
            }
            ledgerRows.push(created)
            return Promise.resolve([created])
          }
          throw new Error('fake db: unhandled table in insert()')
        },
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        // Every filter is honoured, including `version = expectedVersion` —
        // otherwise a stale write would "succeed" here and the 409 path would
        // never be exercised.
        where: (cond: { __eq?: Filter; __and?: Filter[] }) => ({
          returning: () => {
            const idx = holdingsRows.findIndex(matcher(cond, HOLDING_FIELDS))
            if (idx === -1) return Promise.resolve([])
            holdingsRows[idx] = { ...holdingsRows[idx], ...(patch as Partial<HoldingRow>) }
            return Promise.resolve([holdingsRows[idx]])
          },
        }),
      }),
    }),
    delete: (table: unknown) => ({
      where: (cond: { __eq?: Filter; __and?: Filter[] }) => {
        if (table === holdingsTableRef) {
          const match = matcher(cond, HOLDING_FIELDS)
          holdingsRows = holdingsRows.filter((row) => !match(row))
          return Promise.resolve([])
        }
        throw new Error('fake db: unhandled table in delete()')
      },
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
const holdingsTableRef = schema.holdings
const ledgersTableRef = schema.ledgers

const { app } = await import('./app.js')

const HOUSEHOLD_A = '11111111-1111-4111-8111-111111111111'
const HOUSEHOLD_B = '22222222-2222-4222-8222-222222222222'
const MEMBER_A = 'aaaaaaaa-1111-4111-8111-111111111111'
const MEMBER_B = 'bbbbbbbb-2222-4222-8222-222222222222'
const HOLDING_1 = 'cccccccc-3333-4333-8333-333333333333'
const HOLDING_2 = 'dddddddd-4444-4444-8444-444444444444'
const LEDGER_A1 = 'ffffffff-6666-4666-8666-666666666666'

const envelope = { ciphertext: 'Y2lwaGVydGV4dC1vbmU', iv: 'aXYtYnl0ZXMtMTIx', alg: 'AES-256-GCM' }
const newEnvelope = { ciphertext: 'Y2lwaGVydGV4dC10d28', iv: 'aXYtYnl0ZXMtMTIy', alg: 'AES-256-GCM' }

interface HoldingResponse {
  holding?: {
    id: string
    householdId: string
    memberId: string
    ciphertext: string | null
    version: number
    investedAmount?: unknown
    assetClass?: unknown
    ledgerId?: unknown
  }
  error?: string
}
interface HoldingsListResponse {
  holdings: Array<{ id: string; ciphertext: string | null; investedAmount?: unknown }>
}
interface LedgerResponse {
  ledger?: { id: string; householdId: string; isBaseline: boolean }
  error?: string
}

function authed(token: string, method: string, body?: unknown, query = '') {
  return app.request(`/api/holdings${query}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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

/** Creates a second, non-baseline ledger via the real /api/ledgers route. */
async function createLedger(token: string, id: string, name: string) {
  const res = await app.request('/api/ledgers', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, name, source: 'blank', holdings: [] }),
  })
  return (await res.json()) as LedgerResponse
}

describe('holdings routes', () => {
  beforeEach(() => {
    households = []
    members = []
    holdingsRows = []
    ledgerRows = []
    ledgerCounter = 0
  })

  it('rejects a request with no Authorization header', async () => {
    const res = await app.request('/api/holdings')
    expect(res.status).toBe(401)
  })

  it('returns an empty list for a user with no household yet', async () => {
    const res = await app.request('/api/holdings', { headers: { authorization: 'Bearer user_no_household' } })
    expect(res.status).toBe(200)
    expect(((await res.json()) as HoldingsListResponse).holdings).toEqual([])
  })

  it('returns 404 when creating a holding before a household exists', async () => {
    const res = await authed('user_no_household', 'POST', { id: HOLDING_1, memberId: MEMBER_A, ...envelope })
    expect(res.status).toBe(404)
  })

  it('stores an opaque holding scoped to the household', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)

    const res = await authed('user_a', 'POST', { id: HOLDING_1, memberId: MEMBER_A, ...envelope })
    expect(res.status).toBe(201)

    const body = (await res.json()) as HoldingResponse
    expect(body.holding?.householdId).toBe(HOUSEHOLD_A)
    expect(body.holding?.ciphertext).toBe(envelope.ciphertext)
    expect(body.holding?.version).toBe(1)
    // The response is built from an explicit field list, so legacy plaintext
    // columns can never be served alongside the envelope.
    expect(body.holding).not.toHaveProperty('investedAmount')
    expect(body.holding).not.toHaveProperty('assetClass')
  })

  it('rejects a plaintext holding body outright — no schema on this route accepts an amount', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)

    const res = await authed('user_a', 'POST', {
      memberId: MEMBER_A,
      instrumentId: 'instr-equity',
      investedAmount: '10000',
      currentValue: '10500',
    })
    expect(res.status).toBe(400)
    expect(holdingsRows).toHaveLength(0)
  })

  it('rejects an envelope smuggling an extra plaintext field alongside it', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)

    const res = await authed('user_a', 'POST', {
      id: HOLDING_1,
      memberId: MEMBER_A,
      ...envelope,
      investedAmount: '10000',
    })
    expect(res.status).toBe(400)
    expect(holdingsRows).toHaveLength(0)
  })

  it('rejects a holding referencing a member from a different household', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    await createMember('user_b', MEMBER_B)

    const res = await authed('user_a', 'POST', { id: HOLDING_1, memberId: MEMBER_B, ...envelope })
    expect(res.status).toBe(400)
  })

  it('rejects a malformed request body with 400', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const res = await authed('user_a', 'POST', { notAField: true })
    expect(res.status).toBe(400)
  })

  it('sets Cache-Control: no-store on every response', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)

    const created = await authed('user_a', 'POST', { id: HOLDING_1, memberId: MEMBER_A, ...envelope })
    expect(created.headers.get('cache-control')).toBe('no-store')

    const list = await app.request('/api/holdings', { headers: { authorization: 'Bearer user_a' } })
    expect(list.headers.get('cache-control')).toBe('no-store')

    const updated = await authed('user_a', 'PATCH', { ...newEnvelope, expectedVersion: 1 }, `?id=${HOLDING_1}`)
    expect(updated.headers.get('cache-control')).toBe('no-store')

    const denied = await app.request('/api/holdings')
    expect(denied.headers.get('cache-control')).toBe('no-store')
  })

  it('updates via ?id= query param (not a path segment) and bumps to expectedVersion + 1', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)
    await authed('user_a', 'POST', { id: HOLDING_1, memberId: MEMBER_A, ...envelope })

    const res = await authed('user_a', 'PATCH', { ...newEnvelope, expectedVersion: 1 }, `?id=${HOLDING_1}`)
    expect(res.status).toBe(200)

    const body = (await res.json()) as HoldingResponse
    expect(body.holding?.ciphertext).toBe(newEnvelope.ciphertext)
    expect(body.holding?.version).toBe(2)
  })

  it('answers 409 to a stale expectedVersion and leaves the stored row completely unchanged', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)
    await authed('user_a', 'POST', { id: HOLDING_1, memberId: MEMBER_A, ...envelope })
    await authed('user_a', 'PATCH', { ...newEnvelope, expectedVersion: 1 }, `?id=${HOLDING_1}`)

    const stale = await authed(
      'user_a',
      'PATCH',
      { ciphertext: 'Y2lwaGVydGV4dC1zdGFsZQ', iv: 'aXYtYnl0ZXMtMTIz', alg: 'AES-256-GCM', expectedVersion: 1 },
      `?id=${HOLDING_1}`,
    )
    expect(stale.status).toBe(409)

    const stored = holdingsRows.find((h) => h.id === HOLDING_1)!
    expect(stored.ciphertext).toBe(newEnvelope.ciphertext)
    expect(stored.version).toBe(2)
  })

  it('rejects an update with no expectedVersion', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)
    await authed('user_a', 'POST', { id: HOLDING_1, memberId: MEMBER_A, ...envelope })

    const res = await authed('user_a', 'PATCH', newEnvelope, `?id=${HOLDING_1}`)
    expect(res.status).toBe(400)
    expect(holdingsRows[0].ciphertext).toBe(envelope.ciphertext)
  })

  it("user B can never update user A's holding", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    await createMember('user_a', MEMBER_A)
    await authed('user_a', 'POST', { id: HOLDING_1, memberId: MEMBER_A, ...envelope })

    const res = await authed('user_b', 'PATCH', { ...newEnvelope, expectedVersion: 1 }, `?id=${HOLDING_1}`)
    expect(res.status).toBe(404)
    expect(holdingsRows[0].ciphertext).toBe(envelope.ciphertext)
  })

  it("user B never sees user A's holdings in a list", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    await createMember('user_a', MEMBER_A)
    await authed('user_a', 'POST', { id: HOLDING_1, memberId: MEMBER_A, ...envelope })

    const bList = await app.request('/api/holdings', { headers: { authorization: 'Bearer user_b' } })
    expect(((await bList.json()) as HoldingsListResponse).holdings).toEqual([])
  })

  it('serves a legacy row as a null envelope rather than leaking its plaintext columns', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    holdingsRows.push({
      id: HOLDING_2,
      householdId: HOUSEHOLD_A,
      memberId: MEMBER_A,
      ciphertext: null,
      iv: null,
      alg: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      investedAmount: '250000',
    })

    const res = await app.request('/api/holdings', { headers: { authorization: 'Bearer user_a' } })
    const body = (await res.json()) as HoldingsListResponse
    expect(body.holdings).toHaveLength(1)
    expect(body.holdings[0].ciphertext).toBeNull()
    expect(body.holdings[0]).not.toHaveProperty('investedAmount')
    expect(JSON.stringify(body)).not.toContain('250000')
  })
})

// D-016 Chunk 3 — GET/POST scoped by an optional ?ledgerId=, PATCH/DELETE
// unchanged (they already operate purely on `?id=` within the household).
describe('holdings routes — ?ledgerId= scoping', () => {
  beforeEach(() => {
    households = []
    members = []
    holdingsRows = []
    ledgerRows = []
    ledgerCounter = 0
  })

  it('GET /api/holdings with no ledgerId still returns exactly what it did before this change', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)
    await authed('user_a', 'POST', { id: HOLDING_1, memberId: MEMBER_A, ...envelope })

    const res = await app.request('/api/holdings', { headers: { authorization: 'Bearer user_a' } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as HoldingsListResponse
    expect(body.holdings).toHaveLength(1)
    expect(body.holdings[0].id).toBe(HOLDING_1)
    expect(body.holdings[0].ciphertext).toBe(envelope.ciphertext)
  })

  it('GET with no ledgerId returns ONLY Current, never other ledgers\' rows pooled in', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)
    await authed('user_a', 'POST', { id: HOLDING_1, memberId: MEMBER_A, ...envelope }) // Current

    const ledger = await createLedger('user_a', LEDGER_A1, 'Aggressive')
    await authed(
      'user_a',
      'POST',
      { id: HOLDING_2, memberId: MEMBER_A, ...envelope },
      `?ledgerId=${ledger.ledger!.id}`,
    )

    // Before D-016 "scoped to the household" and "Current" were the same set,
    // so the unscoped list could filter by household alone. With a second
    // ledger they diverge, and the Portfolio screen — which calls this — would
    // otherwise show the same holding once per ledger, presenting strategy rows
    // as things the household actually owns.
    const res = await app.request('/api/holdings', { headers: { authorization: 'Bearer user_a' } })
    const body = (await res.json()) as HoldingsListResponse
    expect(body.holdings.map((h) => h.id)).toEqual([HOLDING_1])
  })

  it('GET ?ledgerId=<uuid> on a real ledger lists only that ledger\'s holdings', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)
    await authed('user_a', 'POST', { id: HOLDING_1, memberId: MEMBER_A, ...envelope }) // lands in Current

    const ledger = await createLedger('user_a', LEDGER_A1, 'Aggressive')
    const ledgerId = ledger.ledger!.id
    await authed('user_a', 'POST', { id: HOLDING_2, memberId: MEMBER_A, ...envelope }, `?ledgerId=${ledgerId}`)

    const res = await app.request(`/api/holdings?ledgerId=${ledgerId}`, {
      headers: { authorization: 'Bearer user_a' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as HoldingsListResponse
    expect(body.holdings.map((h) => h.id)).toEqual([HOLDING_2])
  })

  it('GET ?ledgerId= for a ledger that does not exist at all is 404, not an empty list', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const res = await app.request('/api/holdings?ledgerId=99999999-9999-4999-8999-999999999999', {
      headers: { authorization: 'Bearer user_a' },
    })
    expect(res.status).toBe(404)
    expect(((await res.json()) as HoldingResponse).error).toBe('not_found')
  })

  it('POST ?ledgerId=<uuid> creates the holding inside that ledger, with the session household id and no body-supplied ledgerId or householdId', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)
    const ledger = await createLedger('user_a', LEDGER_A1, 'Aggressive')
    const ledgerId = ledger.ledger!.id

    // The schema is `.strict()` — a client cannot even attempt to smuggle
    // ledgerId or householdId into the body; both are 400.
    const smuggledLedgerId = await authed(
      'user_a',
      'POST',
      { id: HOLDING_1, memberId: MEMBER_A, ledgerId: 'not-the-real-one', ...envelope },
      `?ledgerId=${ledgerId}`,
    )
    expect(smuggledLedgerId.status).toBe(400)
    const smuggledHouseholdId = await authed(
      'user_a',
      'POST',
      { id: HOLDING_1, memberId: MEMBER_A, householdId: HOUSEHOLD_B, ...envelope },
      `?ledgerId=${ledgerId}`,
    )
    expect(smuggledHouseholdId.status).toBe(400)
    expect(holdingsRows).toHaveLength(0)

    const res = await authed('user_a', 'POST', { id: HOLDING_1, memberId: MEMBER_A, ...envelope }, `?ledgerId=${ledgerId}`)
    expect(res.status).toBe(201)

    const stored = holdingsRows.find((h) => h.id === HOLDING_1)!
    expect(stored.ledgerId).toBe(ledgerId)
    expect(stored.householdId).toBe(HOUSEHOLD_A)
  })

  it('POST with no ledgerId still files into the baseline, unchanged', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)

    const res = await authed('user_a', 'POST', { id: HOLDING_1, memberId: MEMBER_A, ...envelope })
    expect(res.status).toBe(201)

    const baseline = ledgerRows.find((l) => l.householdId === HOUSEHOLD_A && l.isBaseline)!
    const stored = holdingsRows.find((h) => h.id === HOLDING_1)!
    expect(stored.ledgerId).toBe(baseline.id)
  })

  it('POST ?ledgerId= for a ledger that does not exist is 404 and writes nothing, before the body is even validated', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)

    // Body is deliberately garbage — if the route validated it before the
    // ledger, this would come back 400, not 404.
    const res = await authed(
      'user_a',
      'POST',
      { notAField: true },
      '?ledgerId=99999999-9999-4999-8999-999999999999',
    )
    expect(res.status).toBe(404)
    expect(holdingsRows).toHaveLength(0)
  })

  it("the acceptance criterion: Current never changes because another ledger exists — add, edit and delete in a second ledger leave Current's rows byte-identical", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)
    await authed('user_a', 'POST', { id: HOLDING_1, memberId: MEMBER_A, ...envelope })
    await authed('user_a', 'POST', { id: HOLDING_2, memberId: MEMBER_A, ...envelope })

    const baseline = ledgerRows.find((l) => l.householdId === HOUSEHOLD_A && l.isBaseline)!
    const currentBefore = JSON.parse(JSON.stringify(holdingsRows.filter((h) => h.ledgerId === baseline.id)))

    const ledger = await createLedger('user_a', LEDGER_A1, 'Aggressive')
    const ledgerId = ledger.ledger!.id
    const SECOND_LEDGER_HOLDING = 'eeeeeeee-5555-4555-8555-555555555555'

    // Add.
    const created = await authed(
      'user_a',
      'POST',
      { id: SECOND_LEDGER_HOLDING, memberId: MEMBER_A, ...envelope },
      `?ledgerId=${ledgerId}`,
    )
    expect(created.status).toBe(201)

    // Edit — PATCH takes only `?id=`, never `?ledgerId=`, and operates on the
    // holding wherever it lives, as long as it's this household's.
    const updated = await authed(
      'user_a',
      'PATCH',
      { ...newEnvelope, expectedVersion: 1 },
      `?id=${SECOND_LEDGER_HOLDING}`,
    )
    expect(updated.status).toBe(200)

    // Delete.
    const deleted = await authed('user_a', 'DELETE', undefined, `?id=${SECOND_LEDGER_HOLDING}`)
    expect(deleted.status).toBe(200)
    expect(holdingsRows.some((h) => h.id === SECOND_LEDGER_HOLDING)).toBe(false)

    // The invariant: Current's own rows, compared field-for-field, not just by count.
    const currentAfter = JSON.parse(JSON.stringify(holdingsRows.filter((h) => h.ledgerId === baseline.id)))
    expect(currentAfter).toEqual(currentBefore)
    expect(currentAfter).toHaveLength(2)
  })

  it("two-user isolation: user B cannot list, create into, or edit within user A's ledger — 404 on each", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    await createMember('user_a', MEMBER_A)

    const ledger = await createLedger('user_a', LEDGER_A1, "A's plan")
    const ledgerId = ledger.ledger!.id

    const list = await app.request(`/api/holdings?ledgerId=${ledgerId}`, { headers: { authorization: 'Bearer user_b' } })
    expect(list.status).toBe(404)
    expect(((await list.json()) as HoldingResponse).error).toBe('not_found')

    const create = await authed('user_b', 'POST', { id: HOLDING_1, memberId: MEMBER_A, ...envelope }, `?ledgerId=${ledgerId}`)
    expect(create.status).toBe(404)
    expect(holdingsRows).toHaveLength(0)

    // Seed a holding into A's ledger directly (bypassing B) to prove B can't edit it either.
    await authed('user_a', 'POST', { id: HOLDING_1, memberId: MEMBER_A, ...envelope }, `?ledgerId=${ledgerId}`)
    const edit = await authed('user_b', 'PATCH', { ...newEnvelope, expectedVersion: 1 }, `?id=${HOLDING_1}`)
    expect(edit.status).toBe(404)
    const del = await authed('user_b', 'DELETE', undefined, `?id=${HOLDING_1}`)
    expect(del.status).toBe(404)
    expect(holdingsRows.find((h) => h.id === HOLDING_1)?.ciphertext).toBe(envelope.ciphertext)
  })
})
