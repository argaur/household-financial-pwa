import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Link, Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { HealthTierCard } from '@/components/health-tier-card'
import { AllocationDonut } from '@/components/allocation-donut'
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

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = await getToken()
        const result = await fetchDashboard(token)
        if (cancelled) return
        setData(result)
        setState('loaded')
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

        <HealthTierCard completeness={dashboardData.completeness} />

        <AllocationDonut
          state={dashboardData.allocation.length === 0 ? 'empty' : 'populated'}
          allocation={dashboardData.allocation}
          totalValue={dashboardData.totalValue}
        />

        {/* Next-step nudge card is Slice 7 scope — not built here. */}

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
