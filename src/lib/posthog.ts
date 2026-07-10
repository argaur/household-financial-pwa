import posthog from 'posthog-js'

export function initPostHog() {
  const key = import.meta.env.VITE_POSTHOG_KEY
  if (!key) {
    console.warn('PostHog: VITE_POSTHOG_KEY not set, analytics disabled')
    return
  }
  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false, // page_viewed fires explicitly via track() on route change
    debug: true, // TEMP: diagnosing why capture() sends no network request — remove once fixed
    loaded: (ph) => {
      ;(window as unknown as { __posthog: unknown }).__posthog = ph
      console.log('POSTHOG_LOADED', ph.get_distinct_id())
    },
  })
}
