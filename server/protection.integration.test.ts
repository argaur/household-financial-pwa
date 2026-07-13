import { describe, it, expect, beforeEach, vi } from 'vitest'

process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_ZmFrZS5jbGVyay5hY2NvdW50cy5kZXYk'

// Same fake-token pattern as holdings.integration.test.ts: the bearer token
// IS the userId, so two distinct "signed in" users can drive the real Hono
// app without a real Clerk-signed JWT.
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
}
interface ProtectionRow {
  id: string
  householdId: string
  memberId: string
  type: string
  coverAmount: string
  premium: string | null
  provider: string | null
  status: string
}

let households: HouseholdRow[] = []
let members: MemberRow[] = []
let protectionRows: ProtectionRow[] = []
let nextProtectionId = 1

vi.mock('./lib/db.js', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (cond: { __eq?: [{ name?: string }, string]; __and?: Array<[{ name?: string }, string]> }) => {
          // Normalize a single eq() or an and(eq(), eq(), ...) into a flat
          // list of [columnName, value] filters, applied generically below —
          // mirrors real drizzle's `and`/`eq` composition closely enough.
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
            const created: MemberRow = { id: `m-${members.length + 1}`, householdId: row.householdId as string, name: row.name as string }
            members.push(created)
            return Promise.resolve([created])
          }
          const created: ProtectionRow = {
            id: `prot-${nextProtectionId++}`,
            householdId: row.householdId as string,
            memberId: row.memberId as string,
            type: row.type as string,
            coverAmount: row.coverAmount as string,
            premium: (row.premium as string) ?? null,
            provider: (row.provider as string) ?? null,
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
          returning: () => {
            const both = cond.__and ?? []
            const idFilter = both.find(([col]) => col.name === 'id')?.[1]
            const idx = protectionRows.findIndex((p) => p.id === idFilter)
            if (idx === -1) return Promise.resolve([])
            protectionRows[idx] = { ...protectionRows[idx], ...(patch as Partial<ProtectionRow>) }
            return Promise.resolve([protectionRows[idx]])
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
    eq: (col: { name?: string }, value: string) => ({ __eq: [col, value] as [{ name?: string }, string] }),
    and: (...conds: Array<{ __eq: [{ name?: string }, string] }>) => ({ __and: conds.map((c) => c.__eq) }),
  }
})

const schema = await import('../drizzle/schema.js')
const householdsTableRef = schema.households
const familyMembersTableRef = schema.familyMembers
const protectionTableRef = schema.protection

const { app } = await import('./app.js')

interface HouseholdResponse {
  household: { id: string } | null
}
interface MemberResponse {
  member: { id: string }
}
interface ProtectionResponse {
  protection?: { id: string; householdId: string; memberId: string; type: string }
  error?: string
}
interface ProtectionListResponse {
  protection: Array<{ id: string }>
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

async function createMember(token: string, name: string) {
  const res = await app.request('/api/family-members', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, relationship: 'self', dateOfBirth: '1990-01-01' }),
  })
  const body = (await res.json()) as MemberResponse
  return body.member.id
}

describe('protection routes', () => {
  beforeEach(() => {
    households = []
    members = []
    protectionRows = []
    nextProtectionId = 1
  })

  it('rejects a request with no Authorization header', async () => {
    const res = await app.request('/api/protection')
    expect(res.status).toBe(401)
  })

  it('returns an empty list for a user with no household yet', async () => {
    const res = await app.request('/api/protection', { headers: { authorization: 'Bearer user_no_household' } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as ProtectionListResponse
    expect(body.protection).toEqual([])
  })

  it('returns 404 when creating a protection record before a household exists', async () => {
    const res = await app.request('/api/protection', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_no_household' },
      body: JSON.stringify({ memberId: 'm-1', type: 'term-life', coverAmount: '5000000', status: 'active' }),
    })
    expect(res.status).toBe(404)
  })

  it('creates a protection record scoped to the household', async () => {
    await createHousehold('user_a', 'Gupta Family')
    const memberId = await createMember('user_a', 'Gaurav Gupta')

    const res = await app.request('/api/protection', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ memberId, type: 'term-life', coverAmount: '5000000', status: 'active' }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as ProtectionResponse
    expect(body.protection?.type).toBe('term-life')
    expect(body.protection?.householdId).toBe('h-1')
  })

  it('rejects a protection record referencing a member from a different household', async () => {
    await createHousehold('user_a', 'Gupta Family')
    await createHousehold('user_b', 'Sharma Family')
    const bMemberId = await createMember('user_b', 'Priya Sharma')

    const res = await app.request('/api/protection', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ memberId: bMemberId, type: 'term-life', coverAmount: '1000', status: 'active' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects a malformed request body with 400', async () => {
    await createHousehold('user_a', 'Gupta Family')
    const res = await app.request('/api/protection', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ notAField: true }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects an invalid type or status enum with 400', async () => {
    await createHousehold('user_a', 'Gupta Family')
    const memberId = await createMember('user_a', 'Gaurav Gupta')
    const res = await app.request('/api/protection', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ memberId, type: 'car', coverAmount: '1000', status: 'active' }),
    })
    expect(res.status).toBe(400)
  })

  it('updates a protection record via ?id= query param (not a path segment)', async () => {
    await createHousehold('user_a', 'Gupta Family')
    const memberId = await createMember('user_a', 'Gaurav Gupta')
    const createRes = await app.request('/api/protection', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ memberId, type: 'term-life', coverAmount: '5000000', status: 'active' }),
    })
    const created = ((await createRes.json()) as ProtectionResponse).protection!

    const updateRes = await app.request(`/api/protection?id=${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ memberId, type: 'health', coverAmount: '1000000', status: 'active' }),
    })
    expect(updateRes.status).toBe(200)
    const updated = ((await updateRes.json()) as ProtectionResponse).protection!
    expect(updated.type).toBe('health')
  })

  it("user B can never update user A's protection record", async () => {
    await createHousehold('user_a', 'Gupta Family')
    await createHousehold('user_b', 'Sharma Family')
    const aMemberId = await createMember('user_a', 'Gaurav Gupta')
    const bMemberId = await createMember('user_b', 'Priya Sharma')

    const createRes = await app.request('/api/protection', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ memberId: aMemberId, type: 'term-life', coverAmount: '5000000', status: 'active' }),
    })
    const created = ((await createRes.json()) as ProtectionResponse).protection!

    const updateRes = await app.request(`/api/protection?id=${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_b' },
      body: JSON.stringify({ memberId: bMemberId, type: 'health', coverAmount: '1', status: 'active' }),
    })
    expect(updateRes.status).toBe(404)
  })

  it("user B never sees user A's protection records in a list", async () => {
    await createHousehold('user_a', 'Gupta Family')
    await createHousehold('user_b', 'Sharma Family')
    const aMemberId = await createMember('user_a', 'Gaurav Gupta')

    await app.request('/api/protection', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ memberId: aMemberId, type: 'term-life', coverAmount: '5000000', status: 'active' }),
    })

    const bList = await app.request('/api/protection', { headers: { authorization: 'Bearer user_b' } })
    const bBody = (await bList.json()) as ProtectionListResponse
    expect(bBody.protection).toEqual([])
  })
})
