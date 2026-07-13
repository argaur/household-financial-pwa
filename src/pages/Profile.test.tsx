import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Profile } from './Profile'

const getToken = vi.fn().mockResolvedValue('test-token')
const signOut = vi.fn().mockResolvedValue(undefined)
const deleteUser = vi.fn().mockResolvedValue(undefined)
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken, signOut }),
  useUser: () => ({ user: { primaryEmailAddress: { emailAddress: 'ar.gaurav20@gmail.com' }, delete: deleteUser } }),
}))

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))

const fetchHousehold = vi.fn()
const updateHousehold = vi.fn()
vi.mock('@/lib/household-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/household-api')>()
  return {
    ...actual,
    fetchHousehold: (...args: unknown[]) => fetchHousehold(...args),
    updateHousehold: (...args: unknown[]) => updateHousehold(...args),
  }
})

const listFamilyMembers = vi.fn()
const createFamilyMember = vi.fn()
const updateFamilyMember = vi.fn()
const removeFamilyMember = vi.fn()
vi.mock('@/lib/family-members-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/family-members-api')>()
  return {
    ...actual,
    listFamilyMembers: (...args: unknown[]) => listFamilyMembers(...args),
    createFamilyMember: (...args: unknown[]) => createFamilyMember(...args),
    updateFamilyMember: (...args: unknown[]) => updateFamilyMember(...args),
    removeFamilyMember: (...args: unknown[]) => removeFamilyMember(...args),
  }
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

const household = {
  id: 'h1',
  ownerUserId: 'user_a',
  name: 'Gupta Family',
  createdAt: '',
  updatedAt: '',
}

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
    fetchHousehold.mockReset()
    updateHousehold.mockReset()
    listFamilyMembers.mockReset()
    createFamilyMember.mockReset()
    updateFamilyMember.mockReset()
    removeFamilyMember.mockReset()
    listProtection.mockReset()
    createProtection.mockReset()
    updateProtection.mockReset()
    signOut.mockClear()
    deleteUser.mockClear()
    fetchHousehold.mockResolvedValue(household)
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
    await screen.findByText('Term life')
    // "Gaurav Gupta" appears twice now: once in the Family members card row,
    // once as the Protection card's group header.
    expect(screen.getAllByText('Gaurav Gupta').length).toBeGreaterThanOrEqual(2)
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

  it('shows the household name and edits it via the inline Edit form', async () => {
    listProtection.mockResolvedValue([])
    updateHousehold.mockResolvedValue({ ...household, name: 'Gupta-Sharma Family' })
    render(<Profile />)

    await screen.findByText('Gupta Family')
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))

    const nameInput = screen.getByDisplayValue('Gupta Family') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Gupta-Sharma Family' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(updateHousehold).toHaveBeenCalledWith('test-token', 'Gupta-Sharma Family'))
    await screen.findByText('Gupta-Sharma Family')
  })

  it('adds a family member from the "Add a family member" CTA', async () => {
    listProtection.mockResolvedValue([])
    const newMember = { ...member, id: 'm2', name: 'Priya Gupta', relationship: 'spouse' as const }
    createFamilyMember.mockResolvedValue(newMember)
    render(<Profile />)

    await screen.findByText('Gaurav Gupta')
    fireEvent.click(screen.getByRole('button', { name: /add a family member/i }))

    await screen.findByRole('heading', { name: /^add a family member$/i })
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Priya Gupta' } })
    fireEvent.change(screen.getByLabelText(/date of birth/i), { target: { value: '1991-02-02' } })

    // Radix Select isn't a native <select>; drive it via its combobox trigger + option role.
    fireEvent.click(screen.getByRole('combobox', { name: /their relationship to you/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Spouse' }))

    fireEvent.click(screen.getByRole('button', { name: /add to plan/i }))

    await screen.findByText('Priya Gupta')
  })

  it('opens the edit-member sheet pre-filled when a member row is tapped', async () => {
    listProtection.mockResolvedValue([])
    updateFamilyMember.mockResolvedValue({ ...member, name: 'Gaurav G. Gupta' })
    render(<Profile />)

    await screen.findByText('Gaurav Gupta')
    fireEvent.click(screen.getByText('Gaurav Gupta'))

    await screen.findByRole('heading', { name: /update family member/i })
    const nameInput = screen.getByLabelText(/full name/i) as HTMLInputElement
    expect(nameInput.value).toBe('Gaurav Gupta')
  })

  it('removes a member after confirming the destructive dialog', async () => {
    listProtection.mockResolvedValue([])
    removeFamilyMember.mockResolvedValue(undefined)
    render(<Profile />)

    await screen.findByText('Gaurav Gupta')
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }))

    await screen.findByRole('heading', { name: /remove gaurav gupta\?/i })
    // Both the member row's own "Remove" button and the confirm dialog's
    // "Remove" button match /^remove$/i once the dialog is open — the
    // dialog's confirm button is the last match (Radix portals it to the
    // end of document.body).
    const removeButtons = screen.getAllByRole('button', { name: /^remove$/i })
    fireEvent.click(removeButtons[removeButtons.length - 1])

    await waitFor(() => expect(removeFamilyMember).toHaveBeenCalledWith('test-token', 'm1'))
  })

  it('signs out via the Sign out link', async () => {
    listProtection.mockResolvedValue([])
    render(<Profile />)

    await screen.findByText('Gaurav Gupta')
    fireEvent.click(screen.getByText('Sign out'))

    await waitFor(() => expect(signOut).toHaveBeenCalled())
  })

  it('deletes the account after confirming the destructive dialog', async () => {
    listProtection.mockResolvedValue([])
    render(<Profile />)

    await screen.findByText('Gaurav Gupta')
    fireEvent.click(screen.getByText('Delete account'))

    await screen.findByRole('heading', { name: /delete your account\?/i })
    fireEvent.click(screen.getByRole('button', { name: /yes, delete everything/i }))

    await waitFor(() => expect(deleteUser).toHaveBeenCalled())
  })

  it('shows an inline error and does not sign the user out if account deletion fails', async () => {
    listProtection.mockResolvedValue([])
    deleteUser.mockRejectedValueOnce(new Error('clerk_error'))
    render(<Profile />)

    await screen.findByText('Gaurav Gupta')
    fireEvent.click(screen.getByText('Delete account'))
    await screen.findByRole('heading', { name: /delete your account\?/i })
    fireEvent.click(screen.getByRole('button', { name: /yes, delete everything/i }))

    await screen.findByText(/we couldn't delete your account/i)
    expect(signOut).not.toHaveBeenCalled()
  })
})
