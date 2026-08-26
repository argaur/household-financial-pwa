import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AddHoldingSheet } from './add-holding-sheet'
import type { Instrument } from '@/lib/instruments-api'
import type { Holding } from '@/lib/holdings-api'
import type { FamilyMember } from '@/lib/family-members-api'
import type { HouseholdKeys } from '@/lib/household-keys-api'

const getToken = vi.fn().mockResolvedValue('test-token')
let isSignedIn: boolean | undefined = true
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken, isSignedIn }),
}))

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))

// jsdom has no real CSS animations, so Radix's Presence (inside SheetContent)
// unmounts synchronously on close with nothing to wait for. In a real
// browser it can stay mounted through an exit transition (the same class of
// bug the ledger slice's NewLedgerModal hit) -- so SheetContent is mocked to
// stay mounted regardless of `open`, letting the remount tests exercise
// AddHoldingSheet's own key strategy rather than an artifact of jsdom's lack
// of animation timing.
vi.mock('@/components/ui/sheet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/sheet')>()
  return {
    ...actual,
    SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  }
})

const resolveVaultState = vi.fn()
const completeKeySetup = vi.fn()
const unlockWithPassphrase = vi.fn()
const unlockWithRecoveryCode = vi.fn()
vi.mock('@/lib/key-setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/key-setup')>()
  return {
    ...actual,
    resolveVaultState: (...args: unknown[]) => resolveVaultState(...args),
    completeKeySetup: (...args: unknown[]) => completeKeySetup(...args),
    unlockWithPassphrase: (...args: unknown[]) => unlockWithPassphrase(...args),
    unlockWithRecoveryCode: (...args: unknown[]) => unlockWithRecoveryCode(...args),
  }
})

const listFamilyMembers = vi.fn()
vi.mock('@/lib/family-members-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/family-members-api')>()
  return { ...actual, listFamilyMembers: (...args: unknown[]) => listFamilyMembers(...args) }
})

const createHolding = vi.fn()
vi.mock('@/lib/holdings-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/holdings-api')>()
  return { ...actual, createHolding: (...args: unknown[]) => createHolding(...args) }
})

const instrument: Instrument = {
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

const member: FamilyMember = {
  id: 'm1',
  householdId: 'h1',
  name: 'Ananya Verma',
  relationship: 'self',
  dateOfBirth: '1990-01-01',
  riskProfile: null,
  version: 1,
  createdAt: '',
  updatedAt: '',
}

const holding: Holding = {
  id: 'hold1',
  householdId: 'h1',
  memberId: 'm1',
  instrumentId: 'i1',
  assetClass: 'equity',
  investedAmount: '10000',
  currentValue: '10500',
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

const keys = {
  householdId: 'h1',
  kdfAlg: 'PBKDF2-SHA256',
  kdfIterations: 310000,
  passphraseSalt: 'salt',
  wrappedDekPassphrase: 'wrapped',
  passphraseWrapIv: 'iv',
  recoverySalt: 'salt2',
  wrappedDekRecovery: 'wrapped2',
  recoveryWrapIv: 'iv2',
  createdAt: '',
  updatedAt: '',
} as unknown as HouseholdKeys

const readyVault = { state: 'ready' as const, vault: { householdId: 'h1', dataKey: {} as CryptoKey } }

function renderSheet(props: Partial<Parameters<typeof AddHoldingSheet>[0]> = {}) {
  const onOpenChange = props.onOpenChange ?? vi.fn()
  const onAdded = props.onAdded ?? vi.fn()
  const utils = render(
    <MemoryRouter>
      <AddHoldingSheet
        instrument={instrument}
        open={props.open ?? true}
        onOpenChange={onOpenChange}
        onAdded={onAdded}
      />
    </MemoryRouter>,
  )
  return { ...utils, onOpenChange, onAdded }
}

describe('AddHoldingSheet', () => {
  beforeEach(() => {
    isSignedIn = true
    getToken.mockClear()
    resolveVaultState.mockReset()
    completeKeySetup.mockReset()
    listFamilyMembers.mockReset()
    listFamilyMembers.mockResolvedValue({ members: [member], unreadableCount: 0, notYetEncryptedCount: 0 })
    createHolding.mockReset()
    unlockWithPassphrase.mockReset()
    unlockWithRecoveryCode.mockReset()
  })

  it('resolves nothing while closed, and only resolves once open flips to true', async () => {
    resolveVaultState.mockResolvedValue(readyVault)
    const onOpenChange = vi.fn()
    const onAdded = vi.fn()
    const { rerender } = render(
      <MemoryRouter>
        <AddHoldingSheet instrument={instrument} open={false} onOpenChange={onOpenChange} onAdded={onAdded} />
      </MemoryRouter>,
    )

    // A browsing stranger on /explore makes zero authenticated calls.
    await Promise.resolve()
    expect(resolveVaultState).not.toHaveBeenCalled()
    expect(listFamilyMembers).not.toHaveBeenCalled()

    rerender(
      <MemoryRouter>
        <AddHoldingSheet instrument={instrument} open onOpenChange={onOpenChange} onAdded={onAdded} />
      </MemoryRouter>,
    )

    await waitFor(() => expect(resolveVaultState).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(listFamilyMembers).toHaveBeenCalledTimes(1))
  })

  it('signed out: prompts sign-in, links to /sign-in, and resolves nothing', async () => {
    isSignedIn = false
    renderSheet()

    expect(await screen.findByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/sign-in')
    expect(resolveVaultState).not.toHaveBeenCalled()
    expect(listFamilyMembers).not.toHaveBeenCalled()
  })

  it('ready with at least one family member: renders the holding form prefilled with the instrument', async () => {
    resolveVaultState.mockResolvedValue(readyVault)
    renderSheet()

    expect(await screen.findByLabelText(/amount invested/i)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /instrument/i })).toHaveTextContent('Large Cap Index Fund')
  })

  it('ready with no family members: asks the user to finish setting up the household, linking to /dashboard', async () => {
    resolveVaultState.mockResolvedValue(readyVault)
    listFamilyMembers.mockResolvedValue({ members: [], unreadableCount: 0, notYetEncryptedCount: 0 })
    renderSheet()

    expect(await screen.findByText(/finish setting up your household/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard')
    expect(screen.queryByLabelText(/amount invested/i)).not.toBeInTheDocument()
  })

  it('unlock: renders the unlock form inline, loads no members, and offers no way off the page', async () => {
    resolveVaultState.mockResolvedValue({ state: 'unlock', keys })
    renderSheet()

    expect(await screen.findByLabelText(/your passphrase/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^unlock$/i })).toBeInTheDocument()
    expect(listFamilyMembers).not.toHaveBeenCalled()
    // Nothing may take the user away from the library they were browsing.
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    // And the page shell of the standalone /unlock route must not appear here.
    expect(document.querySelector('.min-h-screen')).toBeNull()
  })

  it('unlock: a correct passphrase unlocks in place and falls through to the prefilled form', async () => {
    resolveVaultState.mockResolvedValueOnce({ state: 'unlock', keys }).mockResolvedValue(readyVault)
    unlockWithPassphrase.mockResolvedValue(undefined)
    renderSheet()

    fireEvent.change(await screen.findByLabelText(/your passphrase/i), { target: { value: 'open sesame please' } })
    fireEvent.click(screen.getByRole('button', { name: /^unlock$/i }))

    await waitFor(() => expect(unlockWithPassphrase).toHaveBeenCalledWith(keys, 'open sesame please'))
    expect(await screen.findByLabelText(/amount invested/i)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /instrument/i })).toHaveTextContent('Large Cap Index Fund')
    expect(resolveVaultState).toHaveBeenCalledTimes(2)
  })

  it('unlock: the recovery-code path is reachable from the inline form', async () => {
    resolveVaultState.mockResolvedValueOnce({ state: 'unlock', keys }).mockResolvedValue(readyVault)
    unlockWithRecoveryCode.mockResolvedValue(undefined)
    renderSheet()

    fireEvent.click(await screen.findByRole('button', { name: /recovery code instead/i }))
    fireEvent.change(screen.getByLabelText(/recovery code/i), { target: { value: 'ABCDEF-GHIJKL' } })
    fireEvent.click(screen.getByRole('button', { name: /^unlock$/i }))

    await waitFor(() => expect(unlockWithRecoveryCode).toHaveBeenCalledWith(keys, 'ABCDEF-GHIJKL'))
    expect(await screen.findByLabelText(/amount invested/i)).toBeInTheDocument()
  })

  it('unlock: a failed unlock shows the one generic message and does not fall through to the form', async () => {
    resolveVaultState.mockResolvedValue({ state: 'unlock', keys })
    unlockWithPassphrase.mockRejectedValue(new Error('OperationError: unwrap failed'))
    renderSheet()

    fireEvent.change(await screen.findByLabelText(/your passphrase/i), { target: { value: 'wrong one entirely' } })
    fireEvent.click(screen.getByRole('button', { name: /^unlock$/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/didn't unlock your household/i)
    // No cause an attacker could read as an oracle, and no echo of the attempt.
    expect(alert.textContent).not.toMatch(/tamper|corrupt|altered|missing|household not found|unwrap/i)
    expect(alert.textContent).not.toContain('wrong one entirely')
    expect(screen.queryByLabelText(/amount invested/i)).not.toBeInTheDocument()
    expect(resolveVaultState).toHaveBeenCalledTimes(1)
  })

  it('key-setup: says no household exists yet and links to /dashboard', async () => {
    resolveVaultState.mockResolvedValue({ state: 'key-setup' })
    renderSheet()

    expect(await screen.findByText(/haven't created a household yet/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard')
  })

  it('completing-setup: completes the key setup silently and then re-resolves', async () => {
    resolveVaultState
      .mockResolvedValueOnce({ state: 'completing-setup', householdId: 'h1' })
      .mockResolvedValue(readyVault)
    completeKeySetup.mockResolvedValue('created')
    renderSheet()

    await waitFor(() => expect(completeKeySetup).toHaveBeenCalledWith('test-token'))
    expect(await screen.findByLabelText(/amount invested/i)).toBeInTheDocument()
    expect(resolveVaultState).toHaveBeenCalledTimes(2)
  })

  it('unrecoverable: shows one short line and links to /dashboard', async () => {
    resolveVaultState.mockResolvedValue({ state: 'unrecoverable', householdId: 'h1' })
    renderSheet()

    expect(await screen.findByText(/can't be opened/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard')
  })

  it('predates-encryption: shows one short line and links to /dashboard', async () => {
    resolveVaultState.mockResolvedValue({ state: 'predates-encryption', householdId: 'h1' })
    renderSheet()

    expect(await screen.findByText(/came before encryption/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard')
  })

  it('a thrown error: shows a short generic failure line rather than swallowing it', async () => {
    resolveVaultState.mockRejectedValue(new Error('vault locked'))
    renderSheet()

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/amount invested/i)).not.toBeInTheDocument()
  })

  it('on save: creates the holding with no ledgerId, closes the sheet, and reports the new holding', async () => {
    resolveVaultState.mockResolvedValue(readyVault)
    createHolding.mockResolvedValue(holding)
    const { onOpenChange, onAdded } = renderSheet()

    fireEvent.change(await screen.findByLabelText(/amount invested/i), { target: { value: '10000' } })
    fireEvent.change(screen.getByLabelText(/current value/i), { target: { value: '10500' } })
    fireEvent.click(screen.getByRole('button', { name: /add to plan/i }))

    await waitFor(() =>
      expect(createHolding).toHaveBeenCalledWith(
        'test-token',
        {
          memberId: 'm1',
          instrumentId: 'i1',
          assetClass: 'equity',
          investedAmount: '10000',
          currentValue: '10500',
          isEmergencyFund: false,
        },
        undefined,
      ),
    )
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(holding))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('reopening after a ready resolution does not refetch family members or re-resolve the vault', async () => {
    resolveVaultState.mockResolvedValue(readyVault)
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <MemoryRouter>
        <AddHoldingSheet instrument={instrument} open onOpenChange={onOpenChange} onAdded={vi.fn()} />
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText(/amount invested/i)).toBeInTheDocument()
    await waitFor(() => expect(resolveVaultState).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(listFamilyMembers).toHaveBeenCalledTimes(1))

    // Close.
    rerender(
      <MemoryRouter>
        <AddHoldingSheet instrument={instrument} open={false} onOpenChange={onOpenChange} onAdded={vi.fn()} />
      </MemoryRouter>,
    )
    // Reopen.
    rerender(
      <MemoryRouter>
        <AddHoldingSheet instrument={instrument} open onOpenChange={onOpenChange} onAdded={vi.fn()} />
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText(/amount invested/i)).toBeInTheDocument()
    // No fresh resolve, no fresh refetch: the cached `ready` state serves it.
    await Promise.resolve()
    expect(resolveVaultState).toHaveBeenCalledTimes(1)
    expect(listFamilyMembers).toHaveBeenCalledTimes(1)
  })

  it('closing and reopening clears the form: typed input does not survive the Radix reset trap', async () => {
    resolveVaultState.mockResolvedValue(readyVault)
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <MemoryRouter>
        <AddHoldingSheet instrument={instrument} open onOpenChange={onOpenChange} onAdded={vi.fn()} />
      </MemoryRouter>,
    )

    const amountField = await screen.findByLabelText(/amount invested/i)
    fireEvent.change(amountField, { target: { value: '12345' } })
    expect(screen.getByLabelText(/amount invested/i)).toHaveValue(12345)

    // Close.
    rerender(
      <MemoryRouter>
        <AddHoldingSheet instrument={instrument} open={false} onOpenChange={onOpenChange} onAdded={vi.fn()} />
      </MemoryRouter>,
    )
    // Reopen.
    rerender(
      <MemoryRouter>
        <AddHoldingSheet instrument={instrument} open onOpenChange={onOpenChange} onAdded={vi.fn()} />
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText(/amount invested/i)).toHaveValue(null)
  })
})
