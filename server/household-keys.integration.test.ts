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
  /** Legacy plaintext column — always null now that the name is encrypted. */
  name: string | null
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

interface LedgerRow {
  id: string
  householdId: string
  name: string
  isBaseline: boolean
  origin: string
}

let households: HouseholdRow[] = []
let keyRows: HouseholdKeyRow[] = []
let ledgerRows: LedgerRow[] = []
let ledgerCounter = 0

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
          function rowsFor(): unknown[] {
            if (table === householdsTableRef) return households.filter((h) => matches(h, { owner_user_id: 'ownerUserId', id: 'id' }))
            if (table === householdKeysTableRef) return keyRows.filter((k) => matches(k, { household_id: 'householdId' }))
            if (table === ledgersTableRef) return ledgerRows.filter((l) => matches(l, { household_id: 'householdId', is_baseline: 'isBaseline', id: 'id' }))
            throw new Error('fake db: unhandled table in select()')
          }
          const rows = rowsFor()
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
            id: row.id as string,
            ownerUserId: row.ownerUserId as string,
            name: null,
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
        function insertLedger() {
          const created: LedgerRow = {
            id: (row.id as string) ?? `ledger-${++ledgerCounter}`,
            householdId: row.householdId as string,
            name: row.name as string,
            isBaseline: row.isBaseline as boolean,
            origin: row.origin as string,
          }
          ledgerRows.push(created)
          return [created]
        }
        const run = (skipOnConflict: boolean) => {
          if (table === householdsTableRef) return insertHousehold()
          if (table === ledgersTableRef) return insertLedger()
          if (table === householdKeysTableRef) return insertKey(skipOnConflict)
          throw new Error('fake db: unhandled table in insert()')
        }
        return {
          returning: () => Promise.resolve(run(false)),
          onConflictDoNothing: () => ({ returning: () => Promise.resolve(run(true)) }),
        }
      },
    }),
    // Mirrors a single SQL UPDATE ... WHERE household_id = $1 RETURNING *:
    // it mutates the matched row's named columns and nothing else, and it
    // never inserts. An empty returning() is how the route detects "no row".
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (cond: { __eq?: [{ name?: string }, string] }) => ({
          returning: () => {
            if (table !== householdKeysTableRef) return Promise.resolve([])
            const householdId = cond.__eq?.[1]
            const row = keyRows.find((k) => k.householdId === householdId)
            if (!row) return Promise.resolve([])
            Object.assign(row, values)
            return Promise.resolve([row])
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
    eq: (col: { name?: string }, value: string) => ({ __eq: [col, value] as [{ name?: string }, string] }),
  }
})

const schema = await import('../drizzle/schema.js')
const householdsTableRef = schema.households
const householdKeysTableRef = schema.householdKeys
const ledgersTableRef = schema.ledgers

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

// /api/household stores an opaque envelope and takes a client-generated id
// (see server/lib/envelope.ts). The label argument survives only to keep these
// call sites readable — it never reaches the server.
const HOUSEHOLD_IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
]
const householdEnvelope = { ciphertext: 'Y2lwaGVydGV4dC1vbmU', iv: 'aXYtYnl0ZXMtMTIx', alg: 'AES-256-GCM' }
let householdSeq = 0

async function createHousehold(token: string, _label: string) {
  const res = await app.request('/api/household', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: HOUSEHOLD_IDS[householdSeq++], ...householdEnvelope }),
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

function patch(token: string, body: unknown) {
  return app.request('/api/household-keys', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

/** A passphrase change: the three passphrase columns and nothing else. */
function passphraseUpdate(tag: string) {
  return {
    credential: 'passphrase' as const,
    passphraseSalt: `salt-passphrase-${tag}`,
    wrappedDekPassphrase: `wrapped-passphrase-${tag}`,
    passphraseWrapIv: `iv-passphrase-${tag}`,
  }
}

/** A recovery-code reset: the three recovery columns and nothing else. */
function recoveryUpdate(tag: string) {
  return {
    credential: 'recovery' as const,
    recoverySalt: `salt-recovery-${tag}`,
    wrappedDekRecovery: `wrapped-recovery-${tag}`,
    recoveryWrapIv: `iv-recovery-${tag}`,
  }
}

describe('household-keys routes', () => {
  beforeEach(() => {
    households = []
    keyRows = []
    ledgerRows = []
    ledgerCounter = 0
    householdSeq = 0
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
      householdId: HOUSEHOLD_IDS[0],
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
      householdId: HOUSEHOLD_IDS[0],
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
    expect(body.householdKeys?.householdId).toBe(HOUSEHOLD_IDS[0])
    expect(body.householdKeys?.wrappedDekPassphrase).toBe('wrapped-passphrase-a')
    expect(JSON.stringify(body)).not.toContain('-b')
    // And user B's row is untouched by anything user A did.
    expect(keyRows.find((k) => k.householdId === HOUSEHOLD_IDS[1])?.wrappedDekPassphrase).toBe('wrapped-passphrase-b')
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
    const res = await post('user_a', { ...validBody('a'), householdId: HOUSEHOLD_IDS[1], plaintextPassphrase: 'hunter2' })
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

/**
 * PATCH /api/household-keys — re-wrap ONE credential.
 *
 * The single most dangerous write in the app: every one of these updates
 * overwrites a copy that is the only way back to a household's data. The two
 * credentials are kept apart by two strict schemas rather than by convention,
 * and each update is one SQL statement, so a body can neither name the other
 * credential's columns nor land half-applied.
 */
describe('household-keys PATCH — credential rotation', () => {
  beforeEach(() => {
    households = []
    keyRows = []
    ledgerRows = []
    ledgerCounter = 0
    householdSeq = 0
    householdKeysRateLimiter.reset()
  })

  async function seeded(token = 'user_a') {
    await createHousehold(token, 'Household One')
    expect((await post(token, validBody('a'))).status).toBe(201)
    return { ...keyRows[0] }
  }

  it('rejects PATCH with no Authorization header, writing nothing', async () => {
    const before = await seeded()
    const res = await app.request('/api/household-keys', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(passphraseUpdate('new')),
    })
    expect(res.status).toBe(401)
    expect(keyRows[0]).toEqual(before)
  })

  it('rejects a token that fails verification', async () => {
    await seeded()
    expect((await patch('invalid', passphraseUpdate('new'))).status).toBe(401)
  })

  it('replaces only the passphrase columns, leaving the recovery copy byte-identical', async () => {
    const before = await seeded()

    const res = await patch('user_a', passphraseUpdate('new'))
    expect(res.status).toBe(200)

    const row = keyRows[0]
    expect(row.passphraseSalt).toBe('salt-passphrase-new')
    expect(row.wrappedDekPassphrase).toBe('wrapped-passphrase-new')
    expect(row.passphraseWrapIv).toBe('iv-passphrase-new')
    // The recovery credential must survive a passphrase change untouched.
    expect(row.recoverySalt).toBe(before.recoverySalt)
    expect(row.wrappedDekRecovery).toBe(before.wrappedDekRecovery)
    expect(row.recoveryWrapIv).toBe(before.recoveryWrapIv)
    // And the KDF parameters, which BOTH copies are derived at.
    expect(row.kdfAlg).toBe(before.kdfAlg)
    expect(row.kdfIterations).toBe(before.kdfIterations)
  })

  it('replaces only the recovery columns, leaving the passphrase copy byte-identical', async () => {
    const before = await seeded()

    const res = await patch('user_a', recoveryUpdate('new'))
    expect(res.status).toBe(200)

    const row = keyRows[0]
    expect(row.recoverySalt).toBe('salt-recovery-new')
    expect(row.wrappedDekRecovery).toBe('wrapped-recovery-new')
    expect(row.recoveryWrapIv).toBe('iv-recovery-new')
    expect(row.passphraseSalt).toBe(before.passphraseSalt)
    expect(row.wrappedDekPassphrase).toBe(before.wrappedDekPassphrase)
    expect(row.passphraseWrapIv).toBe(before.passphraseWrapIv)
    expect(row.kdfIterations).toBe(before.kdfIterations)
  })

  it('returns the full stored row so the client can keep working from it', async () => {
    await seeded()
    const res = await patch('user_a', passphraseUpdate('new'))
    const body = (await res.json()) as HouseholdKeysResponse
    expect(body.householdKeys).toMatchObject({
      householdId: HOUSEHOLD_IDS[0],
      kdfAlg: 'PBKDF2-SHA256',
      kdfIterations: 600_000,
      wrappedDekPassphrase: 'wrapped-passphrase-new',
      wrappedDekRecovery: 'wrapped-recovery-a',
    })
  })

  it('refuses a passphrase change that also tries to set recovery fields', async () => {
    const before = await seeded()
    for (const smuggled of [
      { ...passphraseUpdate('new'), wrappedDekRecovery: 'wrapped-recovery-evil' },
      { ...passphraseUpdate('new'), recoverySalt: 'salt-recovery-evil' },
      { ...passphraseUpdate('new'), recoveryWrapIv: 'iv-recovery-evil' },
    ]) {
      const res = await patch('user_a', smuggled)
      expect(res.status).toBe(400)
    }
    expect(keyRows[0]).toEqual(before)
  })

  it('refuses a recovery reset that also tries to set passphrase fields', async () => {
    const before = await seeded()
    for (const smuggled of [
      { ...recoveryUpdate('new'), wrappedDekPassphrase: 'wrapped-passphrase-evil' },
      { ...recoveryUpdate('new'), passphraseSalt: 'salt-passphrase-evil' },
      { ...recoveryUpdate('new'), passphraseWrapIv: 'iv-passphrase-evil' },
    ]) {
      const res = await patch('user_a', smuggled)
      expect(res.status).toBe(400)
    }
    expect(keyRows[0]).toEqual(before)
  })

  it('refuses a body that tries to move the household, the KDF, or the iteration count', async () => {
    const before = await seeded()
    for (const smuggled of [
      { ...passphraseUpdate('new'), householdId: HOUSEHOLD_IDS[1] },
      { ...passphraseUpdate('new'), kdfIterations: 100_000 },
      { ...passphraseUpdate('new'), kdfAlg: 'rot13' },
      { ...passphraseUpdate('new'), plaintextPassphrase: 'hunter2' },
    ]) {
      expect((await patch('user_a', smuggled)).status).toBe(400)
    }
    expect(keyRows[0]).toEqual(before)
  })

  it('refuses a body with no credential discriminator, or an unknown one', async () => {
    const before = await seeded()
    const { credential: _dropped, ...noDiscriminator } = passphraseUpdate('new')
    for (const bad of [
      noDiscriminator,
      { ...passphraseUpdate('new'), credential: 'both' },
      { ...passphraseUpdate('new'), credential: 'recovery' },
      {},
      null,
    ]) {
      expect((await patch('user_a', bad)).status).toBe(400)
    }
    expect(keyRows[0]).toEqual(before)
  })

  it('refuses a partial credential — every column of the one being changed must be present', async () => {
    const before = await seeded()
    const full = passphraseUpdate('new')
    for (const field of ['passphraseSalt', 'wrappedDekPassphrase', 'passphraseWrapIv'] as const) {
      const partial: Record<string, unknown> = { ...full }
      delete partial[field]
      expect((await patch('user_a', partial)).status).toBe(400)
    }
    expect(keyRows[0]).toEqual(before)
  })

  it('refuses non-base64url and over-long blobs', async () => {
    const before = await seeded()
    expect((await patch('user_a', { ...passphraseUpdate('new'), passphraseSalt: 'not base64url!!' })).status).toBe(400)
    expect((await patch('user_a', { ...passphraseUpdate('new'), wrappedDekPassphrase: 'a'.repeat(5000) })).status).toBe(400)
    expect((await patch('user_a', { ...recoveryUpdate('new'), recoveryWrapIv: '=' })).status).toBe(400)
    expect(keyRows[0]).toEqual(before)
  })

  it('rejects a non-JSON body with 400', async () => {
    const before = await seeded()
    const res = await app.request('/api/household-keys', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user_a' },
      body: 'not json',
    })
    expect(res.status).toBe(400)
    expect(keyRows[0]).toEqual(before)
  })

  it('returns 404 when there is no key row, and never creates one', async () => {
    await createHousehold('user_a', 'Household One')
    const res = await patch('user_a', passphraseUpdate('new'))
    expect(res.status).toBe(404)
    expect(((await res.json()) as HouseholdKeysResponse).error).toBe('household_keys_not_found')
    expect(keyRows).toHaveLength(0)
  })

  it('returns 404 when the caller has no household at all, and creates nothing', async () => {
    const res = await patch('user_no_household', passphraseUpdate('new'))
    expect(res.status).toBe(404)
    expect(keyRows).toHaveLength(0)
    expect(households).toHaveLength(0)
  })

  it("cannot touch another household's key material", async () => {
    await createHousehold('user_a', 'Household One')
    await createHousehold('user_b', 'Household Two')
    await post('user_a', validBody('a'))
    await post('user_b', validBody('b'))
    const bBefore = { ...keyRows.find((k) => k.householdId === HOUSEHOLD_IDS[1])! }

    // Every shape a client could use to try to name the other household.
    expect((await patch('user_a', { ...passphraseUpdate('new'), householdId: HOUSEHOLD_IDS[1] })).status).toBe(400)
    expect((await patch('user_a', passphraseUpdate('new'))).status).toBe(200)

    expect(keyRows.find((k) => k.householdId === HOUSEHOLD_IDS[1])).toEqual(bBefore)
    expect(keyRows.find((k) => k.householdId === HOUSEHOLD_IDS[0])?.wrappedDekPassphrase).toBe('wrapped-passphrase-new')
  })

  it('sets Cache-Control: no-store on every PATCH response', async () => {
    await seeded()
    expect((await patch('user_a', passphraseUpdate('new'))).headers.get('cache-control')).toBe('no-store')
    expect((await patch('user_a', { bogus: true })).headers.get('cache-control')).toBe('no-store')
    expect((await patch('user_no_household', passphraseUpdate('new'))).headers.get('cache-control')).toBe('no-store')
  })

  it('rate-limits the credential-change route per authenticated user', async () => {
    await seeded()
    // seeded() already spent 2 of the window (POST + the GET-free create path
    // uses one check), so drive the rest through PATCH until it blocks.
    let blocked: Response | null = null
    for (let i = 0; i < HOUSEHOLD_KEYS_RATE_LIMIT.limit + 2; i += 1) {
      const res = await patch('user_a', passphraseUpdate(`n${i}`))
      if (res.status === 429) {
        blocked = res
        break
      }
    }
    expect(blocked).not.toBeNull()
    expect(((await blocked!.json()) as HouseholdKeysResponse).error).toBe('rate_limited')
    expect(Number(blocked!.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(blocked!.headers.get('cache-control')).toBe('no-store')
  })

  it('one user exhausting the limit does not block another user from rotating', async () => {
    await createHousehold('user_a', 'Household One')
    await createHousehold('user_b', 'Household Two')
    await post('user_a', validBody('a'))
    await post('user_b', validBody('b'))

    for (let i = 0; i <= HOUSEHOLD_KEYS_RATE_LIMIT.limit; i += 1) await patch('user_a', passphraseUpdate('x'))
    expect((await patch('user_a', passphraseUpdate('y'))).status).toBe(429)
    expect((await patch('user_b', passphraseUpdate('b2'))).status).toBe(200)
  })
})
