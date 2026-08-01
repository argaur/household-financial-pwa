import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../lib/db.js'
import { verifyUserId } from '../lib/auth.js'
import { getHouseholdForOwner } from '../lib/household.js'
import { FixedWindowRateLimiter } from '../lib/rate-limit.js'
import {
  getHouseholdKeys,
  createHouseholdKeys,
  rewrapHouseholdKeys,
  SUPPORTED_KDF_ALG,
  type HouseholdKeyRow,
} from '../lib/household-keys.js'

/**
 * /api/household-keys — wrapped key material for the caller's household.
 *
 * Route shape: this project's zero-config Vercel build only routes
 * single-path-segment /api/* requests to the catch-all function (see
 * server/routes/protection.ts), so this is a flat resource root. GET, POST and
 * PATCH on the same path is fine — HTTP methods are not path segments, and a
 * second segment such as /api/household-keys/rotate would 404 at the platform
 * before Hono ever saw it.
 *
 * The server stores opaque blobs and can never decrypt them.
 */

// Base64url alphabet only (RFC 4648 §5, unpadded). Anything outside it — spaces,
// '+', '/', '=', punctuation — is rejected, so the endpoint cannot be used to
// stash something that looks like a plaintext secret. Bounds are generous
// enough for a wrapped 256-bit DEK plus AEAD tag, and small enough that a large
// body cannot be smuggled through.
const base64urlBlob = (max: number) =>
  z
    .string()
    .min(8)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+$/, 'must be unpadded base64url')

// PBKDF2-SHA256 floor. OWASP's 2023 guidance is 600k iterations; 100k is the
// hard floor so a client bug can never persist a trivially weak KDF, and the
// ceiling stops a bogus value from pinning a device at 100% CPU.
const MIN_KDF_ITERATIONS = 100_000
const MAX_KDF_ITERATIONS = 10_000_000

// .strict() — unknown keys are rejected outright rather than silently dropped,
// so a client that tries to smuggle e.g. householdId or a plaintext field gets
// a 400 instead of a partially-honoured write.
const createHouseholdKeysSchema = z
  .object({
    kdfAlg: z.literal(SUPPORTED_KDF_ALG),
    kdfIterations: z.number().int().min(MIN_KDF_ITERATIONS).max(MAX_KDF_ITERATIONS),
    passphraseSalt: base64urlBlob(256),
    wrappedDekPassphrase: base64urlBlob(1024),
    passphraseWrapIv: base64urlBlob(64),
    recoverySalt: base64urlBlob(256),
    wrappedDekRecovery: base64urlBlob(1024),
    recoveryWrapIv: base64urlBlob(64),
  })
  .strict()

/**
 * Rotating ONE credential.
 *
 * Two disjoint `.strict()` shapes behind a discriminated union, not one schema
 * with optional fields. That choice is the safety property: a body tagged
 * `passphrase` cannot name a recovery column and a body tagged `recovery`
 * cannot name a passphrase column, because in each case the other credential's
 * keys are simply unknown and `.strict()` rejects the whole request. It is
 * therefore impossible to express "change the passphrase and also overwrite the
 * recovery copy" — the request 400s before any handler runs.
 *
 * Neither shape accepts `kdfAlg`, `kdfIterations` or `householdId`. The first
 * two are shared by both wrapped copies, so moving them while rotating one
 * credential would silently strand the other; the third is resolved from the
 * Clerk session and never from the client.
 *
 * Every blob is validated as bounded base64url on exactly the same terms as the
 * create schema and server/lib/envelope.ts.
 */
const rewritePassphraseSchema = z
  .object({
    credential: z.literal('passphrase'),
    passphraseSalt: base64urlBlob(256),
    wrappedDekPassphrase: base64urlBlob(1024),
    passphraseWrapIv: base64urlBlob(64),
  })
  .strict()

const rewriteRecoverySchema = z
  .object({
    credential: z.literal('recovery'),
    recoverySalt: base64urlBlob(256),
    wrappedDekRecovery: base64urlBlob(1024),
    recoveryWrapIv: base64urlBlob(64),
  })
  .strict()

const rewrapHouseholdKeysSchema = z.discriminatedUnion('credential', [
  rewritePassphraseSchema,
  rewriteRecoverySchema,
])

/**
 * SEC-001. An unlimited endpoint that hands out wrapped key material is a free
 * source of blobs for offline passphrase guessing, so the route is rate limited
 * per authenticated user id.
 *
 * 30 requests per 60s: real usage is one GET on session start, a single POST at
 * setup, and an occasional PATCH to change a passphrase or reset a recovery code
 * (a handful more if the user retries), so 30/min never touches a legitimate
 * client, while capping how fast one account's blob can be re-harvested. Keyed
 * by user id, not IP — the caller is always authenticated here, and a user id is
 * the thing an attacker cannot rotate freely.
 *
 * PATCH is limited by the same counter and deliberately so: it is a
 * credential-change endpoint, and an unlimited one would let a hijacked session
 * churn the wrapped copies far faster than any human ever would.
 *
 * See server/lib/rate-limit.ts for the honest limitations: this is per-instance,
 * in-memory, best-effort friction, not a guarantee.
 */
export const HOUSEHOLD_KEYS_RATE_LIMIT = { limit: 30, windowMs: 60_000 } as const
export const householdKeysRateLimiter = new FixedWindowRateLimiter(HOUSEHOLD_KEYS_RATE_LIMIT)

export const householdKeysRoutes = new Hono()

// Key material must never sit in a browser, proxy or CDN cache — applied to
// every response on this route, including errors.
householdKeysRoutes.use('*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
})

/** Only the stored columns, listed explicitly so a future schema addition can never leak by accident. */
function serialize(row: HouseholdKeyRow) {
  return {
    householdId: row.householdId,
    kdfAlg: row.kdfAlg,
    kdfIterations: row.kdfIterations,
    passphraseSalt: row.passphraseSalt,
    wrappedDekPassphrase: row.wrappedDekPassphrase,
    passphraseWrapIv: row.passphraseWrapIv,
    recoverySalt: row.recoverySalt,
    wrappedDekRecovery: row.wrappedDekRecovery,
    recoveryWrapIv: row.recoveryWrapIv,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

householdKeysRoutes.get('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const limit = householdKeysRateLimiter.check(userId)
  if (!limit.allowed) {
    c.header('Retry-After', String(limit.retryAfterSeconds))
    return c.json({ error: 'rate_limited' }, 429)
  }

  // Scoped by the household resolved from the session — never from a query
  // param or body, so one household's key material can't be requested by id.
  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_keys_not_found' }, 404)

  const row = await getHouseholdKeys(db, household.id)
  if (!row) return c.json({ error: 'household_keys_not_found' }, 404)

  return c.json({ householdKeys: serialize(row) })
})

householdKeysRoutes.post('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const limit = householdKeysRateLimiter.check(userId)
  if (!limit.allowed) {
    c.header('Retry-After', String(limit.retryAfterSeconds))
    return c.json({ error: 'rate_limited' }, 429)
  }

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_not_found' }, 404)

  const body = await c.req.json().catch(() => null)
  const parsed = createHouseholdKeysSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_household_keys' }, 400)

  // Create-only. An existing row is never overwritten — doing so would render
  // every encrypted row in the household permanently unreadable. Re-keying is a
  // separate explicit flow, not a side effect of POSTing twice.
  const existing = await getHouseholdKeys(db, household.id)
  if (existing) return c.json({ error: 'household_keys_exist' }, 409)

  const row = await createHouseholdKeys(db, household.id, parsed.data)
  if (!row) return c.json({ error: 'household_keys_exist' }, 409)

  return c.json({ householdKeys: serialize(row) }, 201)
})

/**
 * PATCH — re-wrap one credential's copy of the data key.
 *
 * The server learns nothing here. It receives three opaque blobs, cannot tell a
 * passphrase change from a recovery reset beyond the discriminator the client
 * sent, and could not verify the new blob opens even if it wanted to. That
 * verification happens in the browser BEFORE this request is made
 * (src/lib/credential-change.ts) — it is the client's job because only the
 * client has the credential.
 *
 * What the server does guarantee: the write is scoped to the session's own
 * household, touches exactly one credential's columns, and lands in a single
 * atomic statement or not at all.
 */
householdKeysRoutes.patch('/', async (c) => {
  const userId = await verifyUserId(c.req.header('authorization'))
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const limit = householdKeysRateLimiter.check(userId)
  if (!limit.allowed) {
    c.header('Retry-After', String(limit.retryAfterSeconds))
    return c.json({ error: 'rate_limited' }, 429)
  }

  const household = await getHouseholdForOwner(db, userId)
  if (!household) return c.json({ error: 'household_not_found' }, 404)

  const body = await c.req.json().catch(() => null)
  const parsed = rewrapHouseholdKeysSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_household_keys' }, 400)

  // The discriminator selected the schema; it is not a column, so it is dropped
  // before the row ever sees the input.
  const { credential: _credential, ...columns } = parsed.data

  // UPDATE, never upsert. No row means there is nothing to rotate — this route
  // must not conjure key material for a household that never had any, because
  // the data key it would wrap is not the one the household's rows are sealed
  // under.
  const row = await rewrapHouseholdKeys(db, household.id, columns)
  if (!row) return c.json({ error: 'household_keys_not_found' }, 404)

  return c.json({ householdKeys: serialize(row) })
})
