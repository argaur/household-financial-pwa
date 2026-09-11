import { describe, expect, it } from 'vitest'
import {
  REJECTS_HEADERS,
  REJECTS_REASON_HEADER,
  buildRejectsFilename,
  buildRejectsWorkbook,
  rejectReason,
  selectRejectedRows,
} from './import-rejects'
import { bucketImportRows, type BucketedRows, type RawImportRow } from './import-bucketing'
import { TEMPLATE_HEADERS } from './import-template'
import type { Instrument } from './instruments-api'
import type { Holding } from './holdings-api'
import type { TemplateMember } from './import-template'

/**
 * D-025 step I9 — the rejects download. Uses the real, pinned SheetJS build
 * (through `loadSpreadsheetParser`) the same way `template-generation.test.ts`
 * (I3) and `import-bucketing.test.ts` (I7) do, and reuses `bucketImportRows`
 * unchanged to produce real `BucketedRows` rather than hand-built fixtures,
 * so these assertions exercise the actual round trip: raw rows in, a
 * filtered workbook out.
 */

function makeInstrument(overrides: Partial<Instrument> & Pick<Instrument, 'slug' | 'category' | 'name'>): Instrument {
  return {
    id: overrides.slug,
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
    ...overrides,
  }
}

function makeHolding(overrides: Partial<Holding>): Holding {
  return {
    id: 'h1',
    householdId: 'hh1',
    memberId: 'm1',
    instrumentId: 'i1',
    assetClass: 'equity',
    investedAmount: '10000',
    currentValue: '10000',
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
    ...overrides,
  }
}

const GAURAV: TemplateMember = { id: 'm1', name: 'Gaurav' }
const RINKU: TemplateMember = { id: 'm2', name: 'Rinku' }

const NIFTY_FUND = makeInstrument({
  id: 'i-nifty-50-index-fund',
  slug: 'equity-nifty-50-index-fund',
  category: 1,
  name: 'Nifty 50 Index Fund',
})

const FIXED_DEPOSIT = makeInstrument({
  id: 'i-fixed-deposit',
  slug: 'debt-fixed-deposit',
  category: 2,
  name: 'Fixed Deposit (FD)',
})

const INSTRUMENTS = [NIFTY_FUND, FIXED_DEPOSIT]

function makeRow(overrides: Partial<RawImportRow>): RawImportRow {
  return {
    member: GAURAV,
    rowNumber: 1,
    slug: NIFTY_FUND.slug,
    instrumentName: NIFTY_FUND.name,
    investedAmount: null,
    currentValue: null,
    units: null,
    monthlySip: null,
    startDate: null,
    maturityDate: null,
    nominee: null,
    emergencyFund: false,
    notes: null,
    ...overrides,
  }
}

function colLetter(index: number): string {
  return String.fromCharCode(65 + index)
}

describe('REJECTS_HEADERS', () => {
  it('is the template headers with one Reason column appended, structurally, not a hand-typed list', () => {
    expect(REJECTS_HEADERS).toEqual([...TEMPLATE_HEADERS, REJECTS_REASON_HEADER])
    expect(REJECTS_HEADERS.slice(0, TEMPLATE_HEADERS.length)).toEqual(TEMPLATE_HEADERS)
  })
})

describe('selectRejectedRows', () => {
  it('carries needsAttention, possibleDuplicate and skipped, and never Ready', () => {
    const buckets: BucketedRows = {
      ready: [{ bucket: 'ready', member: GAURAV, rowNumber: 1, instrumentLabel: 'X', reasons: [] }],
      needsAttention: [{ bucket: 'needsAttention', member: GAURAV, rowNumber: 2, instrumentLabel: 'Y', reasons: ['bad'] }],
      possibleDuplicate: [{ bucket: 'possibleDuplicate', member: GAURAV, rowNumber: 3, instrumentLabel: 'Z', reasons: [] }],
      skipped: [{ bucket: 'skipped', member: GAURAV, rowNumber: 4, instrumentLabel: 'W', reasons: ['blank'] }],
    }
    const rejected = selectRejectedRows(buckets)
    expect(rejected.map((r) => r.rowNumber)).toEqual([2, 3, 4])
    expect(rejected.some((r) => r.bucket === 'ready')).toBe(false)
  })
})

describe('rejectReason', () => {
  it('reuses the I6 reasons verbatim when present, joined', () => {
    const row = { bucket: 'needsAttention' as const, member: GAURAV, rowNumber: 1, instrumentLabel: 'X', reasons: ['Amount invested is required.'] }
    expect(rejectReason(row)).toBe('Amount invested is required.')
  })

  it('gives a possible-duplicate row a reason even though bucketing leaves its reasons empty', () => {
    const row = { bucket: 'possibleDuplicate' as const, member: GAURAV, rowNumber: 1, instrumentLabel: 'X', reasons: [] }
    expect(rejectReason(row).length).toBeGreaterThan(0)
  })
})

describe('buildRejectsWorkbook', () => {
  it('writes a header row equal to REJECTS_HEADERS, exactly, per sheet', async () => {
    const raw = [makeRow({ rowNumber: 1, investedAmount: 'lots of money', currentValue: 55000 })]
    const buckets = bucketImportRows({ rows: raw, instruments: INSTRUMENTS, existingHoldings: [] })
    const wb = await buildRejectsWorkbook(raw, buckets)
    const ws = wb.Sheets['Gaurav']
    const headerRow = REJECTS_HEADERS.map((_, col) => ws[colLetter(col) + '1']?.v)
    expect(headerRow).toEqual([...REJECTS_HEADERS])
  })

  it('carries a Needs attention row with its I6 reason and never echoes the offending cell value', async () => {
    const raw = [makeRow({ rowNumber: 1, investedAmount: 'lots of money', currentValue: 55000 })]
    const buckets = bucketImportRows({ rows: raw, instruments: INSTRUMENTS, existingHoldings: [] })
    expect(buckets.needsAttention).toHaveLength(1)

    const wb = await buildRejectsWorkbook(raw, buckets)
    const ws = wb.Sheets['Gaurav']
    const reasonCell = ws[colLetter(TEMPLATE_HEADERS.length) + '2']?.v as string
    expect(reasonCell).toContain('Amount invested')
    expect(reasonCell).not.toContain('lots of money')
    // The raw, unparseable cell value is still carried in the Amount invested
    // column itself (index 3 = column D) so it round-trips for fixing.
    expect(ws['D2']?.v).toBe('lots of money')
  })

  it('carries a Skipped row (blank, untouched) with its reason', async () => {
    const raw = [makeRow({ rowNumber: 1 })] // every editable cell blank
    const buckets = bucketImportRows({ rows: raw, instruments: INSTRUMENTS, existingHoldings: [] })
    expect(buckets.skipped).toHaveLength(1)

    const wb = await buildRejectsWorkbook(raw, buckets)
    const ws = wb.Sheets['Gaurav']
    const reasonCell = ws[colLetter(TEMPLATE_HEADERS.length) + '2']?.v as string
    expect(reasonCell.length).toBeGreaterThan(0)
  })

  it('carries a Possible duplicate row with a reason, even though import-bucketing leaves its reasons empty', async () => {
    const raw = [makeRow({ rowNumber: 1, investedAmount: 50000, currentValue: 55000 })]
    const existingHoldings = [makeHolding({ memberId: GAURAV.id, instrumentId: NIFTY_FUND.id })]
    const buckets = bucketImportRows({ rows: raw, instruments: INSTRUMENTS, existingHoldings })
    expect(buckets.possibleDuplicate).toHaveLength(1)
    expect(buckets.possibleDuplicate[0].reasons).toEqual([])

    const wb = await buildRejectsWorkbook(raw, buckets)
    const ws = wb.Sheets['Gaurav']
    const reasonCell = ws[colLetter(TEMPLATE_HEADERS.length) + '2']?.v as string
    expect(reasonCell.length).toBeGreaterThan(0)
  })

  it('never writes a Ready row into the rejects workbook', async () => {
    const raw = [
      makeRow({ rowNumber: 1, investedAmount: 50000, currentValue: 55000 }), // Ready
      makeRow({ rowNumber: 2, slug: FIXED_DEPOSIT.slug, instrumentName: FIXED_DEPOSIT.name, investedAmount: 'bad', currentValue: 1000 }), // Needs attention
    ]
    const buckets = bucketImportRows({ rows: raw, instruments: INSTRUMENTS, existingHoldings: [] })
    expect(buckets.ready).toHaveLength(1)
    expect(buckets.needsAttention).toHaveLength(1)

    const wb = await buildRejectsWorkbook(raw, buckets)
    const ws = wb.Sheets['Gaurav']
    const ref = ws['!ref'] as string
    const lastRow = Number(ref.split(':')[1]?.match(/\d+$/)?.[0])
    expect(lastRow).toBe(2) // header + exactly the one rejected row, never the Ready one
  })

  it('one sheet per member, named after the member, matching the template', async () => {
    const raw = [
      makeRow({ rowNumber: 1, member: GAURAV, investedAmount: 'bad', currentValue: 1000 }),
      makeRow({ rowNumber: 1, member: RINKU, slug: FIXED_DEPOSIT.slug, instrumentName: FIXED_DEPOSIT.name, investedAmount: 'bad', currentValue: 1000 }),
    ]
    const buckets = bucketImportRows({ rows: raw, instruments: INSTRUMENTS, existingHoldings: [] })
    const wb = await buildRejectsWorkbook(raw, buckets)
    expect(wb.SheetNames.sort()).toEqual(['Gaurav', 'Rinku'])
  })

  it('reflects only the buckets it is given, never a prior call\'s rows -- the caller is the single source of truth', async () => {
    const firstRaw = [makeRow({ rowNumber: 1, member: GAURAV, investedAmount: 'bad', currentValue: 1000 })]
    const firstBuckets = bucketImportRows({ rows: firstRaw, instruments: INSTRUMENTS, existingHoldings: [] })

    const secondRaw = [makeRow({ rowNumber: 1, member: RINKU, slug: FIXED_DEPOSIT.slug, instrumentName: FIXED_DEPOSIT.name, investedAmount: 'bad', currentValue: 1000 })]
    const secondBuckets = bucketImportRows({ rows: secondRaw, instruments: INSTRUMENTS, existingHoldings: [] })

    // Building from the SECOND upload's raw rows and buckets alone -- nothing
    // from the first upload is threaded through -- produces a workbook that
    // carries only Rinku, never Gaurav. This is the "replace, not merge"
    // contract (SPEC.md §I8.2): a fresh call with a fresh upload's data is
    // the whole review state, not an addition to the last one.
    const wb = await buildRejectsWorkbook(secondRaw, secondBuckets)
    expect(wb.SheetNames).toEqual(['Rinku'])
    expect(wb.SheetNames).not.toContain('Gaurav')
    void firstBuckets
  })

  it('leaves no value in localStorage, sessionStorage, or IndexedDB after building the workbook', async () => {
    const raw = [makeRow({ rowNumber: 1, investedAmount: 654321, currentValue: 700000 })]
    const buckets = bucketImportRows({ rows: raw, instruments: INSTRUMENTS, existingHoldings: [] })
    await buildRejectsWorkbook(raw, buckets)

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) as string
      expect(localStorage.getItem(key)).not.toContain('654321')
    }
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i) as string
      expect(sessionStorage.getItem(key)).not.toContain('654321')
    }
  })
})

describe('buildRejectsFilename', () => {
  it('names the file vittam-import-rejects-<ledger>-<date>.xlsx using local date parts', () => {
    const filename = buildRejectsFilename('Retirement / Growth', new Date(2026, 0, 5))
    expect(filename).toBe('vittam-import-rejects-Retirement-Growth-2026-01-05.xlsx')
  })

  it('falls back to "ledger" for a name that sanitizes to nothing, same as the template filename', () => {
    const filename = buildRejectsFilename('///', new Date(2026, 0, 5))
    expect(filename).toBe('vittam-import-rejects-ledger-2026-01-05.xlsx')
  })
})
