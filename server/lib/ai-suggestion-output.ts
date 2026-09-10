import { z } from 'zod'
import { instrumentsSeedData } from '../seed/instruments-data.js'

/**
 * A4. The allowlist the model's output is validated against.
 *
 * ## What this enum is for, so nobody later "helpfully" relaxes it
 *
 * It is not a typo guard. It is the enforcement mechanism for two standing
 * constraints at once (D-024 decision 5), and both of them are regulatory or
 * product lines rather than style:
 *
 * 1. **No product names.** The model may name a library *category* slug and
 *    nothing else, so it mechanically cannot recommend a branded product — and
 *    therefore cannot recommend an embedded-insurance product (a ULIP, a
 *    "child plan"), which is a standing decision of this household's plan and
 *    of this app.
 * 2. **The education-not-advice line, held by construction.** A response that
 *    can only ever be weights against library categories is educational by
 *    shape. Nothing downstream has to police tone.
 *
 * **Do not replace this with a keyword filter, a denylist, or a "warn and
 * continue" path.** Widening it to accept free text hands both constraints back
 * to prompt wording, which is not an enforcement mechanism.
 *
 * ## And the rejection is total, never a filter
 *
 * A single slug outside the library invalidates the **whole** response as
 * `invalid_output`. Silently dropping the offending allocation is the intuitive
 * implementation and it is the wrong one: the remaining weights no longer sum
 * to what the model reasoned about, so the user is shown a plan nobody
 * produced, and the fact that the model went outside the library — the signal
 * that something is wrong — is thrown away. `ai-suggestion-output.test.ts` is
 * written so the silent-filter implementation fails.
 */

/**
 * The library, read from the seed data that populates the `instruments` table
 * rather than hand-copied.
 *
 * Sourcing it here means the enum cannot drift: adding an instrument to the
 * library adds it to the allowlist in the same commit, and removing one removes
 * it. A hand-maintained copy would be correct on the day it was written and
 * quietly wrong afterwards.
 */
export const LIBRARY_INSTRUMENT_SLUGS = instrumentsSeedData.map((row) => row.slug) as [string, ...string[]]

/**
 * The fixed education-not-advice caveat, attached by the server.
 *
 * Deliberately **not** part of the schema the model's output is parsed against:
 * `suggestionOutputSchema` is `.strict()`, so a model that tries to supply its
 * own `caveat` has its whole response refused. The line the user reads is a
 * server constant and the model cannot reach it.
 *
 * Zero em-dashes, per Gaurav's standing rule for user-facing copy.
 */
export const EDUCATION_NOT_ADVICE_CAVEAT =
  'This is education, not advice. It shows what a mix could look like, based on what you told us. It is not a recommendation to buy anything, and Vittam does not know your full situation.'

/** Six asset classes with a couple of instruments each is already a busy card. */
export const MAX_SUGGESTION_ALLOCATIONS = 12

/** Long enough for a short paragraph, short enough that the card stays a card. */
const MAX_REASONING_CHARS = 1200

const allocationSchema = z
  .object({
    slug: z.enum(LIBRARY_INSTRUMENT_SLUGS),
    weightPct: z.number().min(0).max(100),
  })
  .strict()

/**
 * The model's structured output, and nothing more.
 *
 * `.strict()` at both levels: an extra top-level key (a `buyLink`, a `caveat`,
 * a rupee `amount`) fails the whole response rather than being dropped, which
 * is the same discipline `server/lib/envelope.ts` applies to input.
 */
export const suggestionOutputSchema = z
  .object({
    allocations: z
      .array(allocationSchema)
      .min(1)
      .max(MAX_SUGGESTION_ALLOCATIONS)
      .refine(
        (rows) => new Set(rows.map((row) => row.slug)).size === rows.length,
        'allocations must not repeat a slug',
      ),
    reasoning: z.string().min(1).max(MAX_REASONING_CHARS),
  })
  .strict()

export interface Suggestion {
  allocations: Array<{ slug: string; weightPct: number }>
  reasoning: string
  caveat: string
}

export type SuggestionValidation = { status: 'ok'; suggestion: Suggestion } | { status: 'invalid_output' }

/**
 * Validates one provider response.
 *
 * Returns a plain outcome rather than throwing, and — importantly — the failure
 * arm carries **nothing from the response**. The route has to be able to answer
 * a rejection without ever holding a fragment of model output that could reach
 * a log (A5), so there is no `issues` field here to be tempted into logging.
 */
export function validateSuggestionOutput(raw: unknown): SuggestionValidation {
  const parsed = suggestionOutputSchema.safeParse(raw)
  if (!parsed.success) return { status: 'invalid_output' }

  return {
    status: 'ok',
    suggestion: {
      allocations: parsed.data.allocations,
      reasoning: parsed.data.reasoning,
      caveat: EDUCATION_NOT_ADVICE_CAVEAT,
    },
  }
}
