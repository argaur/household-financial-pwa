import { describe, it, expect, beforeEach, vi } from 'vitest'

process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_ZmFrZS5jbGVyay5hY2NvdW50cy5kZXYk'

// Same fake-token pattern as holdings.integration.test.ts: the bearer token IS
// the userId, so two distinct "signed in" users can drive the real Hono app
// without a real Clerk-signed JWT.
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
}
interface ProtectionRow extends EnvelopeRow {
  householdId: string
  memberId: string
  createdAt: Date
  updatedAt: Date
  /** Legacy plaintext column, present on rows written before encryption. */
  coverAmount?: string | null
}

let households: HouseholdRow[] = []
let members: MemberRow[] = []
let protectionRows: ProtectionRow[] = []

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

const PROTECTION_FIELDS = { id: 'id', household_id: 'householdId', version: 'version' }

vi.mock('./lib/db.js', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (cond: { __eq?: Filter; __and?: Filter[] }) => {
          function all(): unknown[] {
            if (table === householdsTableRef) return households.filter(matcher(cond, { owner_user_id: 'ownerUserId' }))
            if (table === familyMembersTableRef)
              return members.filter(matcher(cond, { id: 'id', household_id: 'householdId' }))
            if (table === protectionTableRef) return protectionRows.filter(matcher(cond, PROTECTION_FIELDS))
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
          const envelopeOf = (r: Record<string, unknown>) => ({
            id: String(r.id),
            ciphertext: (r.ciphertext as string) ?? null,
            iv: (r.iv as string) ?? null,
            alg: (r.alg as string) ?? null,
            version: 1,
          })
          if (table === householdsTableRef) {
            const created: HouseholdRow = { ...envelopeOf(row), ownerUserId: String(row.ownerUserId) }
            households.push(created)
            return Promise.resolve([created])
          }
          if (table === familyMembersTableRef) {
            const created: MemberRow = { ...envelopeOf(row), householdId: String(row.householdId) }
            members.push(created)
            return Promise.resolve([created])
          }
          const created: ProtectionRow = {
            ...envelopeOf(row),
            householdId: String(row.householdId),
            memberId: String(row.memberId),
            createdAt: new Date(),
            updatedAt: new Date(),
          }
          protectionRows.push(created)
          return Promise.resolve([created])
        },
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        // Every filter is honoured, including `version = expectedVersion`.
        where: (cond: { __eq?: Filter; __and?: Filter[] }) => ({
          returning: () => {
            const idx = protectionRows.findIndex(matcher(cond, PROTECTION_FIELDS))
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
    eq: (col: { name?: string }, value: unknown) => ({ __eq: [col, value] as Filter }),
    and: (...conds: Array<{ __eq: Filter }>) => ({ __and: conds.map((c) => c.__eq) }),
  }
})

const schema = await import('../drizzle/schema.js')
const householdsTableRef = schema.households
const familyMembersTableRef = schema.familyMembers
const protectionTableRef = schema.protection

const { app } = await import('./app.js')

const HOUSEHOLD_A = '11111111-1111-4111-8111-111111111111'
const HOUSEHOLD_B = '22222222-2222-4222-8222-222222222222'
const MEMBER_A = 'aaaaaaaa-1111-4111-8111-111111111111'
const MEMBER_B = 'bbbbbbbb-2222-4222-8222-222222222222'
const PROTECTION_1 = 'cccccccc-3333-4333-8333-333333333333'
const PROTECTION_2 = 'dddddddd-4444-4444-8444-444444444444'

const envelope = { ciphertext: 'Y2lwaGVydGV4dC1vbmU', iv: 'aXYtYnl0ZXMtMTIx', alg: 'AES-256-GCM' }
const newEnvelope = { ciphertext: 'Y2lwaGVydGV4dC10d28', iv: 'aXYtYnl0ZXMtMTIy', alg: 'AES-256-GCM' }

interface ProtectionResponse {
  protection?: {
    id: string
    householdId: string
    memberId: string
    ciphertext: string | null
    version: number
    coverAmount?: unknown
    type?: unknown
  }
  error?: string
}
interface ProtectionListResponse {
  protection: Array<{ id: string; ciphertext: string | null; coverAmount?: unknown }>
}

function authed(token: string, method: string, body?: unknown, query = '') {
  return app.request(`/api/protection${query}`, {
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

describe('protection routes', () => {
  beforeEach(() => {
    households = []
    members = []
    protectionRows = []
  })

  it('rejects a request with no Authorization header', async () => {
    const res = await app.request('/api/protection')
    expect(res.status).toBe(401)
  })

  it('returns an empty list for a user with no household yet', async () => {
    const res = await app.request('/api/protection', { headers: { authorization: 'Bearer user_no_household' } })
    expect(res.status).toBe(200)
    expect(((await res.json()) as ProtectionListResponse).protection).toEqual([])
  })

  it('returns 404 when creating a protection record before a household exists', async () => {
    const res = await authed('user_no_household', 'POST', { id: PROTECTION_1, memberId: MEMBER_A, ...envelope })
    expect(res.status).toBe(404)
  })

  it('stores an opaque protection record scoped to the household', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)

    const res = await authed('user_a', 'POST', { id: PROTECTION_1, memberId: MEMBER_A, ...envelope })
    expect(res.status).toBe(201)

    const body = (await res.json()) as ProtectionResponse
    expect(body.protection?.householdId).toBe(HOUSEHOLD_A)
    expect(body.protection?.ciphertext).toBe(envelope.ciphertext)
    expect(body.protection?.version).toBe(1)
    expect(body.protection).not.toHaveProperty('coverAmount')
    expect(body.protection).not.toHaveProperty('type')
  })

  it('rejects a plaintext protection body — no schema on this route accepts a cover amount', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)

    const res = await authed('user_a', 'POST', {
      memberId: MEMBER_A,
      type: 'term-life',
      coverAmount: '5000000',
      status: 'active',
    })
    expect(res.status).toBe(400)
    expect(protectionRows).toHaveLength(0)
  })

  it('rejects an envelope smuggling an extra plaintext field alongside it', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)

    const res = await authed('user_a', 'POST', {
      id: PROTECTION_1,
      memberId: MEMBER_A,
      ...envelope,
      coverAmount: '5000000',
    })
    expect(res.status).toBe(400)
    expect(protectionRows).toHaveLength(0)
  })

  it('rejects a protection record referencing a member from a different household', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    await createMember('user_b', MEMBER_B)

    const res = await authed('user_a', 'POST', { id: PROTECTION_1, memberId: MEMBER_B, ...envelope })
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

    const created = await authed('user_a', 'POST', { id: PROTECTION_1, memberId: MEMBER_A, ...envelope })
    expect(created.headers.get('cache-control')).toBe('no-store')

    const list = await app.request('/api/protection', { headers: { authorization: 'Bearer user_a' } })
    expect(list.headers.get('cache-control')).toBe('no-store')

    const updated = await authed('user_a', 'PATCH', { ...newEnvelope, expectedVersion: 1 }, `?id=${PROTECTION_1}`)
    expect(updated.headers.get('cache-control')).toBe('no-store')

    const denied = await app.request('/api/protection')
    expect(denied.headers.get('cache-control')).toBe('no-store')
  })

  it('updates via ?id= query param (not a path segment) and bumps to expectedVersion + 1', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)
    await authed('user_a', 'POST', { id: PROTECTION_1, memberId: MEMBER_A, ...envelope })

    const res = await authed('user_a', 'PATCH', { ...newEnvelope, expectedVersion: 1 }, `?id=${PROTECTION_1}`)
    expect(res.status).toBe(200)

    const body = (await res.json()) as ProtectionResponse
    expect(body.protection?.ciphertext).toBe(newEnvelope.ciphertext)
    expect(body.protection?.version).toBe(2)
  })

  it('answers 409 to a stale expectedVersion and leaves the stored row completely unchanged', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)
    await authed('user_a', 'POST', { id: PROTECTION_1, memberId: MEMBER_A, ...envelope })
    await authed('user_a', 'PATCH', { ...newEnvelope, expectedVersion: 1 }, `?id=${PROTECTION_1}`)

    const stale = await authed(
      'user_a',
      'PATCH',
      { ciphertext: 'Y2lwaGVydGV4dC1zdGFsZQ', iv: 'aXYtYnl0ZXMtMTIz', alg: 'AES-256-GCM', expectedVersion: 1 },
      `?id=${PROTECTION_1}`,
    )
    expect(stale.status).toBe(409)

    const stored = protectionRows.find((p) => p.id === PROTECTION_1)!
    expect(stored.ciphertext).toBe(newEnvelope.ciphertext)
    expect(stored.version).toBe(2)
  })

  it("user B can never update user A's protection record", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    await createMember('user_a', MEMBER_A)
    await authed('user_a', 'POST', { id: PROTECTION_1, memberId: MEMBER_A, ...envelope })

    const res = await authed('user_b', 'PATCH', { ...newEnvelope, expectedVersion: 1 }, `?id=${PROTECTION_1}`)
    expect(res.status).toBe(404)
    expect(protectionRows[0].ciphertext).toBe(envelope.ciphertext)
  })

  it("user B never sees user A's protection records in a list", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    await createMember('user_a', MEMBER_A)
    await authed('user_a', 'POST', { id: PROTECTION_1, memberId: MEMBER_A, ...envelope })

    const bList = await app.request('/api/protection', { headers: { authorization: 'Bearer user_b' } })
    expect(((await bList.json()) as ProtectionListResponse).protection).toEqual([])
  })

  it('serves a legacy row as a null envelope rather than leaking its plaintext columns', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    protectionRows.push({
      id: PROTECTION_2,
      householdId: HOUSEHOLD_A,
      memberId: MEMBER_A,
      ciphertext: null,
      iv: null,
      alg: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      coverAmount: '5000000',
    })

    const res = await app.request('/api/protection', { headers: { authorization: 'Bearer user_a' } })
    const body = (await res.json()) as ProtectionListResponse
    expect(body.protection).toHaveLength(1)
    expect(body.protection[0].ciphertext).toBeNull()
    expect(JSON.stringify(body)).not.toContain('5000000')
  })
})
