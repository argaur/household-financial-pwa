/**
 * Global monthly circuit breaker for AI calls (D-024 decision 6, Chunk R).
 *
 * The only cost layer that survives a cold start, unlike the in-process
 * `server/lib/rate-limit.ts` burst limiter. `ai_global_usage` has one row per
 * calendar month (`period`, `YYYY-MM` UTC), created lazily by the first call
 * of that month, and this constant seeds that row's `cap_calls` on creation.
 *
 * Value resolved by the product owner 2026-09-07: 50. Stored per row (not
 * read live from this constant on every check) so raising the cap later does
 * not rewrite a past month's record — see `Documentation/design/DATA_MODEL.md`
 * §ai_global_usage.
 */
export const AI_GLOBAL_MONTHLY_CALL_CAP = 50
