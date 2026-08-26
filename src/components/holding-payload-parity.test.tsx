import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { LibrarySection } from '@/pages/LibrarySection'
import { InstrumentDetail } from '@/pages/InstrumentDetail'
import { Portfolio } from '@/pages/Portfolio'
import type { Instrument } from '@/lib/instruments-api'
import type { Holding } from '@/lib/holdings-api'
import type { FamilyMember } from '@/lib/family-members-api'

/**
 * Chunk 4 of the D-016 Slice 5 plan asked for an assertion that a holding
 * created from all three entry points -- the Explore library card, the
 * Explore instrument detail page, and Portfolio's own add sheet -- is
 * field-for-field identical, and that none of the three thread a ledgerId
 * (D-023: both Explore entry points write to the baseline "Current" ledger).
 * That assertion never got written. This file is it.
 *
 * Each path is driven through its real user-visible interaction: click the
 * trigger, fill the same amount fields, submit. Rendering HoldingForm three
 * times directly would prove nothing -- the point is that the three CALL
 * SITES (LibrarySection -> AddHoldingSheet, InstrumentDetail ->
 * AddHoldingSheet, Portfolio's own sheet) agree on what they pass to
 * createHolding.
 */

const getToken = vi.fn().mockResolvedValue('test-token')
let isSignedIn: boolean | undefined = true
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken, isSignedIn }),
}))

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))

// Unlike add-holding-sheet.test.tsx, this file never closes and reopens a
// sheet within one render -- each of the three paths gets its own fresh
// render/unmount, so Radix's real Presence/Portal behaviour on a single
// open transition is exercised as-is, with no SheetContent mock needed.

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

const listInstruments = vi.fn()
const getInstrument = vi.fn()
vi.mock('@/lib/instruments-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instruments-api')>()
  return {
    ...actual,
    listInstruments: (...args: unknown[]) => listInstruments(...args),
    getInstrument: (...args: unknown[]) => getInstrument(...args),
  }
})

const listHoldings = vi.fn()
const createHolding = vi.fn()
vi.mock('@/lib/holdings-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/holdings-api')>()
  return {
    ...actual,
    listHoldings: (...args: unknown[]) => listHoldings(...args),
    createHolding: (...args: unknown[]) => createHolding(...args),
  }
})

const getVault = vi.fn()
vi.mock('@/lib/crypto/key-store', () => ({
  getVault: (...args: unknown[]) => getVault(...args),
}))

const listLedgers = vi.fn()
vi.mock('@/lib/ledgers-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ledgers-api')>()
  return { ...actual, listLedgers: (...args: unknown[]) => listLedgers(...args) }
})

// The same instrument, member, invested amount and current value are used on
// every path so any difference in the captured payload is real wiring drift,
// not a difference in test fixtures.
const instrument: Instrument = {
  id: 'i1',
  slug: 'equity-large-cap-fund',
  category: 1,
  name: 'Large Cap Index Fund',
  summary: 'A diversified basket of large company stocks.',
  returns: 'Market-linked',
  tax: '',
  liquidity: '',
  risk: 'Moderate',
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

const savedHolding: Holding = {
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

const baselineLedger = {
  id: 'l1',
  householdId: 'h1',
  name: 'Current',
  isBaseline: true,
  origin: 'manual' as const,
  snapshotOf: null,
  createdAt: '',
  updatedAt: '',
}

const readyVault = { state: 'ready' as const, vault: { householdId: 'h1', dataKey: {} as CryptoKey } }

const INVESTED_AMOUNT = '10000'
const CURRENT_VALUE = '10500'

/** Fills the two required HoldingForm fields with the shared fixture values. */
async function fillAndSubmit(submitButtonName: RegExp) {
  fireEvent.change(await screen.findByLabelText(/amount invested/i), { target: { value: INVESTED_AMOUNT } })
  fireEvent.change(screen.getByLabelText(/current value/i), { target: { value: CURRENT_VALUE } })
  fireEvent.click(screen.getByRole('button', { name: submitButtonName }))
}

async function driveLibraryCard() {
  listInstruments.mockResolvedValue([instrument])
  getVault.mockResolvedValue(null) // no held-check noise
  const utils = render(
    <MemoryRouter initialEntries={['/explore/equity']}>
      <Routes>
        <Route path="/explore/:sectionSlug" element={<LibrarySection />} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.click(await screen.findByRole('button', { name: /\+ add/i }))
  await fillAndSubmit(/add to plan/i)
  await waitFor(() => expect(createHolding).toHaveBeenCalledTimes(1))
  utils.unmount()
}

async function driveInstrumentDetail() {
  getInstrument.mockResolvedValue(instrument)
  const utils = render(
    <MemoryRouter initialEntries={['/explore/equity/equity-large-cap-fund']}>
      <Routes>
        <Route path="/explore/:sectionSlug/:instrumentSlug" element={<InstrumentDetail />} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.click(await screen.findByRole('button', { name: /record this in my plan/i }))
  await fillAndSubmit(/add to plan/i)
  await waitFor(() => expect(createHolding).toHaveBeenCalledTimes(1))
  utils.unmount()
}

async function drivePortfolio() {
  listHoldings.mockResolvedValue({ holdings: [], unreadableCount: 0, notYetEncryptedCount: 0 })
  listInstruments.mockResolvedValue([instrument])
  listLedgers.mockResolvedValue([baselineLedger])
  const utils = render(<Portfolio />)
  fireEvent.click(await screen.findByRole('button', { name: /record your first holding/i }))
  // Unlike the two Explore entry points, Portfolio's form has no
  // initialInstrumentId prefill -- the instrument has to be picked here.
  fireEvent.click(await screen.findByRole('combobox', { name: /instrument/i }))
  fireEvent.click(await screen.findByRole('option', { name: instrument.name }))
  await fillAndSubmit(/add to plan/i)
  await waitFor(() => expect(createHolding).toHaveBeenCalledTimes(1))
  utils.unmount()
}

describe('createHolding payload parity across all three add-holding entry points', () => {
  beforeEach(() => {
    isSignedIn = true
    getToken.mockClear()
    resolveVaultState.mockReset()
    resolveVaultState.mockResolvedValue(readyVault)
    completeKeySetup.mockReset()
    listFamilyMembers.mockReset()
    listFamilyMembers.mockResolvedValue({ members: [member], unreadableCount: 0, notYetEncryptedCount: 0 })
    listInstruments.mockReset()
    getInstrument.mockReset()
    listHoldings.mockReset()
    createHolding.mockReset()
    createHolding.mockResolvedValue(savedHolding)
    getVault.mockReset()
    listLedgers.mockReset()
  })

  it('the Explore library card, Explore instrument detail, and Portfolio add sheet all call createHolding with the identical payload and no ledgerId', async () => {
    await driveLibraryCard()
    const libraryCall = createHolding.mock.calls[0]
    createHolding.mockClear()

    await driveInstrumentDetail()
    const instrumentDetailCall = createHolding.mock.calls[0]
    createHolding.mockClear()

    await drivePortfolio()
    const portfolioCall = createHolding.mock.calls[0]

    // Reference: Portfolio's own add sheet, on its baseline ("Current") tab.
    expect(portfolioCall[0]).toBe('test-token')
    expect(portfolioCall[1]).toEqual({
      memberId: 'm1',
      instrumentId: 'i1',
      assetClass: 'equity',
      investedAmount: INVESTED_AMOUNT,
      currentValue: CURRENT_VALUE,
      isEmergencyFund: false,
    })
    expect(portfolioCall[2]).toBeUndefined()

    // Both Explore entry points must match the Portfolio reference exactly.
    expect(libraryCall).toEqual(portfolioCall)
    expect(instrumentDetailCall).toEqual(portfolioCall)

    // Belt and suspenders on the one property D-023 turns on: no path may
    // thread a ledgerId into Explore.
    expect(libraryCall[2]).toBeUndefined()
    expect(instrumentDetailCall[2]).toBeUndefined()
  })
})
