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
  })
  // Fleet key — every project shares one PostHog project ("Web Fleet"), and this
  // property is how the Fleet Overview dashboard tells them apart. Required.
  posthog.register({ project: 'financial-planning' })
}
