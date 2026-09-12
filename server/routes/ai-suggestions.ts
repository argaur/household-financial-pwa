import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { verifyUserId } from '../lib/auth.js'
import { getHouseholdForOwner, type Household } from '../lib/household.js'
import { getLedgerForHousehold } from '../lib/ledgers.js'
import { ledgerIdSchema } from '../lib/projection-settings.js'
import { getAiSuggestionsUsage } from '../lib/ai-suggestions.js'
import {
  createAiCallCounterConsumer,
  MAX_AI_EDITS_PER_LEDGER,
  MAX_AI_PLANS_PER_HOUSEHOLD,
} from '../lib/ai-counters.js'
import { reserveAiCall, settleAiCallReservation, type ConsumeAiCallCounters } from '../lib/ai-reservations.js'
import { AI_SUGGESTION_MODEL, type AiSuggestionProvider } from '../lib/ai-provider.js'
import { aiSuggestionRequestSchema, MAX_AI_REQUEST_BYTES } from '../lib/ai-suggestion-request.js'
import { validateSuggestionOutput } from '../lib/ai-suggestion-output.js'
import type { db as Db } from '../lib/db.js'

/**
 * /api/ai-suggestions — D-024/D-025 AI import.
 *
 * `GET` (step R5) reports usage counters only, so the dashboard can render a
 * cap-exhausted state without a speculative POST.
 *
 * `POST` (steps A3, A4, A5) is the thin proxy. **Its order is the security
 * property, not an implementation detail**, and it is the order `SPEC.md` §G3
 * sets out:
 *
 * 1. Auth, resolved through `server/lib/auth.ts` **before the body is read at
 *    all**. Tenancy resolution goes with it: a session with no household is
 *    refused while the body is still an unread stream.
 * 2. Size, then parse, then shape. The byte ceiling is checked against the raw
 *    body before `JSON.parse` sees it, and the shape is checked by a strict Zod
 *    schema that rejects unknown keys outright.
 * 3. The reservation insert (`reserveAiCall`).
 * 4. The three conditional counter UPDATEs (`createAiCallCounterConsumer`).
 * 5. **Only then** the provider call.
 * 6. The output allowlist. A slug outside the library invalidates the whole
 *    response as `invalid_output`; it is never filtered out silently.
 * 7. Relay, writing nothing to Neon beyond the reservation's status.
 *
 * **Doing 5 before 4 silently removes the entire cost control.** The call goes
 * out, the household is billed for it, and the cap only discovers afterwards
 * that it should have refused. `server/ai-suggestions-post.integration.test.ts`
 * is written so that mutation turns red; if you are reordering this handler and
 * the suite stays green, the suite is wrong, not the reorder.
 *
 * **The provider is an injected dependency and its shipped default is `null`.**
 * No API key is read anywhere in this file or in `server/lib/ai-provider.ts`;
 * wiring one is held pending Gaurav's approval. Until then a POST is refused
 * with `503` at step 2.5 — after auth and shape, before anything is reserved —
 * so an unwired deploy cannot burn a household's two plans.
 *
 * **The proxy emits no analytics**, carried forward verbatim from the D-016
 * property-discipline note: every property it could usefully report is derived
 * from plaintext holdings. Browser-side telemetry (A9) is the only place events
 * fire.
 *
 * **The browser CSP is not touched.** The browser never calls Anthropic, this
 * route does. Adding the Anthropic host to a browser CSP directive is named in
 * D-024's ship-traps list; A8 pins it with a test.
 *
 * Single path segment, ledger selected by `?ledgerId=`, same reasoning as
 * `server/routes/projection-settings.ts`: this project's zero-config Vercel
 * build only routes single-path-segment `/api/*` requests to the catch-all
 * function, so `/api/ai-suggestions/:ledgerId` would 404 at the platform
 * before Hono ever saw it.
 *
 * Ownership follows `projection-settings.ts`, not `ledgers.ts`: a foreign or
 * nonexistent ledger both answer 403 (never 404), and "no household yet" is
 * folded into the same 403 rather than treated as a distinct case — there is
 * no ledger a session without a household could own either.
 */

type AiSuggestionsDb = Pick<typeof Db, 'select' | 'insert' | 'update'>

/** The narrow slice of a console this route is allowed to use. */
export interface AiSuggestionsLogger {
  error: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
}

/** The narrow slice of a Sentry client this route is allowed to use. */
export interface AiSuggestionsSentry {
  captureException: (error: unknown, hint?: unknown) => void
}

export interface AiSuggestionsRouteDeps {
  db: AiSuggestionsDb
  /**
   * `null` means "not wired yet", which is the shipped default. It is a
   * deliberate value rather than an omission, so the unwired case has to be
   * handled rather than crashing at the call site.
   */
  provider: AiSuggestionProvider | null
  /** Overridable only so a test can observe *when* the real consumer ran. */
  consumeCounters?: ConsumeAiCallCounters
  logger?: AiSuggestionsLogger
  sentry?: AiSuggestionsSentry
}

/**
 * The only thing this route ever hands a logger or Sentry.
 *
 * A5's promise is that no request or response body reaches a log, Sentry or
 * Neon, and the two places that promise is easiest to break are the provider's
 * own exception (an SDK error can echo the request it failed on) and a
 * validation report (Zod issues quote the offending value). So neither is ever
 * passed on: the error's *name* is kept, its message and stack are not, and
 * `validateSuggestionOutput` deliberately returns no issue list to be tempted
 * into logging.
 */
function failureNote(reservationId: string, stage: string, error?: unknown) {
  return {
    route: 'POST /api/ai-suggestions',
    reservationId,
    stage,
    errorName: error instanceof Error ? error.name : undefined,
  }
}

export function createAiSuggestionsRoutes(deps: AiSuggestionsRouteDeps): Hono {
  const routes = new Hono()
  const consumeCounters = deps.consumeCounters ?? createAiCallCounterConsumer(deps.db)
  const logger = deps.logger
  const sentry = deps.sentry

  // `SPEC.md` §G6.7: every response, success and failure. Set after `next()`
  // so it lands on whatever the handler produced, and the handlers below never
  // let an exception escape past this middleware.
  routes.use('*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })

  routes.get('/', async (c) => {
    const userId = await verifyUserId(c.req.header('authorization'))
    if (!userId) return c.json({ error: 'unauthorized' }, 401)

    const household = await getHouseholdForOwner(deps.db, userId)
    if (!household) return c.json({ error: 'forbidden' }, 403)

    const rawLedgerId = c.req.query('ledgerId')
    const parsedLedgerId = ledgerIdSchema.safeParse(rawLedgerId)
    if (!parsedLedgerId.success) return c.json({ error: 'invalid_ledger_id' }, 400)

    const ledger = await getLedgerForHousehold(deps.db, household.id, parsedLedgerId.data)
    if (!ledger) return c.json({ error: 'forbidden' }, 403)

    const usage = await getAiSuggestionsUsage(deps.db, household, ledger)
    return c.json(usage)
  })

  routes.post('/', async (c) => {
    // ---- 1. Auth and tenancy, before the body is touched -------------------
    const userId = await verifyUserId(c.req.header('authorization'))
    if (!userId) return c.json({ error: 'unauthorized' }, 401)

    const household = await getHouseholdForOwner(deps.db, userId)
    if (!household) return c.json({ error: 'forbidden' }, 403)

    // ---- 2. Size, then parse, then shape -----------------------------------
    // The declared length first, so an over-sized body can be refused without
    // reading it at all when the platform tells us how big it is.
    const declaredLength = Number(c.req.header('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_AI_REQUEST_BYTES) {
      return c.json({ error: 'payload_too_large' }, 413)
    }

    const raw = await c.req.text()
    if (new TextEncoder().encode(raw).byteLength > MAX_AI_REQUEST_BYTES) {
      // Measured before `JSON.parse`, deliberately: parsing first would mean a
      // multi-megabyte body had already been materialised as objects.
      return c.json({ error: 'payload_too_large' }, 413)
    }

    let decoded: unknown
    try {
      decoded = JSON.parse(raw)
    } catch {
      return c.json({ error: 'invalid_body' }, 400)
    }

    const parsed = aiSuggestionRequestSchema.safeParse(decoded)
    // No Zod issue list in the response and none in a log: an issue quotes the
    // value it rejected, which on this route is exactly what must not leave.
    if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)
    const request = parsed.data

    // ---- 2.5 Counsel: ledgerId ownership, before anything is reserved ------
    // D-024 Chunk C, steps C1 and C2. A goal_plan body carries no ledgerId and
    // this branch is a no-op for it. Ownership follows the ledgers/holdings
    // convention (server/lib/ledgers.ts), not projection-settings.ts's: a
    // foreign or nonexistent ledger both answer 403 here, via the one
    // household-scoped lookup, so a caller cannot tell "not yours" from
    // "doesn't exist".
    //
    // The id carried forward is the one the *lookup* returned, never the one
    // the request asked for. They are equal on the only path that reaches the
    // reservation, and taking it from the verified row is what keeps them equal
    // if this check is ever loosened: an ownership-verified ledger is the only
    // thing a cap can be charged against.
    //
    // Null for goal_plan, and that is a fact about the domain rather than a
    // default — the ledger a goal plan is about to produce does not exist yet,
    // so there is no per-ledger counter to spend and the household's plans cap
    // is the right one. `reserveAiCall` derives `cap_type` from `kind` alone;
    // this only supplies the row the `edits` cap is charged against.
    let counselLedgerId: string | null = null
    if (request.kind === 'counsel') {
      const ledger = await getLedgerForHousehold(deps.db, household.id, request.ledgerId)
      if (!ledger) return c.json({ error: 'forbidden' }, 403)
      counselLedgerId = ledger.id
    }

    // ---- 2.6 Provider precondition, before anything is reserved ------------
    // Not part of §G3's numbered order and deliberately placed here rather than
    // at step 5: a route with no provider will certainly fail, and failing
    // after the reservation would spend one of the household's two plans on a
    // call that was never going to be made. Nothing is written to Neon on this
    // path.
    if (!deps.provider) {
      logger?.warn('ai-suggestions: no provider configured', { route: 'POST /api/ai-suggestions' })
      return c.json({ status: 'failed', reason: 'provider_error', attemptCounted: false }, 503)
    }

    // ---- 3 and 4. Reserve, then spend the counters -------------------------
    const outcome = await reserveAiCall(
      deps.db,
      {
        householdId: household.id,
        idempotencyKey: request.idempotencyKey,
        kind: request.kind,
        ledgerId: counselLedgerId,
      },
      { consumeCounters },
    )

    if (outcome.status === 'cap_reached') {
      return c.json({ status: 'cap_reached', capType: outcome.capType }, 409)
    }

    if (outcome.status === 'duplicate') {
      // §G6.8: a repeat of the same gesture makes no second provider call. The
      // first call's suggestion is deliberately not replayable — cards are
      // never persisted (D-024 decision on `ai_call_reservations`: the row
      // records that a call happened, never what it said) — so the honest
      // answer is that this gesture is already spent, with its attempt counted.
      // This shape is an addition to §G3's three, which did not name the
      // duplicate case; it is distinguished by `status`, not by the code.
      return c.json({ status: 'duplicate', attemptCounted: true, usage: await readUsage(household, counselLedgerId) }, 409)
    }

    const reservationId = outcome.reservation.id

    // ---- 5. Only now, the provider ----------------------------------------
    let output: unknown
    try {
      output = await deps.provider.createSuggestion({
        kind: request.kind,
        model: AI_SUGGESTION_MODEL,
        payload: request,
      })
    } catch (error) {
      // No refund, by decision: "it failed" is a claim the client makes, and
      // `settleAiCallReservation` is the one guarded transition that says so.
      await settleFailed(reservationId, 'provider_call', error)
      return c.json({ status: 'failed', reason: 'provider_error', attemptCounted: true }, 502)
    }

    // ---- 6. The allowlist. Whole-response, never a filter -------------------
    const validated = validateSuggestionOutput(output)
    if (validated.status === 'invalid_output') {
      await settleFailed(reservationId, 'output_validation')
      return c.json({ status: 'failed', reason: 'invalid_output', attemptCounted: true }, 502)
    }

    // ---- 7. Relay. The only Neon write left is the status -------------------
    const settled = await settleAiCallReservation(deps.db, { reservationId, status: 'completed' })
    if (!settled) {
      // The guard refused, so something else already moved this row. Ordinary
      // traffic on the same retry paths `reserveAiCall` absorbs, not an error:
      // the call was made and its result is still the honest thing to return.
      logger?.info('ai-suggestions: settlement lost a race', failureNote(reservationId, 'settle_completed'))
    }

    return c.json({
      status: 'ok',
      kind: request.kind,
      suggestion: validated.suggestion,
      usage: await readUsage(household, counselLedgerId),
    })
  })

  /**
   * Moves a reservation to `failed` and records that it happened, carrying no
   * request or response content of any kind (A5).
   */
  async function settleFailed(reservationId: string, stage: string, error?: unknown): Promise<void> {
    await settleAiCallReservation(deps.db, { reservationId, status: 'failed' })
    const note = failureNote(reservationId, stage, error)
    logger?.error('ai-suggestions: call failed', note)
    // A sanitised marker, never the provider's own exception: an SDK error can
    // echo the request or the response it failed on, which is precisely what
    // may not reach Sentry.
    sentry?.captureException(new Error(`ai-suggestions failed at ${stage}`), note)
  }

  /**
   * The four usage counters `SPEC.md` §G3 puts on a successful response.
   *
   * `plansUsed` is re-read rather than derived, because the conditional UPDATE
   * reports only whether it affected a row, never the resulting value.
   *
   * `editsUsed` is a bug fix (2026-09-10): this used to hardcode `0`, which
   * was harmless while only `goal_plan` existed but started under-reporting
   * the moment Chunk C's counsel path made `consumeCounters` spend
   * `ledgers.ai_edits_used` — a successful counsel response echoed a stale
   * zero instead of what the ledger's own counter had just recorded.
   *
   * `ledgerId` is `null` for a goal plan, and that is a fact about the domain
   * made explicit rather than an accident of the old hardcoded zero: the
   * ledger a goal plan is about to produce does not exist yet, so there is no
   * per-ledger counter to read and `editsUsed: 0` describes the ledger this
   * plan is about to create. For a counsel call `ledgerId` is the
   * ownership-verified row from step 2.5, re-read fresh here (rather than
   * reusing the pre-call row) for the same reason `plansUsed` is re-read: the
   * conditional UPDATE that just ran reports only whether it affected a row,
   * never the resulting value.
   */
  async function readUsage(household: Household, ledgerId: string | null) {
    const fresh = await getHouseholdForOwner(deps.db, household.ownerUserId)
    const editsUsed = ledgerId
      ? ((await getLedgerForHousehold(deps.db, household.id, ledgerId))?.aiEditsUsed ?? 0)
      : 0
    return {
      plansUsed: fresh?.aiPlansCreated ?? household.aiPlansCreated,
      plansCap: MAX_AI_PLANS_PER_HOUSEHOLD,
      editsUsed,
      editsCap: MAX_AI_EDITS_PER_LEDGER,
    }
  }

  return routes
}

/**
 * The mounted instance. `provider: null` until the Anthropic key is approved
 * and wired — see `server/lib/ai-provider.ts` for why that is a value here
 * rather than an omission.
 */
export const aiSuggestionsRoutes = createAiSuggestionsRoutes({ db, provider: null })
