import { useEffect, useState } from 'react'
import * as Sentry from '@sentry/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { track } from '@/lib/analytics'

interface HealthResponse {
  status: string
  version: string
  commit_sha: string
  db: 'ok' | 'error'
}

/**
 * Slice 0 — Walking Skeleton. No feature code lives here; this page exists
 * to prove the deployment pipeline (frontend + API + DB + PostHog + Sentry)
 * before any onboarding/dashboard work starts in Slice 1+.
 */
export function HomeShell() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`/api/health returned ${res.status}`)
        return res.json() as Promise<HealthResponse>
      })
      .then(setHealth)
      .catch((err: Error) => setHealthError(err.message))
  }, [])

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg py-12 space-y-8">
        <header className="space-y-1">
          <p className="section-label">Household Financial Planning</p>
          <h1 className="font-display text-display">Walking Skeleton</h1>
          <p className="text-body text-muted-foreground">
            Slice 0 — proves the deploy pipeline. No feature code yet.
          </p>
        </header>

        <Separator />

        <section className="space-y-3">
          <h2 className="text-title">System status</h2>

          <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-card">
            <span className="text-body">API + Database</span>
            {health ? (
              <Badge className="bg-tier-strong-bg text-tier-strong border-tier-strong-border">
                {health.db === 'ok' ? 'connected' : 'db error'}
              </Badge>
            ) : healthError ? (
              <Badge variant="destructive">{healthError}</Badge>
            ) : (
              <Badge variant="secondary">checking…</Badge>
            )}
          </div>

          {health && (
            <div className="rounded-lg border border-border bg-card p-4 shadow-card text-caption text-muted-foreground tabular">
              <div>version: {health.version}</div>
              <div>commit: {health.commit_sha}</div>
            </div>
          )}
        </section>

        <Separator />

        <section className="space-y-3">
          <h2 className="text-title">Instrumentation smoke tests</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                track('feature_used', { feature_name: 'posthog_smoke_test' })
                toast({ title: 'PostHog event sent', description: 'feature_used: posthog_smoke_test' })
              }}
            >
              Fire test PostHog event
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                Sentry.captureException(new Error('Slice 0 Sentry smoke test'))
                toast({ title: 'Sentry error sent', description: 'Check the Sentry project for a new issue.' })
              }}
            >
              Fire test Sentry error
            </Button>
          </div>
        </section>

        <p className="text-caption text-muted-foreground">
          <a href="/docs" className="underline">/docs</a>
        </p>
      </div>
    </main>
  )
}
