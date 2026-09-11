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
     * `$autocapture` event on every click carrying the clicked element's own
     * text and every attribute.
     *
     * That is a leak in this product specifically. The whole architecture
     * exists so the server cannot read household data (D-014/D-015: the
     * database holds ciphertext and two wrapped keys it cannot open), and
     * `EventMap` types `ledger_created`, `ledger_edited` and
     * `compare_strip_viewed` as `Record<string, never>` precisely so a ledger
     * name can never be sent on purpose. Autocapture routed around all of it.
     *
     * Not hypothetical. Found 2026-09-11: 611 `$autocapture` events from this
     * app in 90 days on the shared Web Fleet project, with `$el_text` values
     * including real ledger and member labels ("Minor's Equity Folio",
     * "Aggressive Growth", "Spouse").
     *
     * Pinned by `src/lib/posthog-privacy.config.test.ts`. DELETING THIS LINE
     * SILENTLY REOPENS THE LEAK, because it merely restores a vendor default
     * and nothing else would break.
     */
    autocapture: false,
    /**
     * OFF DELIBERATELY, and not left to a setting in another system.
     *
     * posthog-js defaults this to `false`, meaning recording is NOT disabled:
     * this app was opted IN client-side. No replay was ever captured only
     * because the SHARED "Web Fleet" project has replay switched off at the
     * project level, which this repository does not control and which covers
     * every app pointed at it. Someone enabling replay there, for an unrelated
     * app, would have started recording this one.
     *
     * PostHog replay masks INPUTS by default but NOT text, and this product
     * renders real household financial data as ordinary text nodes.
     *
     * Same silent-deletion hazard as above, same pin.
     */
    disable_session_recording: true,
  })
  // Fleet key — every project shares one PostHog project ("Web Fleet"), and this
  // property is how the Fleet Overview dashboard tells them apart. Required.
  posthog.register({ project: 'financial-planning' })
}
