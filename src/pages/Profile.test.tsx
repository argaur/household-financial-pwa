import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expectNoAxeViolations } from '@/test/axe'
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

const fetchHouseholdKeys = vi.fn()
vi.mock('@/lib/household-keys-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/household-keys-api')>()
  return {
    ...actual,
    fetchHouseholdKeys: (...args: unknown[]) => fetchHouseholdKeys(...args),
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
  name: 'Verma Family',
  version: 2,
  createdAt: '',
  updatedAt: '',
}

const member = {
  id: 'm1',
  householdId: 'h1',
  name: 'Ananya Verma',
  relationship: 'self' as const,
  dateOfBirth: '1990-01-01',
  riskProfile: null,
  version: 1,
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
  version: 1,
  createdAt: '',
  updatedAt: '',
}

// Synthetic, opaque base64url blobs — no real key material.
const householdKeys = {
  householdId: 'h1',
  createdAt: '',
  updatedAt: '',
  kdfAlg: 'PBKDF2-SHA256',
  kdfIterations: 600_000,
  passphraseSalt: 'c2FsdC1vbmU',
  wrappedDekPassphrase: 'd3JhcHBlZC1wYXNz',
  passphraseWrapIv: 'aXYtcGFzcw',
  recoverySalt: 'c2FsdC10d28',
  wrappedDekRecovery: 'd3JhcHBlZC1yZWM',
  recoveryWrapIv: 'aXYtcmVj',
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
    // fetchHousehold now reports whether the row could be read at all, and
    // the list clients return counts alongside the decrypted rows.
    fetchHousehold.mockResolvedValue({ state: 'ok', household })
    listFamilyMembers.mockResolvedValue({ members: [member], unreadableCount: 0, notYetEncryptedCount: 0 })
    fetchHouseholdKeys.mockReset()
    fetchHouseholdKeys.mockResolvedValue(householdKeys)
  })

  it('shows the empty state and a CTA when there is no protection cover', async () => {
    listProtection.mockResolvedValue({ protection: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    render(<Profile />)
    await screen.findByText(/no protection cover on record/i)
    expect(screen.getByRole('button', { name: /add protection cover/i })).toBeInTheDocument()
  })

  it('lists protection records grouped by member', async () => {
    listProtection.mockResolvedValue({ protection: [protectionRecord], unreadableCount: 0, notYetEncryptedCount: 0 })
    render(<Profile />)
    await screen.findByText('Term life')
    // "Ananya Verma" appears twice now: once in the Family members card row,
    // once as the Protection card's group header.
    expect(screen.getAllByText('Ananya Verma').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/₹50,00,000 cover · Active/i)).toBeInTheDocument()
  })

  it('opens the add sheet from the empty-state CTA and appends the created record', async () => {
    listProtection.mockResolvedValue({ protection: [], unreadableCount: 0, notYetEncryptedCount: 0 })
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
    listProtection.mockResolvedValue({ protection: [protectionRecord], unreadableCount: 0, notYetEncryptedCount: 0 })
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
      expect(updateProtection).toHaveBeenCalledWith(
        'test-token',
        'prot1',
        expect.objectContaining({ coverAmount: '6000000' }),
        1,
      ),
    )
  })

  it('shows the household name and edits it via the inline Edit form', async () => {
    listProtection.mockResolvedValue({ protection: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    updateHousehold.mockResolvedValue({ ...household, name: 'Verma-Rao Family', version: 3 })
    render(<Profile />)

    await screen.findByText('Verma Family')
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))

    const nameInput = screen.getByDisplayValue('Verma Family') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Verma-Rao Family' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    // The version the rename was made against travels with it.
    await waitFor(() => expect(updateHousehold).toHaveBeenCalledWith('test-token', 'Verma-Rao Family', 2))
    await screen.findByText('Verma-Rao Family')
  })

  it('adds a family member from the "Add a family member" CTA', async () => {
    listProtection.mockResolvedValue({ protection: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    const newMember = { ...member, id: 'm2', name: 'Rohit Verma', relationship: 'spouse' as const }
    createFamilyMember.mockResolvedValue(newMember)
    render(<Profile />)

    await screen.findByText('Ananya Verma')
    fireEvent.click(screen.getByRole('button', { name: /add a family member/i }))

    await screen.findByRole('heading', { name: /^add a family member$/i })
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Rohit Verma' } })
    fireEvent.change(screen.getByLabelText(/date of birth/i), { target: { value: '1991-02-02' } })

    // Radix Select isn't a native <select>; drive it via its combobox trigger + option role.
    fireEvent.click(screen.getByRole('combobox', { name: /their relationship to you/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Spouse' }))

    fireEvent.click(screen.getByRole('button', { name: /add to plan/i }))

    await screen.findByText('Rohit Verma')
  })

  it('opens the edit-member sheet pre-filled when a member row is tapped', async () => {
    listProtection.mockResolvedValue({ protection: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    updateFamilyMember.mockResolvedValue({ ...member, name: 'Ananya R. Verma', version: 2 })
    render(<Profile />)

    await screen.findByText('Ananya Verma')
    fireEvent.click(screen.getByText('Ananya Verma'))

    await screen.findByRole('heading', { name: /update family member/i })
    const nameInput = screen.getByLabelText(/full name/i) as HTMLInputElement
    expect(nameInput.value).toBe('Ananya Verma')
  })

  it('removes a member after confirming the destructive dialog', async () => {
    listProtection.mockResolvedValue({ protection: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    removeFamilyMember.mockResolvedValue(undefined)
    render(<Profile />)

    await screen.findByText('Ananya Verma')
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }))

    await screen.findByRole('heading', { name: /remove ananya verma\?/i })
    // Both the member row's own "Remove" button and the confirm dialog's
    // "Remove" button match /^remove$/i once the dialog is open — the
    // dialog's confirm button is the last match (Radix portals it to the
    // end of document.body).
    const removeButtons = screen.getAllByRole('button', { name: /^remove$/i })
    fireEvent.click(removeButtons[removeButtons.length - 1])

    await waitFor(() => expect(removeFamilyMember).toHaveBeenCalledWith('test-token', 'm1'))
  })

  it('signs out via the Sign out link', async () => {
    listProtection.mockResolvedValue({ protection: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    render(<Profile />)

    await screen.findByText('Ananya Verma')
    fireEvent.click(screen.getByText('Sign out'))

    await waitFor(() => expect(signOut).toHaveBeenCalled())
  })

  it('deletes the account after confirming the destructive dialog', async () => {
    listProtection.mockResolvedValue({ protection: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    render(<Profile />)

    await screen.findByText('Ananya Verma')
    fireEvent.click(screen.getByText('Delete account'))

    await screen.findByRole('heading', { name: /delete your account\?/i })
    fireEvent.click(screen.getByRole('button', { name: /yes, delete everything/i }))

    await waitFor(() => expect(deleteUser).toHaveBeenCalled())
  })

  it('shows an inline error and does not sign the user out if account deletion fails', async () => {
    listProtection.mockResolvedValue({ protection: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    deleteUser.mockRejectedValueOnce(new Error('clerk_error'))
    render(<Profile />)

    await screen.findByText('Ananya Verma')
    fireEvent.click(screen.getByText('Delete account'))
    await screen.findByRole('heading', { name: /delete your account\?/i })
    fireEvent.click(screen.getByRole('button', { name: /yes, delete everything/i }))

    await screen.findByText(/we couldn't delete your account/i)
    expect(signOut).not.toHaveBeenCalled()
  })
})

/**
 * Slice 6b — the Security card.
 *
 * Two clearly separated actions. Each overwrites a wrapped copy that is one of
 * only two ways back into the household's data, so they never share a form, a
 * sheet, or a submit path.
 */
describe('Profile — security card', () => {
  beforeEach(() => {
    listProtection.mockResolvedValue({ protection: [], unreadableCount: 0, notYetEncryptedCount: 0 })
  })

  it('offers changing the passphrase and resetting the recovery code as separate actions', async () => {
    render(<Profile />)
    await screen.findByText('Ananya Verma')

    expect(screen.getByRole('button', { name: /change passphrase/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reset recovery code/i })).toBeInTheDocument()
  })

  it('opens the change-passphrase sheet, and only that form', async () => {
    render(<Profile />)
    await screen.findByText('Ananya Verma')
    fireEvent.click(screen.getByRole('button', { name: /change passphrase/i }))

    await screen.findByRole('heading', { name: /change your passphrase/i })
    expect(screen.getByTestId('change-passphrase-form')).toBeInTheDocument()
    expect(screen.queryByTestId('reset-recovery-form')).not.toBeInTheDocument()
  })

  it('opens the reset-recovery-code sheet, and only that form', async () => {
    render(<Profile />)
    await screen.findByText('Ananya Verma')
    fireEvent.click(screen.getByRole('button', { name: /reset recovery code/i }))

    await screen.findByRole('heading', { name: /reset your recovery code/i })
    expect(screen.getByTestId('reset-recovery-form')).toBeInTheDocument()
    expect(screen.queryByTestId('change-passphrase-form')).not.toBeInTheDocument()
  })

  it('hides both actions when the household has no key material to rotate', async () => {
    fetchHouseholdKeys.mockResolvedValue(null)
    render(<Profile />)
    await screen.findByText('Ananya Verma')

    expect(screen.queryByRole('button', { name: /change passphrase/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reset recovery code/i })).not.toBeInTheDocument()
  })

  it('still renders the rest of the screen when key material cannot be loaded', async () => {
    fetchHouseholdKeys.mockRejectedValue(new Error('offline'))
    render(<Profile />)

    await screen.findByText('Ananya Verma')
    expect(screen.queryByRole('button', { name: /change passphrase/i })).not.toBeInTheDocument()
  })
})

/**
 * `/profile` is one of the five screens documented at zero axe violations
 * live (see CLAUDE.md). This section proves that baseline still holds for
 * the loaded screen (Security card included, since it renders whenever key
 * material is available) and extends it to Slice 9's two credential-change
 * sheets, which Radix portals to `document.body` — so those scans run
 * against `document.body`, not the render container, or the portaled sheet
 * content would never be checked.
 */
describe('Profile — accessibility', () => {
  beforeEach(() => {
    // Self-contained on purpose — do not rely on state left behind by
    // whichever describe block happened to run last.
    fetchHousehold.mockResolvedValue({ state: 'ok', household })
    listFamilyMembers.mockResolvedValue({ members: [member], unreadableCount: 0, notYetEncryptedCount: 0 })
    listProtection.mockResolvedValue({ protection: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    fetchHouseholdKeys.mockReset()
    fetchHouseholdKeys.mockResolvedValue(householdKeys)
  })

  it('has zero axe violations on the loaded screen, including the Security card', async () => {
    const { container } = render(<Profile />)
    await screen.findByText('Ananya Verma')
    await screen.findByRole('button', { name: /change passphrase/i })
    await expectNoAxeViolations(container)
  })

  it('has zero axe violations with the change-passphrase sheet open', async () => {
    render(<Profile />)
    await screen.findByText('Ananya Verma')
    fireEvent.click(screen.getByRole('button', { name: /change passphrase/i }))
    await screen.findByRole('heading', { name: /change your passphrase/i })
    await expectNoAxeViolations(document.body)
  })

  it('has zero axe violations with the reset-recovery-code sheet open', async () => {
    render(<Profile />)
    await screen.findByText('Ananya Verma')
    fireEvent.click(screen.getByRole('button', { name: /reset recovery code/i }))
    await screen.findByRole('heading', { name: /reset your recovery code/i })
    await expectNoAxeViolations(document.body)
  })
})
