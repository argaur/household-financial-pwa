import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ImportHostSheet } from './import-host-sheet'
import { ImportWorkbookError } from '@/lib/import-workbook-read'
import { ImportCommitError } from '@/lib/import-commit'
import { MAX_LEDGER_HOLDINGS } from '@/lib/ledgers-api'
import type { BucketedRow, BucketedRows, RawImportRow } from '@/lib/import-bucketing'
import type { Instrument } from '@/lib/instruments-api'
import type { Holding } from '@/lib/holdings-api'
import { expectNoAxeViolations } from '@/test/axe'

/**
 * D-025 step H4 — the import host surface. Chunk I built every piece and no
 * page assembled them; this file covers the assembly: the step sequence, the
 * three previously dormant seams (template download, rejects download, the
 * two I14 tracking calls), the seven METRICS_PLAN.md events that had no call
 * site, and the two cross-step inconsistencies H4 owns (a promoted duplicate
 * row that would otherwise appear in the rejects file it was committed out
 * of, and a commit that ran while `NewLedgerModal` would have refused).
 *
 * WHAT IS MOCKED AND WHY. The three heavy seams are stubbed so this file
 * tests the host's orchestration rather than re-testing Chunk I: workbook
 * reading (H1), template building (I3) and the batch commit (I11) each have
 * their own suite. Everything that decides a TRACKED value stays real —
 * `bucketImportRows`, `trackImportTemplateDownloaded`, `trackImportCompleted`
 * and the review screen itself — because those are exactly what the event
 * assertions below are worth anything against. `@/lib/analytics` is mocked at
 * the `track` boundary, so every event is observed as the host emits it.
 */

const trackMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/analytics', () => ({ track: trackMock }))

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token', isSignedIn: true }),
}))

const readImportWorkbookMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/import-workbook-read', async () => {
  const actual = await vi.importActual<typeof import('@/lib/import-workbook-read')>('@/lib/import-workbook-read')
  return { ...actual, readImportWorkbook: readImportWorkbookMock }
})

const buildImportTemplateMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/import-template', async () => {
  const actual = await vi.importActual<typeof import('@/lib/import-template')>('@/lib/import-template')
  return { ...actual, buildImportTemplate: buildImportTemplateMock }
})

const buildRejectsWorkbookMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/import-rejects', async () => {
  const actual = await vi.importActual<typeof import('@/lib/import-rejects')>('@/lib/import-rejects')
  return { ...actual, buildRejectsWorkbook: buildRejectsWorkbookMock }
})

const commitImportBatchMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/import-commit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/import-commit')>('@/lib/import-commit')
  return { ...actual, commitImportBatch: commitImportBatchMock }
})

const downloadWorkbookMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/workbook-download', () => ({ downloadWorkbook: downloadWorkbookMock }))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MEMBER = { id: 'm1', name: 'Gaurav', householdId: 'h1' } as unknown as RawImportRow['member']

function instrument(id: string, name: string): Instrument {
  return {
    id,
    slug: id,
    name,
    category: 1,
    summary: '',
    returns: '',
    tax: '',
    liquidity: '',
    risk: '',
    eligibility: '',
    minInvestment: '',
    rateValue: null,
    rateAsOf: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  } as Instrument
}

const INSTRUMENT_READY = instrument('equity-nifty-50-index-fund', 'Nifty 50 Index Fund')
const INSTRUMENT_DUPLICATE = instrument('equity-mid-cap-fund', 'Mid Cap Fund')
const INSTRUMENTS = [INSTRUMENT_READY, INSTRUMENT_DUPLICATE]

/** The ledger already holds the duplicate instrument for this member, so I7 buckets row 3 as a duplicate. */
const EXISTING_HOLDINGS = [
  {
    id: 'h-existing',
    householdId: 'h1',
    memberId: MEMBER.id,
    instrumentId: INSTRUMENT_DUPLICATE.id,
    assetClass: 'equity',
    investedAmount: '11111',
    currentValue: '12222',
    units: null,
    monthlySip: null,
    startDate: null,
    maturityDate: null,
    nominee: null,
    isEmergencyFund: false,
    notes: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as Holding,
]

function rawRow(rowNumber: number, slug: string, invested: unknown, current: unknown): RawImportRow {
  return {
    member: MEMBER,
    rowNumber,
    slug,
    instrumentName: null,
    investedAmount: invested,
    currentValue: current,
    units: null,
    monthlySip: null,
    startDate: null,
    maturityDate: null,
    nominee: null,
    emergencyFund: null,
    notes: null,
  } as RawImportRow
}

/** One Ready row, one Needs-attention row (unparseable amount), one Possible duplicate row. */
function mixedRows(): RawImportRow[] {
  return [
    rawRow(2, INSTRUMENT_READY.slug, 50000, 62000),
    rawRow(3, INSTRUMENT_READY.slug, '9.37L', 62000),
    rawRow(4, INSTRUMENT_DUPLICATE.slug, 30000, 31000),
  ]
}

function readResult(rows: RawImportRow[], overrides: Record<string, unknown> = {}) {
  return { rows, unrecognisedSheets: [], missingMembers: [], ...overrides }
}

function xlsxFile(name = 'vittam-import-current-2026-09-11.xlsx'): File {
  return new File([new Uint8Array([1, 2, 3])], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

function renderHost(props: Partial<React.ComponentProps<typeof ImportHostSheet>> = {}) {
  const onOpenChange = vi.fn()
  const onCommitted = vi.fn()
  const utils = render(
    <ImportHostSheet
      open
      onOpenChange={onOpenChange}
      ledgerId="ledger-1"
      ledgerName="Current"
      members={[{ id: MEMBER.id, name: MEMBER.name }]}
      instruments={INSTRUMENTS}
      existingHoldings={EXISTING_HOLDINGS}
      onCommitted={onCommitted}
      now={() => new Date('2026-09-11T10:00:00')}
      {...props}
    />,
  )
  return { ...utils, onOpenChange, onCommitted }
}

/** Walks disclosure -> template download -> upload, leaving the host on the upload step. */
async function reachUploadStep() {
  const handles = renderHost()
  fireEvent.click(screen.getByRole('button', { name: /download template/i }))
  await screen.findByTestId('import-drop-zone')
  return handles
}

/** Walks all the way to a rendered review screen for `rows`. */
async function reachReviewStep(rows: RawImportRow[] = mixedRows()) {
  readImportWorkbookMock.mockResolvedValue(readResult(rows))
  const handles = await reachUploadStep()
  fireEvent.change(screen.getByLabelText(/choose an \.xlsx file to upload/i), {
    target: { files: [xlsxFile()] },
  })
  await screen.findByRole('button', { name: /add \d+ holdings? to current/i })
  return handles
}

function eventsNamed(name: string) {
  return trackMock.mock.calls.filter((call) => call[0] === name)
}

beforeEach(() => {
  trackMock.mockClear()
  readImportWorkbookMock.mockReset()
  buildImportTemplateMock.mockReset().mockResolvedValue({ SheetNames: [], Sheets: {} })
  buildRejectsWorkbookMock.mockReset().mockResolvedValue({ SheetNames: [], Sheets: {} })
  commitImportBatchMock.mockReset().mockResolvedValue({ inserted: 1 })
  downloadWorkbookMock.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// Opening and the step sequence
// ---------------------------------------------------------------------------

describe('ImportHostSheet — opening and the step sequence', () => {
  it('starts on the PII disclosure step, never on the upload control', () => {
    renderHost()
    expect(screen.getByRole('heading', { name: /before you download this file/i })).toBeInTheDocument()
    expect(screen.queryByTestId('import-drop-zone')).not.toBeInTheDocument()
  })

  it('fires bulk_import_started once on open, with no properties', () => {
    renderHost()
    expect(eventsNamed('bulk_import_started')).toEqual([['bulk_import_started', {}]])
  })

  it('fires nothing at all while closed', () => {
    renderHost({ open: false })
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('fires bulk_import_started again on a reopen, and resets back to the disclosure step', async () => {
    await reachReviewStep()
    trackMock.mockClear()
    cleanup()

    renderHost()
    expect(screen.getByRole('heading', { name: /before you download this file/i })).toBeInTheDocument()
    expect(eventsNamed('bulk_import_started')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Seam 1: the template download
// ---------------------------------------------------------------------------

describe('ImportHostSheet — the template download seam (I3/I4)', () => {
  it('builds the workbook from the members and instruments and saves it under the disclosed file name', async () => {
    renderHost()
    const disclosed = screen.getByTestId('pii-disclosure-filename').textContent ?? ''

    fireEvent.click(screen.getByRole('button', { name: /download template/i }))

    await waitFor(() => expect(downloadWorkbookMock).toHaveBeenCalledTimes(1))
    expect(buildImportTemplateMock).toHaveBeenCalledWith([{ id: MEMBER.id, name: MEMBER.name }], INSTRUMENTS)
    const [, filename] = downloadWorkbookMock.mock.calls[0]
    expect(filename).toBe('vittam-import-Current-2026-09-11.xlsx')
    expect(disclosed).toContain(filename)
  })

  it('fires bulk_import_template_downloaded with no properties, and advances to the upload step', async () => {
    renderHost()
    fireEvent.click(screen.getByRole('button', { name: /download template/i }))

    await screen.findByTestId('import-drop-zone')
    expect(eventsNamed('bulk_import_template_downloaded')).toEqual([['bulk_import_template_downloaded', {}]])
  })

  it('shows a failure and stays on the disclosure step when the workbook cannot be built', async () => {
    buildImportTemplateMock.mockRejectedValue(new Error('chunk load failed'))
    renderHost()

    fireEvent.click(screen.getByRole('button', { name: /download template/i }))

    await screen.findByRole('alert')
    expect(screen.queryByTestId('import-drop-zone')).not.toBeInTheDocument()
    expect(eventsNamed('bulk_import_template_downloaded')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Seam 2: upload, parse, and every file-rejection reason
// ---------------------------------------------------------------------------

describe('ImportHostSheet — file rejection reasons (METRICS_PLAN.md line 321)', () => {
  it('fires wrong_type when the drop zone refuses a non-.xlsx file', async () => {
    await reachUploadStep()

    fireEvent.change(screen.getByLabelText(/choose an \.xlsx file to upload/i), {
      target: { files: [new File(['x'], 'statement.csv', { type: 'text/csv' })] },
    })

    expect(eventsNamed('bulk_import_file_rejected')).toEqual([
      ['bulk_import_file_rejected', { reason: 'wrong_type' }],
    ])
  })

  it('fires unreadable when readImportWorkbook throws unreadable_file', async () => {
    readImportWorkbookMock.mockRejectedValue(new ImportWorkbookError('unreadable_file', 'nope'))
    await reachUploadStep()

    fireEvent.change(screen.getByLabelText(/choose an \.xlsx file to upload/i), {
      target: { files: [xlsxFile()] },
    })

    await waitFor(() =>
      expect(eventsNamed('bulk_import_file_rejected')).toEqual([
        ['bulk_import_file_rejected', { reason: 'unreadable' }],
      ]),
    )
  })

  it('fires wrong_shape when readImportWorkbook throws not_a_template', async () => {
    readImportWorkbookMock.mockRejectedValue(new ImportWorkbookError('not_a_template', 'nope'))
    await reachUploadStep()

    fireEvent.change(screen.getByLabelText(/choose an \.xlsx file to upload/i), {
      target: { files: [xlsxFile()] },
    })

    await waitFor(() =>
      expect(eventsNamed('bulk_import_file_rejected')).toEqual([
        ['bulk_import_file_rejected', { reason: 'wrong_shape' }],
      ]),
    )
  })

  it('fires empty when the workbook is template shaped but carries no rows', async () => {
    readImportWorkbookMock.mockResolvedValue(readResult([]))
    await reachUploadStep()

    fireEvent.change(screen.getByLabelText(/choose an \.xlsx file to upload/i), {
      target: { files: [xlsxFile()] },
    })

    await waitFor(() =>
      expect(eventsNamed('bulk_import_file_rejected')).toEqual([['bulk_import_file_rejected', { reason: 'empty' }]]),
    )
    expect(screen.queryByRole('button', { name: /add \d+ holdings? to current/i })).not.toBeInTheDocument()
  })

  it('fires too_many_rows above the ledger row cap, before anything is bucketed', async () => {
    const rows = Array.from({ length: MAX_LEDGER_HOLDINGS + 1 }, (_, index) =>
      rawRow(index + 2, INSTRUMENT_READY.slug, 1000, 1000),
    )
    readImportWorkbookMock.mockResolvedValue(readResult(rows))
    await reachUploadStep()

    fireEvent.change(screen.getByLabelText(/choose an \.xlsx file to upload/i), {
      target: { files: [xlsxFile()] },
    })

    await waitFor(() =>
      expect(eventsNamed('bulk_import_file_rejected')).toEqual([
        ['bulk_import_file_rejected', { reason: 'too_many_rows' }],
      ]),
    )
    expect(screen.queryByRole('button', { name: /add \d+ holdings? to current/i })).not.toBeInTheDocument()
  })

  it('never carries a file name, a sheet name or a member name on the rejection event', async () => {
    readImportWorkbookMock.mockRejectedValue(new ImportWorkbookError('unreadable_file', 'nope'))
    await reachUploadStep()

    fireEvent.change(screen.getByLabelText(/choose an \.xlsx file to upload/i), {
      target: { files: [xlsxFile('Gaurav-holdings-secret.xlsx')] },
    })

    await waitFor(() => expect(eventsNamed('bulk_import_file_rejected')).toHaveLength(1))
    const serialised = JSON.stringify(trackMock.mock.calls)
    expect(serialised).not.toContain('Gaurav')
    expect(serialised).not.toContain('.xlsx')
  })

  it('stays on the upload step after a rejection so the user can pick another file', async () => {
    readImportWorkbookMock.mockRejectedValue(new ImportWorkbookError('not_a_template', 'nope'))
    await reachUploadStep()

    fireEvent.change(screen.getByLabelText(/choose an \.xlsx file to upload/i), {
      target: { files: [xlsxFile()] },
    })

    await screen.findByRole('alert')
    expect(screen.getByTestId('import-drop-zone')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// The review step
// ---------------------------------------------------------------------------

describe('ImportHostSheet — the review step', () => {
  it('buckets the parsed rows and renders the review screen with the ledger named on the CTA', async () => {
    await reachReviewStep()
    expect(screen.getByRole('button', { name: /add 1 holding to current/i })).toBeInTheDocument()
  })

  it('fires bulk_import_review_shown once, with the four bucket counts and nothing else', async () => {
    await reachReviewStep()
    expect(eventsNamed('bulk_import_review_shown')).toEqual([
      ['bulk_import_review_shown', { rows_ready: 1, rows_attention: 1, rows_duplicate: 1, rows_skipped: 0 }],
    ])
  })

  it('names an unrecognised sheet so the user can rename the tab and re-upload', async () => {
    readImportWorkbookMock.mockResolvedValue(readResult(mixedRows(), { unrecognisedSheets: ['Sheet1'] }))
    await reachUploadStep()
    fireEvent.change(screen.getByLabelText(/choose an \.xlsx file to upload/i), {
      target: { files: [xlsxFile()] },
    })

    expect(await screen.findByText(/Sheet1/)).toBeInTheDocument()
  })

  it('a second upload REPLACES the review state rather than merging into it (SPEC.md §I8.2)', async () => {
    await reachReviewStep()
    expect(screen.getByRole('button', { name: /add 1 holding to current/i })).toBeInTheDocument()

    readImportWorkbookMock.mockResolvedValue(
      readResult([
        rawRow(2, INSTRUMENT_READY.slug, 1000, 1000),
        rawRow(3, INSTRUMENT_READY.slug, 2000, 2000),
      ]),
    )
    fireEvent.change(screen.getByLabelText(/choose an \.xlsx file to upload/i), {
      target: { files: [xlsxFile()] },
    })

    await screen.findByRole('button', { name: /add 2 holdings to current/i })
    expect(screen.queryByRole('button', { name: /add 3 holdings to current/i })).not.toBeInTheDocument()
    expect(eventsNamed('bulk_import_review_shown')).toHaveLength(2)
  })

  it('has no axe violations on the review step', async () => {
    const { baseElement } = await reachReviewStep()
    await expectNoAxeViolations(baseElement as HTMLElement)
  })
})

// ---------------------------------------------------------------------------
// Seam 3: the rejects download, and the H3 rejects-count inconsistency
// ---------------------------------------------------------------------------

describe('ImportHostSheet — the rejects download seam (I9)', () => {
  it('builds the rejects workbook from the raw rows and saves it under the rejects file name', async () => {
    await reachReviewStep()
    // The template download on the way in already used this mock once.
    downloadWorkbookMock.mockClear()

    fireEvent.click(screen.getByRole('button', { name: /download rejects/i }))

    await waitFor(() => expect(downloadWorkbookMock).toHaveBeenCalledTimes(1))
    expect(downloadWorkbookMock.mock.calls[0][1]).toBe('vittam-import-rejects-Current-2026-09-11.xlsx')
    const [rawRowsArg] = buildRejectsWorkbookMock.mock.calls[0]
    expect(rawRowsArg).toHaveLength(3)
  })

  it('fires bulk_import_rejects_downloaded with rows_rejected only', async () => {
    await reachReviewStep()

    fireEvent.click(screen.getByRole('button', { name: /download rejects/i }))

    await waitFor(() =>
      expect(eventsNamed('bulk_import_rejects_downloaded')).toEqual([
        ['bulk_import_rejects_downloaded', { rows_rejected: 2 }],
      ]),
    )
  })

  it('a row promoted by "Add anyway" is left OUT of the rejects workbook it was committed out of', async () => {
    await reachReviewStep()
    fireEvent.click(screen.getByRole('button', { name: /add anyway/i }))

    fireEvent.click(screen.getByRole('button', { name: /download rejects/i }))

    await waitFor(() => expect(buildRejectsWorkbookMock).toHaveBeenCalledTimes(1))
    const [, bucketsArg] = buildRejectsWorkbookMock.mock.calls[0] as [RawImportRow[], BucketedRows]
    expect(bucketsArg.possibleDuplicate).toHaveLength(0)
    expect(bucketsArg.ready).toHaveLength(2)
    expect(bucketsArg.needsAttention).toHaveLength(1)
  })

  it('a promoted row is not counted in rows_rejected either', async () => {
    await reachReviewStep()
    fireEvent.click(screen.getByRole('button', { name: /add anyway/i }))

    fireEvent.click(screen.getByRole('button', { name: /download rejects/i }))

    await waitFor(() =>
      expect(eventsNamed('bulk_import_rejects_downloaded')).toEqual([
        ['bulk_import_rejects_downloaded', { rows_rejected: 1 }],
      ]),
    )
  })
})

// ---------------------------------------------------------------------------
// The commit
// ---------------------------------------------------------------------------

describe('ImportHostSheet — the commit (I11/I14)', () => {
  it('commits the Ready rows against the target ledger and closes the sheet', async () => {
    const { onOpenChange, onCommitted } = await reachReviewStep()

    fireEvent.click(screen.getByRole('button', { name: /add 1 holding to current/i }))

    await waitFor(() => expect(commitImportBatchMock).toHaveBeenCalledTimes(1))
    const input = commitImportBatchMock.mock.calls[0][0]
    expect(input.ledgerId).toBe('ledger-1')
    expect(input.token).toBe('test-token')
    expect(input.instruments).toEqual(INSTRUMENTS)
    expect(input.readyRows.map((row: BucketedRow) => row.rowNumber)).toEqual([2])
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(onCommitted).toHaveBeenCalledWith(1)
  })

  it('fires bulk_import_completed with rows_clean counting the promoted row it actually committed', async () => {
    await reachReviewStep()
    fireEvent.click(screen.getByRole('button', { name: /add anyway/i }))

    fireEvent.click(screen.getByRole('button', { name: /add 2 holdings to current/i }))

    await waitFor(() =>
      expect(eventsNamed('bulk_import_completed')).toEqual([
        ['bulk_import_completed', { rows_clean: 2, rows_rejected: 1 }],
      ]),
    )
  })

  it('fires bulk_import_failed with ledger_full on a 409', async () => {
    commitImportBatchMock.mockRejectedValue(new ImportCommitError(409, 'ledger_full'))
    const { onOpenChange } = await reachReviewStep()

    fireEvent.click(screen.getByRole('button', { name: /add 1 holding to current/i }))

    await waitFor(() =>
      expect(eventsNamed('bulk_import_failed')).toEqual([['bulk_import_failed', { reason: 'ledger_full' }]]),
    )
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(eventsNamed('bulk_import_completed')).toHaveLength(0)
  })

  it('fires bulk_import_failed with forbidden on a 403', async () => {
    commitImportBatchMock.mockRejectedValue(new ImportCommitError(403, 'forbidden'))
    await reachReviewStep()

    fireEvent.click(screen.getByRole('button', { name: /add 1 holding to current/i }))

    await waitFor(() =>
      expect(eventsNamed('bulk_import_failed')).toEqual([['bulk_import_failed', { reason: 'forbidden' }]]),
    )
  })

  it('fires bulk_import_failed with batch_error on anything else', async () => {
    commitImportBatchMock.mockRejectedValue(new ImportCommitError(500, 'invalid_batch'))
    await reachReviewStep()

    fireEvent.click(screen.getByRole('button', { name: /add 1 holding to current/i }))

    await waitFor(() =>
      expect(eventsNamed('bulk_import_failed')).toEqual([['bulk_import_failed', { reason: 'batch_error' }]]),
    )
  })

  it('shows the failure on screen and keeps the reviewed rows, so a retry does not need a re-upload', async () => {
    commitImportBatchMock.mockRejectedValue(new ImportCommitError(500, 'invalid_batch'))
    await reachReviewStep()

    fireEvent.click(screen.getByRole('button', { name: /add 1 holding to current/i }))

    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: /add 1 holding to current/i })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Abandonment
// ---------------------------------------------------------------------------

describe('ImportHostSheet — bulk_import_abandoned', () => {
  it('fires with stage disclosure when the user backs out of the disclosure', () => {
    const { onOpenChange } = renderHost()

    fireEvent.click(screen.getByRole('button', { name: /not now/i }))

    expect(eventsNamed('bulk_import_abandoned')).toEqual([['bulk_import_abandoned', { stage: 'disclosure' }]])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('fires with stage upload when the user closes on the upload step', async () => {
    await reachUploadStep()

    fireEvent.click(screen.getByRole('button', { name: /close/i }))

    await waitFor(() =>
      expect(eventsNamed('bulk_import_abandoned')).toEqual([['bulk_import_abandoned', { stage: 'upload' }]]),
    )
  })

  it('fires with stage review once the leave confirm is accepted', async () => {
    await reachReviewStep()

    fireEvent.click(screen.getByRole('button', { name: /cancel import/i }))
    fireEvent.click(screen.getByRole('button', { name: /leave without saving/i }))

    expect(eventsNamed('bulk_import_abandoned')).toEqual([['bulk_import_abandoned', { stage: 'review' }]])
  })

  it('does not fire after a successful commit — a finished import is not an abandoned one', async () => {
    await reachReviewStep()

    fireEvent.click(screen.getByRole('button', { name: /add 1 holding to current/i }))

    await waitFor(() => expect(eventsNamed('bulk_import_completed')).toHaveLength(1))
    expect(eventsNamed('bulk_import_abandoned')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// The offline guard (M3c inconsistency)
// ---------------------------------------------------------------------------

describe('ImportHostSheet — the offline guard, consistent with NewLedgerModal', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })

  it('disables the commit CTA and says so while offline, and never calls the batch', async () => {
    await reachReviewStep()
    fireEvent(window, new Event('offline'))

    const cta = await screen.findByRole('button', { name: /add 1 holding to current/i })
    expect(cta).toBeDisabled()
    expect(screen.getByText(/You're offline/)).toBeInTheDocument()

    fireEvent.click(cta)
    expect(commitImportBatchMock).not.toHaveBeenCalled()
  })

  it('re-enables the commit CTA when the browser comes back online', async () => {
    await reachReviewStep()
    fireEvent(window, new Event('offline'))
    await waitFor(() => expect(screen.getByRole('button', { name: /add 1 holding to current/i })).toBeDisabled())

    fireEvent(window, new Event('online'))

    await waitFor(() => expect(screen.getByRole('button', { name: /add 1 holding to current/i })).toBeEnabled())
  })
})

// ---------------------------------------------------------------------------
// Copy and breakpoint discipline (SPEC.md §I6.1, Gaurav's style rule)
// ---------------------------------------------------------------------------

describe('ImportHostSheet — source discipline', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/components/import-host-sheet.tsx'), 'utf8')

  it('uses no sm: layout modifier — sm: fires at 390px in this project', () => {
    expect(source).not.toMatch(/sm:(grid-cols|w-auto|flex-row|inline-flex)/)
  })

  it('contains no em-dash in any user-facing string', () => {
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(withoutComments).not.toContain('—')
  })

  it('reaches SheetJS only through the dynamic loader, never a static xlsx import', () => {
    expect(source).not.toMatch(/from\s+['"]xlsx['"]/)
  })
})
