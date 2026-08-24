import { describe, it, expect, beforeEach, vi } from 'vitest'

process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_ZmFrZS5jbGVyay5hY2NvdW50cy5kZXYk'

// Fake token verification: treat the bearer token as the userId directly,
// instead of verifying a real Clerk-signed JWT, so the isolation tests below
// can drive two distinct "signed in" users through the real Hono app without
// hitting Clerk's JWKS endpoint. Same pattern as household.integration.test.ts.
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
  /** Legacy plaintext column, present on rows written before encryption. */
  name?: string | null
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
let ledgerRows: LedgerRow[] = []
let ledgerCounter = 0

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

const MEMBER_FIELDS = { id: 'id', household_id: 'householdId', version: 'version' }
const LEDGER_FIELDS = { household_id: 'householdId', is_baseline: 'isBaseline', id: 'id' }

vi.mock('./lib/db.js', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (cond: { __eq?: Filter; __and?: Filter[] }) => {
          function all(): unknown[] {
            if (table === householdsTableRef) return households.filter(matcher(cond, { owner_user_id: 'ownerUserId' }))
            if (table === familyMembersTableRef) return members.filter(matcher(cond, MEMBER_FIELDS))
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
          const envelope = {
            id: String(row.id),
            ciphertext: (row.ciphertext as string) ?? null,
            iv: (row.iv as string) ?? null,
            alg: (row.alg as string) ?? null,
            // The column default — the route never accepts a version.
            version: 1,
          }
          if (table === householdsTableRef) {
            const created: HouseholdRow = { ...envelope, ownerUserId: String(row.ownerUserId) }
            households.push(created)
            return Promise.resolve([created])
          }
          if (table === familyMembersTableRef) {
            const created: MemberRow = {
              ...envelope,
              householdId: String(row.householdId),
              createdAt: new Date(),
              updatedAt: new Date(),
            }
            members.push(created)
            return Promise.resolve([created])
          }
          throw new Error('fake db: unhandled table in insert()')
        },
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        // Every filter is honoured, including `version = expectedVersion`.
        where: (cond: { __eq?: Filter; __and?: Filter[] }) => ({
          returning: () => {
            const idx = members.findIndex(matcher(cond, MEMBER_FIELDS))
            if (idx === -1) return Promise.resolve([])
            members[idx] = { ...members[idx], ...(patch as Partial<MemberRow>) }
            return Promise.resolve([members[idx]])
          },
        }),
      }),
    }),
    delete: () => ({
      where: (cond: { __eq?: Filter; __and?: Filter[] }) => {
        const match = matcher(cond, MEMBER_FIELDS)
        members = members.filter((m) => !match(m))
        return Promise.resolve([])
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
const ledgersTableRef = schema.ledgers

const { app } = await import('./app.js')

const HOUSEHOLD_A = '11111111-1111-4111-8111-111111111111'
const HOUSEHOLD_B = '22222222-2222-4222-8222-222222222222'
const MEMBER_A = 'aaaaaaaa-1111-4111-8111-111111111111'
const MEMBER_B = 'bbbbbbbb-2222-4222-8222-222222222222'
const MEMBER_LEGACY = 'eeeeeeee-5555-4555-8555-555555555555'

const envelope = { ciphertext: 'Y2lwaGVydGV4dC1vbmU', iv: 'aXYtYnl0ZXMtMTIx', alg: 'AES-256-GCM' }
const newEnvelope = { ciphertext: 'Y2lwaGVydGV4dC10d28', iv: 'aXYtYnl0ZXMtMTIy', alg: 'AES-256-GCM' }

interface MemberResponse {
  member?: { id: string; householdId: string; ciphertext: string | null; version: number; name?: unknown }
  error?: string
}
interface MembersListResponse {
  members: Array<{ id: string; ciphertext: string | null; name?: unknown }>
}

function authed(token: string, method: string, body?: unknown, query = '') {
  return app.request(`/api/family-members${query}`, {
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

describe('family-members routes — two-user isolation', () => {
  beforeEach(() => {
    households = []
    members = []
    ledgerRows = []
    ledgerCounter = 0
  })

  it('rejects a request with no Authorization header', async () => {
    const res = await app.request('/api/family-members')
    expect(res.status).toBe(401)
  })

  it('returns an empty list for a user with no household yet', async () => {
    const res = await app.request('/api/family-members', { headers: { authorization: 'Bearer user_no_household' } })
    expect(res.status).toBe(200)
    expect(((await res.json()) as MembersListResponse).members).toEqual([])
  })

  it('returns 404 when creating a member before a household exists', async () => {
    const res = await authed('user_no_household', 'POST', { id: MEMBER_A, ...envelope })
    expect(res.status).toBe(404)
  })

  it("stores an opaque member scoped to the caller's household", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)

    const res = await authed('user_a', 'POST', { id: MEMBER_A, ...envelope })
    expect(res.status).toBe(201)

    const body = (await res.json()) as MemberResponse
    expect(body.member?.householdId).toBe(HOUSEHOLD_A)
    expect(body.member?.ciphertext).toBe(envelope.ciphertext)
    expect(body.member?.version).toBe(1)
    expect(body.member).not.toHaveProperty('name')
    expect(body.member).not.toHaveProperty('dateOfBirth')
  })

  it('rejects a plaintext member body — no schema on this route accepts a name or a date of birth', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const res = await authed('user_a', 'POST', {
      name: 'Ananya Verma',
      relationship: 'self',
      dateOfBirth: '1990-01-01',
    })
    expect(res.status).toBe(400)
    expect(members).toHaveLength(0)
  })

  it('rejects an envelope smuggling an extra plaintext field alongside it', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const res = await authed('user_a', 'POST', { id: MEMBER_A, ...envelope, name: 'Ananya Verma' })
    expect(res.status).toBe(400)
    expect(members).toHaveLength(0)
  })

  it('rejects a malformed request body with 400', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const res = await authed('user_a', 'POST', { notAField: true })
    expect(res.status).toBe(400)
  })

  it('sets Cache-Control: no-store on every response', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)

    const created = await authed('user_a', 'POST', { id: MEMBER_A, ...envelope })
    expect(created.headers.get('cache-control')).toBe('no-store')

    const list = await app.request('/api/family-members', { headers: { authorization: 'Bearer user_a' } })
    expect(list.headers.get('cache-control')).toBe('no-store')

    const updated = await authed('user_a', 'PATCH', { ...newEnvelope, expectedVersion: 1 }, `?id=${MEMBER_A}`)
    expect(updated.headers.get('cache-control')).toBe('no-store')

    const denied = await app.request('/api/family-members')
    expect(denied.headers.get('cache-control')).toBe('no-store')
  })

  it("user B never sees user A's family members, and creating a member for B never affects A", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    await authed('user_a', 'POST', { id: MEMBER_A, ...envelope })
    await authed('user_b', 'POST', { id: MEMBER_B, ...newEnvelope })

    const aList = await app.request('/api/family-members', { headers: { authorization: 'Bearer user_a' } })
    const aBody = (await aList.json()) as MembersListResponse
    expect(aBody.members.map((m) => m.id)).toEqual([MEMBER_A])

    const bList = await app.request('/api/family-members', { headers: { authorization: 'Bearer user_b' } })
    const bBody = (await bList.json()) as MembersListResponse
    expect(bBody.members.map((m) => m.id)).toEqual([MEMBER_B])
  })

  it('updates via ?id= query param and bumps to expectedVersion + 1', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await authed('user_a', 'POST', { id: MEMBER_A, ...envelope })

    const res = await authed('user_a', 'PATCH', { ...newEnvelope, expectedVersion: 1 }, `?id=${MEMBER_A}`)
    expect(res.status).toBe(200)

    const body = (await res.json()) as MemberResponse
    expect(body.member?.ciphertext).toBe(newEnvelope.ciphertext)
    expect(body.member?.version).toBe(2)
  })

  it('answers 409 to a stale expectedVersion and leaves the stored row completely unchanged', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await authed('user_a', 'POST', { id: MEMBER_A, ...envelope })
    await authed('user_a', 'PATCH', { ...newEnvelope, expectedVersion: 1 }, `?id=${MEMBER_A}`)

    const stale = await authed(
      'user_a',
      'PATCH',
      { ciphertext: 'Y2lwaGVydGV4dC1zdGFsZQ', iv: 'aXYtYnl0ZXMtMTIz', alg: 'AES-256-GCM', expectedVersion: 1 },
      `?id=${MEMBER_A}`,
    )
    expect(stale.status).toBe(409)

    expect(members[0].ciphertext).toBe(newEnvelope.ciphertext)
    expect(members[0].version).toBe(2)
  })

  it('rejects an update to a member from a different household with 404 (isolation, not just a 400)', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    await authed('user_a', 'POST', { id: MEMBER_A, ...envelope })

    const res = await authed('user_b', 'PATCH', { ...newEnvelope, expectedVersion: 1 }, `?id=${MEMBER_A}`)
    expect(res.status).toBe(404)
    expect(members[0].ciphertext).toBe(envelope.ciphertext)
  })

  it('removes a member via ?id= query param', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await authed('user_a', 'POST', { id: MEMBER_A, ...envelope })

    const res = await authed('user_a', 'DELETE', undefined, `?id=${MEMBER_A}`)
    expect(res.status).toBe(200)
    expect(members).toHaveLength(0)
  })

  it('rejects removing a member from a different household with 404', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    await authed('user_a', 'POST', { id: MEMBER_A, ...envelope })

    const res = await authed('user_b', 'DELETE', undefined, `?id=${MEMBER_A}`)
    expect(res.status).toBe(404)
    expect(members).toHaveLength(1)
  })

  it('serves a legacy row as a null envelope rather than leaking its plaintext columns', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    members.push({
      id: MEMBER_LEGACY,
      householdId: HOUSEHOLD_A,
      ciphertext: null,
      iv: null,
      alg: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Ananya Verma',
    })

    const res = await app.request('/api/family-members', { headers: { authorization: 'Bearer user_a' } })
    const body = (await res.json()) as MembersListResponse
    expect(body.members).toHaveLength(1)
    expect(body.members[0].ciphertext).toBeNull()
    expect(JSON.stringify(body)).not.toContain('Ananya Verma')
  })
})
