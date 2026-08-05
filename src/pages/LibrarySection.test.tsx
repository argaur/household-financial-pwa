import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { LibrarySection } from './LibrarySection'

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))

const listInstruments = vi.fn()
vi.mock('@/lib/instruments-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instruments-api')>()
  return { ...actual, listInstruments: (...args: unknown[]) => listInstruments(...args) }
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/explore/:sectionSlug" element={<LibrarySection />} />
        <Route path="/explore" element={<div>Explore page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LibrarySection', () => {
  beforeEach(() => {
    listInstruments.mockReset()
  })

  it('lists instruments with name, full summary and the extracted risk level', async () => {
    listInstruments.mockResolvedValue([
      {
        slug: 'equity-direct-stocks',
        name: 'Direct Stocks',
        summary: 'Buying shares of individual companies on the stock exchange.',
        returns: 'Market-linked; can swing sharply either way over short periods.',
        risk: 'High — concentrated in single-company performance; no diversification unless built manually.',
      },
    ])
    renderAt('/explore/equity')

    await screen.findByText('Direct Stocks')
    expect(listInstruments).toHaveBeenCalledWith(1)
    // The summary renders whole — a card never shows a clipped paragraph.
    expect(screen.getByText('Buying shares of individual companies on the stock exchange.')).toBeInTheDocument()
    // Risk is the lead clause, not the full paragraph clamped to one line.
    expect(screen.getByText('High', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText(/no diversification unless built manually/)).not.toBeInTheDocument()
    // The full returns paragraph belongs to the detail page, not the card.
    expect(screen.queryByText(/over short periods/)).not.toBeInTheDocument()
  })

  it('links each instrument to its detail page', async () => {
    listInstruments.mockResolvedValue([
      {
        slug: 'equity-direct-stocks',
        name: 'Direct Stocks',
        summary: 'Buying shares of individual companies on the stock exchange.',
        returns: 'Market-linked',
        risk: 'High',
      },
    ])
    renderAt('/explore/equity')

    const link = await screen.findByText('Direct Stocks')
    expect(link.closest('a')).toHaveAttribute('href', '/explore/equity/equity-direct-stocks')
  })

  it('redirects to /explore for an unknown section slug', () => {
    renderAt('/explore/not-a-real-section')
    expect(screen.getByText('Explore page')).toBeInTheDocument()
  })

  it('shows an error state when the fetch fails', async () => {
    listInstruments.mockRejectedValue(new Error('network error'))
    renderAt('/explore/equity')

    await screen.findByText(/couldn't load this section/i)
  })
})
