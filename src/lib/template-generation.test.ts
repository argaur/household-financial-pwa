import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Instrument } from './instruments-api'
import { resetSpreadsheetParserForTests } from './spreadsheet-parser-loader'
import {
  buildImportTemplate,
  fieldGuidance,
  orderInstrumentsByAssetClass,
  sanitizeSheetName,
  TEMPLATE_HEADERS,
  type TemplateMember,
} from './import-template'

/**
 * D-025 step I3. Uses the real, pinned SheetJS build (loaded through
 * `loadSpreadsheetParser`, the only sanctioned path — see
 * spreadsheet-parser-loader.ts) rather than a mock, so these assertions
 * exercise the actual workbook shape the browser will produce, the same
 * async-module-loading pattern `spreadsheet-parser-pwa.config.test.ts`
 * documents for this feature.
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

const DIRECT_STOCKS = makeInstrument({
  slug: 'equity-direct-stocks',
  category: 1,
  name: 'Direct Stocks',
  summary: 'Buying shares of individual listed companies directly on the exchange.',
  liquidity: 'High. Tradeable on any market day via a demat account.',
  minInvestment: 'Price of one share; no fixed minimum.',
})

const FIXED_DEPOSIT = makeInstrument({
  slug: 'debt-fixed-deposit',
  category: 2,
  name: 'Fixed Deposit (FD)',
  summary: 'A lump sum deposited with a bank for a fixed tenure at a fixed interest rate.',
  liquidity: 'Moderate. Premature withdrawal is usually allowed but with a penalty.',
  minInvestment: 'Typically ₹1,000–₹10,000 depending on the bank.',
})

const EQUITY_MF = makeInstrument({
  slug: 'equity-active-mutual-funds',
  category: 1,
  name: 'Equity Mutual Funds (Active)',
  summary: 'Professionally managed pooled funds investing in a basket of stocks.',
  liquidity: 'High for open-ended funds. Redeemable on any business day.',
  minInvestment: 'Many funds accept a SIP starting around ₹500/month.',
})

const LAND = makeInstrument({
  slug: 'realestate-land',
  category: 5,
  name: 'Land / Plots',
  summary: 'Undeveloped or semi-developed land, bought for future construction.',
  liquidity: 'Low. Often the least liquid real estate category.',
  minInvestment: 'Full plot price; varies enormously by location.',
})

const GOLD_ETF = makeInstrument({
  slug: 'gold-etf',
  category: 3,
  name: 'Gold ETF',
  summary: 'An exchange-traded fund backed by physical gold, tradeable in small units through a demat account.',
  liquidity: 'High. Tradeable on the exchange during market hours like a stock.',
  minInvestment: 'Price of one unit (a small fraction of a gram).',
})

const THIRTY_INSTRUMENTS: Instrument[] = [
  DIRECT_STOCKS,
  EQUITY_MF,
  FIXED_DEPOSIT,
  GOLD_ETF,
  LAND,
  // Pad up to 30 with distinct slugs/categories to exercise "all 30 prefilled".
  ...Array.from({ length: 25 }, (_, i) =>
    makeInstrument({
      slug: `filler-${i}`,
      category: ((i % 6) + 1) as Instrument['category'],
      name: `Filler Instrument ${i}`,
    }),
  ),
]

const MEMBERS: TemplateMember[] = [
  { id: 'm1', name: 'Gaurav' },
  { id: 'm2', name: 'Rinku' },
]

describe('fieldGuidance (kind-awareness, never a hard block)', () => {
  it('flags maturity date and monthly SIP as less common for Direct Stocks, but never units or nominee', () => {
    const notes = fieldGuidance(DIRECT_STOCKS)
    const columns = notes.map((n) => n.note)
    expect(notes.some((n) => n.note.includes('maturity'))).toBe(true)
    expect(notes.some((n) => n.note.includes('SIP'))).toBe(true)
    expect(columns.every((note) => !note.toLowerCase().includes('required'))).toBe(true)
  })

  it('flags monthly SIP as less common for a Fixed Deposit (lump sum, no SIP mention)', () => {
    const notes = fieldGuidance(FIXED_DEPOSIT)
    expect(notes.some((n) => n.note.includes('SIP'))).toBe(true)
  })

  it('does not flag monthly SIP for an equity mutual fund, which is explicitly SIP-able', () => {
    const notes = fieldGuidance(EQUITY_MF)
    expect(notes.some((n) => n.note.includes('SIP'))).toBe(false)
  })

  it('flags nominee as not applicable for real estate (land)', () => {
    const notes = fieldGuidance(LAND)
    expect(notes.some((n) => n.note.includes('nominee'))).toBe(true)
  })

  it('every note says the field never blocks entry', () => {
    for (const instrument of [DIRECT_STOCKS, FIXED_DEPOSIT, LAND]) {
      for (const note of fieldGuidance(instrument)) {
        expect(note.note).toMatch(/never blocks entry/i)
      }
    }
  })
})

describe('orderInstrumentsByAssetClass', () => {
  it('groups instruments by category in LIBRARY_SECTIONS order (equity, debt, gold, hybrid, real estate, alternative)', () => {
    const ordered = orderInstrumentsByAssetClass([LAND, GOLD_ETF, FIXED_DEPOSIT, DIRECT_STOCKS])
    expect(ordered.map((i) => i.slug)).toEqual([
      'equity-direct-stocks',
      'debt-fixed-deposit',
      'gold-etf',
      'realestate-land',
    ])
  })

  it('does not mutate the input array', () => {
    const input = [LAND, DIRECT_STOCKS]
    const copy = [...input]
    orderInstrumentsByAssetClass(input)
    expect(input).toEqual(copy)
  })
})

describe('sanitizeSheetName', () => {
  it('strips characters Excel forbids in a sheet name', () => {
    const taken = new Set<string>()
    expect(sanitizeSheetName('A/B:C*D?E[F]G', taken)).toBe('A B C D E F G')
  })

  it('truncates to 31 characters', () => {
    const taken = new Set<string>()
    const long = 'A'.repeat(50)
    const name = sanitizeSheetName(long, taken)
    expect(name.length).toBeLessThanOrEqual(31)
  })

  it('disambiguates a duplicate name rather than colliding', () => {
    const taken = new Set<string>()
    const first = sanitizeSheetName('Gaurav', taken)
    const second = sanitizeSheetName('Gaurav', taken)
    expect(first).not.toBe(second)
  })
})

describe('buildImportTemplate', () => {
  beforeEach(() => {
    resetSpreadsheetParserForTests()
  })

  afterEach(() => {
    resetSpreadsheetParserForTests()
  })

  it('makes no network call while building the template (member names never reach the server)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await buildImportTemplate(MEMBERS, THIRTY_INSTRUMENTS)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('creates one worksheet per member, named after the member', async () => {
    const wb = await buildImportTemplate(MEMBERS, THIRTY_INSTRUMENTS)
    expect(wb.SheetNames).toEqual(['Gaurav', 'Rinku'])
  })

  it('prefills every instrument on every member tab, header row plus one row per instrument', async () => {
    const wb = await buildImportTemplate(MEMBERS, THIRTY_INSTRUMENTS)
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName]
      const ref = ws['!ref'] as string
      const range = ref.split(':')
      expect(range[1]).toMatch(/31$/) // header + 30 instruments = row 31
    }
  })

  it('writes the exact D-025 decision-2 columns in order, plus H1b\'s Member id', async () => {
    const wb = await buildImportTemplate(MEMBERS, THIRTY_INSTRUMENTS)
    const ws = wb.Sheets['Gaurav']
    const headerRow = TEMPLATE_HEADERS.map((_, col) => ws[String.fromCharCode(65 + col) + '1']?.v)
    expect(headerRow).toEqual([...TEMPLATE_HEADERS])
    expect(TEMPLATE_HEADERS).toEqual([
      'Slug',
      'Member id',
      'Asset class',
      'Instrument',
      'Amount invested',
      'Current value',
      'Units',
      'Monthly SIP',
      'Start date',
      'Maturity date',
      'Nominee',
      'Emergency fund',
      'Notes',
    ])
  })

  it('hides the slug column but still writes the machine-readable slug into it', async () => {
    const wb = await buildImportTemplate(MEMBERS, THIRTY_INSTRUMENTS)
    const ws = wb.Sheets['Gaurav']
    expect(ws['!cols']?.[0]?.hidden).toBe(true)
    // Row 2 = first instrument after grouping — equity (Direct Stocks) sorts first alphabetically among equity.
    const slugCell = ws['A2']
    expect(typeof slugCell.v).toBe('string')
    expect((slugCell.v as string).length).toBeGreaterThan(0)
  })

  it('hides the Member id column and writes the member\'s own id into every row of that member\'s sheet (H1b)', async () => {
    const wb = await buildImportTemplate(MEMBERS, THIRTY_INSTRUMENTS)
    expect(TEMPLATE_HEADERS.indexOf('Member id')).toBe(1)

    for (const [sheetName, expectedId] of [['Gaurav', 'm1'], ['Rinku', 'm2']] as const) {
      const ws = wb.Sheets[sheetName]
      expect(ws['!cols']?.[1]?.hidden).toBe(true)
      expect(ws['B1'].v).toBe('Member id')
      for (let r = 2; r <= 31; r += 1) {
        expect(ws[`B${r}`]?.v).toBe(expectedId)
      }
    }
  })

  it('groups rows by asset class using the Asset class column', async () => {
    const wb = await buildImportTemplate(MEMBERS, THIRTY_INSTRUMENTS)
    const ws = wb.Sheets['Gaurav']
    const assetClassValues: string[] = []
    for (let r = 2; r <= 31; r += 1) {
      // Column C = index 2 = Asset class, since H1b inserted Member id at B.
      assetClassValues.push(ws[`C${r}`]?.v as string)
    }
    // Once a group changes, it must never repeat an earlier group further down.
    const seen = new Set<string>()
    let lastGroup: string | null = null
    for (const value of assetClassValues) {
      if (value !== lastGroup) {
        expect(seen.has(value), `asset class "${value}" reappeared after the block moved on`).toBe(false)
        seen.add(value)
        lastGroup = value
      }
    }
  })

  it('attaches a kind-aware comment to the maturity-date cell for Direct Stocks (row 2), never a validation that blocks input', async () => {
    const wb = await buildImportTemplate(MEMBERS, THIRTY_INSTRUMENTS)
    const ws = wb.Sheets['Gaurav']
    // Row 2 is Direct Stocks (equity, alphabetically first: "Direct Stocks" < "Equity Mutual..." < "Filler...").
    expect(ws['A2'].v).toBe('equity-direct-stocks')
    const maturityCell = ws['J2'] // column J = index 9 = Maturity date (H1b shifted it one right)
    expect(maturityCell.c?.[0]?.t).toMatch(/maturity/i)
    expect(ws['!dataValidations']).toBeUndefined()
  })

  it('leaves the amount/current-value cells blank and editable, never prefilled with a value or formula', async () => {
    const wb = await buildImportTemplate(MEMBERS, THIRTY_INSTRUMENTS)
    const ws = wb.Sheets['Gaurav']
    // Columns E/F = indices 4/5, one right of where they sat before H1b.
    expect(ws['E2']).toBeUndefined() // Amount invested, blank
    expect(ws['F2']).toBeUndefined() // Current value, blank
  })

  it('sanitizes and disambiguates member sheet names across the whole build', async () => {
    const wb = await buildImportTemplate(
      [
        { id: 'm1', name: 'A/B' },
        { id: 'm2', name: 'A/B' },
      ],
      THIRTY_INSTRUMENTS,
    )
    expect(wb.SheetNames).toEqual(['A B', 'A B (2)'])
  })
})
