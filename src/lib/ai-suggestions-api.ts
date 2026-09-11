import { encryptedFetch } from './encrypted-rows'

/**
 * The browser half of `GET /api/ai-suggestions` (server route from step R5,
 * `server/routes/ai-suggestions.ts`). Usage counters only — how many AI
 * plans/reviews this household has left — so the consent step (A2) and the
 * suggestion-triggering UI (A3/A6/C3, not built yet) can compute a remaining
 * count before ever spending a call.
 *
 * No household data crosses this boundary: counters and one boolean, nothing
 * else, so this file carries no vault, no `sealRow`, no data key, same
 * reasoning as `projection-settings-api.ts`. It reuses `encryptedFetch` only
 * for its Authorization-header plumbing.
 */

export interface AiSuggestionsUsage {
  plansUsed: number
  plansCap: number
  editsUsed: number
  editsCap: number
  globalOpen: boolean
}

export class AiSuggestionsApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'AiSuggestionsApiError'
  }
}

function fail(status: number, message: string): Error {
  return new AiSuggestionsApiError(status, message)
}

export async function getAiSuggestionsUsage(token: string | null, ledgerId: string): Promise<AiSuggestionsUsage> {
  const res = await encryptedFetch(`/api/ai-suggestions?ledgerId=${encodeURIComponent(ledgerId)}`, token, fail)
  return (await res.json()) as AiSuggestionsUsage
}

/**
 * The browser half of `POST /api/ai-suggestions`, `kind: "goal_plan"` (D-024
 * Chunk A/G, `server/routes/ai-suggestions.ts`, `SPEC.md` §G3). Mirrors
 * `server/lib/ai-suggestion-request.ts`'s `goalPlanRequestSchema`: banded
 * rupee figures, percentages-only mix, no free text, no household data.
 */
export interface GoalPlanSuggestionRequest {
  kind: 'goal_plan'
  idempotencyKey: string
  horizonYears: number
  targetAmountBandInr: number
  monthlyCapacityBandInr: number | null
  currentMix: { assetClass: string; weightPct: number }[]
}

/** `suggestion` shape shared by both `kind`s. Weights and slugs only — never a rupee amount (SPEC.md §G6.5). */
export interface AiSuggestion {
  allocations: { slug: string; weightPct: number }[]
  reasoning: string
  caveat: string
}

export interface AiSuggestionUsageSummary {
  plansUsed: number
  plansCap: number
  editsUsed: number
  editsCap: number
}

/**
 * The full discriminated shape of `POST /api/ai-suggestions`'s response,
 * `SPEC.md` §G3. Every member is a real, expected outcome — a cap reached, a
 * replayed gesture, a provider/proxy failure — not an exceptional one, so
 * this is the return type rather than something only reachable via `catch`.
 */
export type AiSuggestionPostResult =
  | { status: 'ok'; kind: 'goal_plan' | 'counsel'; suggestion: AiSuggestion; usage: AiSuggestionUsageSummary }
  | { status: 'cap_reached'; capType: 'plans' | 'edits' | 'global' }
  | { status: 'duplicate'; attemptCounted: true; usage: AiSuggestionUsageSummary }
  | { status: 'failed'; reason: 'provider_error' | 'invalid_output' | 'timeout'; attemptCounted: boolean }

/**
 * `POST /api/ai-suggestions`, `kind: "goal_plan"`.
 *
 * Deliberately does **not** go through `encryptedFetch`: that helper throws
 * on any non-2xx response and discards the body except an `error` key, but
 * this route's meaningful outcomes — `cap_reached` (409), `duplicate` (409),
 * `failed` (502/503) — are all structured JSON bodies on a non-2xx status,
 * not an `error`-shaped exception. The caller (the goal step's consent flow)
 * needs to read `status`/`capType` to render `AiCapNotice` correctly, so the
 * body is read the same way regardless of HTTP status. Authorization and
 * `cache: 'no-store'` plumbing still match `encryptedFetch` exactly — this
 * is the one route on this boundary where reading the body itself, not
 * throwing, is the correct behaviour for a non-2xx response.
 *
 * A genuinely malformed response (no body, not JSON — a network-level
 * failure, not one of the route's documented outcomes) throws
 * `AiSuggestionsApiError`, which the caller treats as its generic error
 * state.
 */
export async function postGoalPlanSuggestion(
  token: string | null,
  request: GoalPlanSuggestionRequest,
): Promise<AiSuggestionPostResult> {
  const res = await fetch('/api/ai-suggestions', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(request),
  })
  const body = (await res.json().catch(() => null)) as AiSuggestionPostResult | null
  if (!body || typeof body.status !== 'string') {
    throw fail(res.status, 'Unexpected response')
  }
  return body
}
