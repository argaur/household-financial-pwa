import posthog from 'posthog-js'

export function initPostHog() {
  // Fleet ingest key. `phc_` tokens are public client-side keys — hardcoding is the
  // fleet convention (Claude Optimisation/starters/analytics/README.md). The env var
  // still wins when set, so this can be pointed elsewhere without a code change.
  // Previously this gated on VITE_POSTHOG_KEY alone, which was never set in Vercel —
  // so analytics here was silently dead from the day it was written.
  const key = import.meta.env.VITE_POSTHOG_KEY || 'phc_oVPCPUJcdtiYuxKVYjnUUZAAfvxgaRfQTbJtifoqZspr'
  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false, // page_viewed fires explicitly via track() on route change
    /**
     * OFF DELIBERATELY. posthog-js defaults this to `true`, and it sends an
     * `$autocapture` event for every click carrying the element's own text and
     * every attribute.
     *
     * That is a leak in this product specifically, not merely noise. The whole
     * architecture exists so the server cannot read household data (D-014/D-015:
     * the database holds ciphertext and two wrapped keys it cannot open), and
     * `EventMap` types `ledger_created`, `ledger_edited` and
     * `compare_strip_viewed` as `Record<string, never>` precisely so a ledger
     * name can never be sent on purpose. Autocapture routed around all of it.
     *
     * It was not hypothetical. Found 2026-09-11 (plan step I13, item I-leak-1):
     * 611 `$autocapture` events from this app in 90 days on the shared Web Fleet
     * project, with `$el_text` values including real ledger and member labels
     * ("Minor's Equity Folio", "Aggressive Growth", "Spouse"). Chunk I would
     * have widened it: the import review screen's CTA reads
     * `Add <n> holdings to <ledger name>`.
     *
     * Pinned by `src/lib/import-telemetry-scrubbing.test.ts`. Do not remove
     * this line to "get richer analytics" without reading that test first.
     */
    autocapture: false,
    /**
     * OFF DELIBERATELY, and not left to a setting in another system.
     *
     * posthog-js defaults this to `false`, meaning recording is NOT disabled:
     * this app was opted IN client-side. No replay was actually captured only
     * because the SHARED "Web Fleet" PostHog project has replay switched off at
     * the project level, which this repository does not control and which
     * covers every app pointed at that project. Someone enabling replay there,
     * for any unrelated app, would have started recording this one.
     *
     * That is not an acceptable dependency for these screens. PostHog's replay
     * masks INPUTS by default but NOT text, and this product renders real
     * household financial data as ordinary text nodes: the ledger view's
     * holdings, and the bulk-import review screen's member names and rupee
     * amounts.
     *
     * Found 2026-09-11 alongside I-leak-1 (plan item I-leak-2). Setting it here
     * makes the fleet toggle irrelevant for this app in the safe direction.
     *
     * Pinned by `src/lib/import-telemetry-scrubbing.test.ts`.
     */
    disable_session_recording: true,
  })
  // Fleet key — every project shares one PostHog project ("Web Fleet"), and this
  // property is how the Fleet Overview dashboard tells them apart. Required.
  posthog.register({ project: 'financial-planning' })
}
