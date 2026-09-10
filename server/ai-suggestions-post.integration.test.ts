import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Hono } from 'hono'
import { createAiDbFake, type AiDbFake } from './test-helpers/ai-db-fake.js'
import {
  createAiCallCounterConsumer,
  MAX_AI_EDITS_PER_LEDGER,
  MAX_AI_PLANS_PER_HOUSEHOLD,
  aiUsagePeriod,
} from './lib/ai-counters.js'
import { AI_SUGGESTION_MODEL, type AiSuggestionProvider } from './lib/ai-provider.js'
import { EDUCATION_NOT_ADVICE_CAVEAT } from './lib/ai-suggestion-output.js'
import { createAiSuggestionsRoutes, type AiSuggestionsRouteDeps } from './routes/ai-suggestions.js'

process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_ZmFrZS5jbGFyay5hY2NvdW50cy5kZXYk'

// Same fake-token pattern as the other integration tests in this folder: the
// bearer token IS the userId, so a real Hono request can be driven without a
// Clerk-signed JWT.
// The route module holds a mounted instance built against the real Neon
// client, which throws at import time without DATABASE_URL. Every test here
// builds its own routes from the factory with an in-memory fake, so the real
// handle is never used — it only has to exist.
vi.mock('./lib/db.js', () => ({ db: {} }))

vi.mock('jose', () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: async (token: string) => {
    if (token === 'invalid') throw new Error('signature verification failed')
    return { payload: { sub: token } }
  },
}))

/**
 * A3, A4 and A5 for `POST /api/ai-suggestions`.
 *
 * **No real provider call and no real key is involved anywhere in this file.**
 * The provider is an injected dependency and every test here supplies a fake
 * one; the route's own default is `null`, which is refused before any counter
 * moves. Nothing reads `ANTHROPIC_API_KEY`.
 *
 * The order the route runs in is the security property, so most of this file is
 * about ordering rather than about outcomes. The single most important test is
 * "does not call the provider when the household is already at its plans cap":
 * moving the provider call above the counter UPDATEs is the mutation that
 * silently removes the entire cost control, and it must turn this file red.
 */

const HOUSEHOLD_A = '11111111-1111-4111-8111-111111111111'
const LEDGER_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const LEDGER_B = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb'
const KEY_ONE = '3f7b6a10-1c4e-4a5d-9f2b-8c1e5d0a7b31'
const KEY_TWO = '9c2d4e88-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
const KEY_THREE = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const KEY_FOUR = '7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b'

const GOAL_PLAN_BODY = {
  kind: 'goal_plan',
  idempotencyKey: KEY_ONE,
  horizonYears: 18,
  targetAmountBandInr: 5_000_000,
  monthlyCapacityBandInr: 47_000,
  currentMix: [
    { assetClass: 'equity', weightPct: 60 },
    { assetClass: 'debt', weightPct: 25 },
    { assetClass: 'gold', weightPct: 15 },
  ],
}

const COUNSEL_BODY = {
  kind: 'counsel',
  idempotencyKey: KEY_ONE,
  ledgerId: LEDGER_A,
  currentMix: [
    { assetClass: 'equity', weightPct: 60 },
    { assetClass: 'debt', weightPct: 40 },
  ],
  holdingSlugs: ['equity-index-funds-etfs', 'debt-ppf'],
}

const GOOD_SUGGESTION = {
  allocations: [
    { slug: 'equity-index-funds-etfs', weightPct: 60 },
    { slug: 'debt-ppf', weightPct: 40 },
  ],
  reasoning: 'An eighteen year horizon leaves room for a growth weighted mix.',
}

interface Harness {
  fake: AiDbFake
  app: Hono
  events: string[]
  providerCalls: unknown[]
  logs: unknown[][]
  sentry: unknown[]
  /** Snapshot of how many reservations existed at the moment counters ran. */
  reservationsWhenCountersRan: number | null
}

function buildHarness(options: {
  provider?: AiSuggestionProvider | null
  plansCreated?: number
  /** Edits already spent on `LEDGER_A`. `LEDGER_B` always starts at zero. */
  editsUsed?: number
  globalUsed?: number
  globalCap?: number
} = {}): Harness {
  const period = aiUsagePeriod(new Date())
  const fake = createAiDbFake({
    households: [{ id: HOUSEHOLD_A, ownerUserId: 'user_a', aiPlansCreated: options.plansCreated ?? 0 }],
    // Two ledgers in the same household, always. The per-ledger edits cap is
    // only a per-ledger cap if exhausting one leaves the other alone, and a
    // single-ledger fixture cannot tell that apart from a second household cap.
    ledgers: [
      { id: LEDGER_A, householdId: HOUSEHOLD_A, isBaseline: true, aiEditsUsed: options.editsUsed ?? 0 },
      { id: LEDGER_B, householdId: HOUSEHOLD_A, isBaseline: false, aiEditsUsed: 0 },
    ],
    globalUsage:
      options.globalUsed === undefined
        ? []
        : [
            {
              period,
              callsUsed: options.globalUsed,
              capCalls: options.globalCap ?? 50,
              updatedAt: new Date(),
            },
          ],
  })

  const events: string[] = []
  const providerCalls: unknown[] = []
  const logs: unknown[][] = []
  const sentry: unknown[] = []
  const harness: Harness = {
    fake,
    app: new Hono(),
    events,
    providerCalls,
    logs,
    sentry,
    reservationsWhenCountersRan: null,
  }

  // The real counter consumer, wrapped only to record when it ran. Substituting
  // a stub here would make the ordering test vacuous — it has to be the real
  // conditional UPDATEs that the provider is proven to run after.
  const realConsumer = createAiCallCounterConsumer(fake.db)

  const deps: AiSuggestionsRouteDeps = {
    db: fake.db,
    provider: options.provider === undefined ? okProvider(events, providerCalls) : options.provider,
    consumeCounters: async (context) => {
      events.push('counters')
      harness.reservationsWhenCountersRan = fake.reservations.length
      return realConsumer(context)
    },
    logger: {
      error: (...args: unknown[]) => logs.push(args),
      warn: (...args: unknown[]) => logs.push(args),
      info: (...args: unknown[]) => logs.push(args),
    },
    sentry: { captureException: (error: unknown, hint?: unknown) => sentry.push({ error, hint }) },
  }

  harness.app.route('/api/ai-suggestions', createAiSuggestionsRoutes(deps))
  return harness
}

function okProvider(events: string[], calls: unknown[], output: unknown = GOOD_SUGGESTION): AiSuggestionProvider {
  return {
    createSuggestion: async (input) => {
      events.push('provider')
      calls.push(input)
      return output
    },
  }
}

function throwingProvider(events: string[], calls: unknown[]): AiSuggestionProvider {
  return {
    createSuggestion: async (input) => {
      events.push('provider')
      calls.push(input)
      throw new Error('anthropic: 529 overloaded')
    },
  }
}

function post(harness: Harness, body: unknown, token: string | null = 'user_a', init: RequestInit = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  return harness.app.request('/api/ai-suggestions', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  })
}

/**
 * A request whose body cannot be read without the spy firing.
 *
 * This is what makes "auth before the body is read at all" a real assertion
 * rather than a reading of the source: every method Hono could use to get at
 * the body is wrapped, so a route that touches the body first is caught even if
 * it does so through a path this test did not anticipate.
 */
function spiedRequest(body: string, token: string | null): { request: Request; reads: string[] } {
  const reads: string[] = []
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  const request = new Request('http://localhost/api/ai-suggestions', { method: 'POST', headers, body })

  for (const method of ['json', 'text', 'arrayBuffer', 'blob', 'formData'] as const) {
    const original = request[method].bind(request) as () => Promise<unknown>
    Object.defineProperty(request, method, {
      configurable: true,
      value: () => {
        reads.push(method)
        return original()
      },
    })
  }
  Object.defineProperty(request, 'body', {
    configurable: true,
    get() {
      reads.push('body')
      return null
    },
  })

  return { request, reads }
}

let harness: Harness

beforeEach(() => {
  harness = buildHarness()
})

describe('POST /api/ai-suggestions — 1. auth is resolved before the body is read at all', () => {
  it('rejects an unauthenticated request without reading the body', async () => {
    const { request, reads } = spiedRequest(JSON.stringify(GOAL_PLAN_BODY), null)
    const res = await harness.app.request(request)

    expect(res.status).toBe(401)
    expect(reads).toEqual([])
    expect(harness.fake.reservations).toHaveLength(0)
    expect(harness.providerCalls).toHaveLength(0)
  })

  it('rejects an invalid token without reading the body', async () => {
    const { request, reads } = spiedRequest(JSON.stringify(GOAL_PLAN_BODY), 'invalid')
    const res = await harness.app.request(request)

    expect(res.status).toBe(401)
    expect(reads).toEqual([])
  })

  it('answers 401, not 400, for an unauthenticated request whose body would throw if parsed', async () => {
    // If the body were parsed first, this is a 400. A 401 is only reachable by
    // resolving the session before the body is touched.
    const res = await post(harness, '{ this is not json', null)
    expect(res.status).toBe(401)
  })

  it('answers 401, not 413, for an unauthenticated request whose body is over the size cap', async () => {
    const res = await post(harness, 'x'.repeat(100_000), null)
    expect(res.status).toBe(401)
  })

  it('answers 403 for a signed-in user with no household, before the body is read', async () => {
    const { request, reads } = spiedRequest(JSON.stringify(GOAL_PLAN_BODY), 'user_without_household')
    const res = await harness.app.request(request)

    expect(res.status).toBe(403)
    expect(reads).toEqual([])
    expect(harness.fake.reservations).toHaveLength(0)
  })
})

describe('POST /api/ai-suggestions — 2. size and shape limits before parse', () => {
  it('refuses an over-sized body with 413, before it is parsed', async () => {
    // Deliberately both over-sized AND malformed JSON. A 413 proves the size
    // check ran first; a 400 would mean the route parsed before measuring.
    const res = await post(harness, `{"kind":"goal_plan","junk":"${'x'.repeat(60_000)}`)
    expect(res.status).toBe(413)
    expect(harness.fake.reservations).toHaveLength(0)
    expect(harness.providerCalls).toHaveLength(0)
  })

  it('refuses malformed JSON with 400 and reserves nothing', async () => {
    const res = await post(harness, '{ this is not json')
    expect(res.status).toBe(400)
    expect(harness.fake.reservations).toHaveLength(0)
    expect(harness.providerCalls).toHaveLength(0)
  })

  it('refuses an unknown key with 400 — strict Zod, never a silent drop', async () => {
    const res = await post(harness, { ...GOAL_PLAN_BODY, memberName: 'Rinku' })
    expect(res.status).toBe(400)
    expect(harness.fake.reservations).toHaveLength(0)
    expect(harness.providerCalls).toHaveLength(0)
  })

  it('refuses an exact rupee amount with 400, so a body carrying one never reserves', async () => {
    const res = await post(harness, { ...GOAL_PLAN_BODY, targetAmountBandInr: 5_234_567 })
    expect(res.status).toBe(400)
    expect(harness.fake.reservations).toHaveLength(0)
    expect(harness.providerCalls).toHaveLength(0)
  })

  it('refuses an unknown kind with 400', async () => {
    const res = await post(harness, { ...GOAL_PLAN_BODY, kind: 'freeform' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/ai-suggestions — 3/4/5. reserve, then counters, then the provider', () => {
  it('runs the reservation insert, then the counter UPDATEs, then the provider, in that order', async () => {
    const res = await post(harness, GOAL_PLAN_BODY)
    expect(res.status).toBe(200)

    expect(harness.events).toEqual(['counters', 'provider'])
    // The reservation already existed when the counters ran, which is the
    // insert-before-counters half of the order.
    expect(harness.reservationsWhenCountersRan).toBe(1)
  })

  it('writes the reservation with cap_type plans and a null ledger for a goal plan', async () => {
    await post(harness, GOAL_PLAN_BODY)
    const [row] = harness.fake.reservations
    expect(row?.kind).toBe('goal_plan')
    expect(row?.capType).toBe('plans')
    expect(row?.ledgerId).toBeNull()
    expect(row?.householdId).toBe(HOUSEHOLD_A)
  })

  it('spends the household plans counter exactly once for one successful call', async () => {
    await post(harness, GOAL_PLAN_BODY)
    expect(harness.fake.households[0]?.aiPlansCreated).toBe(1)
  })

  it('settles the reservation completed on success', async () => {
    await post(harness, GOAL_PLAN_BODY)
    expect(harness.fake.reservations[0]?.status).toBe('completed')
  })

  it('calls the provider with the pinned model and the minimised payload, nothing else', async () => {
    await post(harness, GOAL_PLAN_BODY)
    expect(harness.providerCalls).toHaveLength(1)
    const call = harness.providerCalls[0] as Record<string, unknown>
    expect(call.model).toBe(AI_SUGGESTION_MODEL)
    expect(AI_SUGGESTION_MODEL).toBe('claude-sonnet-5')
    expect(call.kind).toBe('goal_plan')
    // Settled 2026-09-07 and not open for reinterpretation.
    expect(Object.keys(call).sort()).toEqual(['kind', 'model', 'payload'])
    expect(JSON.stringify(call)).not.toMatch(/cache|retry|queue|file/i)
  })

  it('returns the spec response shape with the fixed caveat and current usage', async () => {
    const res = await post(harness, GOAL_PLAN_BODY)
    const body = (await res.json()) as Record<string, never>
    expect(body.status).toBe('ok')
    expect(body.kind).toBe('goal_plan')
    expect(body.suggestion).toEqual({ ...GOOD_SUGGESTION, caveat: EDUCATION_NOT_ADVICE_CAVEAT })
    expect(Object.keys(body.usage).sort()).toEqual(['editsCap', 'editsUsed', 'plansCap', 'plansUsed'])
    expect((body.usage as Record<string, number>).plansUsed).toBe(1)
  })
})

describe('POST /api/ai-suggestions — the cap is reached: 409, and no provider call', () => {
  it('does not call the provider when the household is already at its plans cap', async () => {
    // THE mutation catcher. If the provider call is moved above the counter
    // UPDATEs, this household spends an Anthropic call it has no budget for and
    // both assertions below fail.
    const capped = buildHarness({ plansCreated: MAX_AI_PLANS_PER_HOUSEHOLD })
    const res = await post(capped, GOAL_PLAN_BODY)

    expect(res.status).toBe(409)
    expect(capped.providerCalls).toHaveLength(0)
    expect(capped.events).toEqual(['counters'])
    expect((await res.json()) as unknown).toEqual({ status: 'cap_reached', capType: 'plans' })
  })

  it('does not call the provider when the global monthly breaker is tripped', async () => {
    const capped = buildHarness({ globalUsed: 50, globalCap: 50 })
    const res = await post(capped, GOAL_PLAN_BODY)

    expect(res.status).toBe(409)
    expect(capped.providerCalls).toHaveLength(0)
    expect((await res.json()) as unknown).toEqual({ status: 'cap_reached', capType: 'global' })
  })

  it('leaves the refused reservation failed and does not refund the counter', async () => {
    const capped = buildHarness({ plansCreated: MAX_AI_PLANS_PER_HOUSEHOLD })
    await post(capped, GOAL_PLAN_BODY)

    expect(capped.fake.reservations).toHaveLength(1)
    expect(capped.fake.reservations[0]?.status).toBe('failed')
    expect(capped.fake.households[0]?.aiPlansCreated).toBe(MAX_AI_PLANS_PER_HOUSEHOLD)
  })
})

describe('POST /api/ai-suggestions — a failed provider call does not refund', () => {
  it('answers 502 provider_error and settles the reservation failed', async () => {
    const broken = buildHarness({ provider: throwingProvider([], []) })

    const res = await post(broken, GOAL_PLAN_BODY)
    expect(res.status).toBe(502)
    expect((await res.json()) as unknown).toEqual({
      status: 'failed',
      reason: 'provider_error',
      attemptCounted: true,
    })
    expect(broken.fake.reservations[0]?.status).toBe('failed')
  })

  it('keeps the counter spent, so a client reporting every call as failed still exhausts its cap', async () => {
    const broken = buildHarness({ provider: throwingProvider([], []) })
    await post(broken, GOAL_PLAN_BODY)
    expect(broken.fake.households[0]?.aiPlansCreated).toBe(1)

    const second = await post(broken, { ...GOAL_PLAN_BODY, idempotencyKey: KEY_TWO })
    expect(second.status).toBe(502)
    expect(broken.fake.households[0]?.aiPlansCreated).toBe(MAX_AI_PLANS_PER_HOUSEHOLD)

    const third = await post(broken, { ...GOAL_PLAN_BODY, idempotencyKey: '5d5d5d5d-1111-4111-8111-5d5d5d5d5d5d' })
    expect(third.status).toBe(409)
  })

  it('answers 503 without reserving or spending a counter when no provider is configured', async () => {
    // The route ships with `provider: null` until the key is approved and
    // wired. A precondition, checked after auth and shape and before anything
    // is reserved, so an unwired deploy cannot burn a household's two plans.
    const unwired = buildHarness({ provider: null })
    const res = await post(unwired, GOAL_PLAN_BODY)

    expect(res.status).toBe(503)
    expect((await res.json()) as unknown).toEqual({
      status: 'failed',
      reason: 'provider_error',
      attemptCounted: false,
    })
    expect(unwired.fake.reservations).toHaveLength(0)
    expect(unwired.fake.households[0]?.aiPlansCreated).toBe(0)
  })
})

describe('POST /api/ai-suggestions — A4, the output allowlist invalidates the whole response', () => {
  it('answers 502 invalid_output when one slug is outside the library, and returns no partial suggestion', async () => {
    const events: string[] = []
    const calls: unknown[] = []
    const bad = buildHarness({
      provider: okProvider(events, calls, {
        allocations: [
          { slug: 'equity-index-funds-etfs', weightPct: 50 },
          { slug: 'hdfc-sanchay-par-advantage-ulip', weightPct: 30 },
          { slug: 'debt-ppf', weightPct: 20 },
        ],
        reasoning: 'A mix.',
      }),
    })

    const res = await post(bad, GOAL_PLAN_BODY)
    expect(res.status).toBe(502)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ status: 'failed', reason: 'invalid_output', attemptCounted: true })
    // The silent-filter implementation would have answered 200 with the two
    // library slugs. Nothing partial comes back.
    expect(body.suggestion).toBeUndefined()
    expect(JSON.stringify(body)).not.toMatch(/equity-index-funds-etfs|debt-ppf/)
  })

  it('settles the reservation failed on invalid output and does not refund', async () => {
    const bad = buildHarness({
      provider: okProvider([], [], { allocations: [{ slug: 'not-a-library-slug', weightPct: 100 }], reasoning: 'x' }),
    })
    await post(bad, GOAL_PLAN_BODY)
    expect(bad.fake.reservations[0]?.status).toBe('failed')
    expect(bad.fake.households[0]?.aiPlansCreated).toBe(1)
  })
})

describe('POST /api/ai-suggestions — idempotency (SPEC G6.8)', () => {
  it('makes no second provider call for a repeat of the same gesture', async () => {
    await post(harness, GOAL_PLAN_BODY)
    expect(harness.providerCalls).toHaveLength(1)

    const repeat = await post(harness, GOAL_PLAN_BODY)
    expect(harness.providerCalls).toHaveLength(1)
    expect(harness.fake.reservations).toHaveLength(1)
    expect(harness.fake.households[0]?.aiPlansCreated).toBe(1)
    expect(repeat.status).toBe(409)
    expect(((await repeat.json()) as Record<string, unknown>).status).toBe('duplicate')
  })
})

describe('POST /api/ai-suggestions — A5, no body reaches any log, Sentry or Neon', () => {
  /** Everything from the request and the response that must never be logged. */
  const SECRETS = [
    KEY_ONE,
    '5000000',
    '47000',
    'equity',
    'debt',
    'gold',
    'growth weighted mix',
    'equity-index-funds-etfs',
    'debt-ppf',
  ]

  function assertNothingLeaked(h: Harness) {
    const serialised = JSON.stringify([h.logs, h.sentry], (_key, value) =>
      value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value,
    )
    for (const secret of SECRETS) {
      expect(serialised, `leaked "${secret}"`).not.toContain(secret)
    }
  }

  it('leaks nothing on the success path', async () => {
    await post(harness, GOAL_PLAN_BODY)
    assertNothingLeaked(harness)
  })

  it('leaks nothing on a validation failure, where the body is in hand', async () => {
    await post(harness, { ...GOAL_PLAN_BODY, memberName: 'Rinku' })
    assertNothingLeaked(harness)
    expect(JSON.stringify(harness.logs)).not.toContain('Rinku')
  })

  it('leaks nothing on a cap-reached response', async () => {
    const capped = buildHarness({ plansCreated: MAX_AI_PLANS_PER_HOUSEHOLD })
    await post(capped, GOAL_PLAN_BODY)
    assertNothingLeaked(capped)
  })

  it('leaks nothing on a provider error, whose exception is the likeliest carrier', async () => {
    const events: string[] = []
    const broken = buildHarness({ provider: throwingProvider(events, []) })
    await post(broken, GOAL_PLAN_BODY)
    assertNothingLeaked(broken)
  })

  it('leaks nothing on invalid output, where the response body is in hand', async () => {
    const bad = buildHarness({
      provider: okProvider([], [], {
        allocations: [{ slug: 'not-a-library-slug', weightPct: 100 }],
        reasoning: 'A growth weighted mix with equity and debt and gold.',
      }),
    })
    await post(bad, GOAL_PLAN_BODY)
    assertNothingLeaked(bad)
    expect(JSON.stringify(bad.logs)).not.toContain('not-a-library-slug')
  })

  it('writes nothing to Neon beyond the reservation, its status, and the cost counters', async () => {
    await post(harness, GOAL_PLAN_BODY)

    const tables = new Set(harness.fake.counts.writes.map((write) => write.table))
    expect([...tables].sort()).toEqual(['ai_call_reservations', 'ai_global_usage', 'households'])

    // The only column ever updated on the reservation row is its status. A
    // future change that stashed a prompt or a response on the row shows up
    // here.
    const reservationUpdates = harness.fake.counts.writes.filter(
      (write) => write.table === 'ai_call_reservations' && write.operation === 'update',
    )
    expect(reservationUpdates).toHaveLength(1)
    expect(reservationUpdates[0]?.columns).toEqual(['status'])
  })

  it('writes nothing at all to Neon when the request never gets past validation', async () => {
    await post(harness, { ...GOAL_PLAN_BODY, memberName: 'Rinku' })
    expect(harness.fake.counts.writes).toEqual([])
  })
})

describe('POST /api/ai-suggestions — A5, Cache-Control: no-store on EVERY response', () => {
  it('sets it on success', async () => {
    expect((await post(harness, GOAL_PLAN_BODY)).headers.get('cache-control')).toBe('no-store')
  })

  it('sets it on 401, 403, 400 and 413', async () => {
    expect((await post(harness, GOAL_PLAN_BODY, null)).headers.get('cache-control')).toBe('no-store')
    expect((await post(harness, GOAL_PLAN_BODY, 'user_without_household')).headers.get('cache-control')).toBe('no-store')
    expect((await post(harness, { ...GOAL_PLAN_BODY, memberName: 'x' })).headers.get('cache-control')).toBe('no-store')
    expect((await post(harness, 'x'.repeat(100_000))).headers.get('cache-control')).toBe('no-store')
  })

  it('sets it on a 409 cap-reached response', async () => {
    const capped = buildHarness({ plansCreated: MAX_AI_PLANS_PER_HOUSEHOLD })
    expect((await post(capped, GOAL_PLAN_BODY)).headers.get('cache-control')).toBe('no-store')
  })

  it('sets it on a 502 provider error and on a 502 invalid output', async () => {
    const broken = buildHarness({ provider: throwingProvider([], []) })
    expect((await post(broken, GOAL_PLAN_BODY)).headers.get('cache-control')).toBe('no-store')

    const bad = buildHarness({
      provider: okProvider([], [], { allocations: [{ slug: 'nope', weightPct: 100 }], reasoning: 'x' }),
    })
    expect((await post(bad, GOAL_PLAN_BODY)).headers.get('cache-control')).toBe('no-store')
  })

  it('sets it on the 503 an unwired provider returns', async () => {
    const unwired = buildHarness({ provider: null })
    expect((await post(unwired, GOAL_PLAN_BODY)).headers.get('cache-control')).toBe('no-store')
  })
})

describe('POST /api/ai-suggestions — counsel: ledgerId ownership is checked server-side (D-024 Chunk C, C1)', () => {
  it('answers 403 for a ledger belonging to another household, before any provider call', async () => {
    const foreign = buildHarness()
    // A ledger that exists, but under a different household than the caller's
    // session resolves to. `getLedgerForHousehold`'s household filter is part
    // of the lookup itself, so this must come back indistinguishable from a
    // ledger that does not exist at all — 403, never 404, never a 200.
    foreign.fake.ledgers.push({ id: 'ffffffff-2222-4222-8222-ffffffffffff', householdId: 'other-household', isBaseline: true, aiEditsUsed: 0 })

    const res = await post(foreign, { ...COUNSEL_BODY, ledgerId: 'ffffffff-2222-4222-8222-ffffffffffff' })

    expect(res.status).toBe(403)
    expect(foreign.providerCalls).toHaveLength(0)
    expect(foreign.fake.reservations).toHaveLength(0)
  })

  it('answers 403 for a ledgerId that does not exist at all, same as a foreign one', async () => {
    const res = await post(harness, { ...COUNSEL_BODY, ledgerId: '00000000-0000-4000-8000-000000000000' })

    expect(res.status).toBe(403)
    expect(harness.providerCalls).toHaveLength(0)
    expect(harness.fake.reservations).toHaveLength(0)
  })

  it('sets Cache-Control: no-store on the ownership 403', async () => {
    const res = await post(harness, { ...COUNSEL_BODY, ledgerId: '00000000-0000-4000-8000-000000000000' })
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('does not run the ownership check, or refuse, for a goal_plan body', async () => {
    // goal_plan carries no ledgerId at all; the ownership branch must be a
    // no-op for it, not an accidental 403.
    const res = await post(harness, GOAL_PLAN_BODY)
    expect(res.status).toBe(200)
  })
})

describe('POST /api/ai-suggestions — counsel spends the per-ledger edits cap (D-024 Chunk C, C2)', () => {
  /** Both counters, always read together. */
  function counters(h: Harness) {
    return {
      plans: h.fake.households.find((row) => row.id === HOUSEHOLD_A)?.aiPlansCreated,
      editsA: h.fake.ledgers.find((row) => row.id === LEDGER_A)?.aiEditsUsed,
      editsB: h.fake.ledgers.find((row) => row.id === LEDGER_B)?.aiEditsUsed,
    }
  }

  it('charges ledgers.ai_edits_used and NOT households.ai_plans_created', async () => {
    // The defect this whole step exists to make impossible: routing the counsel
    // reservation at the household plans counter passes every happy-path test
    // that only asserts "a call succeeded". Both counters are asserted, so a
    // swapped mapping fails on the one that should NOT have moved.
    const res = await post(harness, COUNSEL_BODY)

    expect(res.status).toBe(200)
    expect(counters(harness)).toEqual({ plans: 0, editsA: 1, editsB: 0 })
  })

  it('charges households.ai_plans_created and NOT ledgers.ai_edits_used for a goal plan', async () => {
    const res = await post(harness, GOAL_PLAN_BODY)

    expect(res.status).toBe(200)
    expect(counters(harness)).toEqual({ plans: 1, editsA: 0, editsB: 0 })
  })

  it('records cap_type edits and the real ledger_id on a counsel reservation', async () => {
    await post(harness, COUNSEL_BODY)
    const [row] = harness.fake.reservations
    expect(row?.kind).toBe('counsel')
    expect(row?.capType).toBe('edits')
    expect(row?.ledgerId).toBe(LEDGER_A)
    expect(row?.householdId).toBe(HOUSEHOLD_A)
  })

  it('records cap_type plans and a null ledger_id on a goal-plan reservation', async () => {
    // Unlike a counsel call: a goal plan's ledger does not exist yet, so the
    // column is genuinely null rather than a placeholder. Asserted explicitly so
    // "pass the ledger through for everything" fails here.
    await post(harness, GOAL_PLAN_BODY)
    const [row] = harness.fake.reservations
    expect(row?.capType).toBe('plans')
    expect(row?.ledgerId).toBeNull()
  })

  it('refuses a counsel call with 409 edits once that ledger has spent its cap', async () => {
    const capped = buildHarness({ editsUsed: MAX_AI_EDITS_PER_LEDGER })
    const res = await post(capped, COUNSEL_BODY)

    expect(res.status).toBe(409)
    expect((await res.json()) as unknown).toEqual({ status: 'cap_reached', capType: 'edits' })
    expect(capped.providerCalls).toHaveLength(0)
    expect(capped.fake.reservations[0]?.status).toBe('failed')
  })

  it('applies the global monthly breaker to a counsel call exactly as to a goal plan', async () => {
    const capped = buildHarness({ globalUsed: 50, globalCap: 50 })
    const counsel = await post(capped, COUNSEL_BODY)

    expect(counsel.status).toBe(409)
    expect((await counsel.json()) as unknown).toEqual({ status: 'cap_reached', capType: 'global' })
    expect(capped.providerCalls).toHaveLength(0)

    const plan = await post(capped, { ...GOAL_PLAN_BODY, idempotencyKey: KEY_TWO })
    expect(plan.status).toBe(409)
    expect((await plan.json()) as unknown).toEqual({ status: 'cap_reached', capType: 'global' })
    expect(capped.providerCalls).toHaveLength(0)
  })

  it('keeps two ledgers in one household independent — exhausting A does not block B', async () => {
    // This is what makes it a per-ledger cap rather than a second household cap.
    const h = buildHarness({ editsUsed: MAX_AI_EDITS_PER_LEDGER })

    const refused = await post(h, COUNSEL_BODY)
    expect(refused.status).toBe(409)

    const allowed = await post(h, { ...COUNSEL_BODY, ledgerId: LEDGER_B, idempotencyKey: KEY_TWO })
    expect(allowed.status).toBe(200)
    expect(counters(h)).toEqual({ plans: 0, editsA: MAX_AI_EDITS_PER_LEDGER, editsB: 1 })
  })

  it('exhausting a ledger does not touch the household plans cap', async () => {
    await post(harness, COUNSEL_BODY)
    await post(harness, { ...COUNSEL_BODY, idempotencyKey: KEY_TWO })
    const third = await post(harness, { ...COUNSEL_BODY, idempotencyKey: KEY_THREE })

    expect(third.status).toBe(409)
    expect(counters(harness)).toEqual({ plans: 0, editsA: MAX_AI_EDITS_PER_LEDGER, editsB: 0 })

    // The household's plans are untouched by all of that, so a goal plan still
    // goes through.
    const plan = await post(harness, { ...GOAL_PLAN_BODY, idempotencyKey: KEY_FOUR })
    expect(plan.status).toBe(200)
    expect(counters(harness)).toEqual({ plans: 1, editsA: MAX_AI_EDITS_PER_LEDGER, editsB: 0 })
  })

  it('exhausting the household plans cap does not block a counsel call', async () => {
    const capped = buildHarness({ plansCreated: MAX_AI_PLANS_PER_HOUSEHOLD })
    const res = await post(capped, COUNSEL_BODY)

    expect(res.status).toBe(200)
    expect(counters(capped)).toEqual({ plans: MAX_AI_PLANS_PER_HOUSEHOLD, editsA: 1, editsB: 0 })
  })

  it('writes the counsel counter to ledgers, never to households', async () => {
    await post(harness, COUNSEL_BODY)

    const tables = new Set(harness.fake.counts.writes.map((write) => write.table))
    expect([...tables].sort()).toEqual(['ai_call_reservations', 'ai_global_usage', 'ledgers'])
    expect(
      harness.fake.counts.writes.filter((write) => write.table === 'ledgers'),
    ).toEqual([{ operation: 'update', table: 'ledgers', columns: ['aiEditsUsed'] }])
  })
})

describe('POST /api/ai-suggestions — readUsage reports the real edits spend on a counsel call (bug fix)', () => {
  // `readUsage` used to hardcode `editsUsed: 0` on every response. That was
  // harmless while only goal_plan existed (a goal plan's ledger does not
  // exist yet, so 0 was correct), but C2 made a counsel call spend
  // `ledgers.ai_edits_used`, and the hardcoded 0 then silently understated
  // what the ledger's own counter had just recorded.
  it('reports editsUsed: 1 after the first counsel call on a ledger, not 0', async () => {
    const res = await post(harness, COUNSEL_BODY)
    const body = (await res.json()) as { usage: { editsUsed: number; editsCap: number } }

    expect(body.usage.editsUsed).toBe(1)
    expect(body.usage.editsCap).toBe(MAX_AI_EDITS_PER_LEDGER)
  })

  it('reports editsUsed: 2 after a second counsel call on the same ledger, catching an off-by-one', async () => {
    await post(harness, COUNSEL_BODY)
    const res = await post(harness, { ...COUNSEL_BODY, idempotencyKey: KEY_TWO })
    const body = (await res.json()) as { usage: { editsUsed: number } }

    expect(body.usage.editsUsed).toBe(2)
  })

  it('still reports editsUsed: 0 for a goal-plan response, describing the ledger about to be created', async () => {
    // The pre-existing, now-explicit reading: a goal plan carries no ledgerId,
    // so there is no ledger to charge yet and 0 remains correct here.
    const res = await post(harness, GOAL_PLAN_BODY)
    const body = (await res.json()) as { usage: { editsUsed: number } }

    expect(body.usage.editsUsed).toBe(0)
  })

  it('reports the OTHER ledger\'s untouched editsUsed on its own counsel call, not the caller\'s ledger mixed up', async () => {
    await post(harness, COUNSEL_BODY) // spends LEDGER_A
    const res = await post(harness, { ...COUNSEL_BODY, ledgerId: LEDGER_B, idempotencyKey: KEY_TWO })
    const body = (await res.json()) as { usage: { editsUsed: number } }

    expect(body.usage.editsUsed).toBe(1)
  })
})

describe('POST /api/ai-suggestions — the proxy emits no analytics', () => {
  it('imports no analytics module and calls no capture on any path', async () => {
    // Carried forward verbatim from the D-016 property-discipline note: every
    // property the proxy could usefully report is derived from plaintext
    // holdings, so browser-side telemetry (A9) is the only place events fire.
    // Reads the real file, same idiom as `pwa-registration.config.test.ts`: a
    // test asserting against a copy keeps passing after the original changes.
    const source = readFileSync(resolve(__dirname, 'routes/ai-suggestions.ts'), 'utf8')
    // Imports, not prose: the file's own header says the word "analytics" while
    // explaining why it emits none.
    expect(source).not.toMatch(/from\s+['"][^'"]*(posthog|analytics)[^'"]*['"]/i)
    expect(source).not.toMatch(/\.capture\(/)
    expect(source).not.toMatch(/\.identify\(/)
  })
})
