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

  it('lists instruments with name and returns for a valid section', async () => {
    listInstruments.mockResolvedValue([
      { slug: 'equity-direct-stocks', name: 'Direct Stocks', returns: 'Market-linked', risk: 'High' },
    ])
    renderAt('/explore/equity')

    await screen.findByText('Direct Stocks')
    expect(listInstruments).toHaveBeenCalledWith(1)
  })

  it('links each instrument to its detail page', async () => {
    listInstruments.mockResolvedValue([
      { slug: 'equity-direct-stocks', name: 'Direct Stocks', returns: 'Market-linked', risk: 'High' },
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
