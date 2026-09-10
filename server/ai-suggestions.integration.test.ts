import { describe, it, expect, beforeEach, vi } from 'vitest'

process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_ZmFrZS5jbGFyay5hY2NvdW50cy5kZXYk'

// Same fake-token pattern as projection-settings.integration.test.ts: the
// bearer token IS the userId, so distinct "signed in" users can drive the
// real Hono app without a real Clerk-signed JWT.
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
  aiPlansCreated: number
}
interface LedgerRow {
  id: string
  householdId: string
  isBaseline: boolean
  origin: string
  aiEditsUsed: number
}
interface GlobalUsageRow {
  period: string
  callsUsed: number
  capCalls: number
}

let households: HouseholdRow[] = []
let ledgerRows: LedgerRow[] = []
let globalUsageRows: GlobalUsageRow[] = []
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

const HOUSEHOLD_FIELDS = { id: 'id', owner_user_id: 'ownerUserId' }
const LEDGER_FIELDS = { id: 'id', household_id: 'householdId', is_baseline: 'isBaseline' }
const GLOBAL_USAGE_FIELDS = { period: 'period' }

vi.mock('./lib/db.js', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (cond: { __eq?: Filter; __and?: Filter[] }) => {
          function all(): unknown[] {
            if (table === householdsTableRef) return households.filter(matcher(cond, HOUSEHOLD_FIELDS))
            if (table === ledgersTableRef) return ledgerRows.filter(matcher(cond, LEDGER_FIELDS))
            if (table === globalUsageTableRef) return globalUsageRows.filter(matcher(cond, GLOBAL_USAGE_FIELDS))
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
      values: (input: Record<string, unknown> | Array<Record<string, unknown>>) => {
        const rows = Array.isArray(input) ? input : [input]

        function apply(): unknown[] {
          if (table === ledgersTableRef) {
            return rows.map((row) => {
              const created: LedgerRow = {
                id: (row.id as string) ?? `deadbeef-0000-4000-8000-${(++ledgerCounter).toString(16).padStart(12, '0')}`,
                householdId: String(row.householdId),
                isBaseline: Boolean(row.isBaseline),
                origin: String(row.origin),
                aiEditsUsed: 0,
              }
              ledgerRows.push(created)
              return created
            })
          }
          if (table === householdsTableRef) {
            return rows.map((row) => {
              const created: HouseholdRow = { id: String(row.id), ownerUserId: String(row.ownerUserId), aiPlansCreated: 0 }
              households.push(created)
              return created
            })
          }
          throw new Error('fake db: unhandled table in insert()')
        }

        const run = () => Promise.resolve(apply())
        return {
          returning: run,
          then: (...args: Parameters<Promise<unknown[]>['then']>) => run().then(...args),
        }
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
const ledgersTableRef = schema.ledgers
const globalUsageTableRef = schema.aiGlobalUsage

const { app } = await import('./app.js')
const { aiUsagePeriod } = await import('./lib/ai-counters.js')

const HOUSEHOLD_A = '11111111-1111-4111-8111-111111111111'
const HOUSEHOLD_B = '22222222-2222-4222-8222-222222222222'
const CURRENT_PERIOD = aiUsagePeriod(new Date())

interface UsageResponse {
  plansUsed?: number
  plansCap?: number
  editsUsed?: number
  editsCap?: number
  globalOpen?: boolean
  error?: string
}

function authed(token: string, query = '') {
  return app.request(`/api/ai-suggestions${query}`, {
    method: 'GET',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  })
}

async function createHousehold(token: string, id: string) {
  await app.request('/api/household', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, ciphertext: 'Y2lwaGVydGV4dA', iv: 'aXYtYnl0ZXMtMTIx', alg: 'AES-256-GCM' }),
  })
}

function baselineFor(householdId: string) {
  const row = ledgerRows.find((l) => l.householdId === householdId && l.isBaseline)
  if (!row) throw new Error('test setup: household has no baseline ledger')
  return row
}

async function getUsage(token: string, ledgerId: string) {
  const res = await authed(token, `?ledgerId=${ledgerId}`)
  return { res, body: (await res.json()) as UsageResponse }
}

beforeEach(() => {
  households = []
  ledgerRows = []
  globalUsageRows = []
  ledgerCounter = 0
})

describe('ai-suggestions routes — routing shape', () => {
  it('is mounted on a single path segment, never a nested one', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)
    const res = await authed('user_a', `?ledgerId=${ledger.id}`)
    expect(res.status).toBe(200)
  })
})

describe('ai-suggestions routes — auth', () => {
  it('rejects a request with no Authorization header', async () => {
    const res = await app.request('/api/ai-suggestions?ledgerId=11111111-1111-4111-8111-111111111111')
    expect(res.status).toBe(401)
  })

  it('rejects an invalid token', async () => {
    expect((await authed('invalid', '?ledgerId=11111111-1111-4111-8111-111111111111')).status).toBe(401)
  })

  it('sets Cache-Control: no-store on success', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)
    const res = await authed('user_a', `?ledgerId=${ledger.id}`)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('sets Cache-Control: no-store on a denial', async () => {
    const res = await authed('user_no_household', '?ledgerId=11111111-1111-4111-8111-111111111111')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})

describe('ai-suggestions routes — ownership is 403, never 404, and leaks nothing', () => {
  it('answers 403 for a signed-in user with no household yet', async () => {
    const res = await authed('user_no_household', '?ledgerId=11111111-1111-4111-8111-111111111111')
    expect(res.status).toBe(403)
    const body = (await res.json()) as UsageResponse
    expect(body.plansUsed).toBeUndefined()
    expect(body.editsUsed).toBeUndefined()
  })

  it("answers 403 for another household's real ledger id — same body as a nonexistent ledger id", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    const real = baselineFor(HOUSEHOLD_A)

    const foreign = await getUsage('user_b', real.id)
    expect(foreign.res.status).toBe(403)
    expect(foreign.body.plansUsed).toBeUndefined()
    expect(foreign.body.editsUsed).toBeUndefined()

    const nonexistent = await getUsage('user_b', '99999999-9999-4999-8999-999999999999')
    expect(nonexistent.res.status).toBe(403)
    expect(nonexistent.body.error).toBe(foreign.body.error)
  })

  it('400s on a missing or malformed ledgerId', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    expect((await authed('user_a')).status).toBe(400)
    expect((await authed('user_a', '?ledgerId=not-a-uuid')).status).toBe(400)
  })
})

describe('ai-suggestions routes — usage values', () => {
  it('returns the five fields and only the five fields', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)

    const { res, body } = await getUsage('user_a', ledger.id)
    expect(res.status).toBe(200)
    expect(Object.keys(body).sort()).toEqual(['editsCap', 'editsUsed', 'globalOpen', 'plansCap', 'plansUsed'])
  })

  it('reports correct values for a household mid-way through its caps', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)
    const household = households.find((h) => h.id === HOUSEHOLD_A)!
    household.aiPlansCreated = 1
    ledger.aiEditsUsed = 1

    const { body } = await getUsage('user_a', ledger.id)
    expect(body.plansUsed).toBe(1)
    expect(body.plansCap).toBe(2)
    expect(body.editsUsed).toBe(1)
    expect(body.editsCap).toBe(2)
  })

  it('scopes editsUsed to the requested ledger, not some other ledger on the same household', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const baseline = baselineFor(HOUSEHOLD_A)
    baseline.aiEditsUsed = 2
    // A second ledger for the same household, with its own independent counter.
    const other: LedgerRow = {
      id: 'deadbeef-0000-4000-8000-000000000099',
      householdId: HOUSEHOLD_A,
      isBaseline: false,
      origin: 'manual',
      aiEditsUsed: 0,
    }
    ledgerRows.push(other)

    const { body } = await getUsage('user_a', other.id)
    expect(body.editsUsed).toBe(0)
  })

  it('globalOpen is true when the current month has no ai_global_usage row yet', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)
    expect(globalUsageRows).toHaveLength(0)

    const { body } = await getUsage('user_a', ledger.id)
    expect(body.globalOpen).toBe(true)
  })

  it('globalOpen is false when the current month is at its cap', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)
    globalUsageRows.push({ period: CURRENT_PERIOD, callsUsed: 50, capCalls: 50 })

    const { body } = await getUsage('user_a', ledger.id)
    expect(body.globalOpen).toBe(false)
  })

  it('globalOpen is true when the current month is below its cap', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)
    globalUsageRows.push({ period: CURRENT_PERIOD, callsUsed: 10, capCalls: 50 })

    const { body } = await getUsage('user_a', ledger.id)
    expect(body.globalOpen).toBe(true)
  })
})
