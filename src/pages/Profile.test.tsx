import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Profile } from './Profile'

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

const listProtection = vi.fn()
const createProtection = vi.fn()
const updateProtection = vi.fn()
vi.mock('@/lib/protection-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/protection-api')>()
  return {
    ...actual,
    listProtection: (...args: unknown[]) => listProtection(...args),
    createProtection: (...args: unknown[]) => createProtection(...args),
    updateProtection: (...args: unknown[]) => updateProtection(...args),
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

const protectionRecord = {
  id: 'prot1',
  householdId: 'h1',
  memberId: 'm1',
  type: 'term-life' as const,
  coverAmount: '5000000',
  premium: null,
  provider: null,
  status: 'active' as const,
  createdAt: '',
  updatedAt: '',
}

describe('Profile', () => {
  beforeEach(() => {
    listFamilyMembers.mockReset()
    listProtection.mockReset()
    createProtection.mockReset()
    updateProtection.mockReset()
    listFamilyMembers.mockResolvedValue([member])
  })

  it('shows the empty state and a CTA when there is no protection cover', async () => {
    listProtection.mockResolvedValue([])
    render(<Profile />)
    await screen.findByText(/no protection cover on record/i)
    expect(screen.getByRole('button', { name: /add protection cover/i })).toBeInTheDocument()
  })

  it('lists protection records grouped by member', async () => {
    listProtection.mockResolvedValue([protectionRecord])
    render(<Profile />)
    await screen.findByText('Gaurav Gupta')
    expect(screen.getByText('Term life')).toBeInTheDocument()
    expect(screen.getByText(/₹50,00,000 cover · Active/i)).toBeInTheDocument()
  })

  it('opens the add sheet from the empty-state CTA and appends the created record', async () => {
    listProtection.mockResolvedValue([])
    createProtection.mockResolvedValue(protectionRecord)
    render(<Profile />)

    await screen.findByText(/no protection cover on record/i)
    fireEvent.click(screen.getByRole('button', { name: /add protection cover/i }))

    await screen.findByRole('heading', { name: /add protection cover/i })
    fireEvent.change(screen.getByLabelText(/cover amount/i), { target: { value: '5000000' } })
    fireEvent.click(screen.getByRole('button', { name: /add cover/i }))

    await screen.findByText('Term life')
  })

  it('opens the edit sheet pre-filled when a protection row is tapped', async () => {
    listProtection.mockResolvedValue([protectionRecord])
    updateProtection.mockResolvedValue({ ...protectionRecord, coverAmount: '6000000' })
    render(<Profile />)

    await screen.findByText('Term life')
    fireEvent.click(screen.getByText('Term life'))

    await screen.findByRole('heading', { name: /update protection cover/i })
    const coverAmountInput = screen.getByLabelText(/cover amount/i) as HTMLInputElement
    expect(coverAmountInput.value).toBe('5000000')

    fireEvent.change(coverAmountInput, { target: { value: '6000000' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(updateProtection).toHaveBeenCalledWith('test-token', 'prot1', expect.objectContaining({ coverAmount: '6000000' })),
    )
  })
})
