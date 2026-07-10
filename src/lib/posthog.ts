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
  })
}
