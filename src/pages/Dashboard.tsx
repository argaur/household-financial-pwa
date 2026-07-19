import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Link, Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { HealthTierCard } from '@/components/health-tier-card'
import { AllocationDonut } from '@/components/allocation-donut'
import { NudgeCard } from '@/components/nudge-card'
import { InstallPrompt } from '@/components/install-prompt'
import { formatStaleness, readDashboardFetchedAt, recordDashboardFetch } from '@/lib/pwa-cache'
import { useOnline } from '@/lib/use-online'
import { track } from '@/lib/analytics'
import { fetchDashboard, DashboardApiError, type DashboardData, type CompletenessTier } from '@/lib/dashboard-api'

type State = 'loading' | 'loaded' | 'error' | 'no-household'

const LAST_TIER_KEY_PREFIX = 'dashboard:last-tier:'

/**
 * Home / Dashboard — Slice 6. Copy: Documentation/design/COPY_DECK.md
 * "Home / Dashboard". Layout: Documentation/design/WIREFRAMES.md 2a/2b/2c.
 * No nudge card yet (Slice 7) and no bottom tab bar yet (later slice) — this
 * page links to /portfolio, /explore, /profile the same way the
 * post-onboarding confirmation screen it replaces used to.
 *
 * The Completeness Score is computed read-time-only on the server
 * (SPEC.md §7's named simpler fallback for this slice's riskiest
 * assumption — no live-recompute-on-write). completeness_score_changed is
 * therefore detected here, client-side: compare the tier just fetched
 * against the last tier seen for this household (localStorage), fire the
 * event on a change, then update the stored value. Still no write-time
 * recompute — just a read-time "did it change since I last looked" check.
 */
export function Dashboard() {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>('loading')
  const [data, setData] = useState<DashboardData | null>(null)
  const viewedFired = useRef(false)
  // Slice 8 — the offline banner is driven by connectivity, not by inspecting
  // the response: with a NetworkFirst service-worker rule the client can't
  // tell a cache hit from a live fetch, so "offline and we still rendered"
  // is the honest signal that what's on screen came from cache.
  const offline = !useOnline()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = await getToken()
        const result = await fetchDashboard(token)
        if (cancelled) return
        setData(result)
        setState('loaded')
        // Only stamp freshness when we actually reached the network. A
        // NetworkFirst *cache* hit resolves successfully too, so stamping
        // unconditionally would keep re-marking week-old cached data as
        // fetched "just now" — the banner would then never report real age.
        if (navigator.onLine) {
          recordDashboardFetch(result.household.id, Date.now())
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof DashboardApiError && err.status === 404) {
          setState('no-household')
          return
        }
        setState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [getToken])

  useEffect(() => {
    if (state !== 'loaded' || !data || viewedFired.current) return
    viewedFired.current = true

    const allocationSummary = data.allocation.map((s) => `${s.assetClass}:${s.percentage}%`).join(',')
    track('dashboard_viewed', { household_id: data.household.id, allocation_summary: allocationSummary })

    // Slice 7 — exactly one nudge is always present, so this fires once per
    // dashboard load, gated by the same viewedFired ref as dashboard_viewed.
    // Guarded because a *cached* response can predate this field: Slice 8
    // caches the last dashboard payload in the service worker, so a client on
    // new JS can render a payload serialized before `nudge` existed. Degrade
    // to no card rather than crashing the whole dashboard on it.
    if (data.nudge) {
      track('nudge_shown', { check_id: data.nudge.checkId, learn_card_slug: data.nudge.learnCardSlug })
    }

    const key = `${LAST_TIER_KEY_PREFIX}${data.household.id}`
    const lastTier = window.localStorage.getItem(key) as CompletenessTier | null
    if (lastTier && lastTier !== data.completeness.tier) {
      track('completeness_score_changed', {
        household_id: data.household.id,
        before_tier: lastTier,
        after_tier: data.completeness.tier,
      })
    }
    window.localStorage.setItem(key, data.completeness.tier)
  }, [state, data])

  if (state === 'no-household') return <Navigate to="/" replace />

  if (state === 'loading') {
    return (
      <main className="min-h-screen bg-background text-foreground font-sans">
        <div className="container max-w-lg py-12 space-y-6 pb-28">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-40" />
          </div>
          <Skeleton className="h-36 w-full rounded-lg" />
          <Skeleton className="h-72 w-full rounded-lg" />
          {/* Nudge card skeleton — WIREFRAMES.md loading state. */}
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      </main>
    )
  }

  if (state === 'error') {
    return (
      <main className="min-h-screen bg-background text-foreground font-sans">
        <div className="container max-w-lg py-12 space-y-4 text-center">
          <p className="text-body text-muted-foreground">
            Couldn't load your data. Check your connection and try again.
          </p>
          <Button variant="ghost" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </main>
    )
  }

  const dashboardData = data as DashboardData

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg py-12 space-y-6 pb-28">
        <header className="space-y-1">
          <p className="section-label">{dashboardData.household.name}</p>
          <h1 className="font-display text-display">Your plan</h1>
        </header>

        {/* Copy written for Slice 8 — COPY_DECK.md has no offline-banner
            entry; flagged there for backfill. Observational, no exclamation,
            per the deck's established voice. DATA_MODEL.md's guidance is to
            show this only on network-dependent screens, which is why it
            lives here and not in a global shell. */}
        {offline && (
          <div role="status" className="rounded-lg border border-dashed p-3 text-caption">
            You're offline. Showing what was last saved to this device, from{' '}
            {formatStaleness(readDashboardFetchedAt(dashboardData.household.id), Date.now())}. Values
            may have changed since.
          </div>
        )}

        <HealthTierCard completeness={dashboardData.completeness} />

        <AllocationDonut
          state={dashboardData.allocation.length === 0 ? 'empty' : 'populated'}
          allocation={dashboardData.allocation}
          totalValue={dashboardData.totalValue}
        />

        {dashboardData.nudge && <NudgeCard nudge={dashboardData.nudge} />}

        {/* Post-activation install prompt — renders nothing unless the
            browser actually offered an install (Slice 8). */}
        <InstallPrompt surface="dashboard" />

        <nav className="flex flex-col gap-2 pt-2">
          <Link to="/portfolio" className="text-body underline">
            View your holdings →
          </Link>
          <Link to="/explore" className="text-body underline">
            Explore what you can invest in →
          </Link>
          <Link to="/profile" className="text-body underline">
            Manage your protection cover →
          </Link>
        </nav>
      </div>
    </main>
  )
}
