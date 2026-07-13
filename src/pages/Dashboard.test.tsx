import { describe, it, expect, vi, beforeEach } from 'vitest'
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
    expect(track).toHaveBeenCalledTimes(1)
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

  it('shows an error state with a retry button when the fetch fails', async () => {
    fetchDashboard.mockRejectedValue(new DashboardApiError(500, 'server_error'))
    renderDashboard()

    await screen.findByText(/couldn't load your data/i)
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
