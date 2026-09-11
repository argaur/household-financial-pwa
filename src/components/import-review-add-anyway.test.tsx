import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImportReviewScreen } from './import-review-screen'
import { expectNoAxeViolations } from '@/test/axe'
import type { BucketedRow, BucketedRows } from '@/lib/import-bucketing'

/**
 * H3 — "Add anyway" on Possible duplicate rows. A separate file from
 * `import-review-screen.test.tsx` and `import-review-screen-rejects-download.test.tsx`
 * per this step's constraint against editing existing test files except for
 * genuine expected-value updates.
 */

const trackMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/analytics', () => ({ track: trackMock }))

const member = { id: 'm1', name: 'Gaurav' } as BucketedRow['member']

function readyRow(overrides: Partial<BucketedRow> = {}): BucketedRow {
  return {
    bucket: 'ready',
    member,
    rowNumber: 2,
    instrumentLabel: 'Parag Parikh Flexi Cap',
    reasons: [],
    resolved: {
      instrumentId: 'i1',
      instrumentName: 'Parag Parikh Flexi Cap',
      investedAmount: 50000,
      currentValue: 62000,
      units: null,
      monthlySip: 5000,
      startDate: null,
      maturityDate: null,
      nominee: null,
      isEmergencyFund: false,
      notes: null,
    },
    ...overrides,
  }
}

function duplicateRow(overrides: Partial<BucketedRow> = {}): BucketedRow {
  return {
    bucket: 'possibleDuplicate',
    member,
    rowNumber: 4,
    instrumentLabel: 'HDFC Balanced Advantage',
    reasons: [],
    resolved: {
      instrumentId: 'i2',
      instrumentName: 'HDFC Balanced Advantage',
      investedAmount: 30000,
      currentValue: 31000,
      units: null,
      monthlySip: null,
      startDate: null,
      maturityDate: null,
      nominee: null,
      isEmergencyFund: false,
      notes: null,
    },
    ...overrides,
  }
}

function buckets(overrides: Partial<BucketedRows> = {}): BucketedRows {
  return {
    ready: [readyRow()],
    needsAttention: [],
    possibleDuplicate: [duplicateRow()],
    skipped: [],
    ...overrides,
  }
}

describe('ImportReviewScreen — Add anyway on Possible duplicate', () => {
  beforeEach(() => {
    trackMock.mockClear()
  })

  it('renders an "Add anyway" affordance on a Possible duplicate row', () => {
    render(<ImportReviewScreen buckets={buckets()} ledgerName="Current" onCommit={vi.fn()} />)
    expect(screen.getByRole('button', { name: /add anyway/i })).toBeInTheDocument()
  })

  it('does not render "Add anyway" on Ready rows', () => {
    render(<ImportReviewScreen buckets={buckets()} ledgerName="Current" onCommit={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: /add anyway/i })).toHaveLength(1)
  })

  it('tapping "Add anyway" promotes the row into the commit count and CTA label', () => {
    render(<ImportReviewScreen buckets={buckets()} ledgerName="Current" onCommit={vi.fn()} />)
    expect(screen.getByRole('button', { name: /add 1 holding to current/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /add anyway/i }))

    expect(screen.getByRole('button', { name: /add 2 holdings to current/i })).toBeInTheDocument()
  })

  it('promotion is visibly marked and the row stays in the Possible duplicate section', () => {
    render(<ImportReviewScreen buckets={buckets()} ledgerName="Current" onCommit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add anyway/i }))

    expect(screen.getByText('HDFC Balanced Advantage').closest('[data-testid="import-review-row"]')).toBeInTheDocument()
    expect(screen.getByText(/added/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument()
  })

  it('undo demotes the row back out of the commit count without re-showing "Add anyway" being needed twice', () => {
    render(<ImportReviewScreen buckets={buckets()} ledgerName="Current" onCommit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add anyway/i }))
    expect(screen.getByRole('button', { name: /add 2 holdings to current/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /undo/i }))

    expect(screen.getByRole('button', { name: /add 1 holding to current/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add anyway/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument()
  })

  it('onCommit receives Ready plus promoted rows, and never Needs-attention or Skipped', () => {
    const onCommit = vi.fn()
    const dup = duplicateRow()
    const ready = readyRow()
    render(
      <ImportReviewScreen
        buckets={buckets({ ready: [ready], possibleDuplicate: [dup] })}
        ledgerName="Current"
        onCommit={onCommit}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /add anyway/i }))
    fireEvent.click(screen.getByRole('button', { name: /add 2 holdings to current/i }))

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith([ready, dup])
  })

  it('fires bulk_import_duplicate_overridden once on promotion, with no properties', () => {
    render(<ImportReviewScreen buckets={buckets()} ledgerName="Current" onCommit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add anyway/i }))

    expect(trackMock).toHaveBeenCalledTimes(1)
    expect(trackMock).toHaveBeenCalledWith('bulk_import_duplicate_overridden', {})
  })

  it('undo does not fire the event again, and re-promoting fires it again', () => {
    render(<ImportReviewScreen buckets={buckets()} ledgerName="Current" onCommit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add anyway/i }))
    expect(trackMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /undo/i }))
    expect(trackMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /add anyway/i }))
    expect(trackMock).toHaveBeenCalledTimes(2)
  })

  it('multiple Possible duplicate rows promote independently', () => {
    const dupA = duplicateRow({ rowNumber: 4, instrumentLabel: 'HDFC Balanced Advantage' })
    const dupB = duplicateRow({ rowNumber: 7, instrumentLabel: 'ICICI Prudential Bluechip' })
    render(
      <ImportReviewScreen
        buckets={buckets({ possibleDuplicate: [dupA, dupB] })}
        ledgerName="Current"
        onCommit={vi.fn()}
      />,
    )

    const addAnywayButtons = screen.getAllByRole('button', { name: /add anyway/i })
    expect(addAnywayButtons).toHaveLength(2)
    fireEvent.click(addAnywayButtons[0])

    expect(screen.getByRole('button', { name: /add 2 holdings to current/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /add anyway/i })).toHaveLength(1)
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument()
  })

  it('the "Add anyway" and "Undo" affordances are at least 44px tall and never use sm:', () => {
    render(<ImportReviewScreen buckets={buckets()} ledgerName="Current" onCommit={vi.fn()} />)
    const addAnyway = screen.getByRole('button', { name: /add anyway/i })
    expect(addAnyway.className).toMatch(/min-h-11/)
    expect(addAnyway.className).not.toMatch(/(^|\s)sm:(grid-cols|w-auto|flex-row|inline-flex)/)

    fireEvent.click(addAnyway)
    const undo = screen.getByRole('button', { name: /undo/i })
    expect(undo.className).toMatch(/min-h-11/)
    expect(undo.className).not.toMatch(/(^|\s)sm:(grid-cols|w-auto|flex-row|inline-flex)/)
  })

  it('has no axe violations with a row promoted', async () => {
    const { container } = render(<ImportReviewScreen buckets={buckets()} ledgerName="Current" onCommit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add anyway/i }))
    await expectNoAxeViolations(container)
  })
})
