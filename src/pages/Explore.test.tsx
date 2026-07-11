import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Explore } from './Explore'

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

describe('Explore', () => {
  it('renders all 6 section cards', () => {
    render(
      <MemoryRouter>
        <Explore />
      </MemoryRouter>,
    )

    expect(screen.getByText('Equity')).toBeInTheDocument()
    expect(screen.getByText('Debt')).toBeInTheDocument()
    expect(screen.getByText('Gold')).toBeInTheDocument()
    expect(screen.getByText('Hybrid & Guaranteed')).toBeInTheDocument()
    expect(screen.getByText('Real Estate')).toBeInTheDocument()
    expect(screen.getByText('Alternative')).toBeInTheDocument()
  })

  it('links each section card to its /explore/:sectionSlug route', () => {
    render(
      <MemoryRouter>
        <Explore />
      </MemoryRouter>,
    )

    expect(screen.getByText('Equity').closest('a')).toHaveAttribute('href', '/explore/equity')
    expect(screen.getByText('Real Estate').closest('a')).toHaveAttribute('href', '/explore/real-estate')
  })

  it('fires nav_tab_clicked on mount', () => {
    render(
      <MemoryRouter>
        <Explore />
      </MemoryRouter>,
    )
    expect(track).toHaveBeenCalledWith('nav_tab_clicked', { tab_name: 'explore' })
  })
})
