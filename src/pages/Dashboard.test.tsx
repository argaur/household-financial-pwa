import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Dashboard } from './Dashboard'
import { VaultLockedError } from '@/lib/encrypted-rows'
import type { Household } from '@/lib/household-api'
import type { FamilyMember } from '@/lib/family-members-api'
import type { Holding } from '@/lib/holdings-api'
import type { Protection } from '@/lib/protection-api'
import { expectNoAxeViolations } from '@/test/axe'
import { expectNoPortfolioShape, expectNoCallCarriesPortfolioShape } from '@/test/analytics-guard'

const getToken = vi.fn().mockResolvedValue('test-token')
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken }),
}))

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

const fetchHousehold = vi.fn()
vi.mock('@/lib/household-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/household-api')>()
  return { ...actual, fetchHousehold: (...args: unknown[]) => fetchHousehold(...args) }
})

const listFamilyMembers = vi.fn()
vi.mock('@/lib/family-members-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/family-members-api')>()
  return { ...actual, listFamilyMembers: (...args: unknown[]) => listFamilyMembers(...args) }
})

const listHoldings = vi.fn()
vi.mock('@/lib/holdings-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/holdings-api')>()
  return { ...actual, listHoldings: (...args: unknown[]) => listHoldings(...args) }
})

const listProtection = vi.fn()
vi.mock('@/lib/protection-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/protection-api')>()
  return { ...actual, listProtection: (...args: unknown[]) => listProtection(...args) }
})

// --- fixtures -------------------------------------------------------------

const household: Household = {
  id: 'h1',
  name: 'Gupta Family',
  ownerUserId: 'user_1',
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function member(overrides: Partial<FamilyMember> = {}): FamilyMember {
  return {
    id: 'm1',
    name: 'Arun',
    relationship: 'self',
    dateOfBirth: '1990-01-01',
    riskProfile: null,
    householdId: 'h1',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 'hold1',
    instrumentId: 'equity-fund',
    assetClass: 'equity',
    investedAmount: '1000',
    currentValue: '1000',
    units: null,
    monthlySip: null,
    startDate: null,
    maturityDate: null,
    nominee: null,
    isEmergencyFund: false,
    notes: null,
    householdId: 'h1',
    memberId: 'm1',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function protectionRecord(overrides: Partial<Protection> = {}): Protection {
  return {
    id: 'prot1',
    type: 'term-life',
    coverAmount: '10000000',
    premium: null,
    provider: null,
    status: 'active',
    householdId: 'h1',
    memberId: 'm1',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function mockOk({
  members = [],
  holdings = [],
  protection = [],
  membersUnreadable = 0,
  holdingsUnreadable = 0,
  protectionUnreadable = 0,
  membersNotYetEncrypted = 0,
  holdingsNotYetEncrypted = 0,
  protectionNotYetEncrypted = 0,
}: {
  members?: FamilyMember[]
  holdings?: Holding[]
  protection?: Protection[]
  membersUnreadable?: number
  holdingsUnreadable?: number
  protectionUnreadable?: number
  membersNotYetEncrypted?: number
  holdingsNotYetEncrypted?: number
  protectionNotYetEncrypted?: number
} = {}) {
  fetchHousehold.mockResolvedValue({ state: 'ok', household })
  listFamilyMembers.mockResolvedValue({
    members,
    unreadableCount: membersUnreadable,
    notYetEncryptedCount: membersNotYetEncrypted,
  })
  listHoldings.mockResolvedValue({
    holdings,
    unreadableCount: holdingsUnreadable,
    notYetEncryptedCount: holdingsNotYetEncrypted,
  })
  listProtection.mockResolvedValue({
    protection,
    unreadableCount: protectionUnreadable,
    notYetEncryptedCount: protectionNotYetEncrypted,
  })
}

/** The full-coverage fixture ported from the deleted server/dashboard.integration.test.ts
 * ("fixture: full coverage across members/holdings/protection — strong tier, correct
 * allocation") — proves the client computation matches what the server route used to return. */
function mockFullCoverage() {
  const self = member({ id: 'm1', name: 'Ananya Verma', relationship: 'self' })
  const spouse = member({ id: 'm2', name: 'Rohit Verma', relationship: 'spouse' })
  mockOk({
    members: [self, spouse],
    holdings: [
      holding({ id: 'h-eq', memberId: 'm1', assetClass: 'equity', currentValue: '6000', isEmergencyFund: true }),
      holding({ id: 'h-debt', memberId: 'm2', assetClass: 'debt', currentValue: '3000' }),
      holding({ id: 'h-gold', memberId: 'm1', assetClass: 'gold', currentValue: '1000' }),
    ],
    protection: [
      protectionRecord({ id: 'p1', memberId: 'm1', status: 'active' }),
      protectionRecord({ id: 'p2', memberId: 'm2', status: 'active' }),
    ],
  })
}

function renderDashboard(initialPath = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/" element={<div data-testid="root-redirect" />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Dashboard', () => {
  let onLineSpy: ReturnType<typeof vi.spyOn> | null = null
  afterEach(() => {
    onLineSpy?.mockRestore()
    onLineSpy = null
  })

  beforeEach(() => {
    fetchHousehold.mockReset()
    listFamilyMembers.mockReset()
    listHoldings.mockReset()
    listProtection.mockReset()
    track.mockReset()
    window.localStorage.clear()
  })

  it('shows the household name, tier, and empty donut state for a fresh household', async () => {
    mockOk()
    renderDashboard()

    await screen.findByText('Gupta Family')
    expect(screen.getByText('Getting Started')).toBeInTheDocument()
    expect(screen.getByText('Nothing recorded yet.')).toBeInTheDocument()
  })

  // /dashboard is one of the five screens documented at zero axe violations
  // live (see CLAUDE.md). Scanned in its fullest state (the Recharts donut
  // rendered, all five checks complete) so the scan is at least as thorough
  // as the empty state, not less.
  it('has zero axe violations', async () => {
    mockFullCoverage()
    const { container } = renderDashboard()
    await screen.findByText('Strong')
    await expectNoAxeViolations(container)
  })

  it('computes the same tier, allocation and nudge from decrypted rows the server route used to return', async () => {
    mockFullCoverage()
    renderDashboard()

    await screen.findByText('Strong')
    expect(screen.getByText('5 of 5 checks complete')).toBeInTheDocument()
    expect(screen.getByText('Equity')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('Debt')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()
    expect(screen.getByText('Gold')).toBeInTheDocument()
    expect(screen.getByText('10%')).toBeInTheDocument()
    expect(screen.getByText('₹10,000')).toBeInTheDocument()
    // All 5 checks pass -> the affirming "complete" nudge (SPEC.md §7).
    expect(screen.getByText(/every check in your household plan is covered/i)).toBeInTheDocument()
  })

  it('nudge names the member with no holdings recorded (ported from the server fixture)', async () => {
    const self = member({ id: 'm1', name: 'Arun', relationship: 'self' })
    const spouse = member({ id: 'm2', name: 'Meera', relationship: 'spouse' })
    mockOk({
      members: [self, spouse],
      holdings: [holding({ memberId: 'm1', assetClass: 'equity', currentValue: '600' })],
    })
    renderDashboard()

    await screen.findByText('Next step')
    expect(screen.getByText(/Meera has no holdings recorded yet\./)).toBeInTheDocument()
  })

  it('fires dashboard_viewed once, without an allocation summary — that describes portfolio shape', async () => {
    mockFullCoverage()
    renderDashboard()

    await screen.findByText('Strong')
    // waitFor, not a bare expect: the track() calls live in a useEffect that
    // commits AFTER the DOM mutation findByText resolves on — see BUG_LOG B-004.
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith('dashboard_viewed', {
        household_id: 'h1',
      }),
    )
    expect(track).toHaveBeenCalledTimes(2)
    const call = track.mock.calls.find((c) => c[0] === 'dashboard_viewed')!
    expectNoPortfolioShape(call[1] as Record<string, unknown>)
  })

  it('renders exactly one nudge card, never zero (SPEC.md §7)', async () => {
    for (const mockFn of [() => mockOk(), () => mockFullCoverage()]) {
      mockFn()
      const { unmount } = renderDashboard()
      await screen.findByText('Next step')
      expect(screen.getAllByText('Next step')).toHaveLength(1)
      unmount()
    }
  })

  it('fires nudge_shown once per load, without check_id — that names which check failed', async () => {
    mockOk()
    renderDashboard()

    await screen.findByText('Next step')
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith('nudge_shown', {
        learn_card_slug: 'portfolio',
        target_type: 'route',
      }),
    )
    expect(track.mock.calls.filter((c) => c[0] === 'nudge_shown')).toHaveLength(1)
    const call = track.mock.calls.find((c) => c[0] === 'nudge_shown')!
    expectNoPortfolioShape(call[1] as Record<string, unknown>)
  })

  it('fires completeness_score_changed when the tier differs, without before/after tier', async () => {
    window.localStorage.setItem('dashboard:last-tier:h1', 'getting_started')
    mockFullCoverage()
    renderDashboard()

    await screen.findByText('Strong')
    expect(track).toHaveBeenCalledWith('completeness_score_changed', {
      household_id: 'h1',
    })
    expect(window.localStorage.getItem('dashboard:last-tier:h1')).toBe('strong')
    const call = track.mock.calls.find((c) => c[0] === 'completeness_score_changed')!
    expectNoPortfolioShape(call[1] as Record<string, unknown>)
  })

  it('does not fire completeness_score_changed when the tier is unchanged', async () => {
    window.localStorage.setItem('dashboard:last-tier:h1', 'strong')
    mockFullCoverage()
    renderDashboard()

    await screen.findByText('Strong')
    expect(track).not.toHaveBeenCalledWith('completeness_score_changed', expect.anything())
  })

  it('sweeps every event fired on a load for portfolio shape, not just the ones named above', async () => {
    window.localStorage.setItem('dashboard:last-tier:h1', 'getting_started')
    mockFullCoverage()
    renderDashboard()

    await screen.findByText('Strong')
    await waitFor(() => expect(track).toHaveBeenCalledWith('completeness_score_changed', expect.anything()))
    expectNoCallCarriesPortfolioShape(track)
  })

  it('shows no offline banner while online', async () => {
    mockFullCoverage()
    renderDashboard()

    await screen.findByText('Strong')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the offline banner with the age of the cached data when offline', async () => {
    onLineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false) as never
    window.localStorage.setItem('dashboard:fetched-at:h1', String(Date.now() - 2 * 60 * 60 * 1000))
    mockFullCoverage()
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
    mockFullCoverage()
    renderDashboard()

    await screen.findByText('Strong')
    // Would silently mark week-old cached data as "just now" if it did.
    expect(window.localStorage.getItem('dashboard:fetched-at:h1')).toBe(twoHoursAgo)
  })

  it('stamps freshness on a successful online load', async () => {
    mockFullCoverage()
    renderDashboard()

    await screen.findByText('Strong')
    const stamped = Number(window.localStorage.getItem('dashboard:fetched-at:h1'))
    expect(Number.isFinite(stamped)).toBe(true)
    expect(Date.now() - stamped).toBeLessThan(5000)
  })

  it('shows an error state with a retry button when a fetch fails', async () => {
    fetchHousehold.mockResolvedValue({ state: 'ok', household })
    listFamilyMembers.mockResolvedValue({ members: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    listHoldings.mockRejectedValue(new Error('network down'))
    listProtection.mockResolvedValue({ protection: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    renderDashboard()

    await screen.findByText(/couldn't load your data/i)
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('redirects home instead of rendering when there is no household yet', async () => {
    fetchHousehold.mockResolvedValue({ state: 'absent' })
    listFamilyMembers.mockResolvedValue({ members: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    listHoldings.mockResolvedValue({ holdings: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    listProtection.mockResolvedValue({ protection: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    renderDashboard()

    await screen.findByTestId('root-redirect')
    expect(screen.queryByText('Your plan')).not.toBeInTheDocument()
  })

  it('shows a single locked state and no monetary values when the vault is locked, routing to the unlock experience', async () => {
    fetchHousehold.mockRejectedValue(new VaultLockedError())
    listFamilyMembers.mockRejectedValue(new VaultLockedError())
    listHoldings.mockRejectedValue(new VaultLockedError())
    listProtection.mockRejectedValue(new VaultLockedError())
    renderDashboard()

    await screen.findByTestId('root-redirect')
    // Not merely "no household screen" — nothing dashboard-shaped rendered at
    // all, and specifically no monetary value leaked onto the screen.
    expect(screen.queryByText('Your plan')).not.toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(/₹/)
  })

  it('excludes an unreadable row from the computation but still renders everything else, with the count shown', async () => {
    const self = member({ id: 'm1', name: 'Arun', relationship: 'self' })
    mockOk({
      members: [self],
      holdings: [
        holding({ id: 'h1', memberId: 'm1', assetClass: 'equity', currentValue: '6000' }),
        holding({ id: 'h2', memberId: 'm1', assetClass: 'debt', currentValue: '3000' }),
      ],
      holdingsUnreadable: 1,
    })
    renderDashboard()

    await screen.findByText('Gupta Family')
    // The two decrypted holdings still render/compute normally.
    expect(screen.getByText('Equity')).toBeInTheDocument()
    expect(screen.getByText('Debt')).toBeInTheDocument()
    expect(screen.getByText('₹9,000')).toBeInTheDocument()
    // And the gap is disclosed, not hidden.
    expect(screen.getByText(/1.*couldn't be read/i)).toBeInTheDocument()
  })

  it('discloses not-yet-encrypted rows as a partial-data warning too', async () => {
    mockOk({ holdingsNotYetEncrypted: 2 })
    renderDashboard()

    await screen.findByText('Gupta Family')
    expect(screen.getByText(/2.*re-saved/i)).toBeInTheDocument()
  })

  it('shows no partial-data warning when every row decrypted cleanly', async () => {
    mockFullCoverage()
    renderDashboard()

    await screen.findByText('Strong')
    expect(screen.queryByText(/couldn't be read/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/re-saved/i)).not.toBeInTheDocument()
  })
})
