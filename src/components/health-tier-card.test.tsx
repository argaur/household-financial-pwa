import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HealthTierCard } from './health-tier-card'
import type { Completeness } from '@/lib/dashboard-api'

const allUnmet: Completeness = {
  checks: {
    memberCoverage: false,
    emergencyFund: false,
    bothParentsProtected: false,
    assetDiversity: false,
    noStaleValues: false,
  },
  score: 0,
  tier: 'getting_started',
}

describe('HealthTierCard', () => {
  it('renders the Getting Started tier with score and context copy', () => {
    render(<HealthTierCard completeness={allUnmet} />)
    expect(screen.getByText('Getting Started')).toBeInTheDocument()
    expect(screen.getByText('0 of 5 checks complete')).toBeInTheDocument()
    expect(screen.getByText(/your plan is in its early stages/i)).toBeInTheDocument()
  })

  it('renders the On Track tier', () => {
    render(<HealthTierCard completeness={{ ...allUnmet, score: 3, tier: 'on_track' }} />)
    expect(screen.getByText('On Track')).toBeInTheDocument()
    expect(screen.getByText('3 of 5 checks complete')).toBeInTheDocument()
    expect(screen.getByText(/foundations covered/i)).toBeInTheDocument()
  })

  it('renders the Strong tier', () => {
    render(<HealthTierCard completeness={{ ...allUnmet, score: 5, tier: 'strong' }} />)
    expect(screen.getByText('Strong')).toBeInTheDocument()
    expect(screen.getByText('5 of 5 checks complete')).toBeInTheDocument()
    expect(screen.getByText(/strong financial foundation/i)).toBeInTheDocument()
  })
})
