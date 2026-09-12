import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImportReviewScreen } from './import-review-screen'
import { expectNoAxeViolations } from '@/test/axe'
import type { BucketedRow, BucketedRows } from '@/lib/import-bucketing'

/**
 * D-025 step I9 — the rejects download button and the leave-screen confirm
 * on `ImportReviewScreen` (I8). A separate file from
 * `import-review-screen.test.tsx` per this step's constraint against editing
 * existing test files.
 */

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

function needsAttentionRow(overrides: Partial<BucketedRow> = {}): BucketedRow {
  return {
    bucket: 'needsAttention',
    member,
    rowNumber: 3,
    instrumentLabel: 'SBI Gold Fund',
    reasons: ['Amount invested is required.'],
    ...overrides,
  }
}

function emptyBuckets(overrides: Partial<BucketedRows> = {}): BucketedRows {
  return {
    ready: [readyRow()],
    needsAttention: [],
    possibleDuplicate: [],
    skipped: [],
    ...overrides,
  }
}

describe('ImportReviewScreen — rejects download', () => {
  it('hides the rejects download button when every row is Ready', () => {
    render(<ImportReviewScreen buckets={emptyBuckets()} ledgerName="Current" onCommit={vi.fn()} onDownloadRejects={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /download rejects/i })).not.toBeInTheDocument()
  })

  it('hides the rejects download button when no handler is given, even with rejected rows', () => {
    const buckets = emptyBuckets({ needsAttention: [needsAttentionRow()] })
    render(<ImportReviewScreen buckets={buckets} ledgerName="Current" onCommit={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /download rejects/i })).not.toBeInTheDocument()
  })

  it('shows the rejects download button and fires the handler once any row is outside Ready', () => {
    const onDownloadRejects = vi.fn()
    const buckets = emptyBuckets({ needsAttention: [needsAttentionRow()] })
    render(<ImportReviewScreen buckets={buckets} ledgerName="Current" onCommit={vi.fn()} onDownloadRejects={onDownloadRejects} />)

    const button = screen.getByRole('button', { name: /download rejects/i })
    fireEvent.click(button)
    expect(onDownloadRejects).toHaveBeenCalledTimes(1)
  })

  it('shows the rejects download button for a possible-duplicate-only mismatch too', () => {
    const buckets = emptyBuckets({
      possibleDuplicate: [{ bucket: 'possibleDuplicate', member, rowNumber: 4, instrumentLabel: 'HDFC Balanced Advantage', reasons: [] }],
    })
    render(<ImportReviewScreen buckets={buckets} ledgerName="Current" onCommit={vi.fn()} onDownloadRejects={vi.fn()} />)
    expect(screen.getByRole('button', { name: /download rejects/i })).toBeInTheDocument()
  })

  it('the rejects download button is at least 44px tall and never uses sm:', () => {
    const buckets = emptyBuckets({ needsAttention: [needsAttentionRow()] })
    render(<ImportReviewScreen buckets={buckets} ledgerName="Current" onCommit={vi.fn()} onDownloadRejects={vi.fn()} />)
    const button = screen.getByRole('button', { name: /download rejects/i })
    expect(button.className).toMatch(/min-h-11/)
    expect(button.className).not.toMatch(/(^|\s)sm:(grid-cols|w-auto|flex-row|inline-flex)/)
  })
})

describe('ImportReviewScreen — leave-screen confirm', () => {
  it('hides the leave affordance entirely when onLeave is not given', () => {
    render(<ImportReviewScreen buckets={emptyBuckets()} ledgerName="Current" onCommit={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /cancel import/i })).not.toBeInTheDocument()
  })

  it('shows the confirm copy before onLeave is ever called, never fires onLeave on the first click', () => {
    const onLeave = vi.fn()
    render(<ImportReviewScreen buckets={emptyBuckets()} ledgerName="Current" onCommit={vi.fn()} onLeave={onLeave} />)

    fireEvent.click(screen.getByRole('button', { name: /cancel import/i }))

    expect(onLeave).not.toHaveBeenCalled()
    expect(
      screen.getByText(/live only in this browser tab/i),
    ).toBeInTheDocument()
  })

  it('only calls onLeave after the confirm is accepted', () => {
    const onLeave = vi.fn()
    render(<ImportReviewScreen buckets={emptyBuckets()} ledgerName="Current" onCommit={vi.fn()} onLeave={onLeave} />)

    fireEvent.click(screen.getByRole('button', { name: /cancel import/i }))
    fireEvent.click(screen.getByRole('button', { name: /leave without saving/i }))

    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('"Keep reviewing" backs out of the confirm without ever calling onLeave', () => {
    const onLeave = vi.fn()
    render(<ImportReviewScreen buckets={emptyBuckets()} ledgerName="Current" onCommit={vi.fn()} onLeave={onLeave} />)

    fireEvent.click(screen.getByRole('button', { name: /cancel import/i }))
    fireEvent.click(screen.getByRole('button', { name: /keep reviewing/i }))

    expect(onLeave).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /cancel import/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /leave without saving/i })).not.toBeInTheDocument()
  })

  it('the confirm copy carries zero em-dashes', () => {
    render(<ImportReviewScreen buckets={emptyBuckets()} ledgerName="Current" onCommit={vi.fn()} onLeave={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel import/i }))
    const copy = screen.getByText(/live only in this browser tab/i).textContent ?? ''
    expect(copy).not.toContain('—')
  })

  it('the leave-confirm buttons are at least 44px tall and never use sm:', () => {
    render(<ImportReviewScreen buckets={emptyBuckets()} ledgerName="Current" onCommit={vi.fn()} onLeave={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel import/i }))
    const leaveButton = screen.getByRole('button', { name: /leave without saving/i })
    const stayButton = screen.getByRole('button', { name: /keep reviewing/i })
    expect(leaveButton.className).toMatch(/min-h-11/)
    expect(stayButton.className).toMatch(/min-h-11/)
    expect(leaveButton.className).not.toMatch(/(^|\s)sm:(grid-cols|w-auto|flex-row|inline-flex)/)
    expect(stayButton.className).not.toMatch(/(^|\s)sm:(grid-cols|w-auto|flex-row|inline-flex)/)
  })

  it('has no axe violations with the leave-confirm block open', async () => {
    const { container } = render(<ImportReviewScreen buckets={emptyBuckets()} ledgerName="Current" onCommit={vi.fn()} onLeave={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel import/i }))
    await expectNoAxeViolations(container)
  })
})

describe('ImportReviewScreen — a second upload replaces the review state', () => {
  it('re-rendering with a fresh buckets value shows only the new rows, never the old ones alongside them', () => {
    const onCommit = vi.fn()
    const firstBuckets = emptyBuckets({ needsAttention: [needsAttentionRow({ instrumentLabel: 'First Upload Fund' })] })
    const { rerender } = render(<ImportReviewScreen buckets={firstBuckets} ledgerName="Current" onCommit={onCommit} />)
    expect(screen.getByText('First Upload Fund')).toBeInTheDocument()

    // A second, unrelated upload's buckets -- the host recomputes these from
    // scratch via `bucketImportRows` (I7) on the new file's rows and passes
    // them down as a whole new prop value. Nothing here merges the two.
    const secondBuckets = emptyBuckets({
      needsAttention: [needsAttentionRow({ instrumentLabel: 'Second Upload Fund', rowNumber: 5 })],
    })
    rerender(<ImportReviewScreen buckets={secondBuckets} ledgerName="Current" onCommit={onCommit} />)

    expect(screen.getByText('Second Upload Fund')).toBeInTheDocument()
    expect(screen.queryByText('First Upload Fund')).not.toBeInTheDocument()
  })

  it('committing after a second upload sends only the second upload\'s Ready rows', () => {
    const onCommit = vi.fn()
    const firstBuckets = emptyBuckets({ ready: [readyRow({ instrumentLabel: 'First Ready Fund', rowNumber: 1 })] })
    const { rerender } = render(<ImportReviewScreen buckets={firstBuckets} ledgerName="Current" onCommit={onCommit} />)

    const secondReadyRow = readyRow({ instrumentLabel: 'Second Ready Fund', rowNumber: 9 })
    const secondBuckets = emptyBuckets({ ready: [secondReadyRow] })
    rerender(<ImportReviewScreen buckets={secondBuckets} ledgerName="Current" onCommit={onCommit} />)

    fireEvent.click(screen.getByRole('button', { name: /add 1 holding to current/i }))
    expect(onCommit).toHaveBeenCalledWith([secondReadyRow])
  })
})
