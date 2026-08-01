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
import { fetchHousehold } from '@/lib/household-api'
import { listFamilyMembers } from '@/lib/family-members-api'
import { listHoldings } from '@/lib/holdings-api'
import { listProtection } from '@/lib/protection-api'
import { VaultLockedError } from '@/lib/encrypted-rows'
import { computeCompleteness, type Completeness, type CompletenessTier } from '@/lib/dashboard'
import { buildNudgeContext, selectNudge, type Nudge } from '@/lib/nudge'
import { computeAllocation, type AllocationSlice } from '@/lib/allocation'

type State = 'loading' | 'loaded' | 'error' | 'no-household' | 'locked'

interface DashboardView {
  householdId: string
  householdName: string
  completeness: Completeness
  nudge: Nudge
  allocation: AllocationSlice[]
  totalValue: number
  /** Rows across members/holdings/protection that failed to decrypt. A count only. */
  unreadableCount: number
  /** Rows across members/holdings/protection that predate encryption. */
  notYetEncryptedCount: number
}

const LAST_TIER_KEY_PREFIX = 'dashboard:last-tier:'

/**
 * Home / Dashboard — Slice 6, moved client-side in the step that deleted
 * `GET /api/dashboard` (Documentation §"client-side encryption design",
 * 2026-08-01). Copy: Documentation/design/COPY_DECK.md "Home / Dashboard".
 * Layout: Documentation/design/WIREFRAMES.md 2a/2b/2c.
 *
 * The server used to compute the Household Health tier, the allocation donut
 * and the nudge from plaintext DB columns. Those columns no longer exist for
 * an encrypted row, so this page now fetches the household, its family
 * members, its holdings and its protection records — each already decrypted
 * client-side by its own API client (src/lib/*-api.ts) — and runs the exact
 * same pure functions (computeCompleteness/selectNudge/computeAllocation,
 * src/lib) over the decrypted rows in the browser.
 *
 * The Completeness Score stays read-time-only (SPEC.md §7's named simpler
 * fallback for this slice's riskiest assumption — no live-recompute-on-write).
 * completeness_score_changed is therefore still detected client-side: compare
 * the tier just computed against the last tier seen for this household
 * (localStorage), fire the event on a change, then update the stored value.
 */
export function Dashboard() {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>('loading')
  const [data, setData] = useState<DashboardView | null>(null)
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
        // DATA_MODEL.md caps a household at ~50 holdings, so fetching every
        // member/holding/protection row in one shot and decrypting all of it
        // client-side is fine at this scale — no pagination is needed.
        const [householdResult, membersResult, holdingsResult, protectionResult] = await Promise.all([
          fetchHousehold(token),
          listFamilyMembers(token),
          listHoldings(token),
          listProtection(token),
        ])
        if (cancelled) return

        if (householdResult.state !== 'ok') {
          // 'absent' (no household yet), 'not-yet-encrypted' and 'unreadable'
          // each have their own full-page copy and recovery path already, all
          // owned by HouseholdGate — route back through it rather than
          // duplicating three more full-page states on this screen.
          setState('no-household')
          return
        }

        const members = membersResult.members
        const holdings = holdingsResult.holdings
        const protectionRecords = protectionResult.protection

        // Each *-api.ts client already isolated per-row decrypt failures —
        // `members`/`holdings`/`protectionRecords` above hold only the rows
        // that decrypted. One bad row never blanks this screen or corrupts
        // the totals; it just doesn't count toward them.
        const completeness = computeCompleteness(members, holdings, protectionRecords)
        const nudge = selectNudge(completeness.checks, buildNudgeContext(members, holdings, protectionRecords))
        const { allocation, totalValue } = computeAllocation(holdings)

        const unreadableCount =
          membersResult.unreadableCount + holdingsResult.unreadableCount + protectionResult.unreadableCount
        const notYetEncryptedCount =
          membersResult.notYetEncryptedCount +
          holdingsResult.notYetEncryptedCount +
          protectionResult.notYetEncryptedCount

        const result: DashboardView = {
          householdId: householdResult.household.id,
          householdName: householdResult.household.name,
          completeness,
          nudge,
          allocation,
          totalValue,
          unreadableCount,
          notYetEncryptedCount,
        }
        setData(result)
        setState('loaded')
        // Only stamp freshness when we actually reached the network. A
        // NetworkFirst *cache* hit resolves successfully too, so stamping
        // unconditionally would keep re-marking week-old cached data as
        // fetched "just now" — the banner would then never report real age.
        if (navigator.onLine) {
          recordDashboardFetch(result.householdId, Date.now())
        }
      } catch (err) {
        if (cancelled) return
        // The vault being locked is not an error: it means this browser
        // simply doesn't hold the household's key yet (new device, cleared
        // storage, or a future idle lock). Showing zeroes here would be
        // lying about someone's finances — route back through the gate that
        // owns the unlock flow instead of rendering anything dashboard-shaped.
        if (err instanceof VaultLockedError) {
          setState('locked')
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
    track('dashboard_viewed', { household_id: data.householdId, allocation_summary: allocationSummary })

    // Slice 7 — exactly one nudge is always present, so this fires once per
    // dashboard load, gated by the same viewedFired ref as dashboard_viewed.
    track('nudge_shown', {
      check_id: data.nudge.checkId,
      learn_card_slug: data.nudge.learnCardSlug,
      target_type: data.nudge.targetType,
    })

    const key = `${LAST_TIER_KEY_PREFIX}${data.householdId}`
    const lastTier = window.localStorage.getItem(key) as CompletenessTier | null
    if (lastTier && lastTier !== data.completeness.tier) {
      track('completeness_score_changed', {
        household_id: data.householdId,
        before_tier: lastTier,
        after_tier: data.completeness.tier,
      })
    }
    window.localStorage.setItem(key, data.completeness.tier)
  }, [state, data])

  if (state === 'no-household' || state === 'locked') return <Navigate to="/" replace />

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

  const dashboardData = data as DashboardView
  const hasPartialData = dashboardData.unreadableCount > 0 || dashboardData.notYetEncryptedCount > 0

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg py-12 space-y-6 pb-28">
        <header className="space-y-1">
          <p className="section-label">{dashboardData.householdName}</p>
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
            {formatStaleness(readDashboardFetchedAt(dashboardData.householdId), Date.now())}. Values
            may have changed since.
          </div>
        )}

        {/* A silently wrong net worth is worse than an obviously incomplete
            one — if any row couldn't be decrypted, or predates encryption,
            say so here rather than quietly excluding it from the totals
            below without a word. */}
        {hasPartialData && (
          <div role="status" className="rounded-lg border border-dashed p-3 text-caption">
            {dashboardData.unreadableCount > 0 &&
              `${dashboardData.unreadableCount} item${dashboardData.unreadableCount === 1 ? '' : 's'} couldn't be read. `}
            {dashboardData.notYetEncryptedCount > 0 &&
              `${dashboardData.notYetEncryptedCount} item${dashboardData.notYetEncryptedCount === 1 ? '' : 's'} still need${dashboardData.notYetEncryptedCount === 1 ? 's' : ''} to be re-saved. `}
            The totals below don't include these yet.
          </div>
        )}

        <HealthTierCard completeness={dashboardData.completeness} />

        <AllocationDonut
          state={dashboardData.allocation.length === 0 ? 'empty' : 'populated'}
          allocation={dashboardData.allocation}
          totalValue={dashboardData.totalValue}
        />

        <NudgeCard nudge={dashboardData.nudge} />

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
