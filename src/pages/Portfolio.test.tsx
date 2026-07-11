import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Portfolio } from './Portfolio'

const getToken = vi.fn().mockResolvedValue('test-token')
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken }),
}))

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))

const listFamilyMembers = vi.fn()
vi.mock('@/lib/family-members-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/family-members-api')>()
  return { ...actual, listFamilyMembers: (...args: unknown[]) => listFamilyMembers(...args) }
})

const listInstruments = vi.fn()
vi.mock('@/lib/instruments-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instruments-api')>()
  return { ...actual, listInstruments: (...args: unknown[]) => listInstruments(...args) }
})

const listHoldings = vi.fn()
const createHolding = vi.fn()
const updateHolding = vi.fn()
vi.mock('@/lib/holdings-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/holdings-api')>()
  return {
    ...actual,
    listHoldings: (...args: unknown[]) => listHoldings(...args),
    createHolding: (...args: unknown[]) => createHolding(...args),
    updateHolding: (...args: unknown[]) => updateHolding(...args),
  }
})

const member = {
  id: 'm1',
  householdId: 'h1',
  name: 'Gaurav Gupta',
  relationship: 'self' as const,
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

describe('Portfolio', () => {
  beforeEach(() => {
    listFamilyMembers.mockReset()
    listInstruments.mockReset()
    listHoldings.mockReset()
    createHolding.mockReset()
    updateHolding.mockReset()
    listFamilyMembers.mockResolvedValue([member])
    listInstruments.mockResolvedValue([instrument])
  })

  it('shows the empty state and a CTA when there are no holdings', async () => {
    listHoldings.mockResolvedValue([])
    render(<Portfolio />)
    await screen.findByText(/nothing recorded yet/i)
    expect(screen.getByRole('button', { name: /record your first holding/i })).toBeInTheDocument()
  })

  it('lists holdings grouped by member with a summary line', async () => {
    listHoldings.mockResolvedValue([holding])
    render(<Portfolio />)
    await screen.findByText("Gaurav Gupta's holdings")
    expect(screen.getByText('Large Cap Index Fund')).toBeInTheDocument()
    expect(screen.getAllByText(/1 holding · ₹10,500/i)).toHaveLength(2)
  })

  it('opens the add sheet from the empty-state CTA and appends the created holding', async () => {
    listHoldings.mockResolvedValue([])
    createHolding.mockResolvedValue(holding)
    render(<Portfolio />)

    await screen.findByText(/nothing recorded yet/i)
    fireEvent.click(screen.getByRole('button', { name: /record your first holding/i }))

    await screen.findByRole('heading', { name: /record a holding/i })
    fireEvent.click(screen.getByRole('combobox', { name: /instrument/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Large Cap Index Fund' }))
    fireEvent.change(screen.getByLabelText(/amount invested/i), { target: { value: '10000' } })
    fireEvent.change(screen.getByLabelText(/current value/i), { target: { value: '10500' } })
    fireEvent.click(screen.getByRole('button', { name: /add to plan/i }))

    await screen.findByText('Large Cap Index Fund')
  })

  it('opens the edit sheet pre-filled when a holding row is tapped', async () => {
    listHoldings.mockResolvedValue([holding])
    updateHolding.mockResolvedValue({ ...holding, currentValue: '12000' })
    render(<Portfolio />)

    await screen.findByText('Large Cap Index Fund')
    fireEvent.click(screen.getByText('Large Cap Index Fund'))

    await screen.findByRole('heading', { name: /update holding/i })
    const currentValueInput = screen.getByLabelText(/current value/i) as HTMLInputElement
    expect(currentValueInput.value).toBe('10500')

    fireEvent.change(currentValueInput, { target: { value: '12000' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(updateHolding).toHaveBeenCalledWith('test-token', 'hold1', expect.objectContaining({ currentValue: '12000' })))
  })
})
