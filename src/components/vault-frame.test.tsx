import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VaultFrame } from './vault-frame'
import { expectNoAxeViolations } from '@/test/axe'

describe('VaultFrame', () => {
  it('renders children', () => {
    render(
      <VaultFrame>
        <p>Household health</p>
      </VaultFrame>,
    )
    expect(screen.getByText('Household health')).toBeInTheDocument()
  })

  it('applies the documented default token classes', () => {
    render(
      <VaultFrame data-testid="frame">
        <p>content</p>
      </VaultFrame>,
    )
    const frame = screen.getByTestId('frame')
    expect(frame).toHaveClass('rounded-lg', 'border-border', 'shadow-card')
  })

  it('applies the hover-lift shadow token, not applied by default', () => {
    render(
      <VaultFrame data-testid="frame">
        <p>content</p>
      </VaultFrame>,
    )
    const frame = screen.getByTestId('frame')
    expect(frame).toHaveClass('hover:shadow-lift')
    expect(frame.className).not.toMatch(/(^|\s)shadow-lift(\s|$)/)
  })

  it('merges a caller className without dropping its own default tokens', () => {
    render(
      <VaultFrame data-testid="frame" className="p-4 md:p-6">
        <p>content</p>
      </VaultFrame>,
    )
    const frame = screen.getByTestId('frame')
    expect(frame).toHaveClass('rounded-lg', 'border-border', 'shadow-card', 'p-4', 'md:p-6')
  })

  it('spreads arbitrary props onto the root element', () => {
    render(
      <VaultFrame data-testid="frame" aria-label="Household health card" id="health-card">
        <p>content</p>
      </VaultFrame>,
    )
    const frame = screen.getByTestId('frame')
    expect(frame).toHaveAttribute('aria-label', 'Household health card')
    expect(frame).toHaveAttribute('id', 'health-card')
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <VaultFrame>
        <h2>Household health</h2>
        <p>Your plan is in its early stages.</p>
      </VaultFrame>,
    )
    await expectNoAxeViolations(container)
  })
})
