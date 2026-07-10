import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OnboardingStep1 } from './OnboardingStep1'

const getToken = vi.fn().mockResolvedValue('test-token')
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken }),
}))

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))

const createHousehold = vi.fn()
vi.mock('@/lib/household-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/household-api')>()
  return { ...actual, createHousehold: (...args: unknown[]) => createHousehold(...args) }
})

describe('OnboardingStep1', () => {
  beforeEach(() => {
    createHousehold.mockReset()
    getToken.mockClear()
  })

  it('disables Continue until a name is entered', () => {
    render(<OnboardingStep1 onHouseholdCreated={vi.fn()} />)
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()
  })

  it('creates the household and calls onHouseholdCreated on success', async () => {
    const household = { id: '1', ownerUserId: 'u1', name: 'Gupta Family', createdAt: '', updatedAt: '' }
    createHousehold.mockResolvedValue(household)
    const onHouseholdCreated = vi.fn()

    render(<OnboardingStep1 onHouseholdCreated={onHouseholdCreated} />)
    fireEvent.change(screen.getByLabelText(/your household name/i), { target: { value: 'Gupta Family' } })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => expect(onHouseholdCreated).toHaveBeenCalledWith(household))
    expect(createHousehold).toHaveBeenCalledWith('test-token', 'Gupta Family')
  })

  it('shows an error and does not call onHouseholdCreated when the API call fails', async () => {
    createHousehold.mockRejectedValue(new Error('network down'))
    const onHouseholdCreated = vi.fn()

    render(<OnboardingStep1 onHouseholdCreated={onHouseholdCreated} />)
    fireEvent.change(screen.getByLabelText(/your household name/i), { target: { value: 'Gupta Family' } })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await screen.findByText(/something went wrong/i)
    expect(onHouseholdCreated).not.toHaveBeenCalled()
  })
})
