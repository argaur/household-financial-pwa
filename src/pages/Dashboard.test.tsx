import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Dashboard } from './Dashboard'
import { DashboardApiError, type DashboardData } from '@/lib/dashboard-api'

const getToken = vi.fn().mockResolvedValue('test-token')
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken }),
}))

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

const fetchDashboard = vi.fn()
vi.mock('@/lib/dashboard-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/dashboard-api')>()
  return { ...actual, fetchDashboard: (...args: unknown[]) => fetchDashboard(...args) }
})

const emptyDashboard: DashboardData = {
  household: { id: 'h1', name: 'Gupta Family' },
  completeness: {
    checks: {
      memberCoverage: false,
      emergencyFund: false,
      bothParentsProtected: false,
      assetDiversity: false,
      noStaleValues: false,
    },
    score: 0,
    tier: 'getting_started',
  },
  nudge: { checkId: 'member_coverage', learnCardSlug: 'portfolio', memberName: 'Meera' },
  allocation: [],
  totalValue: 0,
}

const populatedDashboard: DashboardData = {
  household: { id: 'h1', name: 'Gupta Family' },
  completeness: {
    checks: {
      memberCoverage: true,
      emergencyFund: true,
      bothParentsProtected: true,
      assetDiversity: true,
      noStaleValues: true,
    },
    score: 5,
    tier: 'strong',
  },
  nudge: { checkId: 'complete', learnCardSlug: 'explore' },
  allocation: [
    { assetClass: 'equity', value: 6000, percentage: 60 },
    { assetClass: 'debt', value: 4000, percentage: 40 },
  ],
  totalValue: 10000,
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  )
}

describe('Dashboard', () => {
  // Only ever restore THIS spy: vi.restoreAllMocks() would also clear the
  // module-level vi.fn() implementations (getToken's mockResolvedValue).
  let onLineSpy: ReturnType<typeof vi.spyOn> | null = null
  afterEach(() => {
    onLineSpy?.mockRestore()
    onLineSpy = null
  })

  beforeEach(() => {
    fetchDashboard.mockReset()
    track.mockReset()
    window.localStorage.clear()
  })

  it('shows the household name, tier, and empty donut state for a fresh household', async () => {
    fetchDashboard.mockResolvedValue(emptyDashboard)
    renderDashboard()

    await screen.findByText('Gupta Family')
    expect(screen.getByText('Getting Started')).toBeInTheDocument()
    expect(screen.getByText('Nothing recorded yet.')).toBeInTheDocument()
  })

  it('shows the populated donut and legend when allocation data exists', async () => {
    fetchDashboard.mockResolvedValue(populatedDashboard)
    renderDashboard()

    await screen.findByText('Strong')
    expect(screen.getByText('Equity')).toBeInTheDocument()
    expect(screen.getByText('₹10,000')).toBeInTheDocument()
  })

  it('fires dashboard_viewed once with an allocation summary', async () => {
    fetchDashboard.mockResolvedValue(populatedDashboard)
    renderDashboard()

    await screen.findByText('Strong')
    expect(track).toHaveBeenCalledWith('dashboard_viewed', {
      household_id: 'h1',
      allocation_summary: 'equity:60%,debt:40%',
    })
    // dashboard_viewed + nudge_shown (Slice 7) — both once per load.
    expect(track).toHaveBeenCalledTimes(2)
  })

  it('renders exactly one nudge card, never zero (SPEC.md §7)', async () => {
    for (const fixture of [emptyDashboard, populatedDashboard]) {
      fetchDashboard.mockResolvedValue(fixture)
      const { unmount } = renderDashboard()
      await screen.findByText('Next step')
      expect(screen.getAllByText('Next step')).toHaveLength(1)
      unmount()
    }
  })

  it('fires nudge_shown once per load with the selected check', async () => {
    fetchDashboard.mockResolvedValue(emptyDashboard)
    renderDashboard()

    await screen.findByText('Next step')
    expect(track).toHaveBeenCalledWith('nudge_shown', {
      check_id: 'member_coverage',
      learn_card_slug: 'portfolio',
    })
    expect(track.mock.calls.filter((c) => c[0] === 'nudge_shown')).toHaveLength(1)
  })

  it('degrades to no nudge card instead of crashing on a payload missing `nudge`', async () => {
    // Reachable via Slice 8's cached dashboard response: new JS can render a
    // payload serialized before the nudge field existed.
    const { nudge: _omitted, ...legacyPayload } = populatedDashboard
    fetchDashboard.mockResolvedValue(legacyPayload)
    renderDashboard()

    await screen.findByText('Strong')
    expect(screen.queryByText('Next step')).not.toBeInTheDocument()
    expect(track).not.toHaveBeenCalledWith('nudge_shown', expect.anything())
  })

  it('fires completeness_score_changed when the tier differs from the last-seen tier in localStorage', async () => {
    window.localStorage.setItem('dashboard:last-tier:h1', 'getting_started')
    fetchDashboard.mockResolvedValue(populatedDashboard)
    renderDashboard()

    await screen.findByText('Strong')
    expect(track).toHaveBeenCalledWith('completeness_score_changed', {
      household_id: 'h1',
      before_tier: 'getting_started',
      after_tier: 'strong',
    })
    expect(window.localStorage.getItem('dashboard:last-tier:h1')).toBe('strong')
  })

  it('does not fire completeness_score_changed when the tier is unchanged', async () => {
    window.localStorage.setItem('dashboard:last-tier:h1', 'strong')
    fetchDashboard.mockResolvedValue(populatedDashboard)
    renderDashboard()

    await screen.findByText('Strong')
    expect(track).not.toHaveBeenCalledWith('completeness_score_changed', expect.anything())
  })

  it('shows no offline banner while online', async () => {
    fetchDashboard.mockResolvedValue(populatedDashboard)
    renderDashboard()

    await screen.findByText('Strong')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the offline banner with the age of the cached data when offline', async () => {
    onLineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false) as never
    // Data last actually fetched two hours ago, while online.
    window.localStorage.setItem('dashboard:fetched-at:h1', String(Date.now() - 2 * 60 * 60 * 1000))
    fetchDashboard.mockResolvedValue(populatedDashboard)
    renderDashboard()

    await screen.findByText('Strong')
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent(/you're offline/i)
    expect(banner).toHaveTextContent(/2 hours ago/)
  })

  it('does not refresh the freshness stamp on an offline (cache-served) load', async () => {
    onLineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false) as never
    const twoHoursAgo = String(Date.now() - 2 * 60 * 60 * 1000)
    window.localStorage.setItem('dashboard:fetched-at:h1', twoHoursAgo)
    fetchDashboard.mockResolvedValue(populatedDashboard)
    renderDashboard()

    await screen.findByText('Strong')
    // Would silently mark week-old cached data as "just now" if it did.
    expect(window.localStorage.getItem('dashboard:fetched-at:h1')).toBe(twoHoursAgo)
  })

  it('stamps freshness on a successful online load', async () => {
    fetchDashboard.mockResolvedValue(populatedDashboard)
    renderDashboard()

    await screen.findByText('Strong')
    const stamped = Number(window.localStorage.getItem('dashboard:fetched-at:h1'))
    expect(Number.isFinite(stamped)).toBe(true)
    expect(Date.now() - stamped).toBeLessThan(5000)
  })

  it('shows an error state with a retry button when the fetch fails', async () => {
    fetchDashboard.mockRejectedValue(new DashboardApiError(500, 'server_error'))
    renderDashboard()

    await screen.findByText(/couldn't load your data/i)
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
