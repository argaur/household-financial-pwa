import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expectNoAxeViolations } from '@/test/axe'
import { unlockTestVault } from '@/test/encrypted-fixtures'
import { getVault } from '@/lib/crypto/key-store'
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

const listHoldings = vi.fn()
vi.mock('@/lib/holdings-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/holdings-api')>()
  return {
    ...actual,
    listHoldings: (...args: unknown[]) => listHoldings(...args),
  }
})

const holding = {
  id: 'ho1',
  householdId: 'h1',
  memberId: 'm1',
  instrumentId: 'ppf',
  assetClass: 'debt' as const,
  investedAmount: '250000',
  currentValue: '260000',
  units: null,
  monthlySip: null,
  startDate: null,
  maturityDate: null,
  nominee: null,
  isEmergencyFund: false,
  notes: null,
  version: 1,
  createdAt: '',
  updatedAt: '',
}

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
    listHoldings.mockReset()
    listHoldings.mockResolvedValue({ holdings: [holding], unreadableCount: 0, notYetEncryptedCount: 0 })
  })

  /**
   * The export's contents are proved in export.test.ts and the download
   * mechanics in download.test.ts. What neither covers is the seam between
   * them — the button. B-001 was exactly this shape: a route that dropped a
   * field, with 294 green tests either side of it.
   */
  describe('download my data', () => {
    /**
     * Restores only what it stubbed. `vi.restoreAllMocks()` here would also
     * clear the module mocks' implementations set in beforeEach, breaking
     * unrelated tests in this file — which it did, the first time.
     */
    let releaseDownloadCapture: (() => void) | null = null

    function captureDownload() {
      const captured: { name: string; text: string }[] = []
      let lastBlobText = ''
      vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} })
      const RealBlob = globalThis.Blob
      vi.stubGlobal(
        'Blob',
        class extends RealBlob {
          constructor(parts: BlobPart[], options?: BlobPropertyBag) {
            super(parts, options)
            lastBlobText = String(parts[0])
          }
        },
      )
      const realCreate = document.createElement.bind(document)
      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = realCreate(tag)
        if (tag === 'a') {
          const anchor = el as HTMLAnchorElement
          anchor.click = () => captured.push({ name: anchor.download, text: lastBlobText })
        }
        return el
      })
      releaseDownloadCapture = () => {
        createElementSpy.mockRestore()
        vi.unstubAllGlobals()
      }
      return captured
    }

    afterEach(() => {
      releaseDownloadCapture?.()
      releaseDownloadCapture = null
    })

    it('writes a file containing the decrypted values from every table', async () => {
      listProtection.mockResolvedValue({
        protection: [protectionRecord],
        unreadableCount: 0,
        notYetEncryptedCount: 0,
      })
      const captured = captureDownload()

      render(<Profile />)
      fireEvent.click(await screen.findByRole('button', { name: /download my data/i }))

      await waitFor(() => expect(captured).toHaveLength(1))
      expect(captured[0].name).toMatch(/^household-financial-plan-\d{4}-\d{2}-\d{2}\.json$/)

      const parsed = JSON.parse(captured[0].text) as Record<string, unknown>
      expect(parsed.household).toMatchObject({ name: 'Verma Family' })
      expect(parsed.familyMembers).toHaveLength(1)
      expect(parsed.holdings).toHaveLength(1)
      expect(parsed.protection).toHaveLength(1)
      expect(JSON.stringify(parsed)).toContain('250000')
      expect(parsed.complete).toBe(true)

    })

    it('tells the user on screen when rows could not be read, not only inside the file', async () => {
      listProtection.mockResolvedValue({ protection: [], unreadableCount: 0, notYetEncryptedCount: 0 })
      listHoldings.mockResolvedValue({ holdings: [], unreadableCount: 4, notYetEncryptedCount: 0 })
      captureDownload()

      render(<Profile />)
      fireEvent.click(await screen.findByRole('button', { name: /download my data/i }))

      // Someone who downloads a backup and never opens it must still learn it
      // is partial — otherwise they find out only when the original is gone.
      expect(await screen.findByRole('status')).toHaveTextContent(/4 records could not be read/i)

    })

    it('reports a failure instead of saving an empty or partial file', async () => {
      listProtection.mockResolvedValue({ protection: [], unreadableCount: 0, notYetEncryptedCount: 0 })
      listHoldings.mockRejectedValue(new Error('network down'))
      const captured = captureDownload()

      render(<Profile />)
      fireEvent.click(await screen.findByRole('button', { name: /download my data/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent(/could not build the download/i)
      expect(captured).toHaveLength(0)

    })
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

  /**
   * Signing out has to take the key with it, not just the screen.
   *
   * `<SignedIn>` unmounts the moment Clerk's session ends, so the dashboard
   * goes blank and sign-out *looks* complete. But the data key lives in
   * IndexedDB, which survives the unmount, the tab close and the browser
   * restart — its only other eviction path is the 15-minute idle lock. Without
   * this, signing out and back in on the same device reopens every decrypted
   * number with no passphrase asked, which is not what the Unlock screen
   * promises ("This browser needs your passphrase").
   *
   * Asserted against the real key store rather than a spy on `clearVault`: a
   * spy proves the function was called, and the claim here is that the key is
   * gone. `handleSignOut` already reasons about shared devices when it clears
   * the dashboard cache — this is the same argument applied to the thing that
   * actually decrypts.
   */
  it('clears the vault on sign out, not just the rendered screen', async () => {
    const vault = await unlockTestVault('household-1')
    expect(await getVault()).not.toBeNull()

    listProtection.mockResolvedValue({ protection: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    render(<Profile />)

    await screen.findByText('Ananya Verma')
    fireEvent.click(screen.getByText('Sign out'))

    await waitFor(() => expect(signOut).toHaveBeenCalled())
    await waitFor(async () => expect(await getVault()).toBeNull())
    expect(vault.householdId).toBe('household-1')
  })

  /**
   * Observed on the 2026-08-05 preview rehearsal: after a real sign-out the
   * vault and the dashboard cache were both gone, but localStorage still held
   *   dashboard:last-tier:<householdId>   = "on_track"
   *   dashboard:fetched-at:<householdId>
   * so a shared browser kept the household's id and a coarse financial signal
   * about it. Small, but it is the same shared-device argument `handleSignOut`
   * already makes two comments above — the copy of the data goes, the key goes,
   * and then the label naming the household stays.
   */
  it('clears the dashboard markers that name the household on sign out', async () => {
    await unlockTestVault('household-1')
    window.localStorage.setItem('dashboard:last-tier:household-1', 'on_track')
    window.localStorage.setItem('dashboard:fetched-at:household-1', '1785933855618')

    listProtection.mockResolvedValue({ protection: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    render(<Profile />)

    await screen.findByText('Ananya Verma')
    fireEvent.click(screen.getByText('Sign out'))

    await waitFor(() => expect(signOut).toHaveBeenCalled())
    expect(window.localStorage.getItem('dashboard:last-tier:household-1')).toBeNull()
    expect(window.localStorage.getItem('dashboard:fetched-at:household-1')).toBeNull()
  })

  /**
   * The first version of the fix above awaited `clearVault()` unguarded, which
   * made sign-out impossible wherever IndexedDB rejects — Safari private mode,
   * storage disabled, a corrupted store. That is strictly worse than the bug it
   * fixed: refusing to sign out removes no key and traps someone in a session
   * they asked to leave. Caught by the pre-existing sign-out test, which had no
   * IndexedDB at all, so this pins the behaviour rather than leaving it to
   * whichever test happens to run without a vault.
   */
  it('still signs out when the key store cannot be cleared', async () => {
    const storeError = new Error('IndexedDB is unavailable')
    // Not a spy on clearVault: the failure being modelled is the storage layer
    // rejecting underneath it, which is what actually happens in private mode.
    const brokenIndexedDb = {
      open: () => {
        throw storeError
      },
    }
    const realIndexedDb = globalThis.indexedDB
    globalThis.indexedDB = brokenIndexedDb as unknown as IDBFactory
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      listProtection.mockResolvedValue({ protection: [], unreadableCount: 0, notYetEncryptedCount: 0 })
      render(<Profile />)

      await screen.findByText('Ananya Verma')
      fireEvent.click(screen.getByText('Sign out'))

      await waitFor(() => expect(signOut).toHaveBeenCalled())
      // Surfaced, not swallowed.
      expect(consoleError).toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
      globalThis.indexedDB = realIndexedDb
    }
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
