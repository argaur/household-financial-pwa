import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HouseholdApiError } from '@/lib/household-api'
import { expectStructuralA11y } from '@/test/a11y'
import { expectNoAxeViolations } from '@/test/axe'
import { HouseholdGate } from './HouseholdGate'

const getToken = vi.fn().mockResolvedValue('test-token')
const signOut = vi.fn()
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken }),
  useClerk: () => ({ signOut }),
}))

vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
}))

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

const resolveVaultState = vi.fn()
const completeKeySetup = vi.fn()
vi.mock('@/lib/key-setup', () => ({
  resolveVaultState: (...args: unknown[]) => resolveVaultState(...args),
  completeKeySetup: (...args: unknown[]) => completeKeySetup(...args),
}))

const fetchHousehold = vi.fn()
vi.mock('@/lib/household-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/household-api')>()
  return { ...actual, fetchHousehold: (...args: unknown[]) => fetchHousehold(...args) }
})

const listFamilyMembers = vi.fn()
vi.mock('@/lib/family-members-api', () => ({
  listFamilyMembers: (...args: unknown[]) => listFamilyMembers(...args),
}))

const listHoldings = vi.fn()
vi.mock('@/lib/holdings-api', () => ({ listHoldings: (...args: unknown[]) => listHoldings(...args) }))

// The three screens under the gate are stubbed: this file is about which door
// the gate opens, not what is behind it.
vi.mock('./KeySetup', () => ({
  KeySetup: ({ onReady }: { onReady: (p: { householdId: string; recoveryCode: string }) => void }) => (
    <button type="button" onClick={() => onReady({ householdId: 'h1', recoveryCode: 'CODE' })}>
      stub key setup
    </button>
  ),
}))
vi.mock('./Unlock', () => ({
  Unlock: ({ onUnlocked }: { onUnlocked: () => void }) => (
    <button type="button" onClick={onUnlocked}>
      stub unlock
    </button>
  ),
}))
vi.mock('./OnboardingStep1', () => ({
  OnboardingStep1: ({ onHouseholdCreated }: { onHouseholdCreated: () => void }) => (
    <button type="button" onClick={onHouseholdCreated}>
      stub step 1
    </button>
  ),
}))
vi.mock('./OnboardingStep2', () => ({ OnboardingStep2: () => <p>stub step 2</p> }))
vi.mock('./OnboardingStep3', () => ({ OnboardingStep3: () => <p>stub step 3</p> }))

const VAULT = { householdId: 'h1', dataKey: {} as CryptoKey }

function household(overrides: Record<string, unknown> = {}) {
  return {
    id: 'h1',
    ownerUserId: 'u1',
    name: 'Verma Family',
    version: 1,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('HouseholdGate — encryption states', () => {
  beforeEach(() => {
    resolveVaultState.mockReset()
    completeKeySetup.mockReset().mockResolvedValue('nothing-pending')
    fetchHousehold.mockReset()
    listFamilyMembers.mockReset().mockResolvedValue({ members: [] })
    listHoldings.mockReset().mockResolvedValue({ holdings: [] })
    track.mockClear()
    getToken.mockClear()
  })

  it('sends a user with no key material to key setup', async () => {
    resolveVaultState.mockResolvedValue({ state: 'key-setup' })
    render(<HouseholdGate />)
    expect(await screen.findByText('stub key setup')).toBeInTheDocument()
  })

  it('sends a user whose key material exists but whose vault is locked to unlock', async () => {
    resolveVaultState.mockResolvedValue({ state: 'unlock', keys: { householdId: 'h1' } })
    render(<HouseholdGate />)
    expect(await screen.findByText('stub unlock')).toBeInTheDocument()
  })

  it('re-resolves after unlocking, without a page reload', async () => {
    resolveVaultState
      .mockResolvedValueOnce({ state: 'unlock', keys: { householdId: 'h1' } })
      .mockResolvedValue({ state: 'ready', vault: VAULT })
    fetchHousehold.mockResolvedValue({ state: 'ok', household: household() })

    render(<HouseholdGate />)
    fireEvent.click(await screen.findByText('stub unlock'))
    expect(await screen.findByText('stub step 2')).toBeInTheDocument()
  })

  it('self-heals an interrupted setup with no user action at all', async () => {
    resolveVaultState
      .mockResolvedValueOnce({ state: 'completing-setup', householdId: 'h1' })
      .mockResolvedValue({ state: 'ready', vault: VAULT })
    completeKeySetup.mockResolvedValue('created')
    fetchHousehold.mockResolvedValue({ state: 'ok', household: household() })

    render(<HouseholdGate />)
    // No click anywhere in this test — that is the assertion.
    expect(await screen.findByText('stub step 2')).toBeInTheDocument()
    expect(completeKeySetup).toHaveBeenCalledWith('test-token')
  })

  it('treats a 409 while self-healing as "already set up" and carries on', async () => {
    resolveVaultState
      .mockResolvedValueOnce({ state: 'completing-setup', householdId: 'h1' })
      .mockResolvedValue({ state: 'ready', vault: VAULT })
    completeKeySetup.mockResolvedValue('already-exists')
    fetchHousehold.mockResolvedValue({ state: 'ok', household: household() })

    render(<HouseholdGate />)
    expect(await screen.findByText('stub step 2')).toBeInTheDocument()
    // Exactly one attempt. A retry here would be a retry at overwriting key
    // material, which is the one thing that can never be undone.
    expect(completeKeySetup).toHaveBeenCalledTimes(1)
  })

  it('states the unrecoverable case plainly and offers only an explicit, confirmed way out', async () => {
    resolveVaultState.mockResolvedValue({ state: 'unrecoverable', householdId: 'h1' })
    render(<HouseholdGate />)

    expect(await screen.findByText(/cannot be recovered/i)).toBeInTheDocument()
    // Routed to the existing account-deletion flow rather than a new
    // destructive path, and nothing is deleted by rendering this screen.
    const link = screen.getByRole('link', { name: /delete/i })
    expect(link).toHaveAttribute('href', '/profile')
    expect(completeKeySetup).not.toHaveBeenCalled()
  })

  it('completes the key setup once the household row finally exists', async () => {
    resolveVaultState.mockResolvedValue({ state: 'ready', vault: VAULT })
    fetchHousehold.mockResolvedValue({ state: 'absent' })
    completeKeySetup.mockResolvedValue('created')

    render(<HouseholdGate />)
    fireEvent.click(await screen.findByText('stub step 1'))
    await waitFor(() => expect(completeKeySetup).toHaveBeenCalledWith('test-token'))
    expect(await screen.findByText('stub step 2')).toBeInTheDocument()
  })

  it('gives an unreadable household its own branch, not the generic error screen', async () => {
    resolveVaultState.mockResolvedValue({ state: 'ready', vault: VAULT })
    fetchHousehold.mockResolvedValue({ state: 'unreadable', id: 'h1', reason: 'UNWRAP_FAILED' })

    render(<HouseholdGate />)
    expect(await screen.findByText(/key in this browser doesn't match/i)).toBeInTheDocument()
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
  })

  it('gives a household written before encryption its own branch', async () => {
    resolveVaultState.mockResolvedValue({ state: 'ready', vault: VAULT })
    fetchHousehold.mockResolvedValue({ state: 'not-yet-encrypted', id: 'h1' })

    render(<HouseholdGate />)
    expect(await screen.findByText(/before your data was encrypted/i)).toBeInTheDocument()
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
  })
})

describe('HouseholdGate — existing behaviour is preserved', () => {
  beforeEach(() => {
    resolveVaultState.mockReset().mockResolvedValue({ state: 'ready', vault: VAULT })
    completeKeySetup.mockReset().mockResolvedValue('nothing-pending')
    fetchHousehold.mockReset()
    listFamilyMembers.mockReset().mockResolvedValue({ members: [] })
    listHoldings.mockReset().mockResolvedValue({ holdings: [] })
    track.mockClear()
  })

  it('walks the onboarding progression to the dashboard', async () => {
    fetchHousehold.mockResolvedValue({ state: 'ok', household: household() })
    listFamilyMembers.mockResolvedValue({ members: [{ id: 'm1', name: 'A' }] })
    listHoldings.mockResolvedValue({ holdings: [{ id: 'x' }] })

    render(<HouseholdGate />)
    expect(await screen.findByTestId('navigate')).toHaveTextContent('/dashboard')
  })

  it('fires onboarding_started once per step, never twice', async () => {
    fetchHousehold.mockResolvedValue({ state: 'absent' })
    const { rerender } = render(<HouseholdGate />)
    await screen.findByText('stub step 1')
    rerender(<HouseholdGate />)

    const householdStarts = track.mock.calls.filter(
      (call) => call[0] === 'onboarding_started' && (call[1] as { step: string }).step === 'household',
    )
    expect(householdStarts).toHaveLength(1)
  })

  it('still shows the session-expired screen on a 401', async () => {
    resolveVaultState.mockRejectedValue(new HouseholdApiError(401, 'unauthorized'))
    render(<HouseholdGate />)
    expect(await screen.findByText(/your session has ended/i)).toBeInTheDocument()
  })

  it('still shows the generic error screen when something genuinely breaks', async () => {
    resolveVaultState.mockRejectedValue(new Error('network down'))
    render(<HouseholdGate />)
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
  })
})

describe('HouseholdGate — accessibility of the new panels', () => {
  beforeEach(() => {
    resolveVaultState.mockReset()
    completeKeySetup.mockReset().mockResolvedValue('nothing-pending')
    fetchHousehold.mockReset()
    listFamilyMembers.mockReset().mockResolvedValue({ members: [] })
    listHoldings.mockReset().mockResolvedValue({ holdings: [] })
  })

  it('never tells a pre-encryption household that its data cannot be recovered', async () => {
    // The whole point of the state: these rows are plaintext and intact. The
    // unrecoverable copy would be a false statement about live data.
    resolveVaultState.mockResolvedValue({ state: 'predates-encryption', householdId: 'h1' })
    render(<HouseholdGate />)

    expect(await screen.findByText(/before your data was encrypted/i)).toBeInTheDocument()
    expect(screen.queryByText(/cannot be recovered/i)).not.toBeInTheDocument()
  })

  it('does not try to open the vault for a pre-encryption household', async () => {
    // fetchHousehold opens the vault; there is no key, so reaching it would
    // throw and land the user on the generic error screen instead.
    resolveVaultState.mockResolvedValue({ state: 'predates-encryption', householdId: 'h1' })
    render(<HouseholdGate />)

    await screen.findByText(/before your data was encrypted/i)
    expect(fetchHousehold).not.toHaveBeenCalled()
  })

  it('passes the structural checks on the unrecoverable panel', async () => {
    resolveVaultState.mockResolvedValue({ state: 'unrecoverable', householdId: 'h1' })
    const { container } = render(<HouseholdGate />)
    await screen.findByText(/cannot be recovered/i)
    expectStructuralA11y(container)
  })

  it('has zero axe violations on the unrecoverable panel', async () => {
    resolveVaultState.mockResolvedValue({ state: 'unrecoverable', householdId: 'h1' })
    const { container } = render(<HouseholdGate />)
    await screen.findByText(/cannot be recovered/i)
    await expectNoAxeViolations(container)
  })

  it('passes the structural checks on the unreadable-household panel', async () => {
    resolveVaultState.mockResolvedValue({ state: 'ready', vault: VAULT })
    fetchHousehold.mockResolvedValue({ state: 'unreadable', id: 'h1', reason: 'UNWRAP_FAILED' })
    const { container } = render(<HouseholdGate />)
    await screen.findByText(/doesn't match/i)
    expectStructuralA11y(container)
  })

  it('has zero axe violations on the unreadable-household panel', async () => {
    resolveVaultState.mockResolvedValue({ state: 'ready', vault: VAULT })
    fetchHousehold.mockResolvedValue({ state: 'unreadable', id: 'h1', reason: 'UNWRAP_FAILED' })
    const { container } = render(<HouseholdGate />)
    await screen.findByText(/doesn't match/i)
    await expectNoAxeViolations(container)
  })

  it('passes the structural checks on the not-yet-encrypted panel', async () => {
    resolveVaultState.mockResolvedValue({ state: 'ready', vault: VAULT })
    fetchHousehold.mockResolvedValue({ state: 'not-yet-encrypted', id: 'h1' })
    const { container } = render(<HouseholdGate />)
    await screen.findByText(/before your data was encrypted/i)
    expectStructuralA11y(container)
  })

  it('has zero axe violations on the not-yet-encrypted panel', async () => {
    resolveVaultState.mockResolvedValue({ state: 'ready', vault: VAULT })
    fetchHousehold.mockResolvedValue({ state: 'not-yet-encrypted', id: 'h1' })
    const { container } = render(<HouseholdGate />)
    await screen.findByText(/before your data was encrypted/i)
    await expectNoAxeViolations(container)
  })
})
