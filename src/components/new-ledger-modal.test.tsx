import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { NewLedgerModal } from './new-ledger-modal'
import { LedgerCapReachedError, LedgerCopyError, type Ledger } from '@/lib/ledgers-api'
import type { Holding } from '@/lib/holdings-api'

const getToken = vi.fn().mockResolvedValue('test-token')
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken }),
}))

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

const createBlankLedger = vi.fn()
const createLedgerFromCurrent = vi.fn()
vi.mock('@/lib/ledgers-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ledgers-api')>()
  return {
    ...actual,
    createBlankLedger: (...args: unknown[]) => createBlankLedger(...args),
    createLedgerFromCurrent: (...args: unknown[]) => createLedgerFromCurrent(...args),
  }
})

const ledger: Ledger = {
  id: 'l2',
  householdId: 'h1',
  name: 'New strategy',
  // As handed back by src/lib/ledgers-api.ts: already decrypted, so the
  // component under test never sees the envelope itself.
  ciphertext: 'Y2lwaGVydGV4dA',
  iv: 'aXYtYnl0ZXM',
  alg: 'AES-256-GCM',
  version: 1,
  isBaseline: false,
  origin: 'manual',
  snapshotOf: 'baseline',
  createdAt: '',
  updatedAt: '',
}

const holdings: Holding[] = []

describe('NewLedgerModal', () => {
  beforeEach(() => {
    track.mockReset()
    createBlankLedger.mockReset()
    createLedgerFromCurrent.mockReset()
    getToken.mockClear()
  })

  it('validates name length: submit is disabled for an empty or whitespace-only name and enables once valid', () => {
    render(<NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={0} onCreated={vi.fn()} />)

    const submit = screen.getByRole('button', { name: /create ledger/i })
    const nameInput = screen.getByLabelText(/ledger name/i)

    expect(submit).toBeDisabled()

    fireEvent.change(nameInput, { target: { value: '   ' } })
    expect(submit).toBeDisabled()

    fireEvent.change(nameInput, { target: { value: 'Aggressive growth' } })
    expect(submit).toBeEnabled()

    // The input itself enforces the 60-char ceiling.
    expect(nameInput).toHaveAttribute('maxlength', '60')
  })

  it('does not call the API when the submit button is disabled by an empty name', () => {
    const onCreated = vi.fn()
    render(
      <NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={0} onCreated={onCreated} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /create ledger/i }))

    expect(createBlankLedger).not.toHaveBeenCalled()
    expect(createLedgerFromCurrent).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('creates a ledger by copying Current and fires ledger_created with source "copy"', async () => {
    createLedgerFromCurrent.mockResolvedValue(ledger)
    const onCreated = vi.fn()
    render(
      <NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={0} onCreated={onCreated} />,
    )

    fireEvent.change(screen.getByLabelText(/ledger name/i), { target: { value: 'New strategy' } })
    fireEvent.click(screen.getByRole('button', { name: /create ledger/i }))

    await waitFor(() => expect(createLedgerFromCurrent).toHaveBeenCalledWith('test-token', 'New strategy', holdings))
    expect(track).toHaveBeenCalledWith('ledger_created', { source: 'copy' })
    expect(onCreated).toHaveBeenCalledWith(ledger, 'copy')
  })

  it('creates a blank ledger and fires ledger_created with source "blank"', async () => {
    createBlankLedger.mockResolvedValue(ledger)
    const onCreated = vi.fn()
    render(
      <NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={0} onCreated={onCreated} />,
    )

    fireEvent.change(screen.getByLabelText(/ledger name/i), { target: { value: 'New strategy' } })
    fireEvent.click(screen.getByRole('radio', { name: /start empty/i }))
    fireEvent.click(screen.getByRole('button', { name: /create ledger/i }))

    await waitFor(() => expect(createBlankLedger).toHaveBeenCalledWith('test-token', 'New strategy'))
    expect(track).toHaveBeenCalledWith('ledger_created', { source: 'blank' })
    expect(onCreated).toHaveBeenCalledWith(ledger, 'blank')
  })

  it('never fires ledger_created optimistically — only after the API call resolves', async () => {
    let resolveCreate: (value: Ledger) => void = () => {}
    createLedgerFromCurrent.mockReturnValue(
      new Promise<Ledger>((resolve) => {
        resolveCreate = resolve
      }),
    )
    render(<NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={0} onCreated={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/ledger name/i), { target: { value: 'New strategy' } })
    fireEvent.click(screen.getByRole('button', { name: /create ledger/i }))

    expect(track).not.toHaveBeenCalledWith('ledger_created', expect.anything())
    resolveCreate(ledger)
    await waitFor(() => expect(track).toHaveBeenCalledWith('ledger_created', { source: 'copy' }))
  })

  it('keeps the modal open and shows an error when the create call fails', async () => {
    createLedgerFromCurrent.mockRejectedValue(new Error('boom'))
    const onOpenChange = vi.fn()
    const onCreated = vi.fn()
    render(
      <NewLedgerModal
        open
        onOpenChange={onOpenChange}
        sourceHoldings={holdings}
        unreadableCount={0}
        onCreated={onCreated}
      />,
    )

    fireEvent.change(screen.getByLabelText(/ledger name/i), { target: { value: 'New strategy' } })
    fireEvent.click(screen.getByRole('button', { name: /create ledger/i }))

    await screen.findByText(/something went wrong/i)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows the cap message when the API reports the ledger cap is reached', async () => {
    createLedgerFromCurrent.mockRejectedValue(new LedgerCapReachedError())
    render(<NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={0} onCreated={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/ledger name/i), { target: { value: 'New strategy' } })
    fireEvent.click(screen.getByRole('button', { name: /create ledger/i }))

    await screen.findByText(/already have 4 ledgers/i)
  })

  it('shows the copy-failed message and says nothing was changed when the copy fails', async () => {
    createLedgerFromCurrent.mockRejectedValue(new LedgerCopyError([{ id: 'h1', reason: 'DECRYPT_FAILED' }], 1))
    render(<NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={0} onCreated={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/ledger name/i), { target: { value: 'New strategy' } })
    fireEvent.click(screen.getByRole('button', { name: /create ledger/i }))

    await screen.findByText(/copy could not be made, so nothing was changed/i)
  })

  it('disables "Copy my current holdings" and defaults to "Start empty" when unreadableCount > 0', () => {
    render(<NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={2} onCreated={vi.fn()} />)

    const copyRadio = screen.getByRole('radio', { name: /copy my current holdings/i })
    const blankRadio = screen.getByRole('radio', { name: /start empty/i })

    expect(copyRadio).toBeDisabled()
    expect(blankRadio).toBeChecked()
    expect(screen.getByText(/some holdings could not be read/i)).toBeInTheDocument()
  })

  it('never copies when holdings become unreadable while the modal is already open', async () => {
    // `source` is initialised once, on mount. A household whose holdings reload
    // mid-modal — a refetch landing, a row failing to decrypt on retry — leaves
    // `source` on 'copy' from mount while `unreadableCount` has since risen.
    // Only the guard inside handleSubmit stands between that and a ledger the
    // user believes mirrors what they own but is silently missing rows.
    const { rerender } = render(
      <NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={0} onCreated={vi.fn()} />,
    )
    fireEvent.change(screen.getByLabelText(/ledger name/i), { target: { value: 'Mid-flight' } })
    expect(screen.getByRole('radio', { name: /copy my current holdings/i })).toBeChecked()

    rerender(
      <NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={2} onCreated={vi.fn()} />,
    )
    // Awaited inside act(): the guard returns before `await getToken()`, so a
    // synchronous assertion here would pass even with the guard removed —
    // handleSubmit would simply not have reached the copy call yet. Flushing
    // the microtask queue is what makes this test able to fail.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create ledger/i }))
    })

    expect(createLedgerFromCurrent).not.toHaveBeenCalled()
  })

  it('clears the name field on reopen — the dialog stays mounted, not remounted, between opens', () => {
    const { rerender } = render(
      <NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={0} onCreated={vi.fn()} />,
    )
    fireEvent.change(screen.getByLabelText(/ledger name/i), { target: { value: 'Aggressive growth' } })
    expect(screen.getByLabelText(/ledger name/i)).toHaveValue('Aggressive growth')

    rerender(
      <NewLedgerModal open={false} onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={0} onCreated={vi.fn()} />,
    )
    rerender(
      <NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={0} onCreated={vi.fn()} />,
    )

    expect(screen.getByLabelText(/ledger name/i)).toHaveValue('')
  })

  it('does not reset the name mid-session when unreadableCount changes while the modal stays open', () => {
    const { rerender } = render(
      <NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={0} onCreated={vi.fn()} />,
    )
    fireEvent.change(screen.getByLabelText(/ledger name/i), { target: { value: 'Mid-flight' } })

    rerender(
      <NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={2} onCreated={vi.fn()} />,
    )

    expect(screen.getByLabelText(/ledger name/i)).toHaveValue('Mid-flight')
  })

  it('submits with source "blank" when unreadableCount > 0 forced the default', async () => {
    createBlankLedger.mockResolvedValue(ledger)
    render(<NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={3} onCreated={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/ledger name/i), { target: { value: 'New strategy' } })
    fireEvent.click(screen.getByRole('button', { name: /create ledger/i }))

    await waitFor(() => expect(createBlankLedger).toHaveBeenCalledWith('test-token', 'New strategy'))
    expect(createLedgerFromCurrent).not.toHaveBeenCalled()
  })

  // G2 — goal capture as a third option in this same modal.
  describe('goal step', () => {
    beforeEach(() => {
      // shouldAdvanceTime: fake only `Date`, let real timers (and therefore
      // `waitFor`'s own polling) keep running — otherwise `waitFor` never
      // sees the mocked promise resolve and every async assertion here hangs.
      vi.useFakeTimers({ shouldAdvanceTime: true })
      vi.setSystemTime(new Date('2026-09-09T00:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    function openGoalStep() {
      render(<NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={0} onCreated={vi.fn()} />)
      fireEvent.click(screen.getByRole('radio', { name: /plan toward a goal/i }))
    }

    it('swaps the modal body in place rather than opening a second surface', () => {
      render(<NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={0} onCreated={vi.fn()} />)
      const dialogsBefore = screen.getAllByRole('dialog')
      expect(dialogsBefore).toHaveLength(1)
      const dialogBefore = dialogsBefore[0]

      fireEvent.click(screen.getByRole('radio', { name: /plan toward a goal/i }))

      const dialogsAfter = screen.getAllByRole('dialog')
      expect(dialogsAfter).toHaveLength(1)
      expect(dialogsAfter[0]).toBe(dialogBefore)

      // The blank/copy options are gone, replaced in place — not a second surface.
      expect(screen.queryByRole('radio', { name: /copy my current holdings/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: /start empty/i })).not.toBeInTheDocument()
      expect(screen.getByLabelText(/what are you saving for/i)).toBeInTheDocument()
    })

    it('prefills the horizon to target year minus current year, using a fixed clock', () => {
      // System time faked to 2026-09-09, so "current year" is 2026.
      openGoalStep()
      fireEvent.change(screen.getByLabelText(/target year/i), { target: { value: '2033' } })
      expect(screen.getByLabelText(/years to reach it/i)).toHaveValue('7')
    })

    it('shows an inline error and keeps the modal open for an over-length label', () => {
      openGoalStep()
      fireEvent.change(screen.getByLabelText(/ledger name/i), { target: { value: 'A goal' } })
      fireEvent.change(screen.getByLabelText(/what are you saving for/i), { target: { value: 'x'.repeat(81) } })
      fireEvent.change(screen.getByLabelText(/target amount/i), { target: { value: '500000' } })
      fireEvent.change(screen.getByLabelText(/target year/i), { target: { value: '2033' } })

      fireEvent.click(screen.getByRole('button', { name: /create ledger/i }))

      expect(screen.getByText(/80 characters or fewer/i)).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(createBlankLedger).not.toHaveBeenCalled()
    })

    it('shows an inline error and keeps the modal open for a zero target amount', () => {
      openGoalStep()
      fireEvent.change(screen.getByLabelText(/ledger name/i), { target: { value: 'A goal' } })
      fireEvent.change(screen.getByLabelText(/what are you saving for/i), { target: { value: 'A house' } })
      fireEvent.change(screen.getByLabelText(/target amount/i), { target: { value: '0' } })
      fireEvent.change(screen.getByLabelText(/target year/i), { target: { value: '2033' } })

      fireEvent.click(screen.getByRole('button', { name: /create ledger/i }))

      expect(screen.getByText(/whole rupee amount greater than zero/i)).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(createBlankLedger).not.toHaveBeenCalled()
    })

    it('shows an inline error and keeps the modal open for a non-integer target amount', () => {
      openGoalStep()
      fireEvent.change(screen.getByLabelText(/ledger name/i), { target: { value: 'A goal' } })
      fireEvent.change(screen.getByLabelText(/what are you saving for/i), { target: { value: 'A house' } })
      fireEvent.change(screen.getByLabelText(/target amount/i), { target: { value: '500000.5' } })
      fireEvent.change(screen.getByLabelText(/target year/i), { target: { value: '2033' } })

      fireEvent.click(screen.getByRole('button', { name: /create ledger/i }))

      expect(screen.getByText(/whole rupee amount greater than zero/i)).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(createBlankLedger).not.toHaveBeenCalled()
    })

    it('shows an inline error and keeps the modal open for an out-of-range target year', () => {
      openGoalStep()
      fireEvent.change(screen.getByLabelText(/ledger name/i), { target: { value: 'A goal' } })
      fireEvent.change(screen.getByLabelText(/what are you saving for/i), { target: { value: 'A house' } })
      fireEvent.change(screen.getByLabelText(/target amount/i), { target: { value: '500000' } })
      fireEvent.change(screen.getByLabelText(/target year/i), { target: { value: '99999' } })

      fireEvent.click(screen.getByRole('button', { name: /create ledger/i }))

      expect(screen.getByText(/valid target year/i)).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(createBlankLedger).not.toHaveBeenCalled()
    })

    it('clears every goal field and resets to the options step on reopen — the dialog stays mounted, not remounted', () => {
      const { rerender } = render(
        <NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={0} onCreated={vi.fn()} />,
      )
      fireEvent.click(screen.getByRole('radio', { name: /plan toward a goal/i }))
      fireEvent.change(screen.getByLabelText(/what are you saving for/i), { target: { value: 'A house' } })
      fireEvent.change(screen.getByLabelText(/target amount/i), { target: { value: '500000' } })
      fireEvent.change(screen.getByLabelText(/target year/i), { target: { value: '2033' } })
      fireEvent.change(screen.getByLabelText(/what can you add each month/i), { target: { value: '5000' } })

      rerender(
        <NewLedgerModal open={false} onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={0} onCreated={vi.fn()} />,
      )
      rerender(
        <NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={0} onCreated={vi.fn()} />,
      )

      // Back on the options step, not the goal step, with the blank/copy options showing again.
      expect(screen.getByRole('radio', { name: /copy my current holdings/i })).toBeInTheDocument()
      expect(screen.queryByLabelText(/what are you saving for/i)).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('radio', { name: /plan toward a goal/i }))
      expect(screen.getByLabelText(/what are you saving for/i)).toHaveValue('')
      expect(screen.getByLabelText(/target amount/i)).toHaveValue(null)
      expect(screen.getByLabelText(/target year/i)).toHaveValue(null)
      expect(screen.getByLabelText(/what can you add each month/i)).toHaveValue(null)
    })

    it('creates a hand ledger with a goal that stays origin "manual" via the same blank-ledger path', async () => {
      const goalLedger: Ledger = {
        ...ledger,
        origin: 'manual',
        goal: { label: 'A house', targetAmountInr: 500000, targetYear: 2033, monthlyCapacityInr: null },
      }
      createBlankLedger.mockResolvedValue(goalLedger)
      const onCreated = vi.fn()
      render(
        <NewLedgerModal open onOpenChange={vi.fn()} sourceHoldings={holdings} unreadableCount={0} onCreated={onCreated} />,
      )
      fireEvent.click(screen.getByRole('radio', { name: /plan toward a goal/i }))

      fireEvent.change(screen.getByLabelText(/ledger name/i), { target: { value: 'Toward the house' } })
      fireEvent.change(screen.getByLabelText(/what are you saving for/i), { target: { value: 'A house' } })
      fireEvent.change(screen.getByLabelText(/target amount/i), { target: { value: '500000' } })
      fireEvent.change(screen.getByLabelText(/target year/i), { target: { value: '2033' } })

      fireEvent.click(screen.getByRole('button', { name: /create ledger/i }))

      await waitFor(() =>
        expect(createBlankLedger).toHaveBeenCalledWith('test-token', 'Toward the house', {
          label: 'A house',
          targetAmountInr: 500000,
          targetYear: 2033,
          monthlyCapacityInr: null,
        }),
      )
      // Never the copy path, and never any AI/consent call — this is the same
      // hand-creation function a goalless blank ledger uses.
      expect(createLedgerFromCurrent).not.toHaveBeenCalled()
      expect(track).toHaveBeenCalledWith('ledger_created', { source: 'blank' })
      expect(onCreated).toHaveBeenCalledWith(goalLedger, 'blank')
      expect(onCreated.mock.calls[0][0].origin).toBe('manual')
    })
  })
})
