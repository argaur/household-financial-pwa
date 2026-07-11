import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OnboardingStep3 } from './OnboardingStep3'
import type { FamilyMember } from '@/lib/family-members-api'

const getToken = vi.fn().mockResolvedValue('test-token')
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken }),
}))

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

const listInstruments = vi.fn()
vi.mock('@/lib/instruments-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instruments-api')>()
  return {
    ...actual,
    listInstruments: (...args: unknown[]) => listInstruments(...args),
  }
})

const createHolding = vi.fn()
vi.mock('@/lib/holdings-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/holdings-api')>()
  return {
    ...actual,
    createHolding: (...args: unknown[]) => createHolding(...args),
  }
})

const member: FamilyMember = {
  id: 'm1',
  householdId: 'h1',
  name: 'Gaurav Gupta',
  relationship: 'self',
  dateOfBirth: '1990-01-01',
  createdAt: '',
  updatedAt: '',
}

const instrument = {
  id: 'i1',
  slug: 'equity-large-cap-fund',
  category: 1,
  name: 'Large Cap Index Fund',
  summary: '',
  returns: '',
  tax: '',
  liquidity: '',
  risk: '',
  eligibility: '',
  minInvestment: '',
  rateValue: null,
  rateAsOf: null,
  createdAt: '',
}

const holding = {
  id: 'hold1',
  householdId: 'h1',
  memberId: 'm1',
  instrumentId: 'i1',
  assetClass: 'equity' as const,
  investedAmount: '10000',
  currentValue: '10500',
  units: null,
  monthlySip: null,
  startDate: null,
  maturityDate: null,
  nominee: null,
  priceSource: 'manual',
  isEmergencyFund: false,
  notes: null,
  createdAt: '',
  updatedAt: '',
}

describe('OnboardingStep3', () => {
  beforeEach(() => {
    listInstruments.mockReset()
    createHolding.mockReset()
    track.mockReset()
  })

  it('shows the headline and holding form once instruments load', async () => {
    listInstruments.mockResolvedValue([instrument])
    render(<OnboardingStep3 members={[member]} onContinue={vi.fn()} />)

    await screen.findByText('What do you currently hold?')
    expect(screen.getByRole('button', { name: /see my plan/i })).toBeInTheDocument()
  })

  it('fires onboarding_step_completed and onboarding_completed, then calls onContinue, on save', async () => {
    listInstruments.mockResolvedValue([instrument])
    createHolding.mockResolvedValue(holding)
    const onContinue = vi.fn()
    render(<OnboardingStep3 members={[member]} onContinue={onContinue} />)

    await screen.findByText('What do you currently hold?')
    fireEvent.click(screen.getByRole('combobox', { name: /instrument/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Large Cap Index Fund' }))
    fireEvent.change(screen.getByLabelText(/amount invested/i), { target: { value: '10000' } })
    fireEvent.change(screen.getByLabelText(/current value/i), { target: { value: '10500' } })
    fireEvent.click(screen.getByRole('button', { name: /see my plan/i }))

    await waitFor(() => expect(onContinue).toHaveBeenCalled())
    expect(track).toHaveBeenCalledWith('onboarding_step_completed', expect.objectContaining({ step: 'holdings' }))
    expect(track).toHaveBeenCalledWith('onboarding_completed', {})
  })
})
