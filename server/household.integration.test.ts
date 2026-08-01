import { describe, it, expect, beforeEach, vi } from 'vitest'

process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_ZmFrZS5jbGVyay5hY2NvdW50cy5kZXYk'

// Fake token verification: treat the bearer token as the userId directly,
// instead of verifying a real Clerk-signed JWT, so the isolation tests below
// can drive two distinct "signed in" users through the real Hono app without
// hitting Clerk's JWKS endpoint.
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
  createdAt: Date
  updatedAt: Date
}

let rows: HouseholdRow[] = []

type Filter = [{ name?: string }, unknown]

function filtersOf(cond: { __eq?: Filter; __and?: Filter[] }): Array<[string | undefined, unknown]> {
  const raw: Filter[] = cond.__and ?? (cond.__eq ? [cond.__eq] : [])
  return raw.map(([col, value]) => [col?.name, value])
}

const COLUMN_TO_FIELD: Record<string, keyof HouseholdRow> = {
  id: 'id',
  owner_user_id: 'ownerUserId',
  version: 'version',
}

function matches(row: HouseholdRow, cond: { __eq?: Filter; __and?: Filter[] }): boolean {
  return filtersOf(cond).every(([column, value]) => {
    const field = column ? COLUMN_TO_FIELD[column] : undefined
    return field ? row[field] === value : true
  })
}

vi.mock('./lib/db.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (cond: { __eq?: Filter; __and?: Filter[] }) => {
          const found = rows.filter((r) => matches(r, cond))
          const result = Promise.resolve(found) as Promise<unknown[]> & { limit: (n: number) => Promise<unknown[]> }
          result.limit = (n: number) => Promise.resolve(found.slice(0, n))
          return result
        },
      }),
    }),
    insert: () => ({
      values: (row: Partial<HouseholdRow>) => ({
        returning: () => {
          if (row.ownerUserId === 'user_db_error') return Promise.reject(new Error('connection reset'))
          const created: HouseholdRow = {
            id: String(row.id),
            ownerUserId: String(row.ownerUserId),
            ciphertext: row.ciphertext ?? null,
            iv: row.iv ?? null,
            alg: row.alg ?? null,
            // The column default — the route never accepts a version.
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
          rows.push(created)
          return Promise.resolve([created])
        },
      }),
    }),
    update: () => ({
      set: (patch: Partial<HouseholdRow>) => ({
        // The real UPDATE carries `version = expectedVersion` in its WHERE, so
        // the fake has to honour every filter — otherwise a stale write would
        // "succeed" here and the 409 path would never be exercised.
        where: (cond: { __eq?: Filter; __and?: Filter[] }) => ({
          returning: () => {
            const idx = rows.findIndex((r) => matches(r, cond))
            if (idx === -1) return Promise.resolve([])
            rows[idx] = { ...rows[idx], ...patch }
            return Promise.resolve([rows[idx]])
          },
        }),
      }),
    }),
  },
}))

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    eq: (col: { name?: string }, value: unknown) => ({ __eq: [col, value] as Filter }),
    and: (...conds: Array<{ __eq: Filter }>) => ({ __and: conds.map((c) => c.__eq) }),
  }
})

const { app } = await import('./app.js')

const HOUSEHOLD_A = '11111111-1111-4111-8111-111111111111'
const HOUSEHOLD_B = '22222222-2222-4222-8222-222222222222'

const envelope = {
  ciphertext: 'Y2lwaGVydGV4dC1vbmU',
  iv: 'aXYtYnl0ZXMtMTIx',
  alg: 'AES-256-GCM',
}
const newEnvelope = {
  ciphertext: 'Y2lwaGVydGV4dC10d28',
  iv: 'aXYtYnl0ZXMtMTIy',
  alg: 'AES-256-GCM',
}

interface HouseholdResponse {
  household: {
    id: string
    ownerUserId: string
    ciphertext: string | null
    version: number
    name?: unknown
  } | null
}

function post(token: string, body: unknown) {
  return app.request('/api/household', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

function patch(token: string, body: unknown) {
  return app.request('/api/household', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

describe('household routes — two-user isolation', () => {
  beforeEach(() => {
    rows = []
  })

  it('rejects a request with no Authorization header', async () => {
    const res = await app.request('/api/household')
    expect(res.status).toBe(401)
  })

  it('rejects a request with a token that fails verification', async () => {
    const res = await app.request('/api/household', { headers: { authorization: 'Bearer invalid' } })
    expect(res.status).toBe(401)
  })

  it('creates a household scoped to the requesting user, storing only the envelope', async () => {
    const res = await post('user_a', { id: HOUSEHOLD_A, ...envelope })
    expect(res.status).toBe(201)

    const body = (await res.json()) as HouseholdResponse
    expect(body.household?.ownerUserId).toBe('user_a')
    expect(body.household?.id).toBe(HOUSEHOLD_A)
    expect(body.household?.ciphertext).toBe(envelope.ciphertext)
    expect(body.household?.version).toBe(1)
    expect(body.household).not.toHaveProperty('name')
  })

  it('rejects a plaintext household name outright — there is no schema that accepts one', async () => {
    const res = await post('user_a', { name: 'Gupta Family' })
    expect(res.status).toBe(400)
    expect(rows).toHaveLength(0)
  })

  it('rejects an envelope smuggling an extra plaintext field alongside it', async () => {
    const res = await post('user_a', { id: HOUSEHOLD_A, ...envelope, name: 'Gupta Family' })
    expect(res.status).toBe(400)
    expect(rows).toHaveLength(0)
  })

  it('rejects a non-base64url ciphertext with 400', async () => {
    const res = await post('user_a', { id: HOUSEHOLD_A, ...envelope, ciphertext: 'not base64url!!' })
    expect(res.status).toBe(400)
  })

  it('rejects a create with no row id', async () => {
    const res = await post('user_a', envelope)
    expect(res.status).toBe(400)
  })

  it('sets Cache-Control: no-store on every response', async () => {
    const created = await post('user_a', { id: HOUSEHOLD_A, ...envelope })
    expect(created.headers.get('cache-control')).toBe('no-store')

    const read = await app.request('/api/household', { headers: { authorization: 'Bearer user_a' } })
    expect(read.headers.get('cache-control')).toBe('no-store')

    const renamed = await patch('user_a', { ...newEnvelope, expectedVersion: 1 })
    expect(renamed.headers.get('cache-control')).toBe('no-store')

    const denied = await app.request('/api/household')
    expect(denied.headers.get('cache-control')).toBe('no-store')
  })

  it("a second user creating a household does not see or affect the first user's household", async () => {
    await post('user_a', { id: HOUSEHOLD_A, ...envelope })

    const userBGet = await app.request('/api/household', { headers: { authorization: 'Bearer user_b' } })
    expect(((await userBGet.json()) as HouseholdResponse).household).toBeNull()

    const userBPost = await post('user_b', { id: HOUSEHOLD_B, ...newEnvelope })
    const userBCreated = (await userBPost.json()) as HouseholdResponse
    expect(userBCreated.household?.ownerUserId).toBe('user_b')
    expect(userBCreated.household?.ciphertext).toBe(newEnvelope.ciphertext)

    const userAGet = await app.request('/api/household', { headers: { authorization: 'Bearer user_a' } })
    const userABody = (await userAGet.json()) as HouseholdResponse
    expect(userABody.household?.id).toBe(HOUSEHOLD_A)
    expect(userABody.household?.ciphertext).toBe(envelope.ciphertext)
  })

  it('surfaces a DB error as 500, not as a mislabeled 400', async () => {
    const res = await post('user_db_error', { id: HOUSEHOLD_A, ...envelope })
    expect(res.status).toBe(500)
  })

  it("updates the caller's household and bumps the version to expectedVersion + 1", async () => {
    await post('user_a', { id: HOUSEHOLD_A, ...envelope })

    const res = await patch('user_a', { ...newEnvelope, expectedVersion: 1 })
    expect(res.status).toBe(200)

    const body = (await res.json()) as HouseholdResponse
    expect(body.household?.ciphertext).toBe(newEnvelope.ciphertext)
    expect(body.household?.version).toBe(2)
  })

  it('answers 409 to a stale expectedVersion and leaves the stored row completely unchanged', async () => {
    await post('user_a', { id: HOUSEHOLD_A, ...envelope })
    await patch('user_a', { ...newEnvelope, expectedVersion: 1 })

    // A second device still believes the row is at version 1.
    const stale = await patch('user_a', {
      ciphertext: 'Y2lwaGVydGV4dC1zdGFsZQ',
      iv: 'aXYtYnl0ZXMtMTIz',
      alg: 'AES-256-GCM',
      expectedVersion: 1,
    })
    expect(stale.status).toBe(409)

    expect(rows[0].ciphertext).toBe(newEnvelope.ciphertext)
    expect(rows[0].version).toBe(2)
  })

  it('rejects an update with no expectedVersion', async () => {
    await post('user_a', { id: HOUSEHOLD_A, ...envelope })
    const res = await patch('user_a', newEnvelope)
    expect(res.status).toBe(400)
    expect(rows[0].ciphertext).toBe(envelope.ciphertext)
  })

  it('rejects a PATCH with 404 when the caller has no household yet', async () => {
    const res = await patch('user_no_household', { ...newEnvelope, expectedVersion: 1 })
    expect(res.status).toBe(404)
  })

  it("a PATCH by user B never affects user A's household", async () => {
    await post('user_a', { id: HOUSEHOLD_A, ...envelope })
    await post('user_b', { id: HOUSEHOLD_B, ...envelope })
    await patch('user_b', { ...newEnvelope, expectedVersion: 1 })

    const aCheck = await app.request('/api/household', { headers: { authorization: 'Bearer user_a' } })
    const aBody = (await aCheck.json()) as HouseholdResponse
    expect(aBody.household?.ciphertext).toBe(envelope.ciphertext)
    expect(aBody.household?.version).toBe(1)
  })
})
