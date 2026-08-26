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

const resolveVaultState = vi.fn()
const completeKeySetup = vi.fn()
vi.mock('@/lib/key-setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/key-setup')>()
  return {
    ...actual,
    resolveVaultState: (...args: unknown[]) => resolveVaultState(...args),
    completeKeySetup: (...args: unknown[]) => completeKeySetup(...args),
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

  it('unlock: shows the placeholder unlock line and loads no members', async () => {
    resolveVaultState.mockResolvedValue({ state: 'unlock', keys })
    renderSheet()

    expect(await screen.findByText(/unlock/i)).toBeInTheDocument()
    expect(listFamilyMembers).not.toHaveBeenCalled()
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
})
