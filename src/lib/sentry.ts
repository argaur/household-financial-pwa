import * as Sentry from '@sentry/react'

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) {
    console.warn('Sentry: VITE_SENTRY_DSN not set, error tracking disabled')
    return
  }
  Sentry.init({
    dsn,
    release: import.meta.env.VITE_COMMIT_SHA || 'dev',
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  })
}
