import { z } from 'zod'
import { assetClassEnum } from '../../drizzle/schema.js'

/**
 * The request contract for `POST /api/ai-suggestions` (D-024 Chunk A, step A3;
 * `Documentation/design/SPEC.md` §G3).
 *
 * **Payload minimisation is enforced here or it is not enforced at all.** The
 * plan's requirement is that a member name, a nominee and an exact rupee amount
 * be *unrepresentable*, not merely discouraged, and that is a property of this
 * file rather than of the route:
 *
 * - Every object is `.strict()`, the same discipline `server/lib/envelope.ts`
 *   uses. An unknown key is a 400, never a silent drop, so `memberName`,
 *   `nominee` and `notes` cannot ride along even by accident.
 * - **There is no free-text string field anywhere in this schema.** The only
 *   two string-typed values it accepts are a literal (`kind`) and a v4 UUID
 *   (`idempotencyKey`); `assetClass` is the same six-value database enum the
 *   projection settings use, not an open string. A name therefore has nowhere
 *   to sit. `ai-suggestion-request.test.ts` pins this by substituting a
 *   person's name into every accepted key in turn, so a later field that
 *   happened to accept free text would fail without anyone remembering this
 *   paragraph.
 * - Rupee figures are **banded, and the band is checked**. A target must be a
 *   multiple of 100000 and a monthly capacity a multiple of 1000, so an exact
 *   holding total is refused outright rather than rounded on the server. This
 *   is the difference between "the client is asked to round" and "an exact
 *   amount cannot be transmitted": rounding server-side would mean the exact
 *   number had already crossed the wire.
 * - The mix carries `weightPct` only. There is no amount on a mix entry, which
 *   is what stops the exact portfolio being reconstructible from a percentage
 *   plus a total.
 *
 * Chunk C adds the `kind: "counsel"` member to the union below. The union is
 * discriminated on `kind` deliberately, so adding a second request shape cannot
 * loosen this one.
 */

/**
 * The body-size ceiling, checked against the raw bytes **before** any parse.
 *
 * A legitimate body is a UUID, three numbers and at most six mix entries, which
 * is a few hundred bytes. 4 KiB leaves room for the counsel shape's slug list
 * without letting the route be used as a data channel into the provider.
 */
export const MAX_AI_REQUEST_BYTES = 4096

/** `targetAmountBandInr` must be a multiple of this. `SPEC.md` §G3. */
export const TARGET_AMOUNT_BAND_INR = 100_000
/** `monthlyCapacityBandInr` must be a multiple of this. `SPEC.md` §G3. */
export const MONTHLY_CAPACITY_BAND_INR = 1_000

export const MIN_GOAL_HORIZON_YEARS = 1
export const MAX_GOAL_HORIZON_YEARS = 40

/**
 * Ten crore. Not a product limit, a sanity bound: it stops an absurd number
 * being handed to the provider and keeps the value inside a safe integer.
 */
const MAX_TARGET_AMOUNT_BAND_INR = 1_000_000_000
/** Ten lakh a month, the same kind of bound for the same reason. */
const MAX_MONTHLY_CAPACITY_BAND_INR = 1_000_000

const bandedAmount = (band: number, max: number) =>
  z
    .number()
    .int()
    .positive()
    .max(max)
    .refine((value) => value % band === 0, `must be banded to the nearest ${band}`)

/** One row of the household's current allocation. Percentages, never rupees. */
const assetMixEntrySchema = z
  .object({
    assetClass: z.enum(assetClassEnum),
    weightPct: z.number().min(0).max(100),
  })
  .strict()

const currentMixSchema = z
  .array(assetMixEntrySchema)
  .min(1)
  .max(assetClassEnum.length)
  .refine(
    (mix) => new Set(mix.map((entry) => entry.assetClass)).size === mix.length,
    'currentMix must not repeat an assetClass',
  )

/** Client-supplied v4 UUID, one per user gesture. Matches `reserveAiCall`'s contract. */
const idempotencyKeySchema = z.string().uuid()

export const goalPlanRequestSchema = z
  .object({
    kind: z.literal('goal_plan'),
    idempotencyKey: idempotencyKeySchema,
    horizonYears: z.number().int().min(MIN_GOAL_HORIZON_YEARS).max(MAX_GOAL_HORIZON_YEARS),
    targetAmountBandInr: bandedAmount(TARGET_AMOUNT_BAND_INR, MAX_TARGET_AMOUNT_BAND_INR),
    // Nullable, not optional: "I have not said" is a real answer and is sent
    // explicitly, so an omitted key stays an error rather than becoming a
    // second way of saying the same thing.
    monthlyCapacityBandInr: bandedAmount(MONTHLY_CAPACITY_BAND_INR, MAX_MONTHLY_CAPACITY_BAND_INR).nullable(),
    currentMix: currentMixSchema,
  })
  .strict()

/**
 * What the route parses against. A discriminated union of one, today.
 *
 * Written as a union rather than as the goal-plan schema directly so C1 adds a
 * member instead of rewriting the route, and so an unknown `kind` is refused by
 * the discriminator rather than falling through to whichever shape happens to
 * be first.
 */
export const aiSuggestionRequestSchema = z.discriminatedUnion('kind', [goalPlanRequestSchema])

export type GoalPlanRequest = z.infer<typeof goalPlanRequestSchema>
export type AiSuggestionRequest = z.infer<typeof aiSuggestionRequestSchema>
