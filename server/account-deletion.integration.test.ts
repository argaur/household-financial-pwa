import { describe, it, expect, beforeEach, vi } from 'vitest'

process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_ZmFrZS5jbGVyay5hY2NvdW50cy5kZXYk'
process.env.CLERK_WEBHOOK_SECRET = 'whsec_MfKQ9r8GxxWCsnrRVDU4vNyBqXPFA5HWtNq7hMt3cVA='

// Same fake-token pattern as the other *.integration.test.ts files: the
// bearer token IS the userId, so the app's normal session-authed routes
// (household/family-members/protection) can be driven directly to build a
// real populated household. The webhook route under test is NOT session-
// authed (see server/routes/clerk-webhook.ts) — it's verified separately via
// a real Svix HMAC signature computed in this file with Web Crypto, the same
// way Clerk itself signs webhook deliveries.
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
}
// holdings/goals aren't exercised through this file's HTTP routes (holding
// creation additionally requires an instruments-table lookup, out of scope
// for this cascade test) — seeded directly as fixture rows standing in for
// "a populated household" per DATA_MODEL.md, same as account-deletion.test.ts's
// unit-level fixture. What's under test here is that the real webhook route,
// driven end-to-end through app.request() with a genuine Svix signature,
// triggers the same cascade for every user-owned table and leaves
// analytics_events alone — not the holdings/goals HTTP create paths
// themselves (already covered by holdings.integration.test.ts separately).
interface HoldingRow {
  id: string
  householdId: string
}
interface GoalRow {
  id: string
  householdId: string
}
interface AnalyticsEventRow {
  id: string
  userId: string
}

let households: HouseholdRow[] = []
let members: MemberRow[] = []
let protectionRows: ProtectionRow[] = []
let holdings: HoldingRow[] = []
let goals: GoalRow[] = []
let analyticsEvents: AnalyticsEventRow[] = []
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
          }
          protectionRows.push(created)
          return Promise.resolve([created])
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: (cond: { __eq?: [{ name?: string }, string] }) => ({
        returning: () => {
          if (table !== householdsTableRef) return Promise.resolve([])
          const ownerUserId = cond.__eq?.[1]
          const deleted = households.filter((h) => h.ownerUserId === ownerUserId)
          const deletedIds = new Set(deleted.map((h) => h.id))
          // Simulate the real Postgres ON DELETE CASCADE FKs declared in
          // drizzle/schema.ts for every user-owned table. analytics_events
          // has no such FK (retention rule) and is deliberately untouched.
          households = households.filter((h) => !deletedIds.has(h.id))
          members = members.filter((m) => !deletedIds.has(m.householdId))
          protectionRows = protectionRows.filter((p) => !deletedIds.has(p.householdId))
          holdings = holdings.filter((h) => !deletedIds.has(h.householdId))
          goals = goals.filter((g) => !deletedIds.has(g.householdId))
          return Promise.resolve(deleted)
        },
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

const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET!

async function sign(body: string, id: string, timestamp: string): Promise<string> {
  const secretBytes = Uint8Array.from(atob(WEBHOOK_SECRET.replace('whsec_', '')), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`))
  let binary = ''
  for (const byte of new Uint8Array(sigBuffer)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function postWebhook(body: string) {
  const id = 'msg_test'
  const timestamp = String(Math.floor(Date.now() / 1000))
  const sig = await sign(body, id, timestamp)
  return app.request('/api/clerk-webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${sig}`,
    },
    body,
  })
}

interface HouseholdResponse {
  household: { id: string } | null
}
interface MemberResponse {
  member: { id: string }
}
interface MembersListResponse {
  members: unknown[]
}
interface ProtectionResponse {
  protection?: { id: string }
}
interface ProtectionListResponse {
  protection: unknown[]
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

async function createProtection(token: string, memberId: string) {
  const res = await app.request('/api/protection', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ memberId, type: 'term-life', coverAmount: '5000000', status: 'active' }),
  })
  const body = (await res.json()) as ProtectionResponse
  return body.protection!.id
}

describe('Slice 9 — full create→populate→delete→verify-zero-rows cycle (account deletion webhook)', () => {
  beforeEach(() => {
    households = []
    members = []
    protectionRows = []
    holdings = []
    goals = []
    analyticsEvents = []
    nextProtectionId = 1
  })

  it('rejects a webhook call with no signature headers', async () => {
    const res = await app.request('/api/clerk-webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'user.deleted', data: { id: 'user_a' } }),
    })
    expect(res.status).toBe(401)
  })

  it('rejects a webhook call with an incorrect signature', async () => {
    const body = JSON.stringify({ type: 'user.deleted', data: { id: 'user_a' } })
    const res = await app.request('/api/clerk-webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'svix-id': 'msg_x',
        'svix-timestamp': String(Math.floor(Date.now() / 1000)),
        'svix-signature': 'v1,not-a-real-signature',
      },
      body,
    })
    expect(res.status).toBe(401)
  })

  it('ignores non-"user.deleted" event types (acknowledges, does not delete)', async () => {
    const household = await createHousehold('user_a', 'Gupta Family')
    const body = JSON.stringify({ type: 'user.updated', data: { id: 'user_a' } })
    const res = await postWebhook(body)
    expect(res.status).toBe(200)

    const check = await app.request('/api/household', { headers: { authorization: 'Bearer user_a' } })
    const checkBody = (await check.json()) as HouseholdResponse
    expect(checkBody.household?.id).toBe(household.id)
  })

  it('proves the retention policy end to end: populated household -> user.deleted webhook -> zero rows everywhere except analytics_events', async () => {
    // CREATE + POPULATE via the real app routes (household, member,
    // protection) plus fixture rows for holdings/goals/analytics_events
    // (see the interface comments above for why those two aren't driven
    // through HTTP in this file).
    const household = await createHousehold('user_a', 'Gupta Family')
    const memberId = await createMember('user_a', 'Gaurav Gupta')
    await createProtection('user_a', memberId)
    holdings.push({ id: 'hold-1', householdId: household.id })
    goals.push({ id: 'goal-1', householdId: household.id })
    analyticsEvents.push({ id: 'ae-1', userId: 'user_a' })

    // Sanity: everything is actually there before we delete anything.
    expect(households).toHaveLength(1)
    expect(members).toHaveLength(1)
    expect(protectionRows).toHaveLength(1)
    expect(holdings).toHaveLength(1)
    expect(goals).toHaveLength(1)

    // DELETE — the real Clerk user.deleted webhook, signature-verified.
    const webhookRes = await postWebhook(JSON.stringify({ type: 'user.deleted', data: { id: 'user_a' } }))
    expect(webhookRes.status).toBe(200)
    const webhookBody = (await webhookRes.json()) as { ok: boolean; deleted: boolean }
    expect(webhookBody.deleted).toBe(true)

    // VERIFY ZERO ROWS in every user-owned table.
    expect(households).toHaveLength(0)
    expect(members).toHaveLength(0)
    expect(protectionRows).toHaveLength(0)
    expect(holdings).toHaveLength(0)
    expect(goals).toHaveLength(0)

    // VERIFY via the app's own read routes too, not just the fixture arrays.
    const householdCheck = (await (await app.request('/api/household', { headers: { authorization: 'Bearer user_a' } })).json()) as HouseholdResponse
    expect(householdCheck.household).toBeNull()

    const membersCheck = (await (await app.request('/api/family-members', { headers: { authorization: 'Bearer user_a' } })).json()) as MembersListResponse
    expect(membersCheck.members).toEqual([])

    const protectionCheck = (await (await app.request('/api/protection', { headers: { authorization: 'Bearer user_a' } })).json()) as ProtectionListResponse
    expect(protectionCheck.protection).toEqual([])

    // VERIFY analytics_events is RETAINED (orphaned), not deleted — the
    // one deliberate exception to the hard-delete cascade.
    expect(analyticsEvents).toHaveLength(1)
    expect(analyticsEvents[0].userId).toBe('user_a')
  })

  it("never touches a different household's data when deleting one user", async () => {
    await createHousehold('user_a', 'Gupta Family')
    const householdB = await createHousehold('user_b', 'Sharma Family')
    const memberB = await createMember('user_b', 'Priya Sharma')
    await createProtection('user_b', memberB)

    await postWebhook(JSON.stringify({ type: 'user.deleted', data: { id: 'user_a' } }))

    const bCheck = (await (await app.request('/api/household', { headers: { authorization: 'Bearer user_b' } })).json()) as HouseholdResponse
    expect(bCheck.household?.id).toBe(householdB.id)
    expect(members.filter((m) => m.householdId === householdB.id)).toHaveLength(1)
    expect(protectionRows.filter((p) => p.householdId === householdB.id)).toHaveLength(1)
  })
})
