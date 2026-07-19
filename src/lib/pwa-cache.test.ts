import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  recordDashboardFetch,
  readDashboardFetchedAt,
  clearDashboardFetchedAt,
  isStale,
  formatStaleness,
  STALE_AFTER_MS,
  clearDashboardCache,
  DASHBOARD_CACHE_NAME,
} from './pwa-cache'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

beforeEach(() => {
  window.localStorage.clear()
})

describe('dashboard fetch timestamp', () => {
  it('round-trips a recorded timestamp', () => {
    recordDashboardFetch('h1', 1_700_000_000_000)
    expect(readDashboardFetchedAt('h1')).toBe(1_700_000_000_000)
  })

  it('is scoped per household — one household never reads another\'s timestamp', () => {
    recordDashboardFetch('h1', 1_700_000_000_000)
    expect(readDashboardFetchedAt('h2')).toBeNull()
  })

  it('returns null when nothing has been recorded', () => {
    expect(readDashboardFetchedAt('h1')).toBeNull()
  })

  it('returns null rather than NaN when the stored value is corrupt', () => {
    window.localStorage.setItem('dashboard:fetched-at:h1', 'not-a-number')
    expect(readDashboardFetchedAt('h1')).toBeNull()
  })

  it('clears a stored timestamp', () => {
    recordDashboardFetch('h1', 1_700_000_000_000)
    clearDashboardFetchedAt('h1')
    expect(readDashboardFetchedAt('h1')).toBeNull()
  })

  it('survives localStorage being unavailable (private mode / quota) without throwing', () => {
    const original = window.localStorage.setItem
    window.localStorage.setItem = () => {
      throw new DOMException('QuotaExceededError')
    }
    expect(() => recordDashboardFetch('h1', 1)).not.toThrow()
    window.localStorage.setItem = original
  })
})

describe('clearDashboardCache', () => {
  it('deletes the dashboard cache by name', async () => {
    const deleted: string[] = []
    vi.stubGlobal('caches', { delete: async (name: string) => { deleted.push(name); return true } })
    await clearDashboardCache()
    expect(deleted).toEqual([DASHBOARD_CACHE_NAME])
    vi.unstubAllGlobals()
  })

  it('is a no-op when the Cache API is unavailable', async () => {
    vi.stubGlobal('caches', undefined)
    await expect(clearDashboardCache()).resolves.toBeUndefined()
    vi.unstubAllGlobals()
  })

  it('swallows a failing cache delete rather than blocking sign-out', async () => {
    vi.stubGlobal('caches', { delete: async () => { throw new Error('nope') } })
    await expect(clearDashboardCache()).resolves.toBeUndefined()
    vi.unstubAllGlobals()
  })
})

describe('isStale', () => {
  const now = 1_700_000_000_000

  it('treats a missing timestamp as stale — we cannot claim data is fresh', () => {
    expect(isStale(null, now)).toBe(true)
  })

  it('is fresh immediately after a fetch', () => {
    expect(isStale(now, now)).toBe(false)
  })

  it('is fresh just inside the threshold and stale just outside it', () => {
    expect(isStale(now - (STALE_AFTER_MS - 1), now)).toBe(false)
    expect(isStale(now - STALE_AFTER_MS, now)).toBe(true)
    expect(isStale(now - (STALE_AFTER_MS + 1), now)).toBe(true)
  })

  it('treats a future timestamp as fresh rather than stale (clock skew)', () => {
    expect(isStale(now + HOUR, now)).toBe(false)
  })
})

describe('formatStaleness', () => {
  const now = 1_700_000_000_000

  it('describes a very recent fetch as just now', () => {
    expect(formatStaleness(now - 5_000, now)).toBe('just now')
  })

  it('describes minutes, singular and plural', () => {
    expect(formatStaleness(now - MINUTE, now)).toBe('1 minute ago')
    expect(formatStaleness(now - 5 * MINUTE, now)).toBe('5 minutes ago')
  })

  it('describes hours, singular and plural', () => {
    expect(formatStaleness(now - HOUR, now)).toBe('1 hour ago')
    expect(formatStaleness(now - 3 * HOUR, now)).toBe('3 hours ago')
  })

  it('describes days, singular and plural', () => {
    expect(formatStaleness(now - DAY, now)).toBe('1 day ago')
    expect(formatStaleness(now - 4 * DAY, now)).toBe('4 days ago')
  })

  it('rolls up at each boundary rather than reporting 60 minutes or 24 hours', () => {
    expect(formatStaleness(now - 60 * MINUTE, now)).toBe('1 hour ago')
    expect(formatStaleness(now - 24 * HOUR, now)).toBe('1 day ago')
  })

  it('falls back to a vague phrase when the timestamp is unknown', () => {
    expect(formatStaleness(null, now)).toBe('at some point')
  })

  it('does not emit a negative duration for a future timestamp', () => {
    expect(formatStaleness(now + MINUTE, now)).toBe('just now')
  })
})
