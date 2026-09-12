import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Portfolio } from './Portfolio'
import { LedgerCapReachedError, LedgersApiError } from '@/lib/ledgers-api'
import type { AiSuggestionsUsage } from '@/lib/ai-suggestions-api'
import { unlockTestVault, requestBody, jsonResponse } from '@/test/encrypted-fixtures'

/**
 * M3c (D-024/D-025) — "Apply" on an AI suggestion creates a NEW ledger.
 *
 * The decision this pins (see DECISIONS_LOG.md D-024 decision 3, "nothing
 * changes until Apply is tapped"): Apply writes something, and what it writes
 * is a brand new ledger, EMPTY OF HOLDINGS, with the suggestion sealed onto it
 * as context. Current is never touched.
 *
 * WHY EMPTY, AND WHY NO TEST HERE MAY EVER RELAX THAT: an AI allocation is
 * `{ slug, weightPct }` and carries no member. Every holding needs a
 * `memberId`, and a household has several members, so synthesising holdings
 * from a suggestion would silently attribute the rest of the household's money
 * to whichever member was guessed. Member attribution is never guessed, so
 * Apply creates the container and the user fills it in by hand.
 */

const getToken = vi.fn().mockResolvedValue('test-token')
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken }),
}))

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

const listFamilyMembers = vi.fn()
vi.mock('@/lib/family-members-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/family-members-api')>()
  return { ...actual, listFamilyMembers: (...args: unknown[]) => listFamilyMembers(...args) }
})

const listInstruments = vi.fn()
vi.mock('@/lib/instruments-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instruments-api')>()
  return { ...actual, listInstruments: (...args: unknown[]) => listInstruments(...args) }
})

const listHoldings = vi.fn()
const createHolding = vi.fn()
const updateHolding = vi.fn()
const deleteHolding = vi.fn()
vi.mock('@/lib/holdings-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/holdings-api')>()
  return {
    ...actual,
    listHoldings: (...args: unknown[]) => listHoldings(...args),
    createHolding: (...args: unknown[]) => createHolding(...args),
    updateHolding: (...args: unknown[]) => updateHolding(...args),
    deleteHolding: (...args: unknown[]) => deleteHolding(...args),
  }
})

const listLedgers = vi.fn()
const createSuggestionLedger = vi.fn()
const createBlankLedger = vi.fn()
const createLedgerFromCurrent = vi.fn()
const deleteLedger = vi.fn()
vi.mock('@/lib/ledgers-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ledgers-api')>()
  return {
    ...actual,
    listLedgers: (...args: unknown[]) => listLedgers(...args),
    createSuggestionLedger: (...args: unknown[]) => createSuggestionLedger(...args),
    createBlankLedger: (...args: unknown[]) => createBlankLedger(...args),
    createLedgerFromCurrent: (...args: unknown[]) => createLedgerFromCurrent(...args),
    deleteLedger: (...args: unknown[]) => deleteLedger(...args),
  }
})

const getAiSuggestionsUsage = vi.fn()
const postCounselSuggestion = vi.fn()
vi.mock('@/lib/ai-suggestions-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai-suggestions-api')>()
  return {
    ...actual,
    getAiSuggestionsUsage: (...args: unknown[]) => getAiSuggestionsUsage(...args),
    postCounselSuggestion: (...args: unknown[]) => postCounselSuggestion(...args),
  }
})

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

const instrument = {
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

const holding = {
  id: 'hold1',
  householdId: 'h1',
  memberId: 'm1',
  instrumentId: 'i1',
  assetClass: 'equity' as const,
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

const ALLOCATIONS = [{ slug: 'equity-large-cap-fund', weightPct: 100 }]

function usage(overrides: Partial<AiSuggestionsUsage> = {}): AiSuggestionsUsage {
  return { plansUsed: 0, plansCap: 2, editsUsed: 0, editsCap: 2, globalOpen: true, ...overrides }
}

/** The ledger the create resolves with, as the server would hand it back. */
const createdLedger = {
  id: 'l9',
  householdId: 'h1',
  name: 'AI review, 11 Sep 2026',
  suggestion: { kind: 'counsel' as const, allocations: ALLOCATIONS },
  ciphertext: 'c',
  iv: 'i',
  alg: 'AES-GCM',
  version: 1,
  isBaseline: false,
  origin: 'manual' as const,
  snapshotOf: null,
  createdAt: '2026-09-11T00:00:00.000Z',
  updatedAt: '2026-09-11T00:00:00.000Z',
}

/** Walks the live Apply path: Review this ledger, consent, result card, Apply. */
async function applyASuggestion() {
  render(
    <MemoryRouter>
      <Portfolio />
    </MemoryRouter>,
  )
  await screen.findByText("Ananya Verma's holdings")
  fireEvent.click(await screen.findByRole('button', { name: /review this ledger/i }))
  fireEvent.click(await screen.findByRole('button', { name: /send this request/i }))
  await screen.findByTestId('ai-suggestion-allocations')
  fireEvent.click(screen.getByRole('button', { name: /add these to the plan/i }))
}

describe('Portfolio — Apply on an AI suggestion creates a new, empty ledger (M3c)', () => {
  beforeEach(() => {
    listFamilyMembers.mockReset()
    listInstruments.mockReset()
    listHoldings.mockReset()
    createHolding.mockReset()
    updateHolding.mockReset()
    deleteHolding.mockReset()
    listLedgers.mockReset()
    createSuggestionLedger.mockReset()
    createBlankLedger.mockReset()
    createLedgerFromCurrent.mockReset()
    deleteLedger.mockReset()
    getAiSuggestionsUsage.mockReset()
    postCounselSuggestion.mockReset()
    track.mockReset()

    listFamilyMembers.mockResolvedValue({ members: [member], unreadableCount: 0, notYetEncryptedCount: 0 })
    listInstruments.mockResolvedValue([instrument])
    listLedgers.mockResolvedValue([baselineLedger])
    listHoldings.mockResolvedValue({ holdings: [holding], unreadableCount: 0, notYetEncryptedCount: 0 })
    getAiSuggestionsUsage.mockResolvedValue(usage())
    postCounselSuggestion.mockResolvedValue({
      status: 'ok',
      kind: 'counsel',
      suggestion: {
        allocations: ALLOCATIONS,
        reasoning: 'A simple illustration.',
        caveat: 'This is an illustration, not advice.',
      },
      usage: { plansUsed: 0, plansCap: 2, editsUsed: 1, editsCap: 2 },
    })
    createSuggestionLedger.mockResolvedValue(createdLedger)
  })

  it('creates one new ledger, named for the suggestion, carrying the suggested mix as context', async () => {
    await applyASuggestion()

    await waitFor(() => expect(createSuggestionLedger).toHaveBeenCalledTimes(1))
    const [token, name, suggestion] = createSuggestionLedger.mock.calls[0]
    expect(token).toBe('test-token')
    expect(String(name)).toMatch(/^AI review, /)
    expect(suggestion).toEqual({ kind: 'counsel', allocations: ALLOCATIONS })
  })

  it('creates NO holdings, and never routes through the copy-from-Current path', async () => {
    await applyASuggestion()
    await waitFor(() => expect(createSuggestionLedger).toHaveBeenCalledTimes(1))

    // The whole point of the decision: an allocation has no member, so no
    // holding may be written on the user's behalf.
    expect(createHolding).not.toHaveBeenCalled()
    expect(updateHolding).not.toHaveBeenCalled()
    expect(deleteHolding).not.toHaveBeenCalled()
    // createLedgerFromCurrent is the path that COPIES holdings. Apply must
    // never take it.
    expect(createLedgerFromCurrent).not.toHaveBeenCalled()
  })

  it('leaves Current untouched: no write to it, and its own holdings still read back unchanged', async () => {
    await applyASuggestion()
    await waitFor(() => expect(createSuggestionLedger).toHaveBeenCalledTimes(1))

    // Back to the Current tab: the baseline still shows exactly what it held
    // before Apply, and nothing was deleted from it.
    fireEvent.click(screen.getByRole('tab', { name: 'Current' }))
    expect(await screen.findByText("Ananya Verma's holdings")).toBeInTheDocument()
    expect(deleteLedger).not.toHaveBeenCalled()
    expect(deleteHolding).not.toHaveBeenCalled()
  })

  it('clears the suggestion card and says plainly that the new plan is empty', async () => {
    await applyASuggestion()

    const notice = await screen.findByTestId('apply-suggestion-notice')
    expect(notice).toHaveTextContent('AI review, 11 Sep 2026')
    expect(notice).toHaveTextContent(/it is empty/i)
    expect(notice).toHaveTextContent(/add the holdings yourself/i)
    // Nothing on this notice may claim the allocation was applied to anything.
    expect(notice.textContent ?? '').not.toMatch(/—/)
    expect(screen.queryByTestId('ai-suggestion-allocations')).not.toBeInTheDocument()
  })

  it('adds the new ledger to the tab strip and makes it the one being viewed', async () => {
    await applyASuggestion()

    const tab = await screen.findByRole('tab', { name: 'AI review, 11 Sep 2026' })
    await waitFor(() => expect(tab).toHaveAttribute('aria-selected', 'true'))
  })

  it('surfaces the 4-ledger cap in the same words the manual "+ New ledger" flow uses, and creates nothing', async () => {
    createSuggestionLedger.mockRejectedValue(new LedgerCapReachedError())

    await applyASuggestion()

    const notice = await screen.findByTestId('apply-suggestion-notice')
    expect(notice).toHaveTextContent(
      'You already have 4 ledgers, the most this household can hold. Delete one to create another.',
    )
    expect(screen.queryByRole('tab', { name: 'AI review, 11 Sep 2026' })).not.toBeInTheDocument()
  })

  it('on a failed create, shows a plain message and puts the suggestion back rather than dropping it', async () => {
    createSuggestionLedger.mockRejectedValue(new LedgersApiError(500, 'boom'))

    await applyASuggestion()

    const notice = await screen.findByTestId('apply-suggestion-notice')
    expect(notice).toHaveTextContent('Something went wrong. Please try again.')
    // The suggestion is not silently lost: the card is back on the page.
    expect(await screen.findByTestId('ai-suggestion-allocations')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'AI review, 11 Sep 2026' })).not.toBeInTheDocument()
  })
})

function spyOnOnLine(value: boolean) {
  return vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
}

describe('Portfolio — Apply respects the offline write guard (SPEC.md §7)', () => {
  let onLineSpy: ReturnType<typeof spyOnOnLine> | null = null

  beforeEach(() => {
    listFamilyMembers.mockReset()
    listInstruments.mockReset()
    listHoldings.mockReset()
    createHolding.mockReset()
    updateHolding.mockReset()
    deleteHolding.mockReset()
    listLedgers.mockReset()
    createSuggestionLedger.mockReset()
    createBlankLedger.mockReset()
    createLedgerFromCurrent.mockReset()
    deleteLedger.mockReset()
    getAiSuggestionsUsage.mockReset()
    postCounselSuggestion.mockReset()
    track.mockReset()

    listFamilyMembers.mockResolvedValue({ members: [member], unreadableCount: 0, notYetEncryptedCount: 0 })
    listInstruments.mockResolvedValue([instrument])
    listLedgers.mockResolvedValue([baselineLedger])
    listHoldings.mockResolvedValue({ holdings: [holding], unreadableCount: 0, notYetEncryptedCount: 0 })
    getAiSuggestionsUsage.mockResolvedValue(usage())
    postCounselSuggestion.mockResolvedValue({
      status: 'ok',
      kind: 'counsel',
      suggestion: {
        allocations: ALLOCATIONS,
        reasoning: 'A simple illustration.',
        caveat: 'This is an illustration, not advice.',
      },
      usage: { plansUsed: 0, plansCap: 2, editsUsed: 1, editsCap: 2 },
    })
    createSuggestionLedger.mockResolvedValue(createdLedger)
  })

  afterEach(() => {
    onLineSpy?.mockRestore()
    onLineSpy = null
  })

  it('disables Apply and shows the offline message on the result card while offline, and never calls createSuggestionLedger', async () => {
    onLineSpy = spyOnOnLine(false)

    render(
      <MemoryRouter>
        <Portfolio />
      </MemoryRouter>,
    )
    await screen.findByText("Ananya Verma's holdings")
    fireEvent.click(await screen.findByRole('button', { name: /review this ledger/i }))
    fireEvent.click(await screen.findByRole('button', { name: /send this request/i }))
    await screen.findByTestId('ai-suggestion-allocations')

    const applyButton = screen.getByRole('button', { name: /add these to the plan/i })
    expect(applyButton).toBeDisabled()
    expect(screen.getByText(/nothing is queued in the background/i)).toBeInTheDocument()

    applyButton.click()
    expect(createSuggestionLedger).not.toHaveBeenCalled()
  })

  it('re-enables Apply, and lets it actually create the ledger, once the connection comes back', async () => {
    onLineSpy = spyOnOnLine(false)

    render(
      <MemoryRouter>
        <Portfolio />
      </MemoryRouter>,
    )
    await screen.findByText("Ananya Verma's holdings")
    fireEvent.click(await screen.findByRole('button', { name: /review this ledger/i }))
    fireEvent.click(await screen.findByRole('button', { name: /send this request/i }))
    await screen.findByTestId('ai-suggestion-allocations')
    expect(screen.getByRole('button', { name: /add these to the plan/i })).toBeDisabled()

    onLineSpy.mockReturnValue(true)
    fireEvent(window, new Event('online'))

    await waitFor(() => expect(screen.getByRole('button', { name: /add these to the plan/i })).not.toBeDisabled())

    fireEvent.click(screen.getByRole('button', { name: /add these to the plan/i }))
    await waitFor(() => expect(createSuggestionLedger).toHaveBeenCalledTimes(1))
  })
})

describe('createSuggestionLedger — the wire (M3c)', () => {
  const HOUSEHOLD_ID = '11111111-1111-4111-8111-111111111111'

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn())
    await unlockTestVault(HOUSEHOLD_ID)
  })

  it('posts an empty holdings array and a sealed name, never a plaintext one', async () => {
    // The real module, past this file's own vi.mock of it.
    const api = await vi.importActual<typeof import('@/lib/ledgers-api')>('@/lib/ledgers-api')

    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit | undefined)?.body)) as Record<string, unknown>
      return jsonResponse(
        {
          ledger: {
            id: body.id,
            householdId: HOUSEHOLD_ID,
            name: null,
            ciphertext: body.ciphertext,
            iv: body.iv,
            alg: body.alg,
            version: 1,
            isBaseline: false,
            origin: 'manual',
            snapshotOf: null,
            createdAt: '2026-09-11T00:00:00.000Z',
            updatedAt: '2026-09-11T00:00:00.000Z',
          },
        },
        201,
      )
    })

    const ledger = await api.createSuggestionLedger('token', 'AI review, 11 Sep 2026', {
      kind: 'counsel',
      allocations: ALLOCATIONS,
    })

    const calls = vi.mocked(fetch).mock.calls as unknown as Array<[unknown, RequestInit | undefined]>
    const body = requestBody(calls)
    expect(body.holdings).toEqual([])
    expect(body.source).toBe('blank')
    expect(body.name).toBeUndefined()
    expect(typeof body.ciphertext).toBe('string')
    // D-020: the name goes over the wire sealed, and comes back decrypted.
    expect(JSON.stringify(body)).not.toContain('AI review')
    expect(ledger.name).toBe('AI review, 11 Sep 2026')
    expect(ledger.suggestion).toEqual({ kind: 'counsel', allocations: ALLOCATIONS })

    vi.unstubAllGlobals()
  })
})
