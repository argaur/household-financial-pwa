import { describe, it, expect, beforeEach, vi } from 'vitest'

process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_ZmFrZS5jbGVyay5hY2NvdW50cy5kZXYk'

// Same fake-token pattern as protection.integration.test.ts / holdings.integration.test.ts:
// the bearer token IS the userId.
vi.mock('jose', () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: async (token: string) => {
    if (token === 'invalid') throw new Error('signature verification failed')
    return { payload: { sub: token } }
  },
}))

/**
 * SEEDING NOTE — read before adding a fixture here.
 *
 * The dashboard is computed server-side from plaintext columns, and the write
 * routes no longer accept plaintext at all: they take opaque envelopes. So the
 * member/holding/protection fixtures below are pushed straight into the fake
 * tables rather than POSTed through the API — they stand for rows written
 * before encryption, which is exactly the data this computation can still see.
 * The household is still created through its real route, because that is what
 * proves the dashboard resolves the caller's household from the session.
 *
 * Encrypted rows are invisible to this computation by design; the client-side
 * dashboard is what makes them count again.
 */
interface HouseholdRow {
  id: string
  ownerUserId: string
  name: string | null
  ciphertext: string | null
  iv: string | null
  alg: string | null
  version: number
}
interface MemberRow {
  id: string
  householdId: string
  name: string | null
  relationship: string | null
  ciphertext: string | null
  version: number
}
interface HoldingRow {
  id: string
  householdId: string
  memberId: string
  assetClass: string | null
  currentValue: string | null
  isEmergencyFund: boolean
  ciphertext: string | null
  version: number
}
interface ProtectionRow {
  id: string
  householdId: string
  memberId: string
  status: string | null
  ciphertext: string | null
  version: number
}

let households: HouseholdRow[] = []
let members: MemberRow[] = []
let holdingsRows: HoldingRow[] = []
let protectionRows: ProtectionRow[] = []
let nextMemberId = 1
let nextHoldingId = 1
let nextProtectionId = 1

vi.mock('./lib/db.js', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (cond: { __eq?: [{ name?: string }, string]; __and?: Array<[{ name?: string }, string]> }) => {
          const raw: Array<[{ name?: string }, string]> = cond.__and ?? (cond.__eq ? [cond.__eq] : [])
          const filters: Array<[string | undefined, string]> = raw.map(([col, value]) => [col?.name, value])
          function matches(row: object, fieldMap: Record<string, string>): boolean {
            const record = row as Record<string, unknown>
            return filters.every(([colName, value]) => {
              const field = colName ? fieldMap[colName] : undefined
              return field ? record[field] === value : true
            })
          }
          function all(): unknown[] {
            if (table === householdsTableRef) return households.filter((h) => matches(h, { owner_user_id: 'ownerUserId' }))
            if (table === familyMembersTableRef)
              return members.filter((m) => matches(m, { id: 'id', household_id: 'householdId' }))
            if (table === holdingsTableRef)
              return holdingsRows.filter((h) => matches(h, { id: 'id', household_id: 'householdId' }))
            if (table === protectionTableRef)
              return protectionRows.filter((p) => matches(p, { id: 'id', household_id: 'householdId' }))
            return []
          }
          const rows = all()
          const result = Promise.resolve(rows) as Promise<unknown[]> & { limit: (n: number) => Promise<unknown[]> }
          result.limit = (n: number) => Promise.resolve(rows.slice(0, n))
          return result
        },
      }),
    }),
    insert: () => ({
      values: (row: Record<string, unknown>) => ({
        returning: () => {
          const created: HouseholdRow = {
            id: String(row.id),
            ownerUserId: String(row.ownerUserId),
            name: null,
            ciphertext: (row.ciphertext as string) ?? null,
            iv: (row.iv as string) ?? null,
            alg: (row.alg as string) ?? null,
            version: 1,
          }
          households.push(created)
          return Promise.resolve([created])
        },
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: () => ({
          returning: () => Promise.resolve([patch]),
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
    eq: (col: { name?: string }, value: string) => ({ __eq: [col, value] as [{ name?: string }, string] }),
    and: (...conds: Array<{ __eq: [{ name?: string }, string] }>) => ({ __and: conds.map((c) => c.__eq) }),
  }
})

const schema = await import('../drizzle/schema.js')
const householdsTableRef = schema.households
const familyMembersTableRef = schema.familyMembers
const holdingsTableRef = schema.holdings
const protectionTableRef = schema.protection

const { app } = await import('./app.js')

const HOUSEHOLD_A = '11111111-1111-4111-8111-111111111111'
const HOUSEHOLD_B = '22222222-2222-4222-8222-222222222222'

const envelope = {
  ciphertext: 'Y2lwaGVydGV4dC1vbmU',
  iv: 'aXYtYnl0ZXMtMTIx',
  alg: 'AES-256-GCM',
}

interface HouseholdResponse {
  household: { id: string } | null
}
interface DashboardResponse {
  household?: { id: string; name: string | null }
  completeness?: { checks: Record<string, boolean>; score: number; tier: string }
  nudge?: {
    checkId: string
    learnCardSlug: string
    targetType?: string
    memberName?: string
    assetClassCount?: number
  }
  allocation?: Array<{ assetClass: string; value: number; percentage: number }>
  totalValue?: number
  error?: string
}

async function createHousehold(token: string, id: string) {
  const res = await app.request('/api/household', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, ...envelope }),
  })
  const body = (await res.json()) as HouseholdResponse
  return body.household!
}

function seedMember(householdId: string, name: string, relationship = 'self') {
  const row: MemberRow = {
    id: `m-${nextMemberId++}`,
    householdId,
    name,
    relationship,
    ciphertext: null,
    version: 1,
  }
  members.push(row)
  return row.id
}

function seedHolding(
  householdId: string,
  memberId: string,
  assetClass: string,
  currentValue: string,
  isEmergencyFund = false,
) {
  holdingsRows.push({
    id: `hold-${nextHoldingId++}`,
    householdId,
    memberId,
    assetClass,
    currentValue,
    isEmergencyFund,
    ciphertext: null,
    version: 1,
  })
}

function seedProtection(householdId: string, memberId: string, status = 'active') {
  protectionRows.push({
    id: `prot-${nextProtectionId++}`,
    householdId,
    memberId,
    status,
    ciphertext: null,
    version: 1,
  })
}

describe('dashboard route', () => {
  beforeEach(() => {
    households = []
    members = []
    holdingsRows = []
    protectionRows = []
    nextMemberId = 1
    nextHoldingId = 1
    nextProtectionId = 1
  })

  it('rejects a request with no Authorization header', async () => {
    const res = await app.request('/api/dashboard')
    expect(res.status).toBe(401)
  })

  it('returns 404 for a user with no household yet', async () => {
    const res = await app.request('/api/dashboard', { headers: { authorization: 'Bearer user_no_household' } })
    expect(res.status).toBe(404)
  })

  it('fixture: household with 0 members — getting_started, empty allocation', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const res = await app.request('/api/dashboard', { headers: { authorization: 'Bearer user_a' } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as DashboardResponse
    expect(body.completeness?.tier).toBe('getting_started')
    expect(body.completeness?.score).toBe(0)
    expect(body.allocation).toEqual([])
    expect(body.totalValue).toBe(0)
  })

  it('fixture: 1 member, no holdings — getting_started', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    seedMember(HOUSEHOLD_A, 'Ananya Verma')
    const res = await app.request('/api/dashboard', { headers: { authorization: 'Bearer user_a' } })
    const body = (await res.json()) as DashboardResponse
    expect(body.completeness?.score).toBe(0)
    expect(body.completeness?.tier).toBe('getting_started')
  })

  it('fixture: full coverage across members/holdings/protection — strong tier, correct allocation', async () => {
    const household = await createHousehold('user_a', HOUSEHOLD_A)
    const selfId = seedMember(HOUSEHOLD_A, 'Ananya Verma', 'self')
    const spouseId = seedMember(HOUSEHOLD_A, 'Rohit Verma', 'spouse')

    seedHolding(HOUSEHOLD_A, selfId, 'equity', '6000', true)
    seedHolding(HOUSEHOLD_A, spouseId, 'debt', '3000')
    seedHolding(HOUSEHOLD_A, selfId, 'gold', '1000')

    seedProtection(HOUSEHOLD_A, selfId, 'active')
    seedProtection(HOUSEHOLD_A, spouseId, 'active')

    const res = await app.request('/api/dashboard', { headers: { authorization: 'Bearer user_a' } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as DashboardResponse
    expect(body.household?.id).toBe(household.id)
    expect(body.completeness?.checks).toEqual({
      memberCoverage: true,
      emergencyFund: true,
      bothParentsProtected: true,
      assetDiversity: true,
      noStaleValues: true,
    })
    expect(body.completeness?.score).toBe(5)
    expect(body.completeness?.tier).toBe('strong')
    // Slice 7: the route must forward the nudge getDashboard() computes — all
    // five checks pass here, so it's the affirming `complete` nudge.
    expect(body.nudge).toBeDefined()
    expect(body.nudge?.checkId).toBe('complete')
    expect(body.totalValue).toBe(10000)
    expect(body.allocation).toEqual([
      { assetClass: 'equity', value: 6000, percentage: 60 },
      { assetClass: 'debt', value: 3000, percentage: 30 },
      { assetClass: 'gold', value: 1000, percentage: 10 },
    ])
  })

  it('skips encrypted rows rather than crashing on their null plaintext columns', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const selfId = seedMember(HOUSEHOLD_A, 'Ananya Verma', 'self')
    seedHolding(HOUSEHOLD_A, selfId, 'equity', '6000', true)
    // An encrypted holding: every plaintext column is null, the envelope is set.
    holdingsRows.push({
      id: 'hold-encrypted',
      householdId: HOUSEHOLD_A,
      memberId: selfId,
      assetClass: null,
      currentValue: null,
      isEmergencyFund: false,
      ciphertext: 'Y2lwaGVydGV4dC1vbmU',
      version: 1,
    })

    const res = await app.request('/api/dashboard', { headers: { authorization: 'Bearer user_a' } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as DashboardResponse
    expect(body.totalValue).toBe(6000)
    expect(body.allocation).toEqual([{ assetClass: 'equity', value: 6000, percentage: 100 }])
  })

  it('always forwards a nudge in the response — never zero (SPEC.md §7)', async () => {
    // Regression guard: getDashboard() computes a nudge, but the route once
    // hand-picked response fields and dropped it, so the live dashboard
    // rendered no NudgeCard despite the "exactly one, never zero" invariant.
    // A household with zero members has four unmet checks → member_coverage.
    await createHousehold('user_a', HOUSEHOLD_A)
    const res = await app.request('/api/dashboard', { headers: { authorization: 'Bearer user_a' } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as DashboardResponse
    expect(body.nudge).toBeDefined()
    expect(body.nudge?.checkId).toBe('member_coverage')
    expect(body.nudge?.learnCardSlug).toBe('portfolio')
    // Same seam as B-001: the route hand-picks response fields, so every new
    // nudge field needs its own assertion here or it can be dropped on
    // serialization while every unit test still passes.
    expect(body.nudge?.targetType).toBe('route')
  })

  it("user B never sees user A's dashboard data", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    const aMemberId = seedMember(HOUSEHOLD_A, 'Ananya Verma')
    seedHolding(HOUSEHOLD_A, aMemberId, 'equity', '5000')

    const res = await app.request('/api/dashboard', { headers: { authorization: 'Bearer user_b' } })
    const body = (await res.json()) as DashboardResponse
    expect(body.allocation).toEqual([])
    expect(body.totalValue).toBe(0)
  })
})
