import { describe, it, expect, beforeEach, vi } from 'vitest'

process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_ZmFrZS5jbGVyay5hY2NvdW50cy5kZXYk'

// Fake token verification: treat the bearer token as the userId directly,
// instead of verifying a real Clerk-signed JWT, so the isolation test below
// can drive two distinct "signed in" users through the real Hono app without
// hitting Clerk's JWKS endpoint.
vi.mock('jose', () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: async (token: string) => {
    if (token === 'invalid') throw new Error('signature verification failed')
    return { payload: { sub: token } }
  },
}))

// In-memory household store standing in for Neon — keyed by ownerUserId, same
// shape household.ts expects from a real drizzle db (select/insert chain).
let rows: Array<{ id: string; ownerUserId: string; name: string; createdAt: Date; updatedAt: Date }> = []

vi.mock('./lib/db.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (cond: { ownerUserId?: string }) => ({
          // drizzle's eq() builder isn't reproduced here; household.ts always
          // filters by a single ownerUserId equality, so a plain scan suffices.
          limit: () => Promise.resolve(rows.filter((r) => matchesOwner(cond, r.ownerUserId))),
        }),
      }),
    }),
    insert: () => ({
      values: (row: { ownerUserId: string; name: string }) => ({
        returning: () => {
          if (row.ownerUserId === 'user_db_error') return Promise.reject(new Error('connection reset'))
          const created = { id: `id-${rows.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...row }
          rows.push(created)
          return Promise.resolve([created])
        },
      }),
    }),
    update: () => ({
      set: (patch: { name?: string }) => ({
        where: (cond: { __idFilter?: string }) => ({
          returning: () => {
            const idx = rows.findIndex((r) => r.id === (cond.__idFilter ?? lastIdFilter))
            if (idx === -1) return Promise.resolve([])
            rows[idx] = { ...rows[idx], ...patch }
            return Promise.resolve([rows[idx]])
          },
        }),
      }),
    }),
  },
}))

// updateHouseholdName filters by households.id (not ownerUserId) — capture
// that separately from the ownerFilter side channel below, which only
// tracks the last eq() call regardless of which column it was against.
let lastIdFilter: string | undefined

// drizzle's eq(households.ownerUserId, userId) produces an opaque SQL object
// in real code; the mocked `where` above receives whatever household.ts
// passes, so we capture the intended owner via a side channel instead.
let ownerFilter: string | undefined
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    eq: (col: { name?: string }, value: string) => {
      if (col?.name === 'id') lastIdFilter = value
      else ownerFilter = value
      return { __ownerFilter: value, __idFilter: value }
    },
  }
})

function matchesOwner(_cond: unknown, ownerUserId: string): boolean {
  return ownerFilter === ownerUserId
}

const { app } = await import('./app.js')

interface HouseholdResponse {
  household: { id: string; ownerUserId: string; name: string } | null
}

describe('household routes — two-user isolation', () => {
  beforeEach(() => {
    rows = []
    ownerFilter = undefined
    lastIdFilter = undefined
  })

  it('rejects a request with no Authorization header', async () => {
    const res = await app.request('/api/household')
    expect(res.status).toBe(401)
  })

  it('rejects a request with a token that fails verification', async () => {
    const res = await app.request('/api/household', { headers: { authorization: 'Bearer invalid' } })
    expect(res.status).toBe(401)
  })

  it('creates a household scoped to the requesting user', async () => {
    const res = await app.request('/api/household', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ name: 'Gupta Family' }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as HouseholdResponse
    expect(body.household?.ownerUserId).toBe('user_a')
  })

  it('a second user creating a household does not see or affect the first user\'s household', async () => {
    await app.request('/api/household', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ name: 'Gupta Family' }),
    })

    const userBGet = await app.request('/api/household', { headers: { authorization: 'Bearer user_b' } })
    const userBBody = (await userBGet.json()) as HouseholdResponse
    expect(userBBody.household).toBeNull()

    const userBPost = await app.request('/api/household', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_b' },
      body: JSON.stringify({ name: 'Sharma Family' }),
    })
    const userBCreated = (await userBPost.json()) as HouseholdResponse
    expect(userBCreated.household?.ownerUserId).toBe('user_b')
    expect(userBCreated.household?.name).toBe('Sharma Family')

    const userAGet = await app.request('/api/household', { headers: { authorization: 'Bearer user_a' } })
    const userABody = (await userAGet.json()) as HouseholdResponse
    expect(userABody.household?.name).toBe('Gupta Family')
  })

  it('rejects a malformed request body', async () => {
    const res = await app.request('/api/household', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ notName: 'oops' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects a whitespace-only name with 400 (name-validation failure)', async () => {
    const res = await app.request('/api/household', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ name: '   ' }),
    })
    expect(res.status).toBe(400)
  })

  it('surfaces a DB error as 500, not as a mislabeled 400 invalid_name', async () => {
    const res = await app.request('/api/household', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_db_error' },
      body: JSON.stringify({ name: 'Gupta Family' }),
    })
    expect(res.status).toBe(500)
  })

  it('renames the caller\'s household via PATCH', async () => {
    await app.request('/api/household', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ name: 'Gupta Family' }),
    })

    const res = await app.request('/api/household', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ name: 'Gupta-Sharma Family' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as HouseholdResponse
    expect(body.household?.name).toBe('Gupta-Sharma Family')
  })

  it('rejects a PATCH rename with 404 when the caller has no household yet', async () => {
    const res = await app.request('/api/household', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_no_household' },
      body: JSON.stringify({ name: 'New Name' }),
    })
    expect(res.status).toBe(404)
  })

  it('rejects a blank-name PATCH with 400', async () => {
    await app.request('/api/household', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ name: 'Gupta Family' }),
    })
    const res = await app.request('/api/household', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ name: '   ' }),
    })
    expect(res.status).toBe(400)
  })

  it("a PATCH rename by user B never affects user A's household", async () => {
    await app.request('/api/household', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: JSON.stringify({ name: 'Gupta Family' }),
    })
    await app.request('/api/household', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_b' },
      body: JSON.stringify({ name: 'Sharma Family' }),
    })
    await app.request('/api/household', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_b' },
      body: JSON.stringify({ name: 'Sharma-Verma Family' }),
    })

    const aCheck = await app.request('/api/household', { headers: { authorization: 'Bearer user_a' } })
    const aBody = (await aCheck.json()) as HouseholdResponse
    expect(aBody.household?.name).toBe('Gupta Family')
  })
})
