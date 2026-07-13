import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AllocationDonut } from './allocation-donut'
import type { AllocationSlice } from '@/lib/dashboard-api'

const allocation: AllocationSlice[] = [
  { assetClass: 'equity', value: 6000, percentage: 60 },
  { assetClass: 'debt', value: 3000, percentage: 30 },
  { assetClass: 'gold', value: 1000, percentage: 10 },
]

function renderDonut(props: Partial<React.ComponentProps<typeof AllocationDonut>>) {
  return render(
    <MemoryRouter>
      <AllocationDonut state="empty" allocation={[]} totalValue={0} {...props} />
    </MemoryRouter>,
  )
}

describe('AllocationDonut', () => {
  it('shows a loading skeleton in the loading state', () => {
    renderDonut({ state: 'loading' })
    expect(screen.getByTestId('allocation-donut-loading')).toBeInTheDocument()
  })

  it('shows the empty/ghost state with a CTA linking to /portfolio', () => {
    renderDonut({ state: 'empty' })
    expect(screen.getByText('Nothing recorded yet.')).toBeInTheDocument()
    expect(screen.getByText(/add your first investment/i)).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: /record a holding/i })
    expect(cta).toHaveAttribute('href', '/portfolio')
  })

  it('shows the legend and total for the populated state', () => {
    renderDonut({ state: 'populated', allocation, totalValue: 10000 })
    expect(screen.getByText('Equity')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('Debt')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()
    expect(screen.getByText('Gold')).toBeInTheDocument()
    expect(screen.getByText('10%')).toBeInTheDocument()
    expect(screen.getByText('Total recorded value')).toBeInTheDocument()
    expect(screen.getByText('₹10,000')).toBeInTheDocument()
  })
})
