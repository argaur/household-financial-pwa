import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HoldingForm } from './holding-form'
import type { FamilyMember } from '@/lib/family-members-api'
import type { Instrument } from '@/lib/instruments-api'
import type { Holding } from '@/lib/holdings-api'
import { expectNoPortfolioShape } from '@/test/analytics-guard'

const getToken = vi.fn().mockResolvedValue('test-token')
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken }),
}))

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

const createHolding = vi.fn()
const updateHolding = vi.fn()
const deleteHolding = vi.fn()
vi.mock('@/lib/holdings-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/holdings-api')>()
  return {
    ...actual,
    createHolding: (...args: unknown[]) => createHolding(...args),
    updateHolding: (...args: unknown[]) => updateHolding(...args),
    deleteHolding: (...args: unknown[]) => deleteHolding(...args),
  }
})

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
  version: 3,
  createdAt: '',
  updatedAt: '',
}

describe('HoldingForm', () => {
  beforeEach(() => {
    createHolding.mockReset()
    updateHolding.mockReset()
    deleteHolding.mockReset()
    track.mockReset()
  })

  it('submit is disabled until member, instrument, and both amounts are filled', () => {
    render(
      <HoldingForm
        members={[member]}
        instruments={[instrument]}
        submitLabel="Add to plan"
        submittingLabel="Adding…"
        analyticsSurface="test"
        onSaved={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /add to plan/i })).toBeDisabled()
  })

  it('creates a holding and derives asset class label from the selected instrument', async () => {
    createHolding.mockResolvedValue(holding)
    const onSaved = vi.fn()
    render(
      <HoldingForm
        members={[member]}
        instruments={[instrument]}
        submitLabel="Add to plan"
        submittingLabel="Adding…"
        analyticsSurface="test"
        onSaved={onSaved}
      />,
    )

    fireEvent.click(screen.getByRole('combobox', { name: /instrument/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Large Cap Index Fund' }))
    await waitFor(() => expect(screen.getByLabelText(/asset class/i)).toHaveValue('Equity'))

    fireEvent.change(screen.getByLabelText(/amount invested/i), { target: { value: '10000' } })
    fireEvent.change(screen.getByLabelText(/current value/i), { target: { value: '10500' } })

    fireEvent.click(screen.getByRole('button', { name: /add to plan/i }))

    await waitFor(() =>
      // Third argument is ledgerId — undefined here because no `ledgerId`
      // prop was passed, same as adding to Current.
      expect(createHolding).toHaveBeenCalledWith(
        'test-token',
        {
          memberId: 'm1',
          instrumentId: 'i1',
          // Derived in the browser now — the server can no longer see the
          // instrument, so it cannot denormalize the asset class.
          assetClass: 'equity',
          investedAmount: '10000',
          currentValue: '10500',
          isEmergencyFund: false,
        },
        undefined,
      ),
    )
    expect(onSaved).toHaveBeenCalledWith(holding)
  })

  it('fires holding_created without asset_class or instrument_id — those describe portfolio shape', async () => {
    createHolding.mockResolvedValue(holding)
    render(
      <HoldingForm
        members={[member]}
        instruments={[instrument]}
        submitLabel="Add to plan"
        submittingLabel="Adding…"
        analyticsSurface="test"
        onSaved={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('combobox', { name: /instrument/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Large Cap Index Fund' }))
    await waitFor(() => expect(screen.getByLabelText(/asset class/i)).toHaveValue('Equity'))
    fireEvent.change(screen.getByLabelText(/amount invested/i), { target: { value: '10000' } })
    fireEvent.change(screen.getByLabelText(/current value/i), { target: { value: '10500' } })
    fireEvent.click(screen.getByRole('button', { name: /add to plan/i }))

    await waitFor(() => expect(track).toHaveBeenCalledWith('holding_created', { member_id: 'm1' }))
    const call = track.mock.calls.find((c) => c[0] === 'holding_created')!
    expectNoPortfolioShape(call[1] as Record<string, unknown>)
  })

  it('fires holding_updated without asset_class or instrument_id — those describe portfolio shape', async () => {
    updateHolding.mockResolvedValue({ ...holding, currentValue: '12000' })
    render(
      <HoldingForm
        members={[member]}
        instruments={[instrument]}
        initialHolding={holding}
        submitLabel="Save changes"
        submittingLabel="Saving…"
        analyticsSurface="test"
        onSaved={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText(/current value/i), { target: { value: '12000' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(track).toHaveBeenCalledWith('holding_updated', { member_id: 'm1' }))
    const call = track.mock.calls.find((c) => c[0] === 'holding_updated')!
    expectNoPortfolioShape(call[1] as Record<string, unknown>)
  })

  it('pre-fills fields from initialHolding and calls updateHolding on save (edit mode)', async () => {
    updateHolding.mockResolvedValue({ ...holding, currentValue: '12000' })
    const onSaved = vi.fn()
    render(
      <HoldingForm
        members={[member]}
        instruments={[instrument]}
        initialHolding={holding}
        submitLabel="Save changes"
        submittingLabel="Saving…"
        analyticsSurface="test"
        onSaved={onSaved}
      />,
    )

    const currentValueInput = screen.getByLabelText(/current value/i) as HTMLInputElement
    expect(currentValueInput.value).toBe('10500')

    fireEvent.change(currentValueInput, { target: { value: '12000' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(updateHolding).toHaveBeenCalledWith(
        'test-token',
        'hold1',
        {
          memberId: 'm1',
          instrumentId: 'i1',
          assetClass: 'equity',
          investedAmount: '10000',
          currentValue: '12000',
          isEmergencyFund: false,
        },
        // The version this edit was made against — the server refuses the
        // write if the stored row has moved on.
        3,
      ),
    )
    expect(onSaved).toHaveBeenCalled()
  })

  it('shows an inline error and does not call onSaved when the save fails', async () => {
    const { HoldingsApiError } = await import('@/lib/holdings-api')
    createHolding.mockRejectedValue(new HoldingsApiError(400, 'invalid_holding'))
    const onSaved = vi.fn()
    render(
      <HoldingForm
        members={[member]}
        instruments={[instrument]}
        submitLabel="Add to plan"
        submittingLabel="Adding…"
        analyticsSurface="test"
        onSaved={onSaved}
      />,
    )

    fireEvent.click(screen.getByRole('combobox', { name: /instrument/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Large Cap Index Fund' }))
    fireEvent.change(screen.getByLabelText(/amount invested/i), { target: { value: '10000' } })
    fireEvent.change(screen.getByLabelText(/current value/i), { target: { value: '10500' } })
    fireEvent.click(screen.getByRole('button', { name: /add to plan/i }))

    await screen.findByText(/check the member, instrument, and amounts/i)
    expect(onSaved).not.toHaveBeenCalled()
  })

  // The ledgerId prop is what makes this form ledger-aware (D-016 Chunk 3).
  // Everything below is gated on it, so Current's behaviour is untouched.
  describe('inside a non-baseline ledger', () => {
    function renderInLedger(overrides: Partial<Parameters<typeof HoldingForm>[0]> = {}) {
      return render(
        <HoldingForm
          members={[member]}
          instruments={[instrument]}
          initialHolding={holding}
          submitLabel="Save changes"
          submittingLabel="Saving…"
          analyticsSurface="test"
          ledgerId="ledger-1"
          onSaved={vi.fn()}
          onDeleted={vi.fn()}
          {...overrides}
        />,
      )
    }

    it('threads ledgerId into createHolding and fires ledger_edited on add', async () => {
      createHolding.mockResolvedValue(holding)
      render(
        <HoldingForm
          members={[member]}
          instruments={[instrument]}
          submitLabel="Add to plan"
          submittingLabel="Adding…"
          analyticsSurface="test"
          ledgerId="ledger-1"
          onSaved={vi.fn()}
        />,
      )

      fireEvent.click(screen.getByRole('combobox', { name: /instrument/i }))
      fireEvent.click(await screen.findByRole('option', { name: 'Large Cap Index Fund' }))
      fireEvent.change(screen.getByLabelText(/amount invested/i), { target: { value: '10000' } })
      fireEvent.change(screen.getByLabelText(/current value/i), { target: { value: '10500' } })
      fireEvent.click(screen.getByRole('button', { name: /add to plan/i }))

      await waitFor(() => expect(createHolding).toHaveBeenCalledWith('test-token', expect.any(Object), 'ledger-1'))
      expect(track).toHaveBeenCalledWith('ledger_edited', {})
    })

    it('fires ledger_edited on an edit, and never carries portfolio shape', async () => {
      updateHolding.mockResolvedValue({ ...holding, currentValue: '12000' })
      renderInLedger()

      fireEvent.change(screen.getByLabelText(/current value/i), { target: { value: '12000' } })
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

      await waitFor(() => expect(track).toHaveBeenCalledWith('ledger_edited', {}))
      // An edit keeps the holding in whichever ledger it already lives in —
      // updateHolding must never grow a ledgerId argument.
      expect(updateHolding).toHaveBeenCalledWith('test-token', 'hold1', expect.any(Object), 3)
      const call = track.mock.calls.find((c) => c[0] === 'ledger_edited')!
      expectNoPortfolioShape(call[1] as Record<string, unknown>)
    })

    it('offers Remove holding only when editing inside a ledger, never on Current and never on add', () => {
      const { unmount } = renderInLedger()
      expect(screen.getByRole('button', { name: /remove holding/i })).toBeInTheDocument()
      unmount()

      // Editing on the Current tab: no ledgerId, so no remove affordance.
      const { unmount: unmountCurrent } = renderInLedger({ ledgerId: undefined })
      expect(screen.queryByRole('button', { name: /remove holding/i })).not.toBeInTheDocument()
      unmountCurrent()

      // Adding inside a ledger: nothing exists yet to remove.
      renderInLedger({ initialHolding: undefined })
      expect(screen.queryByRole('button', { name: /remove holding/i })).not.toBeInTheDocument()
    })

    it('requires a confirmation step before deleting, and Cancel backs out without calling the API', async () => {
      renderInLedger()

      fireEvent.click(screen.getByRole('button', { name: /remove holding/i }))
      await screen.findByText(/remove this holding from this ledger/i)
      expect(deleteHolding).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
      await waitFor(() => expect(screen.queryByText(/remove this holding from this ledger/i)).not.toBeInTheDocument())
      expect(deleteHolding).not.toHaveBeenCalled()
    })

    it('deletes by id alone, fires ledger_edited, and calls onDeleted', async () => {
      deleteHolding.mockResolvedValue(undefined)
      const onDeleted = vi.fn()
      renderInLedger({ onDeleted })

      fireEvent.click(screen.getByRole('button', { name: /remove holding/i }))
      fireEvent.click(await screen.findByRole('button', { name: /^removing|^remove holding$/i }))

      // By id only — the route takes no ?ledgerId= for DELETE.
      await waitFor(() => expect(deleteHolding).toHaveBeenCalledWith('test-token', 'hold1'))
      expect(deleteHolding).toHaveBeenCalledTimes(1)
      await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('hold1'))
      expect(track).toHaveBeenCalledWith('ledger_edited', {})
    })

    it('shows an inline error and does not call onDeleted when the delete fails', async () => {
      const { HoldingsApiError } = await import('@/lib/holdings-api')
      deleteHolding.mockRejectedValue(new HoldingsApiError(404, 'not_found'))
      const onDeleted = vi.fn()
      renderInLedger({ onDeleted })

      fireEvent.click(screen.getByRole('button', { name: /remove holding/i }))
      fireEvent.click(await screen.findByRole('button', { name: /^removing|^remove holding$/i }))

      await screen.findByText(/couldn't remove that holding/i)
      expect(onDeleted).not.toHaveBeenCalled()
      // Back to the un-confirmed state, so a retry is one deliberate click away.
      expect(screen.getByRole('button', { name: /remove holding/i })).toBeInTheDocument()
      expect(track).not.toHaveBeenCalledWith('ledger_edited', {})
    })
  })
})
