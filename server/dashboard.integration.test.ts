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

interface HouseholdRow {
  id: string
  ownerUserId: string
  name: string
}
interface MemberRow {
  id: string
  householdId: string
  name: string
  relationship: string
}
interface InstrumentRow {
  id: string
  category: number
  name: string
}
interface HoldingRow {
  id: string
  householdId: string
  memberId: string
  instrumentId: string
  assetClass: string
  investedAmount: string
  currentValue: string
  isEmergencyFund: boolean
}
interface ProtectionRow {
  id: string
  householdId: string
  memberId: string
  type: string
  coverAmount: string
  status: string
}

let households: HouseholdRow[] = []
let members: MemberRow[] = []
let instrumentsRows: InstrumentRow[] = []
let holdingsRows: HoldingRow[] = []
let protectionRows: ProtectionRow[] = []
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
            if (table === instrumentsTableRef) return instrumentsRows.filter((i) => matches(i, { id: 'id' }))
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
    insert: (table: unknown) => ({
      values: (row: Record<string, unknown>) => ({
        returning: () => {
          if (table === householdsTableRef) {
            const created: HouseholdRow = { id: `h-${households.length + 1}`, ownerUserId: row.ownerUserId as string, name: row.name as string }
            households.push(created)
            return Promise.resolve([created])
          }
          if (table === familyMembersTableRef) {
            const created: MemberRow = {
              id: `m-${members.length + 1}`,
              householdId: row.householdId as string,
              name: row.name as string,
              relationship: row.relationship as string,
            }
            members.push(created)
            return Promise.resolve([created])
          }
          if (table === holdingsTableRef) {
            const created: HoldingRow = {
              id: `hold-${nextHoldingId++}`,
              householdId: row.householdId as string,
              memberId: row.memberId as string,
              instrumentId: row.instrumentId as string,
              assetClass: row.assetClass as string,
              investedAmount: row.investedAmount as string,
              currentValue: row.currentValue as string,
              isEmergencyFund: (row.isEmergencyFund as boolean) ?? false,
            }
            holdingsRows.push(created)
            return Promise.resolve([created])
          }
          const created: ProtectionRow = {
            id: `prot-${nextProtectionId++}`,
            householdId: row.householdId as string,
            memberId: row.memberId as string,
            type: row.type as string,
            coverAmount: row.coverAmount as string,
            status: row.status as string,
          }
          protectionRows.push(created)
          return Promise.resolve([created])
        },
      }),
    }),
    update: (_table: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: (cond: { __and?: Array<[{ name?: string }, string]> }) => ({
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
const instrumentsTableRef = schema.instruments
const holdingsTableRef = schema.holdings
const protectionTableRef = schema.protection

const { app } = await import('./app.js')

interface HouseholdResponse {
  household: { id: string } | null
}
interface MemberResponse {
  member: { id: string }
}
interface DashboardResponse {
  household?: { id: string; name: string }
  completeness?: { checks: Record<string, boolean>; score: number; tier: string }
  nudge?: { checkId: string; learnCardSlug: string; memberName?: string; assetClassCount?: number }
  allocation?: Array<{ assetClass: string; value: number; percentage: number }>
  totalValue?: number
  error?: string
}

async function createHousehold(token: string, name: string) {
  const res = await app.request('/api/household', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  })
  const body = (await res.json()) as HouseholdResponse
  return body.household!
}

async function createMember(token: string, name: string, relationship = 'self') {
  const res = await app.request('/api/family-members', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, relationship, dateOfBirth: '1990-01-01' }),
  })
  const body = (await res.json()) as MemberResponse
  return body.member.id
}

async function createHolding(
  token: string,
  memberId: string,
  instrumentId: string,
  currentValue: string,
  isEmergencyFund = false,
) {
  await app.request('/api/holdings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ memberId, instrumentId, investedAmount: currentValue, currentValue, isEmergencyFund }),
  })
}

async function createProtection(token: string, memberId: string, status = 'active') {
  await app.request('/api/protection', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ memberId, type: 'term-life', coverAmount: '5000000', status }),
  })
}

describe('dashboard route', () => {
  beforeEach(() => {
    households = []
    members = []
    holdingsRows = []
    protectionRows = []
    nextHoldingId = 1
    nextProtectionId = 1
    instrumentsRows = [
      { id: 'instr-equity', category: 1, name: 'Large Cap Index Fund' },
      { id: 'instr-debt', category: 2, name: 'Corporate Bond Fund' },
      { id: 'instr-gold', category: 3, name: 'Sovereign Gold Bond' },
    ]
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
    await createHousehold('user_a', 'Gupta Family')
    const res = await app.request('/api/dashboard', { headers: { authorization: 'Bearer user_a' } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as DashboardResponse
    expect(body.completeness?.tier).toBe('getting_started')
    expect(body.completeness?.score).toBe(0)
    expect(body.allocation).toEqual([])
    expect(body.totalValue).toBe(0)
  })

  it('fixture: 1 member, no holdings — getting_started', async () => {
    await createHousehold('user_a', 'Gupta Family')
    await createMember('user_a', 'Gaurav Gupta')
    const res = await app.request('/api/dashboard', { headers: { authorization: 'Bearer user_a' } })
    const body = (await res.json()) as DashboardResponse
    expect(body.completeness?.score).toBe(0)
    expect(body.completeness?.tier).toBe('getting_started')
  })

  it('fixture: full coverage across members/holdings/protection — strong tier, correct allocation', async () => {
    const household = await createHousehold('user_a', 'Gupta Family')
    const selfId = await createMember('user_a', 'Gaurav Gupta', 'self')
    const spouseId = await createMember('user_a', 'Priya Gupta', 'spouse')

    await createHolding('user_a', selfId, 'instr-equity', '6000', true)
    await createHolding('user_a', spouseId, 'instr-debt', '3000')
    await createHolding('user_a', selfId, 'instr-gold', '1000')

    await createProtection('user_a', selfId, 'active')
    await createProtection('user_a', spouseId, 'active')

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

  it('always forwards a nudge in the response — never zero (SPEC.md §7)', async () => {
    // Regression guard: getDashboard() computes a nudge, but the route once
    // hand-picked response fields and dropped it, so the live dashboard
    // rendered no NudgeCard despite the "exactly one, never zero" invariant.
    // A household with zero members has four unmet checks → member_coverage.
    await createHousehold('user_a', 'Gupta Family')
    const res = await app.request('/api/dashboard', { headers: { authorization: 'Bearer user_a' } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as DashboardResponse
    expect(body.nudge).toBeDefined()
    expect(body.nudge?.checkId).toBe('member_coverage')
    expect(body.nudge?.learnCardSlug).toBe('portfolio')
  })

  it("user B never sees user A's dashboard data", async () => {
    await createHousehold('user_a', 'Gupta Family')
    await createHousehold('user_b', 'Sharma Family')
    const aMemberId = await createMember('user_a', 'Gaurav Gupta')
    await createHolding('user_a', aMemberId, 'instr-equity', '5000')

    const res = await app.request('/api/dashboard', { headers: { authorization: 'Bearer user_b' } })
    const body = (await res.json()) as DashboardResponse
    expect(body.allocation).toEqual([])
    expect(body.totalValue).toBe(0)
  })
})
