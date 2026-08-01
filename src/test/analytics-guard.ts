import { expect } from 'vitest'

/**
 * Properties this app has decided never to send to PostHog because they
 * describe portfolio shape — what a household owns — rather than that an
 * event happened. Stripped 2026-08-01 from `holding_created`, `holding_updated`,
 * `dashboard_viewed`, `completeness_score_changed`, `nudge_shown` and
 * `learn_card_clicked` (see METRICS_PLAN.md's Analytics Implementation Notes).
 *
 * This list is intentionally general-purpose: `expectNoPortfolioShape` is
 * meant to be called against every `track()` payload a test observes, not
 * just the six events above, so a future event can't quietly reintroduce one
 * of these names without a test failing.
 */
export const FORBIDDEN_ANALYTICS_PROPERTIES = [
  'asset_class',
  'instrument_id',
  'allocation_summary',
  'before_tier',
  'after_tier',
  'check_id',
] as const

/**
 * Asserts a single object handed to `track()` (or `posthog.capture`) carries
 * none of `FORBIDDEN_ANALYTICS_PROPERTIES`. Call this on the actual payload a
 * mock observed — never on the call site's source, which only proves intent.
 */
export function expectNoPortfolioShape(payload: Record<string, unknown>): void {
  for (const key of FORBIDDEN_ANALYTICS_PROPERTIES) {
    expect(Object.prototype.hasOwnProperty.call(payload, key), `payload must not carry '${key}': ${JSON.stringify(payload)}`).toBe(
      false,
    )
  }
}

/**
 * Same check applied to every call recorded by a `vi.fn()` standing in for
 * `track`. Use this over a mocked `track`/`posthog.capture` spy once a test
 * has driven a whole flow, so every event fired — not just the ones the test
 * named — is swept for portfolio shape.
 */
export function expectNoCallCarriesPortfolioShape(trackMock: { mock: { calls: unknown[][] } }): void {
  for (const call of trackMock.mock.calls) {
    const payload = call[1]
    if (payload && typeof payload === 'object') {
      expectNoPortfolioShape(payload as Record<string, unknown>)
    }
  }
}
