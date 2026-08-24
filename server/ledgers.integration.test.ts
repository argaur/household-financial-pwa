import { describe, it, expect, beforeEach, vi } from 'vitest'

process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_ZmFrZS5jbGVyay5hY2NvdW50cy5kZXYk'

// Fake token verification: the bearer token IS the userId, so two distinct
// "signed in" users can be driven through the real Hono app without Clerk's
// JWKS. Same pattern as family-members.integration.test.ts.
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
}
interface LedgerRow extends EnvelopeRow {
  householdId: string
  // Non-null only for the one row that is exempt from encryption by design:
  // the baseline "Current" ledger. Every other row carries this as null and
  // its real value only in ciphertext/iv/alg.
  name: string | null
  isBaseline: boolean
  origin: string
  snapshotOf: string | null
  createdAt: Date
  updatedAt: Date
}
interface HoldingRow extends EnvelopeRow {
  householdId: string
  memberId: string
  ledgerId: string
  createdAt: Date
  updatedAt: Date
}

let households: HouseholdRow[] = []
let members: MemberRow[] = []
let ledgerRows: LedgerRow[] = []
let holdingRows: HoldingRow[] = []
let ledgerCounter = 0
let clock = 0
/** Flips the next holdings insert into a failure, to exercise the compensating delete. */
let failHoldingsInsert = false

/** Monotonic, so created_at ordering is deterministic instead of millisecond-tied. */
function nextTimestamp() {
  clock += 1000
  return new Date(clock)
}

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

const HOUSEHOLD_FIELDS = { id: 'id', owner_user_id: 'ownerUserId', version: 'version' }
const MEMBER_FIELDS = { id: 'id', household_id: 'householdId', version: 'version' }
const LEDGER_FIELDS = { id: 'id', household_id: 'householdId', is_baseline: 'isBaseline' }
const HOLDING_FIELDS = { id: 'id', household_id: 'householdId', member_id: 'memberId', ledger_id: 'ledgerId' }

vi.mock('./lib/db.js', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (cond: { __eq?: Filter; __and?: Filter[] }) => {
          function all(): unknown[] {
            if (table === householdsTableRef) return households.filter(matcher(cond, HOUSEHOLD_FIELDS))
            if (table === familyMembersTableRef) return members.filter(matcher(cond, MEMBER_FIELDS))
            if (table === ledgersTableRef) return ledgerRows.filter(matcher(cond, LEDGER_FIELDS))
            if (table === holdingsTableRef) return holdingRows.filter(matcher(cond, HOLDING_FIELDS))
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
      // Accepts either a single row or an array — the ledger snapshot copy
      // writes every holding in ONE multi-row insert, and the fake has to model
      // that as one all-or-nothing statement for the atomicity test to mean
      // anything.
      values: (input: Record<string, unknown> | Array<Record<string, unknown>>) => {
        const rows = Array.isArray(input) ? input : [input]

        function apply(): unknown[] {
          if (table === ledgersTableRef) {
            return rows.map((row) => {
              const created: LedgerRow = {
                id: (row.id as string) ?? `ledger-${++ledgerCounter}`,
                householdId: String(row.householdId),
                // Only ensureBaselineLedger ever sends a literal `name`; a
                // non-baseline create sends ciphertext/iv/alg instead and no
                // `name` at all, so this must not coerce `undefined` into the
                // string "undefined".
                name: (row.name as string | undefined) ?? null,
                ciphertext: (row.ciphertext as string | undefined) ?? null,
                iv: (row.iv as string | undefined) ?? null,
                alg: (row.alg as string | undefined) ?? null,
                version: 1,
                isBaseline: Boolean(row.isBaseline),
                origin: String(row.origin),
                snapshotOf: (row.snapshotOf as string | null) ?? null,
                createdAt: nextTimestamp(),
                updatedAt: nextTimestamp(),
              }
              ledgerRows.push(created)
              return created
            })
          }

          if (table === holdingsTableRef) {
            if (failHoldingsInsert) throw new Error('fake db: holdings insert failed')
            // Primary key. A duplicate id fails the whole statement, exactly as
            // Postgres would.
            const seen = new Set(holdingRows.map((h) => h.id))
            for (const row of rows) {
              if (seen.has(String(row.id))) throw new Error('fake db: duplicate holding id')
              seen.add(String(row.id))
            }
            return rows.map((row) => {
              const created: HoldingRow = {
                id: String(row.id),
                householdId: String(row.householdId),
                memberId: String(row.memberId),
                ledgerId: String(row.ledgerId),
                ciphertext: (row.ciphertext as string) ?? null,
                iv: (row.iv as string) ?? null,
                alg: (row.alg as string) ?? null,
                version: 1,
                createdAt: nextTimestamp(),
                updatedAt: nextTimestamp(),
              }
              holdingRows.push(created)
              return created
            })
          }

          return rows.map((row) => {
            const envelope = {
              id: String(row.id),
              ciphertext: (row.ciphertext as string) ?? null,
              iv: (row.iv as string) ?? null,
              alg: (row.alg as string) ?? null,
              version: 1,
            }
            if (table === householdsTableRef) {
              const created: HouseholdRow = { ...envelope, ownerUserId: String(row.ownerUserId) }
              households.push(created)
              return created
            }
            if (table === familyMembersTableRef) {
              const created: MemberRow = {
                ...envelope,
                householdId: String(row.householdId),
                createdAt: nextTimestamp(),
                updatedAt: nextTimestamp(),
              }
              members.push(created)
              return created
            }
            throw new Error('fake db: unhandled table in insert()')
          })
        }

        // Drizzle's insert builder is thenable with or without .returning();
        // the snapshot copy awaits it directly, so both paths must execute.
        const run = () => Promise.resolve(apply())
        return {
          returning: run,
          then: (...args: Parameters<Promise<unknown[]>['then']>) => run().then(...args),
        }
      },
    }),
    delete: (table: unknown) => ({
      where: (cond: { __eq?: Filter; __and?: Filter[] }) => {
        if (table === ledgersTableRef) {
          const match = matcher(cond, LEDGER_FIELDS)
          const doomed = ledgerRows.filter(match).map((row) => row.id)
          ledgerRows = ledgerRows.filter((row) => !match(row))
          // holdings.ledger_id is ON DELETE CASCADE (drizzle/schema.ts).
          holdingRows = holdingRows.filter((row) => !doomed.includes(row.ledgerId))
          return Promise.resolve([])
        }
        if (table === familyMembersTableRef) {
          const match = matcher(cond, MEMBER_FIELDS)
          members = members.filter((row) => !match(row))
          return Promise.resolve([])
        }
        throw new Error('fake db: unhandled table in delete()')
      },
    }),
    update: () => ({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([]) }),
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
const ledgersTableRef = schema.ledgers
const holdingsTableRef = schema.holdings

const { app } = await import('./app.js')
const { MAX_NON_BASELINE_LEDGERS, MAX_LEDGER_HOLDINGS, BASELINE_LEDGER_NAME } = await import('./lib/ledgers.js')

const HOUSEHOLD_A = '11111111-1111-4111-8111-111111111111'
const HOUSEHOLD_B = '22222222-2222-4222-8222-222222222222'
const MEMBER_A = 'aaaaaaaa-1111-4111-8111-111111111111'
const MEMBER_B = 'bbbbbbbb-2222-4222-8222-222222222222'

const envelope = { ciphertext: 'Y2lwaGVydGV4dC1vbmU', iv: 'aXYtYnl0ZXMtMTIx', alg: 'AES-256-GCM' }
const reEncrypted = { ciphertext: 'Y2lwaGVydGV4dC1jb3B5', iv: 'aXYtYnl0ZXMtOTk5', alg: 'AES-256-GCM' }

/**
 * A fake sealed ledger name — this suite never runs real crypto, so `label`
 * is embedded directly in the "ciphertext" purely so two different POSTs in
 * the same test are distinguishable by which envelope landed where. It proves
 * nothing about what real ciphertext looks like; `src/lib/ledgers-api.test.ts`
 * owns that.
 */
function nameEnvelope(label: string) {
  return { ciphertext: `Y2lwaGVy-${label}`, iv: `aXYtYnl0-${label}`, alg: 'AES-256-GCM' }
}

/** Deterministic v4-shaped uuids, so bulk payloads pass rowIdSchema. */
function uuid(n: number) {
  const hex = n.toString(16).padStart(12, '0')
  return `deadbeef-0000-4000-8000-${hex}`
}

interface LedgerBody {
  id: string
  householdId: string
  name: string | null
  ciphertext: string | null
  iv: string | null
  alg: string | null
  version: number
  isBaseline: boolean
  origin: string
  snapshotOf: string | null
}
interface LedgerResponse {
  ledger?: LedgerBody
  error?: string
}
interface LedgerListResponse {
  ledgers: LedgerBody[]
}

function authed(token: string, method: string, body?: unknown, query = '') {
  return app.request(`/api/ledgers${query}`, {
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

/** Writes a holding into the caller's Current ledger, via the real v1 route. */
async function createCurrentHolding(token: string, id: string, memberId: string) {
  return app.request('/api/holdings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, memberId, ...envelope }),
  })
}

function baselineFor(householdId: string) {
  const row = ledgerRows.find((l) => l.householdId === householdId && l.isBaseline)
  if (!row) throw new Error('test setup: household has no baseline ledger')
  return row
}

async function listLedgersFor(token: string) {
  const res = await app.request('/api/ledgers', { headers: { authorization: `Bearer ${token}` } })
  return { res, body: (await res.json()) as LedgerListResponse }
}

beforeEach(() => {
  households = []
  members = []
  ledgerRows = []
  holdingRows = []
  ledgerCounter = 0
  clock = 0
  failHoldingsInsert = false
})

describe('ledgers routes — auth', () => {
  it('rejects every verb without an Authorization header', async () => {
    const get = await app.request('/api/ledgers')
    expect(get.status).toBe(401)

    const post = await app.request('/api/ledgers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: uuid(1), ...nameEnvelope('1'), source: 'blank', holdings: [] }),
    })
    expect(post.status).toBe(401)

    const del = await app.request(`/api/ledgers?id=${uuid(1)}`, { method: 'DELETE' })
    expect(del.status).toBe(401)
  })

  it('rejects an invalid token on every verb', async () => {
    expect((await authed('invalid', 'GET')).status).toBe(401)
    expect(
      (await authed('invalid', 'POST', { id: uuid(1), ...nameEnvelope('1'), source: 'blank', holdings: [] })).status,
    ).toBe(401)
    expect((await authed('invalid', 'DELETE', undefined, `?id=${uuid(1)}`)).status).toBe(401)
  })

  it('sets Cache-Control: no-store on every response, denials included', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)

    const denied = await app.request('/api/ledgers')
    expect(denied.headers.get('cache-control')).toBe('no-store')

    const list = await app.request('/api/ledgers', { headers: { authorization: 'Bearer user_a' } })
    expect(list.headers.get('cache-control')).toBe('no-store')

    const created = await authed('user_a', 'POST', { id: uuid(1), ...nameEnvelope('1'), source: 'blank', holdings: [] })
    expect(created.headers.get('cache-control')).toBe('no-store')
  })

  it('returns an empty list for a signed-in user with no household yet', async () => {
    const { res, body } = await listLedgersFor('user_no_household')
    expect(res.status).toBe(200)
    expect(body.ledgers).toEqual([])
  })

  it('returns 404 on create before a household exists', async () => {
    const res = await authed('user_no_household', 'POST', {
      id: uuid(1),
      ...nameEnvelope('1'),
      source: 'blank',
      holdings: [],
    })
    expect(res.status).toBe(404)
    expect(ledgerRows).toHaveLength(0)
  })
})

describe('ledgers routes — GET', () => {
  it("lists the household's ledgers with the baseline first, then oldest-created first", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await authed('user_a', 'POST', { id: uuid(1), ...nameEnvelope('aggressive'), source: 'blank', holdings: [] })
    await authed('user_a', 'POST', { id: uuid(2), ...nameEnvelope('conservative'), source: 'blank', holdings: [] })

    const { body } = await listLedgersFor('user_a')
    const baseline = baselineFor(HOUSEHOLD_A)
    expect(body.ledgers.map((l) => l.id)).toEqual([baseline.id, uuid(1), uuid(2)])
    expect(body.ledgers[0].isBaseline).toBe(true)
    expect(body.ledgers[0].name).toBe(BASELINE_LEDGER_NAME)
    expect(body.ledgers[0].ciphertext).toBeNull()
  })

  it('serves only the agreed columns — no aiEditsUsed, no projectionHorizonYears', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const { body } = await listLedgersFor('user_a')

    expect(Object.keys(body.ledgers[0]).sort()).toEqual(
      ['alg', 'ciphertext', 'createdAt', 'householdId', 'id', 'isBaseline', 'iv', 'name', 'origin', 'snapshotOf', 'updatedAt', 'version'].sort(),
    )
  })

  it("a created non-baseline ledger's wire response carries ciphertext/iv/alg and never a plaintext name", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const res = await authed('user_a', 'POST', {
      id: uuid(1),
      ...nameEnvelope('aggressive'),
      source: 'blank',
      holdings: [],
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as LedgerResponse

    expect(body.ledger?.name).toBeNull()
    expect(body.ledger?.ciphertext).toBe('Y2lwaGVy-aggressive')
    expect(body.ledger?.iv).toBe('aXYtYnl0-aggressive')
    expect(body.ledger?.alg).toBe('AES-256-GCM')

    // The list response agrees — this is not a create-response-only artifact.
    const { body: list } = await listLedgersFor('user_a')
    const created = list.ledgers.find((l) => l.id === uuid(1))
    expect(created?.name).toBeNull()
    expect(created?.ciphertext).toBe('Y2lwaGVy-aggressive')
  })

  it("the baseline ledger's wire response carries a plain name: 'Current' and a null ciphertext", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const { body } = await listLedgersFor('user_a')

    const baseline = body.ledgers.find((l) => l.isBaseline)
    expect(baseline?.name).toBe('Current')
    expect(baseline?.ciphertext).toBeNull()
    expect(baseline?.iv).toBeNull()
    expect(baseline?.alg).toBeNull()
  })
})

describe('ledgers routes — two-user isolation', () => {
  it("user B never sees user A's ledgers", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    await authed('user_a', 'POST', { id: uuid(1), ...nameEnvelope('a-plan'), source: 'blank', holdings: [] })
    await authed('user_b', 'POST', { id: uuid(2), ...nameEnvelope('b-plan'), source: 'blank', holdings: [] })

    const a = await listLedgersFor('user_a')
    expect(a.body.ledgers.map((l) => l.id)).toEqual([baselineFor(HOUSEHOLD_A).id, uuid(1)])
    expect(a.body.ledgers.every((l) => l.householdId === HOUSEHOLD_A)).toBe(true)

    const b = await listLedgersFor('user_b')
    expect(b.body.ledgers.map((l) => l.id)).toEqual([baselineFor(HOUSEHOLD_B).id, uuid(2)])
    expect(b.body.ledgers.every((l) => l.householdId === HOUSEHOLD_B)).toBe(true)
  })

  it("a create by B never lands in A's household, even reusing A's ledger id shape", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)

    const res = await authed('user_b', 'POST', { id: uuid(9), ...nameEnvelope('9'), source: 'blank', holdings: [] })
    expect(res.status).toBe(201)
    expect(((await res.json()) as LedgerResponse).ledger?.householdId).toBe(HOUSEHOLD_B)

    expect(ledgerRows.filter((l) => l.householdId === HOUSEHOLD_A)).toHaveLength(1)
  })

  it("user B cannot delete user A's ledger — 404, never 403, and A's row survives", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    await authed('user_a', 'POST', { id: uuid(1), ...nameEnvelope('a-plan'), source: 'blank', holdings: [] })

    const res = await authed('user_b', 'DELETE', undefined, `?id=${uuid(1)}`)
    expect(res.status).toBe(404)
    expect(((await res.json()) as LedgerResponse).error).toBe('not_found')
    expect(ledgerRows.some((l) => l.id === uuid(1))).toBe(true)
  })

  it("user B cannot delete user A's baseline — the answer is 404, not a baseline refusal", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)

    const res = await authed('user_b', 'DELETE', undefined, `?id=${baselineFor(HOUSEHOLD_A).id}`)
    expect(res.status).toBe(404)
    // Not 'cannot_delete_baseline': that would confirm the row exists.
    expect(((await res.json()) as LedgerResponse).error).toBe('not_found')
  })
})

describe('ledgers routes — the 4-ledger cap', () => {
  it('allows four non-baseline ledgers and answers the fifth with 409', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)

    for (let i = 1; i <= MAX_NON_BASELINE_LEDGERS; i += 1) {
      const res = await authed('user_a', 'POST', { id: uuid(i), ...nameEnvelope(`${i}`), source: 'blank', holdings: [] })
      expect(res.status).toBe(201)
    }

    const fifth = await authed('user_a', 'POST', { id: uuid(99), ...nameEnvelope('99'), source: 'blank', holdings: [] })
    expect(fifth.status).toBe(409)
    expect(((await fifth.json()) as LedgerResponse).error).toBe('ledger_cap_reached')
    expect(ledgerRows.filter((l) => !l.isBaseline)).toHaveLength(MAX_NON_BASELINE_LEDGERS)
  })

  it('does not count the baseline toward the cap', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    expect(ledgerRows.filter((l) => l.isBaseline)).toHaveLength(1)

    for (let i = 1; i <= MAX_NON_BASELINE_LEDGERS; i += 1) {
      await authed('user_a', 'POST', { id: uuid(i), ...nameEnvelope(`${i}`), source: 'blank', holdings: [] })
    }
    // Baseline + 4 — if the baseline counted, the fourth would have been refused.
    expect(ledgerRows.filter((l) => l.householdId === HOUSEHOLD_A)).toHaveLength(MAX_NON_BASELINE_LEDGERS + 1)
  })

  it('frees a slot when a ledger is deleted', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    for (let i = 1; i <= MAX_NON_BASELINE_LEDGERS; i += 1) {
      await authed('user_a', 'POST', { id: uuid(i), ...nameEnvelope(`${i}`), source: 'blank', holdings: [] })
    }
    expect(
      (await authed('user_a', 'POST', { id: uuid(99), ...nameEnvelope('99'), source: 'blank', holdings: [] })).status,
    ).toBe(409)

    expect((await authed('user_a', 'DELETE', undefined, `?id=${uuid(1)}`)).status).toBe(200)
    expect(
      (await authed('user_a', 'POST', { id: uuid(99), ...nameEnvelope('99'), source: 'blank', holdings: [] })).status,
    ).toBe(201)
  })

  it("one household's ledgers do not consume another household's cap", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    for (let i = 1; i <= MAX_NON_BASELINE_LEDGERS; i += 1) {
      await authed('user_a', 'POST', { id: uuid(i), ...nameEnvelope(`${i}`), source: 'blank', holdings: [] })
    }

    const res = await authed('user_b', 'POST', { id: uuid(50), ...nameEnvelope('50'), source: 'blank', holdings: [] })
    expect(res.status).toBe(201)
  })
})

describe('ledgers routes — DELETE', () => {
  it('refuses to delete the baseline with 400 cannot_delete_baseline', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const baseline = baselineFor(HOUSEHOLD_A)

    const res = await authed('user_a', 'DELETE', undefined, `?id=${baseline.id}`)
    expect(res.status).toBe(400)
    expect(((await res.json()) as LedgerResponse).error).toBe('cannot_delete_baseline')
    expect(ledgerRows.some((l) => l.id === baseline.id)).toBe(true)
  })

  it("refuses to delete the baseline even when it holds the household's real holdings", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)
    await createCurrentHolding('user_a', uuid(31), MEMBER_A)

    const res = await authed('user_a', 'DELETE', undefined, `?id=${baselineFor(HOUSEHOLD_A).id}`)
    expect(res.status).toBe(400)
    expect(holdingRows).toHaveLength(1)
  })

  it('requires ?id=', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const res = await authed('user_a', 'DELETE')
    expect(res.status).toBe(400)
    expect(((await res.json()) as LedgerResponse).error).toBe('missing_id')
  })

  it('deletes a non-baseline ledger and cascades its holdings, leaving Current alone', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)
    await createCurrentHolding('user_a', uuid(31), MEMBER_A)

    await authed('user_a', 'POST', {
      id: uuid(1),
      ...nameEnvelope('aggressive'),
      source: 'copy',
      holdings: [{ id: uuid(41), memberId: MEMBER_A, ...reEncrypted }],
    })
    expect(holdingRows).toHaveLength(2)

    const res = await authed('user_a', 'DELETE', undefined, `?id=${uuid(1)}`)
    expect(res.status).toBe(200)
    expect(ledgerRows.some((l) => l.id === uuid(1))).toBe(false)
    expect(holdingRows.map((h) => h.id)).toEqual([uuid(31)])
  })

  it('returns 404 for a ledger id that does not exist at all', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const res = await authed('user_a', 'DELETE', undefined, `?id=${uuid(777)}`)
    expect(res.status).toBe(404)
  })
})

describe('ledgers routes — POST body is opaque and strict', () => {
  it('rejects a plaintext ledger body — no schema here accepts an amount, an asset class, or a plaintext name', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const res = await authed('user_a', 'POST', {
      id: uuid(1),
      name: 'Aggressive',
      source: 'blank',
      holdings: [],
      monthlySip: 25000,
      assetClass: 'equity',
    })
    expect(res.status).toBe(400)
    expect(ledgerRows.filter((l) => !l.isBaseline)).toHaveLength(0)
  })

  it('rejects a create body missing the envelope entirely', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const res = await authed('user_a', 'POST', { id: uuid(1), source: 'blank', holdings: [] })
    expect(res.status).toBe(400)
    expect(ledgerRows.filter((l) => !l.isBaseline)).toHaveLength(0)
  })

  it("rejects a ledger name envelope smuggling an extra plaintext field alongside it", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const res = await authed('user_a', 'POST', {
      id: uuid(1),
      ...nameEnvelope('1'),
      name: 'Aggressive',
      source: 'blank',
      holdings: [],
    })
    expect(res.status).toBe(400)
    expect(ledgerRows.filter((l) => !l.isBaseline)).toHaveLength(0)
  })

  it('rejects a holding envelope smuggling an extra plaintext field alongside it', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)

    const res = await authed('user_a', 'POST', {
      id: uuid(1),
      ...nameEnvelope('1'),
      source: 'copy',
      holdings: [{ id: uuid(41), memberId: MEMBER_A, ...reEncrypted, currentValue: 250000 }],
    })
    expect(res.status).toBe(400)
    expect(ledgerRows.filter((l) => !l.isBaseline)).toHaveLength(0)
    expect(holdingRows).toHaveLength(0)
  })

  it('rejects a client-claimed isBaseline, origin or snapshotOf', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)

    for (const extra of [{ isBaseline: true }, { origin: 'ai_suggestion' }, { snapshotOf: uuid(5) }]) {
      const res = await authed('user_a', 'POST', {
        id: uuid(1),
        ...nameEnvelope('1'),
        source: 'blank',
        holdings: [],
        ...extra,
      })
      expect(res.status).toBe(400)
    }
    expect(ledgerRows.filter((l) => !l.isBaseline)).toHaveLength(0)
  })

  it('rejects a client-supplied householdId outright', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)

    const res = await authed('user_b', 'POST', {
      id: uuid(1),
      ...nameEnvelope('1'),
      source: 'blank',
      holdings: [],
      householdId: HOUSEHOLD_A,
    })
    expect(res.status).toBe(400)
    expect(ledgerRows.filter((l) => l.householdId === HOUSEHOLD_A && !l.isBaseline)).toHaveLength(0)
  })

  it('rejects ciphertext that is not base64url', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const res = await authed('user_a', 'POST', {
      id: uuid(1),
      ciphertext: 'Aggressive growth',
      iv: 'aXYtYnl0ZXMtMTIx',
      alg: 'AES-256-GCM',
      source: 'blank',
      holdings: [],
    })
    expect(res.status).toBe(400)
    expect(ledgerRows.filter((l) => !l.isBaseline)).toHaveLength(0)
  })

  it('rejects an unknown source', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const res = await authed('user_a', 'POST', { id: uuid(1), ...nameEnvelope('1'), source: 'ai', holdings: [] })
    expect(res.status).toBe(400)
  })

  it(`rejects more than ${MAX_LEDGER_HOLDINGS} holdings, and writes nothing`, async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)

    const tooMany = Array.from({ length: MAX_LEDGER_HOLDINGS + 1 }, (_, i) => ({
      id: uuid(1000 + i),
      memberId: MEMBER_A,
      ...reEncrypted,
    }))

    const res = await authed('user_a', 'POST', { id: uuid(1), ...nameEnvelope('bulk'), source: 'copy', holdings: tooMany })
    expect(res.status).toBe(400)
    expect(ledgerRows.filter((l) => !l.isBaseline)).toHaveLength(0)
    expect(holdingRows).toHaveLength(0)
  })

  it(`accepts exactly ${MAX_LEDGER_HOLDINGS} holdings`, async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)

    const atCap = Array.from({ length: MAX_LEDGER_HOLDINGS }, (_, i) => ({
      id: uuid(1000 + i),
      memberId: MEMBER_A,
      ...reEncrypted,
    }))

    const res = await authed('user_a', 'POST', { id: uuid(1), ...nameEnvelope('bulk'), source: 'copy', holdings: atCap })
    expect(res.status).toBe(201)
    expect(holdingRows).toHaveLength(MAX_LEDGER_HOLDINGS)
  })
})

describe('ledgers routes — member tenancy on the snapshot copy', () => {
  it("rejects a memberId from another household with 400 and writes NOTHING", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    await createMember('user_a', MEMBER_A)
    await createMember('user_b', MEMBER_B)

    const res = await authed('user_b', 'POST', {
      id: uuid(1),
      ...nameEnvelope('borrowed'),
      source: 'copy',
      // MEMBER_A belongs to household A. The FK would accept it; tenancy must not.
      holdings: [{ id: uuid(41), memberId: MEMBER_A, ...reEncrypted }],
    })

    expect(res.status).toBe(400)
    expect(((await res.json()) as LedgerResponse).error).toBe('invalid_member')
    expect(holdingRows).toHaveLength(0)
    expect(ledgerRows.filter((l) => !l.isBaseline)).toHaveLength(0)
  })

  it('rejects the whole request when only one of several memberIds is foreign', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    await createMember('user_a', MEMBER_A)
    await createMember('user_b', MEMBER_B)

    const res = await authed('user_b', 'POST', {
      id: uuid(1),
      ...nameEnvelope('mostly-mine'),
      source: 'copy',
      holdings: [
        { id: uuid(41), memberId: MEMBER_B, ...reEncrypted },
        { id: uuid(42), memberId: MEMBER_A, ...reEncrypted },
        { id: uuid(43), memberId: MEMBER_B, ...reEncrypted },
      ],
    })

    expect(res.status).toBe(400)
    // Not "the two valid ones landed" — all or nothing.
    expect(holdingRows).toHaveLength(0)
    expect(ledgerRows.filter((l) => !l.isBaseline)).toHaveLength(0)
  })

  it('rejects a memberId that exists in no household at all', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const res = await authed('user_a', 'POST', {
      id: uuid(1),
      ...nameEnvelope('ghost'),
      source: 'copy',
      holdings: [{ id: uuid(41), memberId: uuid(555), ...reEncrypted }],
    })
    expect(res.status).toBe(400)
    expect(holdingRows).toHaveLength(0)
  })
})

describe('ledgers routes — the snapshot copy, and "Current never changes"', () => {
  it('lands copied holdings under the new ledger and the session household, leaving Current byte-identical', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)
    await createCurrentHolding('user_a', uuid(31), MEMBER_A)
    await createCurrentHolding('user_a', uuid(32), MEMBER_A)

    const baseline = baselineFor(HOUSEHOLD_A)
    const currentBefore = JSON.parse(JSON.stringify(holdingRows.filter((h) => h.ledgerId === baseline.id)))

    const res = await authed('user_a', 'POST', {
      id: uuid(1),
      ...nameEnvelope('aggressive'),
      source: 'copy',
      holdings: [
        { id: uuid(41), memberId: MEMBER_A, ...reEncrypted },
        { id: uuid(42), memberId: MEMBER_A, ...reEncrypted },
      ],
    })
    expect(res.status).toBe(201)

    const body = (await res.json()) as LedgerResponse
    expect(body.ledger?.isBaseline).toBe(false)
    expect(body.ledger?.origin).toBe('manual')
    expect(body.ledger?.snapshotOf).toBe(baseline.id)
    expect(body.ledger?.householdId).toBe(HOUSEHOLD_A)
    expect(body.ledger?.name).toBeNull()
    expect(body.ledger?.ciphertext).toBe('Y2lwaGVy-aggressive')

    const copied = holdingRows.filter((h) => h.ledgerId === uuid(1))
    expect(copied.map((h) => h.id)).toEqual([uuid(41), uuid(42)])
    expect(copied.every((h) => h.householdId === HOUSEHOLD_A)).toBe(true)
    expect(copied.every((h) => h.memberId === MEMBER_A)).toBe(true)
    // Re-encrypted by the browser under the new row id's AAD — the server
    // stores what it was handed and never re-derives it.
    expect(copied.every((h) => h.ciphertext === reEncrypted.ciphertext)).toBe(true)

    // The invariant the whole feature rests on.
    const currentAfter = JSON.parse(JSON.stringify(holdingRows.filter((h) => h.ledgerId === baseline.id)))
    expect(currentAfter).toEqual(currentBefore)
  })

  it('sets snapshotOf to null for a blank ledger', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const res = await authed('user_a', 'POST', { id: uuid(1), ...nameEnvelope('scratch'), source: 'blank', holdings: [] })

    expect(res.status).toBe(201)
    expect(((await res.json()) as LedgerResponse).ledger?.snapshotOf).toBeNull()
    expect(holdingRows).toHaveLength(0)
  })

  it('never writes a baseline through this route, however the request is dressed up', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await authed('user_a', 'POST', { id: uuid(1), ...nameEnvelope('current'), source: 'copy', holdings: [] })

    // isBaseline is never client-decided. One Current, still.
    expect(ledgerRows.filter((l) => l.isBaseline)).toHaveLength(1)
    expect(ledgerRows.find((l) => l.id === uuid(1))?.isBaseline).toBe(false)
  })

  it('deletes the just-created ledger when the holdings insert fails, rather than leaving a half-copy', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)
    await createCurrentHolding('user_a', uuid(31), MEMBER_A)

    failHoldingsInsert = true
    const res = await authed('user_a', 'POST', {
      id: uuid(1),
      ...nameEnvelope('doomed'),
      source: 'copy',
      holdings: [{ id: uuid(41), memberId: MEMBER_A, ...reEncrypted }],
    })

    expect(res.status).toBe(500)
    // The compensating delete ran: no empty shell left behind.
    expect(ledgerRows.some((l) => l.id === uuid(1))).toBe(false)
    // And Current is untouched.
    expect(holdingRows.map((h) => h.id)).toEqual([uuid(31)])
    expect(ledgerRows.filter((l) => l.isBaseline)).toHaveLength(1)
  })

  it('leaves no ledger behind after a failed copy, so the cap is not silently consumed', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createMember('user_a', MEMBER_A)

    failHoldingsInsert = true
    for (let i = 1; i <= MAX_NON_BASELINE_LEDGERS + 1; i += 1) {
      await authed('user_a', 'POST', {
        id: uuid(i),
        ...nameEnvelope(`doomed-${i}`),
        source: 'copy',
        holdings: [{ id: uuid(100 + i), memberId: MEMBER_A, ...reEncrypted }],
      })
    }

    failHoldingsInsert = false
    const res = await authed('user_a', 'POST', { id: uuid(80), ...nameEnvelope('real'), source: 'blank', holdings: [] })
    expect(res.status).toBe(201)
  })
})
