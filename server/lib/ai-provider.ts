import type { AiSuggestionRequest } from './ai-suggestion-request.js'

/**
 * The seam between the proxy route and Anthropic (D-024 Chunk A, step A3).
 *
 * ## There is no implementation in this file, and that is deliberate
 *
 * This module declares a **type** and two constants. It reads no environment
 * variable, holds no API key, imports no SDK and opens no socket. The route
 * takes a provider as an injected dependency and its shipped default is `null`.
 *
 * Wiring a real client — the key, the SDK, the outbound call — is explicitly
 * held pending Gaurav's approval and is not part of steps A3/A4/A5. Until then
 * the route answers `503` on a request it cannot serve, **before** it reserves
 * anything, so an unwired deploy cannot spend a household's two plans on a call
 * that was never going to happen.
 *
 * The injected-dependency shape is also what makes A3's ordering testable at
 * all: every test supplies a fake provider that records when it was called, and
 * the whole security property of this feature is that it is called last.
 *
 * ## Provider settings, settled 2026-09-07 and not open for reinterpretation
 *
 * `claude-sonnet-5`, structured output, **no prompt caching, no retries, no
 * queue, no Files API**. `AiProviderCall` carries exactly `kind`, `model` and
 * the already-validated `payload` — there is no options bag for a future
 * implementer to add a cache or a retry policy to without changing this type,
 * and `ai-suggestions-post.integration.test.ts` pins the key set.
 *
 * A retry in particular is not a neutral convenience here: the reservation is
 * already taken and the counter already spent by the time the provider runs, so
 * a retry loop would be a second outbound call against one authorised
 * reservation. If retries are ever wanted, they belong in a decision, not in
 * this file.
 */

/** The model, per D-018 §5. */
export const AI_SUGGESTION_MODEL = 'claude-sonnet-5'

/**
 * The single outbound call the proxy is allowed to make, described in full.
 *
 * `payload` is the request body **after** `aiSuggestionRequestSchema` has
 * accepted it, so a provider implementation can never be handed a name, a
 * nominee or an exact rupee amount: those cannot get this far.
 */
export interface AiProviderCall {
  kind: AiSuggestionRequest['kind']
  model: typeof AI_SUGGESTION_MODEL
  payload: AiSuggestionRequest
}

export interface AiSuggestionProvider {
  /**
   * Returns the model's structured output, unvalidated. The allowlist in
   * `ai-suggestion-output.ts` is the only thing entitled to say it is usable,
   * so this deliberately returns `unknown` — a typed return here would let an
   * implementation assert a shape the library enum has not agreed to.
   */
  createSuggestion(call: AiProviderCall): Promise<unknown>
}
