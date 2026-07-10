import { describe, it, expect, beforeEach, vi } from 'vitest'

process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_ZmFrZS5jbGVyay5hY2NvdW50cy5kZXYk'

// Fake token verification: treat the bearer token as the userId directly,
// instead of verifying a real Clerk-signed JWT, so the isolation test below
// can drive two distinct "signed in" users through the real Hono app without
// hitting Clerk's JWKS endpoint. Same pattern as household.integration.test.ts.
vi.mock('jose', () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: async (token: string) => {
    if (token === 'invalid') throw new Error('signature verification failed')
    return { payload: { sub: token } }
  },
}))

// In-memory households + family_members store standing in for Neon — keyed
// loosely, same shape household.ts/family-members.ts expect from a real
// drizzle db (select/insert/where chain).
interface HouseholdRow {
  id: string
  ownerUserId: string
  name: string
  createdAt: Date
  updatedAt: Date
}
interface MemberRow {
  id: string
  householdId: string
  name: string
  relationship: string
  dateOfBirth: string
  riskProfile?: string
  createdAt: Date
  updatedAt: Date
}

let households: HouseholdRow[] = []
let members: MemberRow[] = []

// Side channel: the mocked drizzle-orm eq() below records which column/value
// pair each query intends to filter by, since we don't reproduce drizzle's
// real query builder here.
let lastEqColumnKey: string | undefined
let lastEqValue: string | undefined

vi.mock('./lib/db.js', () => ({
  db: {
    select: () => ({
      from: (table: { _tableName?: string }) => ({
        where: (_cond: unknown) => {
          // household lookups end in .limit(1); family-member lookups don't.
          const isHouseholdTable = table === householdsTableRef
          if (isHouseholdTable) {
            return {
              limit: () =>
                Promise.resolve(households.filter((h) => lastEqColumnKey === 'ownerUserId' && h.ownerUserId === lastEqValue)),
            }
          }
          return Promise.resolve(members.filter((m) => lastEqColumnKey === 'householdId' && m.householdId === lastEqValue))
        },
      }),
    }),
    insert: (table: { _tableName?: string }) => ({
      values: (row: Record<string, unknown>) => ({
        returning: () => {
          if (table === householdsTableRef) {
            if (row.ownerUserId === 'user_db_error') return Promise.reject(new Error('connection reset'))
            const created: HouseholdRow = {
              id: `h-${households.length + 1}`,
              createdAt: new Date(),
              updatedAt: new Date(),
              ownerUserId: row.ownerUserId as string,
              name: row.name as string,
            }
            households.push(created)
            return Promise.resolve([created])
          }
          const created: MemberRow = {
            id: `m-${members.length + 1}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            householdId: row.householdId as string,
            name: row.name as string,
            relationship: row.relationship as string,
            dateOfBirth: row.dateOfBirth as string,
            riskProfile: row.riskProfile as string | undefined,
          }
          members.push(created)
          return Promise.resolve([created])
        },
      }),
    }),
  },
}))

// A stable reference to distinguish which table a query targets, since the
// mocked db above receives whatever household.ts/family-members.ts pass as
// `from(table)` / `insert(table)`.
let householdsTableRef: unknown

vi.mock('../drizzle/schema.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../drizzle/schema.js')>()
  return actual
})

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    eq: (col: { name?: string }, value: string) => {
      lastEqColumnKey = col?.name === 'owner_user_id' ? 'ownerUserId' : col?.name === 'household_id' ? 'householdId' : undefined
      lastEqValue = value
      return { __eq: [col, value] }
    },
  }
})

const schema = await import('../drizzle/schema.js')
householdsTableRef = schema.households

const { app } = await import('./app.js')

interface HouseholdResponse {
  household: { id: string; ownerUserId: string; name: string } | null
}
interface MembersListResponse {
  members: Array<{ id: string; householdId: string; name: string }>
}
interface MemberCreateResponse {
  member?: { id: string; householdId: string; name: string }
  error?: string
}

async function createHousehold(token: string, name: string) {
  const res = await app.request('/api/household', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  })
  const body = (await res.json()) as HouseholdResponse
  return body.household
}

describe('family-members routes — two-user isolation', () => {
  beforeEach(() => {
    households = []
    members = []
    lastEqColumnKey = undefined
    lastEqValue = undefined
  })

  it('rejects a request with no Authorization header', async () => {
    const res = await app.request('/api/family-members')
    expect(res.status).toBe(401)
  })

  it('rejects a request with a token that fails verification', async () => {
    const res = await app.request('/api/family-members', { headers: { authorization: 'Bearer invalid' } })
    expect(res.status).toBe(401)
  })

  it('returns an empty member list for a user with no household yet', async () => {
    const res = await app.request('/api/family-members', { headers: { authorization: 'Bearer user_no_household' } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as MembersListResponse
    expect(body.members).toEqual([])
  })

  it('returns 404 when creating a member before a household exists', async () => {
    const res = await app.request('/api/family-members', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_no_household' },
      body: JSON.stringify({ name: 'Gaurav Gupta', relationship: 'self', dateOfBirth: '1990-01-01' }),
    })
    expect(res.status).toBe(404)
  })

  it('creates a member scoped to the caller\'s household', async () => {
    await createHousehold('user_a', 'Gupta Family')
    const res = await app.request('/api/family-members', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ name: 'Gaurav Gupta', relationship: 'self', dateOfBirth: '1990-01-01' }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as MemberCreateResponse
    expect(body.member?.name).toBe('Gaurav Gupta')
    expect(body.member?.householdId).toBe('h-1')
  })

  it('rejects an invalid relationship value with 400', async () => {
    await createHousehold('user_a', 'Gupta Family')
    const res = await app.request('/api/family-members', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ name: 'Gaurav Gupta', relationship: 'sibling', dateOfBirth: '1990-01-01' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects a malformed request body with 400', async () => {
    await createHousehold('user_a', 'Gupta Family')
    const res = await app.request('/api/family-members', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ notName: 'oops' }),
    })
    expect(res.status).toBe(400)
  })

  it("user B never sees user A's family members, and creating a member for B never affects A", async () => {
    await createHousehold('user_a', 'Gupta Family')
    await createHousehold('user_b', 'Sharma Family')

    await app.request('/api/family-members', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ name: 'Gaurav Gupta', relationship: 'self', dateOfBirth: '1990-01-01' }),
    })

    const bList = await app.request('/api/family-members', { headers: { authorization: 'Bearer user_b' } })
    const bBody = (await bList.json()) as MembersListResponse
    expect(bBody.members).toEqual([])

    const bCreate = await app.request('/api/family-members', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_b' },
      body: JSON.stringify({ name: 'Priya Sharma', relationship: 'self', dateOfBirth: '1992-05-05' }),
    })
    const bCreateBody = (await bCreate.json()) as MemberCreateResponse
    expect(bCreateBody.member?.name).toBe('Priya Sharma')

    const aList = await app.request('/api/family-members', { headers: { authorization: 'Bearer user_a' } })
    const aBody = (await aList.json()) as MembersListResponse
    expect(aBody.members).toHaveLength(1)
    expect(aBody.members[0].name).toBe('Gaurav Gupta')
  })
})
