import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { InstrumentDetail } from './InstrumentDetail'

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

const getInstrument = vi.fn()
vi.mock('@/lib/instruments-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instruments-api')>()
  return { ...actual, getInstrument: (...args: unknown[]) => getInstrument(...args) }
})

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
})
