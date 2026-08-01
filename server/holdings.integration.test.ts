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
  ciphertext: string | null
  iv: string | null
  alg: string | null
  version: number
  createdAt: Date
  updatedAt: Date
  /** Legacy plaintext column, present on rows written before encryption. */
  investedAmount?: string | null
}

let households: HouseholdRow[] = []
let members: MemberRow[] = []
let holdingsRows: HoldingRow[] = []

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

const HOLDING_FIELDS = { id: 'id', household_id: 'householdId', version: 'version' }

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
            return []
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
          const created: HoldingRow = {
            id: String(row.id),
            householdId: String(row.householdId),
            memberId: String(row.memberId),
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

const { app } = await import('./app.js')

const HOUSEHOLD_A = '11111111-1111-4111-8111-111111111111'
const HOUSEHOLD_B = '22222222-2222-4222-8222-222222222222'
const MEMBER_A = 'aaaaaaaa-1111-4111-8111-111111111111'
const MEMBER_B = 'bbbbbbbb-2222-4222-8222-222222222222'
const HOLDING_1 = 'cccccccc-3333-4333-8333-333333333333'
const HOLDING_2 = 'dddddddd-4444-4444-8444-444444444444'

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
  }
  error?: string
}
interface HoldingsListResponse {
  holdings: Array<{ id: string; ciphertext: string | null; investedAmount?: unknown }>
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

describe('holdings routes', () => {
  beforeEach(() => {
    households = []
    members = []
    holdingsRows = []
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
