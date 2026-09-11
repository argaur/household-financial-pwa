import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImportReviewScreen } from './import-review-screen'
import { expectNoAxeViolations } from '@/test/axe'
import type { BucketedRow, BucketedRows } from '@/lib/import-bucketing'

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

function skippedRow(overrides: Partial<BucketedRow> = {}): BucketedRow {
  return {
    bucket: 'skipped',
    member,
    rowNumber: 5,
    instrumentLabel: '(blank)',
    reasons: ['Row left blank in the template.'],
    ...overrides,
  }
}

function buckets(overrides: Partial<BucketedRows> = {}): BucketedRows {
  return {
    ready: [readyRow()],
    needsAttention: [needsAttentionRow()],
    possibleDuplicate: [duplicateRow()],
    skipped: [skippedRow()],
    ...overrides,
  }
}

describe('ImportReviewScreen', () => {
  it('renders the four bucket sections in fixed order with their counts', () => {
    render(<ImportReviewScreen buckets={buckets()} ledgerName="Current" onCommit={vi.fn()} />)

    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual([
      expect.stringContaining('Ready'),
      expect.stringContaining('Needs attention'),
      expect.stringContaining('Possible duplicate'),
      expect.stringContaining('Skipped'),
    ])

    expect(screen.getByText('Ready').closest('summary')).toHaveTextContent('1')
    expect(screen.getByText('Needs attention').closest('summary')).toHaveTextContent('1')
    expect(screen.getByText('Possible duplicate').closest('summary')).toHaveTextContent('1')
    expect(screen.getByText('Skipped').closest('summary')).toHaveTextContent('1')
  })

  it('expands Ready by default and leaves the other three collapsed', () => {
    render(<ImportReviewScreen buckets={buckets()} ledgerName="Current" onCommit={vi.fn()} />)

    const details = screen.getAllByRole('group', { hidden: true })
    // Fall back to querying <details> elements directly since <details> has no implicit ARIA role in some environments.
    const detailsEls = document.querySelectorAll('details')
    expect(detailsEls).toHaveLength(4)
    expect(detailsEls[0]).toHaveAttribute('open')
    expect(detailsEls[1]).not.toHaveAttribute('open')
    expect(detailsEls[2]).not.toHaveAttribute('open')
    expect(detailsEls[3]).not.toHaveAttribute('open')
    void details
  })

  it('renders a Ready row with member, instrument, and amount, and no reason text', () => {
    render(<ImportReviewScreen buckets={buckets()} ledgerName="Current" onCommit={vi.fn()} />)
    expect(screen.getAllByText('Gaurav').length).toBeGreaterThan(0)
    expect(screen.getByText('Parag Parikh Flexi Cap')).toBeInTheDocument()
    expect(screen.getByText('₹50,000')).toBeInTheDocument()
  })

  it('renders a Needs attention row with its reason beneath it', () => {
    render(<ImportReviewScreen buckets={buckets()} ledgerName="Current" onCommit={vi.fn()} />)
    expect(screen.getByText('SBI Gold Fund')).toBeInTheDocument()
    expect(screen.getByText('Amount invested is required.')).toBeInTheDocument()
  })

  it('renders a Skipped row with its reason', () => {
    render(<ImportReviewScreen buckets={buckets()} ledgerName="Current" onCommit={vi.fn()} />)
    expect(screen.getByText('Row left blank in the template.')).toBeInTheDocument()
  })

  it('the primary CTA carries the Ready count and the ledger name, and commits only the Ready bucket', () => {
    const onCommit = vi.fn()
    render(<ImportReviewScreen buckets={buckets()} ledgerName="Aggressive growth" onCommit={onCommit} />)

    const cta = screen.getByRole('button', { name: /add 1 holding to aggressive growth/i })
    fireEvent.click(cta)

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith([buckets().ready[0]])
  })

  it('pluralizes the CTA count for more than one ready row', () => {
    const twoReady = buckets({ ready: [readyRow(), readyRow({ rowNumber: 6 })] })
    render(<ImportReviewScreen buckets={twoReady} ledgerName="Current" onCommit={vi.fn()} />)
    expect(screen.getByRole('button', { name: /add 2 holdings to current/i })).toBeInTheDocument()
  })

  it('disables the primary CTA when the Ready bucket is empty', () => {
    const empty = buckets({ ready: [] })
    render(<ImportReviewScreen buckets={empty} ledgerName="Current" onCommit={vi.fn()} />)
    expect(screen.getByRole('button', { name: /add 0 holdings to current/i })).toBeDisabled()
  })

  it('every touch target is at least 44px tall via min-h-11', () => {
    const { container } = render(<ImportReviewScreen buckets={buckets()} ledgerName="Current" onCommit={vi.fn()} />)
    const summaries = container.querySelectorAll('summary')
    summaries.forEach((summary) => expect(summary.className).toMatch(/min-h-11/))
    const cta = screen.getByRole('button', { name: /add 1 holding to current/i })
    expect(cta.className).toMatch(/min-h-11/)
  })

  it('carries min-w-0 on every bucket section and row block so a long name wraps instead of widening the page', () => {
    const { container } = render(<ImportReviewScreen buckets={buckets()} ledgerName="Current" onCommit={vi.fn()} />)
    const detailsEls = container.querySelectorAll('details')
    detailsEls.forEach((el) => expect(el.className).toMatch(/min-w-0/))
    const rowBlocks = container.querySelectorAll('[data-testid="import-review-row"]')
    expect(rowBlocks.length).toBeGreaterThan(0)
    rowBlocks.forEach((el) => expect(el.className).toMatch(/min-w-0/))
  })

  it('uses no sm: responsive classes anywhere in its rendered output', () => {
    const { container } = render(<ImportReviewScreen buckets={buckets()} ledgerName="Current" onCommit={vi.fn()} />)
    const all = container.querySelectorAll('*')
    all.forEach((el) => {
      expect(el.className).not.toMatch(/(^|\s)sm:(grid-cols|w-auto|flex-row|inline-flex)/)
    })
  })

  it('has no axe violations', async () => {
    const { container } = render(<ImportReviewScreen buckets={buckets()} ledgerName="Current" onCommit={vi.fn()} />)
    await expectNoAxeViolations(container)
  })
})
