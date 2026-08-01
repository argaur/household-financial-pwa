import { describe, it, expect, beforeEach, vi } from 'vitest'

process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_ZmFrZS5jbGVyay5hY2NvdW50cy5kZXYk'

// Same fake-token pattern as the other integration tests: the bearer token IS
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
  name: string
}
interface HouseholdKeyRow {
  householdId: string
  kdfAlg: string
  kdfIterations: number
  passphraseSalt: string
  wrappedDekPassphrase: string
  passphraseWrapIv: string
  recoverySalt: string
  wrappedDekRecovery: string
  recoveryWrapIv: string
  createdAt: Date
  updatedAt: Date
}

let households: HouseholdRow[] = []
let keyRows: HouseholdKeyRow[] = []

vi.mock('./lib/db.js', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (cond: { __eq?: [{ name?: string }, string] }) => {
          const filters: Array<[string | undefined, string]> = cond.__eq ? [[cond.__eq[0]?.name, cond.__eq[1]]] : []
          function matches(row: object, fieldMap: Record<string, string>): boolean {
            const record = row as Record<string, unknown>
            return filters.every(([colName, value]) => {
              const field = colName ? fieldMap[colName] : undefined
              return field ? record[field] === value : true
            })
          }
          const rows =
            table === householdsTableRef
              ? households.filter((h) => matches(h, { owner_user_id: 'ownerUserId', id: 'id' }))
              : table === householdKeysTableRef
                ? keyRows.filter((k) => matches(k, { household_id: 'householdId' }))
                : []
          const result = Promise.resolve(rows) as Promise<unknown[]> & { limit: (n: number) => Promise<unknown[]> }
          result.limit = (n: number) => Promise.resolve(rows.slice(0, n))
          return result
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (row: Record<string, unknown>) => {
        function insertHousehold() {
          const created: HouseholdRow = {
            id: `h-${households.length + 1}`,
            ownerUserId: row.ownerUserId as string,
            name: row.name as string,
          }
          households.push(created)
          return [created]
        }
        // Mirrors the real primary-key conflict on household_keys.household_id:
        // onConflictDoNothing() + returning() yields an empty array when a row
        // already exists, which is how the route detects the 409 case.
        function insertKey(skipOnConflict: boolean) {
          const householdId = row.householdId as string
          if (keyRows.some((k) => k.householdId === householdId)) {
            if (skipOnConflict) return []
            throw new Error('duplicate key value violates unique constraint "household_keys_pkey"')
          }
          const created: HouseholdKeyRow = {
            householdId,
            kdfAlg: row.kdfAlg as string,
            kdfIterations: row.kdfIterations as number,
            passphraseSalt: row.passphraseSalt as string,
            wrappedDekPassphrase: row.wrappedDekPassphrase as string,
            passphraseWrapIv: row.passphraseWrapIv as string,
            recoverySalt: row.recoverySalt as string,
            wrappedDekRecovery: row.wrappedDekRecovery as string,
            recoveryWrapIv: row.recoveryWrapIv as string,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-01T00:00:00Z'),
          }
          keyRows.push(created)
          return [created]
        }
        const run = (skipOnConflict: boolean) =>
          table === householdsTableRef ? insertHousehold() : insertKey(skipOnConflict)
        return {
          returning: () => Promise.resolve(run(false)),
          onConflictDoNothing: () => ({ returning: () => Promise.resolve(run(true)) }),
        }
      },
    }),
  },
}))

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    eq: (col: { name?: string }, value: string) => ({ __eq: [col, value] as [{ name?: string }, string] }),
  }
})

const schema = await import('../drizzle/schema.js')
const householdsTableRef = schema.households
const householdKeysTableRef = schema.householdKeys

const { app } = await import('./app.js')
const { householdKeysRateLimiter, HOUSEHOLD_KEYS_RATE_LIMIT } = await import('./routes/household-keys.js')

interface HouseholdResponse {
  household: { id: string } | null
}
interface HouseholdKeysResponse {
  householdKeys?: Record<string, unknown>
  error?: string
}

// Synthetic, opaque base64url blobs — no real key material, no real names.
function validBody(tag: string) {
  return {
    kdfAlg: 'PBKDF2-SHA256',
    kdfIterations: 600_000,
    passphraseSalt: `salt-passphrase-${tag}`,
    wrappedDekPassphrase: `wrapped-passphrase-${tag}`,
    passphraseWrapIv: `iv-passphrase-${tag}`,
    recoverySalt: `salt-recovery-${tag}`,
    wrappedDekRecovery: `wrapped-recovery-${tag}`,
    recoveryWrapIv: `iv-recovery-${tag}`,
  }
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

function get(token: string) {
  return app.request('/api/household-keys', { headers: { authorization: `Bearer ${token}` } })
}

function post(token: string, body: unknown) {
  return app.request('/api/household-keys', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

describe('household-keys routes', () => {
  beforeEach(() => {
    households = []
    keyRows = []
    householdKeysRateLimiter.reset()
  })

  it('rejects GET with no Authorization header', async () => {
    const res = await app.request('/api/household-keys')
    expect(res.status).toBe(401)
  })

  it('rejects POST with no Authorization header, writing nothing', async () => {
    const res = await app.request('/api/household-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody('a')),
    })
    expect(res.status).toBe(401)
    expect(keyRows).toHaveLength(0)
  })

  it('rejects a token that fails verification', async () => {
    const res = await get('invalid')
    expect(res.status).toBe(401)
  })

  it('returns 404 when the household has no key material yet', async () => {
    await createHousehold('user_a', 'Household One')
    const res = await get('user_a')
    expect(res.status).toBe(404)
    const body = (await res.json()) as HouseholdKeysResponse
    expect(body.error).toBe('household_keys_not_found')
  })

  it('returns 404 when the caller has no household at all', async () => {
    const res = await get('user_no_household')
    expect(res.status).toBe(404)
  })

  it('creates the key row and returns exactly the stored fields', async () => {
    await createHousehold('user_a', 'Household One')
    const res = await post('user_a', validBody('a'))
    expect(res.status).toBe(201)

    const created = ((await res.json()) as HouseholdKeysResponse).householdKeys!
    expect(created).toEqual({
      householdId: 'h-1',
      kdfAlg: 'PBKDF2-SHA256',
      kdfIterations: 600_000,
      passphraseSalt: 'salt-passphrase-a',
      wrappedDekPassphrase: 'wrapped-passphrase-a',
      passphraseWrapIv: 'iv-passphrase-a',
      recoverySalt: 'salt-recovery-a',
      wrappedDekRecovery: 'wrapped-recovery-a',
      recoveryWrapIv: 'iv-recovery-a',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it('GET returns the stored row after creation', async () => {
    await createHousehold('user_a', 'Household One')
    await post('user_a', validBody('a'))

    const res = await get('user_a')
    expect(res.status).toBe(200)
    const body = (await res.json()) as HouseholdKeysResponse
    expect(body.householdKeys).toMatchObject({
      householdId: 'h-1',
      kdfAlg: 'PBKDF2-SHA256',
      kdfIterations: 600_000,
      wrappedDekPassphrase: 'wrapped-passphrase-a',
    })
  })

  it("never returns another household's key material", async () => {
    await createHousehold('user_a', 'Household One')
    await createHousehold('user_b', 'Household Two')
    // Seed the OTHER household's real key row, not a mock return value.
    expect((await post('user_b', validBody('b'))).status).toBe(201)

    const beforeOwn = await get('user_a')
    expect(beforeOwn.status).toBe(404)

    await post('user_a', validBody('a'))
    const res = await get('user_a')
    const body = (await res.json()) as HouseholdKeysResponse
    expect(body.householdKeys?.householdId).toBe('h-1')
    expect(body.householdKeys?.wrappedDekPassphrase).toBe('wrapped-passphrase-a')
    expect(JSON.stringify(body)).not.toContain('-b')
    // And user B's row is untouched by anything user A did.
    expect(keyRows.find((k) => k.householdId === 'h-2')?.wrappedDekPassphrase).toBe('wrapped-passphrase-b')
  })

  it('returns 409 on a second POST and leaves the stored row completely unchanged', async () => {
    await createHousehold('user_a', 'Household One')
    await post('user_a', validBody('a'))
    const original = { ...keyRows[0] }

    const res = await post('user_a', validBody('overwrite'))
    expect(res.status).toBe(409)
    expect(((await res.json()) as HouseholdKeysResponse).error).toBe('household_keys_exist')

    expect(keyRows).toHaveLength(1)
    expect(keyRows[0]).toEqual(original)

    // And the GET still serves the original material, not the attempted one.
    const after = (await (await get('user_a')).json()) as HouseholdKeysResponse
    expect(after.householdKeys?.wrappedDekPassphrase).toBe('wrapped-passphrase-a')
    expect(after.householdKeys?.recoveryWrapIv).toBe('iv-recovery-a')
  })

  it('returns 404 on POST when the caller has no household', async () => {
    const res = await post('user_no_household', validBody('a'))
    expect(res.status).toBe(404)
    expect(keyRows).toHaveLength(0)
  })

  it('rejects a malformed body with 400 and writes nothing', async () => {
    await createHousehold('user_a', 'Household One')
    const res = await post('user_a', { notAField: true })
    expect(res.status).toBe(400)
    expect(keyRows).toHaveLength(0)
  })

  it('rejects non-JSON body with 400', async () => {
    await createHousehold('user_a', 'Household One')
    const res = await app.request('/api/household-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: 'not json',
    })
    expect(res.status).toBe(400)
    expect(keyRows).toHaveLength(0)
  })

  it('rejects extra unexpected fields with 400', async () => {
    await createHousehold('user_a', 'Household One')
    const res = await post('user_a', { ...validBody('a'), householdId: 'h-2', plaintextPassphrase: 'hunter2' })
    expect(res.status).toBe(400)
    expect(keyRows).toHaveLength(0)
  })

  it('rejects non-base64url blob values with 400', async () => {
    await createHousehold('user_a', 'Household One')
    const res = await post('user_a', { ...validBody('a'), passphraseSalt: 'not base64url!!' })
    expect(res.status).toBe(400)
    expect(keyRows).toHaveLength(0)
  })

  it('rejects an over-long blob with 400', async () => {
    await createHousehold('user_a', 'Household One')
    const res = await post('user_a', { ...validBody('a'), wrappedDekPassphrase: 'a'.repeat(5000) })
    expect(res.status).toBe(400)
    expect(keyRows).toHaveLength(0)
  })

  it('rejects a trivially weak KDF iteration count with 400', async () => {
    await createHousehold('user_a', 'Household One')
    for (const kdfIterations of [1, 1000, -600_000, 1.5]) {
      const res = await post('user_a', { ...validBody('a'), kdfIterations })
      expect(res.status).toBe(400)
    }
    expect(keyRows).toHaveLength(0)
  })

  it('rejects an unknown KDF algorithm with 400', async () => {
    await createHousehold('user_a', 'Household One')
    const res = await post('user_a', { ...validBody('a'), kdfAlg: 'rot13' })
    expect(res.status).toBe(400)
    expect(keyRows).toHaveLength(0)
  })

  it('sets Cache-Control: no-store on both GET and POST responses', async () => {
    await createHousehold('user_a', 'Household One')

    const missing = await get('user_a')
    expect(missing.headers.get('cache-control')).toBe('no-store')

    const created = await post('user_a', validBody('a'))
    expect(created.headers.get('cache-control')).toBe('no-store')

    const found = await get('user_a')
    expect(found.headers.get('cache-control')).toBe('no-store')
  })

  it('rate-limits the route per authenticated user and reports Retry-After', async () => {
    await createHousehold('user_a', 'Household One')

    for (let i = 1; i < HOUSEHOLD_KEYS_RATE_LIMIT.limit; i += 1) {
      const res = await get('user_a')
      expect(res.status).toBe(404)
    }

    const last = await get('user_a')
    expect(last.status).toBe(404)

    const blocked = await get('user_a')
    expect(blocked.status).toBe(429)
    expect(((await blocked.json()) as HouseholdKeysResponse).error).toBe('rate_limited')
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(blocked.headers.get('cache-control')).toBe('no-store')
  })

  it('one user exhausting the rate limit does not block another user', async () => {
    await createHousehold('user_a', 'Household One')
    await createHousehold('user_b', 'Household Two')

    for (let i = 0; i <= HOUSEHOLD_KEYS_RATE_LIMIT.limit; i += 1) await get('user_a')
    expect((await get('user_a')).status).toBe(429)
    expect((await get('user_b')).status).toBe(404)
  })
})
