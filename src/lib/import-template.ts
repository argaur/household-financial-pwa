/**
 * D-025 step I3 — the import template builder.
 *
 * Builds the bulk-import workbook entirely in the browser: one worksheet per
 * household member, each prefilled with the full 30-instrument library
 * grouped by asset class, a hidden machine-readable slug column, and
 * kind-aware guidance (comments, and best-effort shading — see the note on
 * `applyGuidance` below) on the fields a given instrument does not usually
 * carry. Nothing here ever blocks input: every cell stays a plain, editable
 * string/number/boolean cell (SPEC.md §I3/§I4, D-025 decision 3).
 *
 * SPEC.md §I3, "No API for template generation": "The workbook is built
 * entirely in the browser by SheetJS from the decrypted member list and the
 * existing `GET /api/instruments` response. Nothing about the template
 * touches the server, which is what keeps member names out of any server
 * surface even though they are in the file." This module makes zero network
 * calls of its own — both inputs (`members`, `instruments`) are handed in by
 * the caller, already resolved.
 *
 * The twelve columns are D-025 decision 2, quoted verbatim in the header
 * list below rather than re-derived:
 * "Columns: hidden slug, asset class (display only), instrument name, amount
 * invested, current value, units, monthly SIP, start date, maturity date,
 * nominee, emergency-fund flag, notes."
 */

import type { Instrument } from './instruments-api'
import { LIBRARY_SECTIONS } from './library-sections'
import { loadSpreadsheetParser } from './spreadsheet-parser-loader'

/**
 * Local type aliases reached via `typeof import('xlsx')` rather than
 * `import type { ... } from 'xlsx'`. `spreadsheet-parser-pwa.config.test.ts`
 * sweeps every source file for `import ... from 'xlsx'` (type-only imports
 * included, since the regex does not special-case `import type`), so even a
 * types-only static import here would fail that test. `typeof import(...)`
 * is a type query, not an import statement, and does not match it.
 */
type XLSXModule = Awaited<ReturnType<typeof loadSpreadsheetParser>>
type WorkBook = ReturnType<XLSXModule['utils']['book_new']>
type WorkSheet = ReturnType<XLSXModule['utils']['aoa_to_sheet']>

/** The member fields the template needs. Deliberately narrower than the full `FamilyMember`. */
export interface TemplateMember {
  id: string
  name: string
}

/** D-025 decision 2's twelve columns, in the order the decision lists them. Column A (slug) is hidden. */
export const TEMPLATE_HEADERS = [
  'Slug',
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
] as const

const COL = {
  slug: 0,
  assetClass: 1,
  instrument: 2,
  investedAmount: 3,
  currentValue: 4,
  units: 5,
  monthlySip: 6,
  startDate: 7,
  maturityDate: 8,
  nominee: 9,
  emergencyFund: 10,
  notes: 11,
} as const

/** Light shading fill, applied best-effort to a "less common for this instrument" cell. See `applyGuidance`. */
const GUIDANCE_FILL = { patternType: 'solid', fgColor: { rgb: 'FFFDF0D5' } } as const

const COMMENT_AUTHOR = 'Vittam'

// ---------------------------------------------------------------------------
// Asset-class grouping
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = new Map(LIBRARY_SECTIONS.map((section, index) => [section.category, index]))

function assetClassLabel(category: number): string {
  return LIBRARY_SECTIONS.find((section) => section.category === category)?.title ?? 'Other'
}

/** Stable sort: asset-class order per `LIBRARY_SECTIONS`, then instrument name. Never mutates the input array. */
export function orderInstrumentsByAssetClass(instruments: Instrument[]): Instrument[] {
  return [...instruments].sort((a, b) => {
    const orderDiff = (CATEGORY_ORDER.get(a.category) ?? Number.MAX_SAFE_INTEGER) -
      (CATEGORY_ORDER.get(b.category) ?? Number.MAX_SAFE_INTEGER)
    if (orderDiff !== 0) return orderDiff
    return a.name.localeCompare(b.name)
  })
}

// ---------------------------------------------------------------------------
// Kind-awareness
//
// D-025 decision 3 requires "shading plus cell comments, never a hard
// block", matching how the in-app holding form already treats every field as
// optional on every instrument (src/components/holding-form.tsx accepts all
// twelve fields regardless of instrument kind). The decision does not specify
// the exact per-instrument relevance rule, so this is a documented, testable
// heuristic derived only from data already in the browser (the Instrument's
// own summary/liquidity/minInvestment text) — never a hidden per-slug table
// that would silently drift from the seed content. See this module's
// exported report for the flag on this choice.
// ---------------------------------------------------------------------------

function textBlob(instrument: Instrument): string {
  return `${instrument.summary} ${instrument.liquidity} ${instrument.minInvestment}`.toLowerCase()
}

/** Units (or grams, or folio units) apply when the instrument is bought in discrete units. */
function unitsRelevant(instrument: Instrument): boolean {
  return /\b(unit|units|share|shares|gram|grams|folio|demat)\b/.test(textBlob(instrument))
}

/** A monthly SIP applies only to instruments the library text describes as SIP-able. */
function monthlySipRelevant(instrument: Instrument): boolean {
  return /\bsip\b/.test(textBlob(instrument))
}

/** A maturity date applies to fixed-tenure instruments — the seed text names the tenure when one exists. */
function maturityDateRelevant(instrument: Instrument): boolean {
  return /(matur|tenure|lock-in|\d+[- ]year)/.test(textBlob(instrument))
}

/** Every financial instrument in the library carries a nominee except real estate (category 5), which uses legal ownership/heirs instead. */
function nomineeRelevant(instrument: Instrument): boolean {
  return instrument.category !== 5
}

export interface FieldGuidanceNote {
  column: number
  note: string
}

/** The "less common for this instrument" notes to attach as comments/shading. Empty when every field is common. */
export function fieldGuidance(instrument: Instrument): FieldGuidanceNote[] {
  const notes: FieldGuidanceNote[] = []
  if (!unitsRelevant(instrument)) {
    notes.push({
      column: COL.units,
      note: `${instrument.name} is not usually held in discrete units. Leave blank unless it applies — this never blocks entry.`,
    })
  }
  if (!monthlySipRelevant(instrument)) {
    notes.push({
      column: COL.monthlySip,
      note: `${instrument.name} is not usually bought via a recurring SIP. Leave blank unless it applies — this never blocks entry.`,
    })
  }
  if (!maturityDateRelevant(instrument)) {
    notes.push({
      column: COL.maturityDate,
      note: `${instrument.name} does not usually have a fixed maturity date. Leave blank unless it applies — this never blocks entry.`,
    })
  }
  if (!nomineeRelevant(instrument)) {
    notes.push({
      column: COL.nominee,
      note: `${instrument.name} does not carry a bank-style nominee. Record the legal owner/heir in Notes instead if needed — this never blocks entry.`,
    })
  }
  return notes
}

// ---------------------------------------------------------------------------
// Sheet naming
// ---------------------------------------------------------------------------

// Excel forbids \ / ? * [ ] : in a sheet name and caps it at 31 characters.
const INVALID_SHEET_NAME_CHARS = /[\\/?*[\]:]/g
const MAX_SHEET_NAME_LENGTH = 31

/**
 * Excel-safe, unique-within-the-workbook sheet name for a member. `taken`
 * accumulates lower-cased names already used in this workbook build (Excel
 * sheet names are case-insensitively unique) and is mutated as each name is
 * assigned.
 */
export function sanitizeSheetName(rawName: string, taken: Set<string>): string {
  let base = rawName.replace(INVALID_SHEET_NAME_CHARS, ' ').trim()
  if (base.length === 0) base = 'Member'
  base = base.slice(0, MAX_SHEET_NAME_LENGTH)

  let candidate = base
  let suffixIndex = 2
  while (taken.has(candidate.toLowerCase())) {
    const suffix = ` (${suffixIndex})`
    candidate = base.slice(0, MAX_SHEET_NAME_LENGTH - suffix.length) + suffix
    suffixIndex += 1
  }
  taken.add(candidate.toLowerCase())
  return candidate
}

// ---------------------------------------------------------------------------
// Sheet building
// ---------------------------------------------------------------------------

function applyGuidance(ws: WorkSheet, XLSX: XLSXModule, rowIndex: number, guidance: FieldGuidanceNote): void {
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: guidance.column })
  // `aoa_to_sheet` never materialises a cell object for a `null` value (the
  // deliberately blank, user-fills-this-in cells this template prefills
  // every field with), so the target cell usually does not exist yet. A
  // guidance note still needs somewhere to live, so a blank stub cell (type
  // 'z', SheetJS's own "empty" cell type) is created rather than skipped.
  const cell = ws[address] ?? (ws[address] = { t: 'z' })

  cell.c = [{ a: COMMENT_AUTHOR, t: guidance.note }]
  // Best-effort shading only. SheetJS Community Edition (the pinned
  // cdn.sheetjs.com build, D-025 open question 2) does not document write
  // support for cell fill styles — style writing is a SheetJS Pro feature.
  // Setting `s` here is harmless if the writer drops it, and starts working
  // for free if the pinned build ever gains write support. The comment above
  // is the guaranteed, CE-supported guidance channel; shading is not relied
  // on as the sole signal. Flagged in the implementation report rather than
  // silently treated as "done".
  cell.s = { fill: GUIDANCE_FILL }
}

function buildMemberSheet(XLSX: XLSXModule, orderedInstruments: Instrument[]): WorkSheet {
  const rows: unknown[][] = [[...TEMPLATE_HEADERS]]

  for (const instrument of orderedInstruments) {
    const row: unknown[] = []
    row[COL.slug] = instrument.slug
    row[COL.assetClass] = assetClassLabel(instrument.category)
    row[COL.instrument] = instrument.name
    row[COL.investedAmount] = null
    row[COL.currentValue] = null
    row[COL.units] = null
    row[COL.monthlySip] = null
    row[COL.startDate] = null
    row[COL.maturityDate] = null
    row[COL.nominee] = null
    row[COL.emergencyFund] = false
    row[COL.notes] = null
    rows.push(row)
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ hidden: true }]

  orderedInstruments.forEach((instrument, index) => {
    const rowIndex = index + 1 // row 0 is the header
    for (const guidance of fieldGuidance(instrument)) {
      applyGuidance(ws, XLSX, rowIndex, guidance)
    }
  })

  return ws
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Builds the import workbook: one worksheet per member, each carrying all
 * `instruments` (expected to be the full 30-instrument library from
 * `GET /api/instruments`), grouped by asset class, with a hidden slug column
 * and kind-aware guidance. Makes no network call — both arguments are
 * already-resolved, in-memory data; see the module doc for why that matters.
 */
export async function buildImportTemplate(members: TemplateMember[], instruments: Instrument[]): Promise<WorkBook> {
  const XLSX = await loadSpreadsheetParser()
  const wb = XLSX.utils.book_new()
  const orderedInstruments = orderInstrumentsByAssetClass(instruments)
  const takenSheetNames = new Set<string>()

  for (const member of members) {
    const ws = buildMemberSheet(XLSX, orderedInstruments)
    const sheetName = sanitizeSheetName(member.name, takenSheetNames)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  return wb
}
