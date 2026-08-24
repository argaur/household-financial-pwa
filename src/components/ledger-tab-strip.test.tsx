import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LedgerTabStrip, MAX_NON_BASELINE_LEDGERS } from './ledger-tab-strip'
import type { Ledger } from '@/lib/ledgers-api'

const getToken = vi.fn().mockResolvedValue('test-token')
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken }),
}))

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

const deleteLedger = vi.fn()
vi.mock('@/lib/ledgers-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ledgers-api')>()
  return {
    ...actual,
    deleteLedger: (...args: unknown[]) => deleteLedger(...args),
  }
})

function makeLedger(overrides: Partial<Ledger>): Ledger {
  return {
    id: 'l1',
    householdId: 'h1',
    name: 'Current',
    isBaseline: true,
    origin: 'manual',
    snapshotOf: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

const baseline = makeLedger({ id: 'baseline', name: 'Current', isBaseline: true })
const strategyA = makeLedger({ id: 'a', name: 'Aggressive growth', isBaseline: false, origin: 'manual' })

describe('LedgerTabStrip', () => {
  beforeEach(() => {
    track.mockReset()
    deleteLedger.mockReset()
    getToken.mockClear()
  })

  it('renders Current first with no delete affordance, and offers delete on a non-baseline tab', () => {
    render(
      <LedgerTabStrip
        ledgers={[baseline, strategyA]}
        activeLedgerId={baseline.id}
        onSelect={vi.fn()}
        sourceHoldings={[]}
        unreadableCount={0}
        onLedgerCreated={vi.fn()}
        onLedgerDeleted={vi.fn()}
      />,
    )

    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveTextContent('Current')
    expect(tabs[1]).toHaveTextContent('Aggressive growth')

    expect(screen.queryByRole('button', { name: /delete current/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete aggressive growth/i })).toBeInTheDocument()
  })

  it('calls onSelect when a tab is clicked but never fires ledger_switched (that is Chunk 3)', () => {
    const onSelect = vi.fn()
    render(
      <LedgerTabStrip
        ledgers={[baseline, strategyA]}
        activeLedgerId={baseline.id}
        onSelect={onSelect}
        sourceHoldings={[]}
        unreadableCount={0}
        onLedgerCreated={vi.fn()}
        onLedgerDeleted={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Aggressive growth' }))
    expect(onSelect).toHaveBeenCalledWith('a')
    expect(track).not.toHaveBeenCalledWith('ledger_switched', expect.anything())
  })

  it('deletes a non-baseline ledger and fires ledger_deleted', async () => {
    deleteLedger.mockResolvedValue(undefined)
    const onLedgerDeleted = vi.fn()
    render(
      <LedgerTabStrip
        ledgers={[baseline, strategyA]}
        activeLedgerId={baseline.id}
        onSelect={vi.fn()}
        sourceHoldings={[]}
        unreadableCount={0}
        onLedgerCreated={vi.fn()}
        onLedgerDeleted={onLedgerDeleted}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /delete aggressive growth/i }))

    await waitFor(() => expect(deleteLedger).toHaveBeenCalledWith('test-token', 'a'))
    expect(track).toHaveBeenCalledWith('ledger_deleted', {})
    expect(onLedgerDeleted).toHaveBeenCalledWith('a')
  })

  it('disables + New at the 4-ledger cap and fires ledger_cap_reached on attempt, without opening the modal', () => {
    const nonBaseline = Array.from({ length: MAX_NON_BASELINE_LEDGERS }, (_, i) =>
      makeLedger({ id: `strategy-${i}`, name: `Strategy ${i}`, isBaseline: false }),
    )
    render(
      <LedgerTabStrip
        ledgers={[baseline, ...nonBaseline]}
        activeLedgerId={baseline.id}
        onSelect={vi.fn()}
        sourceHoldings={[]}
        unreadableCount={0}
        onLedgerCreated={vi.fn()}
        onLedgerDeleted={vi.fn()}
      />,
    )

    const newButton = screen.getByRole('button', { name: '+ New' })
    expect(newButton).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(newButton)

    expect(track).toHaveBeenCalledWith('ledger_cap_reached', {})
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText(/4-ledger limit/i)).toBeInTheDocument()
  })

  it('opens the create modal from + New when under the cap', async () => {
    render(
      <LedgerTabStrip
        ledgers={[baseline]}
        activeLedgerId={baseline.id}
        onSelect={vi.fn()}
        sourceHoldings={[]}
        unreadableCount={0}
        onLedgerCreated={vi.fn()}
        onLedgerDeleted={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '+ New' }))
    await screen.findByRole('dialog')
  })

  it('does not overflow at 390px — the strip is horizontally scrollable rather than wrapping or clipping', () => {
    render(
      <LedgerTabStrip
        ledgers={[baseline, strategyA]}
        activeLedgerId={baseline.id}
        onSelect={vi.fn()}
        sourceHoldings={[]}
        unreadableCount={0}
        onLedgerCreated={vi.fn()}
        onLedgerDeleted={vi.fn()}
      />,
    )

    // jsdom has no layout engine, so overflow can't be measured — assert the
    // scroll-container class carries the behavior instead.
    expect(screen.getByTestId('ledger-tab-scroll')).toHaveClass('overflow-x-auto')
  })
})
