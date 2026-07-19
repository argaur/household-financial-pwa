/**
 * Slice 8 — the client half of offline dashboard support.
 *
 * The service worker (vite.config.ts) caches the last successful
 * /api/dashboard response with a NetworkFirst strategy, so a reload while
 * offline still renders. But a NetworkFirst hit is indistinguishable from a
 * live response at the fetch() layer — the client can't ask Workbox "did this
 * come from cache?" without a custom service worker, which SPEC.md §7
 * explicitly steers away from for this slice.
 *
 * So freshness is tracked here instead: every *successful* dashboard load
 * stamps a timestamp, and the UI reports how old the data on screen is
 * whenever the browser is offline. That keeps the whole thing to plain
 * localStorage plus one Workbox rule — no custom SW layer.
 *
 * Timestamps are keyed per household, matching the existing
 * `dashboard:last-tier:<id>` convention Slice 6 established.
 */

const FETCHED_AT_KEY_PREFIX = 'dashboard:fetched-at:'

/** Beyond this age, cached dashboard data is described as stale. */
export const STALE_AFTER_MS = 60 * 60 * 1000 // 1 hour

function keyFor(householdId: string): string {
  return `${FETCHED_AT_KEY_PREFIX}${householdId}`
}

/**
 * localStorage throws in Safari private mode and when the quota is exceeded.
 * Freshness reporting is a nicety — never let it take down a dashboard that
 * otherwise rendered fine.
 */
export function recordDashboardFetch(householdId: string, now: number): void {
  try {
    window.localStorage.setItem(keyFor(householdId), String(now))
  } catch {
    // Freshness reporting degrades to "at some point"; nothing else breaks.
  }
}

export function readDashboardFetchedAt(householdId: string): number | null {
  try {
    const raw = window.localStorage.getItem(keyFor(householdId))
    if (raw === null) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function clearDashboardFetchedAt(householdId: string): void {
  try {
    window.localStorage.removeItem(keyFor(householdId))
  } catch {
    // Nothing to do — a stale key is harmless.
  }
}

/**
 * An unknown timestamp counts as stale: we'd rather over-warn than tell
 * someone their numbers are current when we can't actually vouch for it.
 * A future timestamp (clock skew, or a device whose clock moved backwards)
 * counts as fresh rather than wrapping around to a huge negative age.
 */
export function isStale(fetchedAt: number | null, now: number): boolean {
  if (fetchedAt === null) return true
  const age = now - fetchedAt
  if (age < 0) return false
  return age >= STALE_AFTER_MS
}

/** Must match `cacheName` on the /api/dashboard rule in vite.config.ts. */
export const DASHBOARD_CACHE_NAME = 'dashboard-last'

/**
 * Purge the cached dashboard response on sign-out.
 *
 * Service-worker caches are scoped to the *origin*, not to a signed-in user.
 * NetworkFirst normally protects us — a second user on the same browser hits
 * the network and gets their own data — but offline it would fall back to
 * whatever household was cached last. Signing out and going offline would
 * then show the previous user's holdings. Multi-tenancy in this app is
 * app-layer only (no Postgres RLS), so the client is responsible for not
 * leaving another household's data readable on a shared device.
 */
export async function clearDashboardCache(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return
    await caches.delete(DASHBOARD_CACHE_NAME)
  } catch {
    // Best-effort: a failed purge still leaves NetworkFirst as the guard.
  }
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`
}

/** Human-readable age for the offline banner. Rolls up at each boundary. */
export function formatStaleness(fetchedAt: number | null, now: number): string {
  if (fetchedAt === null) return 'at some point'
  const age = now - fetchedAt
  if (age < MINUTE) return 'just now'
  if (age < HOUR) return plural(Math.floor(age / MINUTE), 'minute')
  if (age < DAY) return plural(Math.floor(age / HOUR), 'hour')
  return plural(Math.floor(age / DAY), 'day')
}
