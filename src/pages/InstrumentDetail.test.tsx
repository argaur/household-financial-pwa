import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { InstrumentDetail } from './InstrumentDetail'

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

const getInstrument = vi.fn()
vi.mock('@/lib/instruments-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instruments-api')>()
  return { ...actual, getInstrument: (...args: unknown[]) => getInstrument(...args) }
})

const getToken = vi.fn().mockResolvedValue('test-token')
let isSignedIn: boolean | undefined = true
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken, isSignedIn }),
}))

const resolveVaultState = vi.fn()
vi.mock('@/lib/key-setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/key-setup')>()
  return { ...actual, resolveVaultState: (...args: unknown[]) => resolveVaultState(...args) }
})

const listFamilyMembers = vi.fn()
vi.mock('@/lib/family-members-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/family-members-api')>()
  return { ...actual, listFamilyMembers: (...args: unknown[]) => listFamilyMembers(...args) }
})

const member = {
  id: 'm1',
  householdId: 'h1',
  name: 'Ananya Verma',
  relationship: 'self' as const,
  dateOfBirth: '1990-01-01',
  riskProfile: null,
  version: 1,
  createdAt: '',
  updatedAt: '',
}

const readyVault = { state: 'ready' as const, vault: { householdId: 'h1', dataKey: {} as CryptoKey } }

const fullInstrument = {
  id: 'id-1',
  slug: 'debt-ppf',
  category: 2,
  name: 'Public Provident Fund (PPF)',
  summary: 'A long-term government-backed savings scheme.',
  returns: 'Government-declared rate, revised quarterly.',
  tax: 'EEE status.',
  liquidity: 'Low.',
  risk: 'Very low.',
  eligibility: 'Indian residents.',
  minInvestment: '₹500/year minimum.',
  rateValue: '7.1',
  rateAsOf: '2026-07-01',
  createdAt: '2026-07-11T00:00:00.000Z',
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/explore/:sectionSlug/:instrumentSlug" element={<InstrumentDetail />} />
        <Route path="/explore" element={<div>Explore page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('InstrumentDetail', () => {
  beforeEach(() => {
    getInstrument.mockReset()
    track.mockReset()
    isSignedIn = true
    getToken.mockClear()
    resolveVaultState.mockReset()
    listFamilyMembers.mockReset()
    listFamilyMembers.mockResolvedValue({ members: [member], unreadableCount: 0, notYetEncryptedCount: 0 })
  })

  it('renders all 7 fields for a fully-populated instrument', async () => {
    getInstrument.mockResolvedValue(fullInstrument)
    renderAt('/explore/debt/debt-ppf')

    await screen.findByText('Public Provident Fund (PPF)')
    expect(screen.getByText('Government-declared rate, revised quarterly.')).toBeInTheDocument()
    expect(screen.getByText('EEE status.')).toBeInTheDocument()
    expect(screen.getByText('Low.')).toBeInTheDocument()
    expect(screen.getByText('Very low.')).toBeInTheDocument()
    expect(screen.getByText('Indian residents.')).toBeInTheDocument()
    expect(screen.getByText('₹500/year minimum.')).toBeInTheDocument()
    expect(screen.getByText('7.1%')).toBeInTheDocument()
    expect(screen.getByText(/rate as of 2026-07-01/i)).toBeInTheDocument()
  })

  it('groups fields into a headline tier and a fine-print tier', async () => {
    getInstrument.mockResolvedValue(fullInstrument)
    renderAt('/explore/debt/debt-ppf')

    await screen.findByText('Public Provident Fund (PPF)')
    expect(screen.getByText('Should you care?')).toBeInTheDocument()
    expect(screen.getByText('The fine print')).toBeInTheDocument()
  })

  it('omits the rate section for an instrument with no rate', async () => {
    getInstrument.mockResolvedValue({ ...fullInstrument, rateValue: null, rateAsOf: null })
    renderAt('/explore/debt/debt-ppf')

    await screen.findByText('Public Provident Fund (PPF)')
    expect(screen.queryByText('Current rate')).not.toBeInTheDocument()
  })

  it('fires instrument_viewed on load', async () => {
    getInstrument.mockResolvedValue(fullInstrument)
    renderAt('/explore/debt/debt-ppf')

    await screen.findByText('Public Provident Fund (PPF)')
    expect(track).toHaveBeenCalledWith('instrument_viewed', { section: 'debt', instrument_slug: 'debt-ppf' })
  })

  it('redirects to /explore for an unknown section slug', () => {
    renderAt('/explore/not-a-real-section/some-slug')
    expect(screen.getByText('Explore page')).toBeInTheDocument()
  })

  it('shows an error state when the fetch fails', async () => {
    getInstrument.mockRejectedValue(new Error('not found'))
    renderAt('/explore/debt/debt-ppf')

    await screen.findByText(/couldn't load this instrument/i)
  })

  it('renders the "Record this in my plan" CTA once the instrument is loaded', async () => {
    getInstrument.mockResolvedValue(fullInstrument)
    renderAt('/explore/debt/debt-ppf')

    expect(await screen.findByRole('button', { name: 'Record this in my plan' })).toBeInTheDocument()
  })

  // Pinned because `sm` is 390px in this project, not Tailwind's default
  // 640px (tailwind.config.ts, and app/CLAUDE.md's "sm:-390px breakpoint
  // trap" past-mistake). A mobile-first `w-full sm:w-auto` therefore stops
  // being full width at exactly the primary phone width, which is the
  // opposite of the intent. The larger-screen boundary here is `md` (768px).
  it('keeps the CTA full width across every phone width, not just below 390px', async () => {
    getInstrument.mockResolvedValue(fullInstrument)
    renderAt('/explore/debt/debt-ppf')

    const cta = await screen.findByRole('button', { name: 'Record this in my plan' })
    expect(cta.className).toContain('w-full')
    expect(cta.className).not.toContain('sm:w-auto')
    // No `sm:` modifier at all on this element, for the same reason.
    expect(cta.className).not.toMatch(/\bsm:/)
  })

  it('does not render the CTA while loading or in the error state', async () => {
    getInstrument.mockRejectedValue(new Error('not found'))
    renderAt('/explore/debt/debt-ppf')

    await screen.findByText(/couldn't load this instrument/i)
    expect(screen.queryByRole('button', { name: 'Record this in my plan' })).not.toBeInTheDocument()
  })

  it('clicking the CTA opens the sheet scoped to the loaded instrument', async () => {
    getInstrument.mockResolvedValue(fullInstrument)
    resolveVaultState.mockResolvedValue(readyVault)
    renderAt('/explore/debt/debt-ppf')

    fireEvent.click(await screen.findByRole('button', { name: 'Record this in my plan' }))

    expect(await screen.findByText('Add Public Provident Fund (PPF)')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /instrument/i })).toHaveTextContent(
      'Public Provident Fund (PPF)',
    )
  })

  it('never fires explore_holding_added from this page', async () => {
    getInstrument.mockResolvedValue(fullInstrument)
    resolveVaultState.mockResolvedValue(readyVault)
    renderAt('/explore/debt/debt-ppf')

    fireEvent.click(await screen.findByRole('button', { name: 'Record this in my plan' }))
    await screen.findByText('Add Public Provident Fund (PPF)')

    expect(track).not.toHaveBeenCalledWith('explore_holding_added', expect.anything())
  })
})
