import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OnboardingStep2 } from './OnboardingStep2'

const getToken = vi.fn().mockResolvedValue('test-token')
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken }),
}))

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))

const listFamilyMembers = vi.fn()
const createFamilyMember = vi.fn()
vi.mock('@/lib/family-members-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/family-members-api')>()
  return {
    ...actual,
    listFamilyMembers: (...args: unknown[]) => listFamilyMembers(...args),
    createFamilyMember: (...args: unknown[]) => createFamilyMember(...args),
  }
})

describe('OnboardingStep2', () => {
  beforeEach(() => {
    listFamilyMembers.mockReset()
    createFamilyMember.mockReset()
  })

  it('shows the empty-state prompt and a disabled Continue when there are no members yet', async () => {
    listFamilyMembers.mockResolvedValue([])
    render(<OnboardingStep2 onContinue={vi.fn()} />)

    await screen.findByText(/start by adding yourself/i)
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()
  })

  it('lists existing members and enables Continue when at least one exists', async () => {
    listFamilyMembers.mockResolvedValue([
      { id: '1', householdId: 'h1', name: 'Gaurav Gupta', relationship: 'self', dateOfBirth: '1990-01-01' },
    ])
    render(<OnboardingStep2 onContinue={vi.fn()} />)

    await screen.findByText('Gaurav Gupta')
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled()
  })

  it('calls onContinue when Continue is clicked with at least one member', async () => {
    listFamilyMembers.mockResolvedValue([
      { id: '1', householdId: 'h1', name: 'Gaurav Gupta', relationship: 'self', dateOfBirth: '1990-01-01' },
    ])
    const onContinue = vi.fn()
    render(<OnboardingStep2 onContinue={onContinue} />)

    await screen.findByText('Gaurav Gupta')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onContinue).toHaveBeenCalled()
  })

  it('adding a member via the sheet appends it to the list', async () => {
    listFamilyMembers.mockResolvedValue([])
    const created = { id: '2', householdId: 'h1', name: 'Rinku Gupta', relationship: 'spouse', dateOfBirth: '1991-02-02' }
    createFamilyMember.mockResolvedValue(created)

    render(<OnboardingStep2 onContinue={vi.fn()} />)
    await screen.findByText(/start by adding yourself/i)

    fireEvent.click(screen.getByRole('button', { name: /add a family member/i }))
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Rinku Gupta' } })
    fireEvent.change(screen.getByLabelText(/date of birth/i), { target: { value: '1991-02-02' } })

    // Radix Select isn't a native <select>; drive it via its combobox trigger + option role.
    fireEvent.click(screen.getByRole('combobox', { name: /their relationship to you/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Spouse' }))

    fireEvent.click(screen.getByRole('button', { name: /add to plan/i }))

    await waitFor(() => expect(createFamilyMember).toHaveBeenCalledWith('test-token', {
      name: 'Rinku Gupta',
      relationship: 'spouse',
      dateOfBirth: '1991-02-02',
    }))
    await screen.findByText('Rinku Gupta')
  })
})
