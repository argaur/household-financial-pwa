import { describe, it, expect, beforeEach, vi } from 'vitest'

process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_ZmFrZS5jbGFyay5hY2NvdW50cy5kZXYk'

// Same fake-token pattern as ledgers.integration.test.ts: the bearer token IS
// the userId, so two distinct "signed in" users can drive the real Hono app
// without a real Clerk-signed JWT.
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
}
interface LedgerRow {
  id: string
  householdId: string
  isBaseline: boolean
  origin: string
  projectionHorizonYears: number | null
}
interface SettingRow {
  id: string
  ledgerId: string
  assetClass: string
  annualRatePct: string
  createdAt: Date
  updatedAt: Date
}

let households: HouseholdRow[] = []
let ledgerRows: LedgerRow[] = []
let settingRows: SettingRow[] = []
let ledgerCounter = 0
let settingCounter = 0
let clock = 0

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

const HOUSEHOLD_FIELDS = { id: 'id', owner_user_id: 'ownerUserId' }
const LEDGER_FIELDS = { id: 'id', household_id: 'householdId', is_baseline: 'isBaseline' }
const SETTING_FIELDS = { id: 'id', ledger_id: 'ledgerId', asset_class: 'assetClass' }

vi.mock('./lib/db.js', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (cond: { __eq?: Filter; __and?: Filter[] }) => {
          function all(): unknown[] {
            if (table === householdsTableRef) return households.filter(matcher(cond, HOUSEHOLD_FIELDS))
            if (table === ledgersTableRef) return ledgerRows.filter(matcher(cond, LEDGER_FIELDS))
            if (table === settingsTableRef) return settingRows.filter(matcher(cond, SETTING_FIELDS))
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
                // uuid-shaped, not just unique — ledgerIdSchema (z.string().uuid())
                // rejects anything else, exactly as it would a real malformed id.
                id: (row.id as string) ?? `deadbeef-0000-4000-8000-${(++ledgerCounter).toString(16).padStart(12, '0')}`,
                householdId: String(row.householdId),
                isBaseline: Boolean(row.isBaseline),
                origin: String(row.origin),
                projectionHorizonYears: (row.projectionHorizonYears as number | undefined) ?? null,
              }
              ledgerRows.push(created)
              return created
            })
          }
          if (table === settingsTableRef) {
            return rows.map((row) => {
              const created: SettingRow = {
                id: `setting-${++settingCounter}`,
                ledgerId: String(row.ledgerId),
                assetClass: String(row.assetClass),
                annualRatePct: String(row.annualRatePct),
                createdAt: nextTimestamp(),
                updatedAt: nextTimestamp(),
              }
              settingRows.push(created)
              return created
            })
          }
          if (table === householdsTableRef) {
            return rows.map((row) => {
              const created: HouseholdRow = { id: String(row.id), ownerUserId: String(row.ownerUserId) }
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
    update: (table: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: (cond: { __eq?: Filter; __and?: Filter[] }) => {
          function apply(): unknown[] {
            if (table === ledgersTableRef) {
              const match = matcher(cond, LEDGER_FIELDS)
              ledgerRows = ledgerRows.map((row) => (match(row) ? { ...row, ...patch } : row))
              return []
            }
            if (table === settingsTableRef) {
              const match = matcher(cond, SETTING_FIELDS)
              settingRows = settingRows.map((row) => (match(row) ? { ...row, ...patch } : row))
              return []
            }
            throw new Error('fake db: unhandled table in update()')
          }
          const run = () => Promise.resolve(apply())
          return {
            returning: run,
            then: (...args: Parameters<Promise<unknown[]>['then']>) => run().then(...args),
          }
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: (cond: { __eq?: Filter; __and?: Filter[] }) => {
        if (table === settingsTableRef) {
          const match = matcher(cond, SETTING_FIELDS)
          settingRows = settingRows.filter((row) => !match(row))
          return Promise.resolve([])
        }
        throw new Error('fake db: unhandled table in delete()')
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
const settingsTableRef = schema.ledgerProjectionSettings

const { app } = await import('./app.js')

const HOUSEHOLD_A = '11111111-1111-4111-8111-111111111111'
const HOUSEHOLD_B = '22222222-2222-4222-8222-222222222222'

interface SettingsResponse {
  ledgerId?: string
  horizonYears?: number | null
  rates?: Array<{ assetClass: string; annualRatePct: number }>
  error?: string
  status?: string
}

function authed(token: string, method: string, query = '', body?: unknown) {
  return app.request(`/api/projection-settings${query}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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

async function getSettings(token: string, ledgerId: string) {
  const res = await authed(token, 'GET', `?ledgerId=${ledgerId}`)
  return { res, body: (await res.json()) as SettingsResponse }
}

async function putSettings(token: string, body: unknown) {
  const res = await authed(token, 'PUT', '', body)
  return { res, body: (await res.json()) as SettingsResponse }
}

beforeEach(() => {
  households = []
  ledgerRows = []
  settingRows = []
  ledgerCounter = 0
  settingCounter = 0
  clock = 0
})

describe('projection-settings routes — routing shape', () => {
  it('is mounted on a single path segment, never a nested one', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)
    const res = await authed('user_a', 'GET', `?ledgerId=${ledger.id}`)
    expect(res.status).toBe(200)
  })
})

describe('projection-settings routes — auth', () => {
  it('rejects GET and PUT without an Authorization header', async () => {
    const get = await app.request('/api/projection-settings?ledgerId=11111111-1111-4111-8111-111111111111')
    expect(get.status).toBe(401)

    const put = await app.request('/api/projection-settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ledgerId: '11111111-1111-4111-8111-111111111111', rates: [] }),
    })
    expect(put.status).toBe(401)
  })

  it('rejects an invalid token on both verbs', async () => {
    expect((await authed('invalid', 'GET', '?ledgerId=11111111-1111-4111-8111-111111111111')).status).toBe(401)
    expect(
      (await authed('invalid', 'PUT', '', { ledgerId: '11111111-1111-4111-8111-111111111111', rates: [] })).status,
    ).toBe(401)
  })

  it('sets Cache-Control: no-store, denials included', async () => {
    const denied = await authed('nobody', 'GET', '?ledgerId=11111111-1111-4111-8111-111111111111')
    expect(denied.headers.get('cache-control')).toBe('no-store')
  })
})

describe('projection-settings routes — ownership is 403, not 404, and does not leak existence', () => {
  it('answers 403 for a signed-in user with no household at all', async () => {
    const res = await authed('user_no_household', 'GET', '?ledgerId=11111111-1111-4111-8111-111111111111')
    expect(res.status).toBe(403)
  })

  it("answers 403 for another household's real ledger id — same body as a ledger id that doesn't exist", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    const real = baselineFor(HOUSEHOLD_A)

    const foreign = await getSettings('user_b', real.id)
    expect(foreign.res.status).toBe(403)

    const nonexistent = await getSettings('user_b', '99999999-9999-4999-8999-999999999999')
    expect(nonexistent.res.status).toBe(403)
    expect(nonexistent.body.error).toBe(foreign.body.error)
  })

  it("PUT for another household's ledger returns 403 and writes nothing", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    const real = baselineFor(HOUSEHOLD_A)

    const res = await putSettings('user_b', { ledgerId: real.id, rates: [{ assetClass: 'equity', annualRatePct: 12 }] })
    expect(res.res.status).toBe(403)
    expect(settingRows).toHaveLength(0)
    expect(baselineFor(HOUSEHOLD_A).projectionHorizonYears).toBeNull()
  })
})

describe('projection-settings routes — GET', () => {
  it('returns an empty rates array for a ledger with no saved settings, not a 404', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)

    const { res, body } = await getSettings('user_a', ledger.id)
    expect(res.status).toBe(200)
    expect(body.rates).toEqual([])
    expect(body.horizonYears).toBeNull()
    expect(body.ledgerId).toBe(ledger.id)
  })

  it('400s on a missing or malformed ledgerId', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    expect((await authed('user_a', 'GET')).status).toBe(400)
    expect((await authed('user_a', 'GET', '?ledgerId=not-a-uuid')).status).toBe(400)
  })
})

describe('projection-settings routes — PUT validation', () => {
  it('rejects an unknown top-level key', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)
    const res = await putSettings('user_a', { ledgerId: ledger.id, rates: [], extra: true })
    expect(res.res.status).toBe(400)
  })

  it('rejects an unknown key inside a rate entry', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)
    const res = await putSettings('user_a', {
      ledgerId: ledger.id,
      rates: [{ assetClass: 'equity', annualRatePct: 12, note: 'hi' }],
    })
    expect(res.res.status).toBe(400)
    expect(settingRows).toHaveLength(0)
  })

  it('rejects an assetClass outside assetClassEnum', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)
    const res = await putSettings('user_a', { ledgerId: ledger.id, rates: [{ assetClass: 'crypto', annualRatePct: 12 }] })
    expect(res.res.status).toBe(400)
    expect(settingRows).toHaveLength(0)
  })

  it('rejects a non-numeric rate rather than coercing it', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)
    const res = await putSettings('user_a', { ledgerId: ledger.id, rates: [{ assetClass: 'equity', annualRatePct: '12' }] })
    expect(res.res.status).toBe(400)
    expect(settingRows).toHaveLength(0)
  })

  it('rejects an out-of-range rate', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)
    const res = await putSettings('user_a', { ledgerId: ledger.id, rates: [{ assetClass: 'equity', annualRatePct: 5000 }] })
    expect(res.res.status).toBe(400)
    expect(settingRows).toHaveLength(0)
  })

  it('rejects a rate with more than 2 decimal places', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)
    const res = await putSettings('user_a', { ledgerId: ledger.id, rates: [{ assetClass: 'equity', annualRatePct: 12.345 }] })
    expect(res.res.status).toBe(400)
    expect(settingRows).toHaveLength(0)
  })

  it('rejects a rates array repeating the same assetClass', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)
    const res = await putSettings('user_a', {
      ledgerId: ledger.id,
      rates: [
        { assetClass: 'equity', annualRatePct: 12 },
        { assetClass: 'equity', annualRatePct: 10 },
      ],
    })
    expect(res.res.status).toBe(400)
    expect(settingRows).toHaveLength(0)
  })

  it('rejects an out-of-range horizonYears', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)
    const res = await putSettings('user_a', { ledgerId: ledger.id, horizonYears: 0, rates: [] })
    expect(res.res.status).toBe(400)
  })
})

describe('projection-settings routes — PUT upsert semantics', () => {
  it('creates rows for a fresh ledger and echoes them back on GET', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)

    const put = await putSettings('user_a', {
      ledgerId: ledger.id,
      rates: [
        { assetClass: 'equity', annualRatePct: 12 },
        { assetClass: 'debt', annualRatePct: 6.5 },
      ],
    })
    expect(put.res.status).toBe(200)
    expect(put.body.status).toBe('ok')
    expect(settingRows).toHaveLength(2)

    const { body } = await getSettings('user_a', ledger.id)
    expect(body.rates?.sort((a, b) => a.assetClass.localeCompare(b.assetClass))).toEqual([
      { assetClass: 'debt', annualRatePct: 6.5 },
      { assetClass: 'equity', annualRatePct: 12 },
    ])
  })

  it('a repeated PUT with the same values does not create duplicate rows', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)
    const body = { ledgerId: ledger.id, rates: [{ assetClass: 'equity', annualRatePct: 12 }] }

    await putSettings('user_a', body)
    expect(settingRows).toHaveLength(1)
    await putSettings('user_a', body)
    expect(settingRows).toHaveLength(1)
    await putSettings('user_a', body)
    expect(settingRows).toHaveLength(1)
  })

  it('a repeated PUT with a changed rate updates the existing row rather than inserting a second one', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)

    await putSettings('user_a', { ledgerId: ledger.id, rates: [{ assetClass: 'equity', annualRatePct: 12 }] })
    await putSettings('user_a', { ledgerId: ledger.id, rates: [{ assetClass: 'equity', annualRatePct: 9.5 }] })

    expect(settingRows).toHaveLength(1)
    const { body } = await getSettings('user_a', ledger.id)
    expect(body.rates).toEqual([{ assetClass: 'equity', annualRatePct: 9.5 }])
  })

  it('rates is the full desired state: an omitted assetClass on a later PUT is deleted', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)

    await putSettings('user_a', {
      ledgerId: ledger.id,
      rates: [
        { assetClass: 'equity', annualRatePct: 12 },
        { assetClass: 'debt', annualRatePct: 6 },
      ],
    })
    expect(settingRows).toHaveLength(2)

    await putSettings('user_a', { ledgerId: ledger.id, rates: [{ assetClass: 'equity', annualRatePct: 12 }] })
    expect(settingRows).toHaveLength(1)
    expect(settingRows[0].assetClass).toBe('equity')
  })

  it('an empty rates array clears all saved overrides for the ledger', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)

    await putSettings('user_a', { ledgerId: ledger.id, rates: [{ assetClass: 'equity', annualRatePct: 12 }] })
    expect(settingRows).toHaveLength(1)

    await putSettings('user_a', { ledgerId: ledger.id, rates: [] })
    expect(settingRows).toHaveLength(0)
  })

  it("one household's rates never leak into another's rows", async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    await createHousehold('user_b', HOUSEHOLD_B)
    const ledgerA = baselineFor(HOUSEHOLD_A)
    const ledgerB = baselineFor(HOUSEHOLD_B)

    await putSettings('user_a', { ledgerId: ledgerA.id, rates: [{ assetClass: 'equity', annualRatePct: 12 }] })
    await putSettings('user_b', { ledgerId: ledgerB.id, rates: [{ assetClass: 'gold', annualRatePct: 8 }] })

    const a = await getSettings('user_a', ledgerA.id)
    expect(a.body.rates).toEqual([{ assetClass: 'equity', annualRatePct: 12 }])
    const b = await getSettings('user_b', ledgerB.id)
    expect(b.body.rates).toEqual([{ assetClass: 'gold', annualRatePct: 8 }])
  })
})

describe('projection-settings routes — horizonYears lives on ledgers.projection_horizon_years', () => {
  it('round-trips a set horizonYears', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)

    const put = await putSettings('user_a', { ledgerId: ledger.id, horizonYears: 15, rates: [] })
    expect(put.res.status).toBe(200)

    const { body } = await getSettings('user_a', ledger.id)
    expect(body.horizonYears).toBe(15)
  })

  it('omitting horizonYears on a later PUT leaves the previously set value untouched', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)

    await putSettings('user_a', { ledgerId: ledger.id, horizonYears: 20, rates: [] })
    await putSettings('user_a', { ledgerId: ledger.id, rates: [{ assetClass: 'equity', annualRatePct: 11 }] })

    const { body } = await getSettings('user_a', ledger.id)
    expect(body.horizonYears).toBe(20)
  })

  it('an explicit null clears a previously set horizonYears', async () => {
    await createHousehold('user_a', HOUSEHOLD_A)
    const ledger = baselineFor(HOUSEHOLD_A)

    await putSettings('user_a', { ledgerId: ledger.id, horizonYears: 20, rates: [] })
    await putSettings('user_a', { ledgerId: ledger.id, horizonYears: null, rates: [] })

    const { body } = await getSettings('user_a', ledger.id)
    expect(body.horizonYears).toBeNull()
  })
})
