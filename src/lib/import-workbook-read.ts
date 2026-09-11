/**
 * D-025 step H1 — reading an uploaded workbook into `RawImportRow[]`.
 *
 * This is the stage that was missing from Chunk I: `bucketImportRows` (I7)
 * consumes `RawImportRow[]`, `buildRejectsWorkbook` (I9) re-reads them, and
 * `import-parser.ts` (I5) parses individual cells — but nothing produced rows
 * from an uploaded file. This module does exactly that and nothing else: no
 * drop zone, no host page, no parsing of cell VALUES (that stays I5's job,
 * reached through I7), no commit.
 *
 * ---------------------------------------------------------------------------
 * THE TRAP: `sanitizeSheetName` IS LOSSY, SO THE MAPPING IS REBUILT, NOT
 * INVERTED.
 *
 * `import-template.ts`'s `sanitizeSheetName` replaces Excel-invalid characters
 * with spaces, truncates at 31 characters, and disambiguates a collision by
 * appending " (2)", " (3)" — truncating further to make room. None of that is
 * reversible. Two members with long, similar names collapse to the same
 * truncated base and are then told apart ONLY by the order the template writer
 * walked them in.
 *
 * So a reader must never try to recover a member by matching a sheet name
 * against member names, by prefix, by fuzzy distance, or by "close enough".
 * Getting it wrong files someone's holdings against the WRONG FAMILY MEMBER,
 * silently, with entirely plausible amounts — the same class of harm as I5's
 * date and lakh traps and I7's fuzzy-instrument rule.
 *
 * The forward mapping is deterministic, so `buildSheetNameToMemberMap` below
 * replays it: iterate the household's members in the SAME ORDER the template
 * writer used, call the SAME `sanitizeSheetName` with the same running `taken`
 * set, and key a map by what comes out. `sanitizeSheetName` is imported, never
 * reimplemented, so the writer and the reader cannot drift.
 *
 * The one hazard this cannot remove: the caller must pass the members in the
 * same order the template was built from. Order is the disambiguator, so a
 * reordered list genuinely does remap colliding names. The app's member list
 * comes from one source with one stable order (`GET /api/family-members`, by
 * creation), which is why this is a documented caller contract rather than
 * something this module can enforce — there is nothing in the FILE that records
 * the order used.
 * ---------------------------------------------------------------------------
 *
 * State only. Nothing here writes to localStorage, sessionStorage, IndexedDB,
 * a cache, or a server, and it makes no network call: the bytes are handed in
 * already. I12 proves the absence of persistence for this feature; this module
 * does nothing that would make that proof false.
 */

import { TEMPLATE_HEADERS, sanitizeSheetName, type TemplateMember } from './import-template'
import { PARSER_READ_OPTIONS, type CellValue } from './import-parser'
import type { RawImportRow } from './import-bucketing'
import { loadSpreadsheetParser } from './spreadsheet-parser-loader'

/**
 * Local type aliases reached via `typeof import('xlsx')`, matching the
 * workaround `import-template.ts` and `import-rejects.ts` already use:
 * `spreadsheet-parser-pwa.config.test.ts` sweeps every source file for
 * `import ... from 'xlsx'`, type-only imports included, and a `typeof
 * import(...)` type query does not match that scan. That sweep is what keeps
 * ~1MB of SheetJS out of the main bundle; this module reaches the library only
 * through `loadSpreadsheetParser`'s dynamic import, like every other consumer.
 */
type XLSXModule = Awaited<ReturnType<typeof loadSpreadsheetParser>>
type WorkSheet = ReturnType<XLSXModule['utils']['aoa_to_sheet']>

/** Bytes for one uploaded `.xlsx`. `File` is what a drop zone hands over; `ArrayBuffer` is what a test does. */
export type ImportWorkbookSource = File | ArrayBuffer | Uint8Array

export type ImportWorkbookErrorCode =
  /** SheetJS could not read the bytes at all — not a workbook, or a corrupt one. */
  | 'unreadable_file'
  /** Readable as a workbook, but no sheet in it carries the template's header row. */
  | 'not_a_template'

/**
 * A refusal to read the file, with a code the host surface can turn into copy.
 * No message here contains a cell value, matching I6's contract for everything
 * this feature shows a user.
 */
export class ImportWorkbookError extends Error {
  readonly code: ImportWorkbookErrorCode

  constructor(code: ImportWorkbookErrorCode, message: string) {
    super(message)
    this.name = 'ImportWorkbookError'
    this.code = code
  }
}

export interface ImportWorkbookReadResult {
  /**
   * One row per filled-in template row, in sheet order, ready for
   * `bucketImportRows`. Untouched prefilled rows are INCLUDED, with their
   * blank cells blank, so I7 buckets them as Skipped ("Row left blank in the
   * template.") rather than as errors — see `isRowTouched` there.
   */
  rows: RawImportRow[]
  /**
   * Template-shaped sheets whose name matches no member, in workbook order.
   * Their rows are NOT imported: see `readImportWorkbook`'s doc for why a
   * guess is worse than a refusal. The host surface is expected to name these
   * so the user can rename the tab back and re-upload.
   */
  unrecognisedSheets: string[]
  /** Member sheets the workbook did not contain at all. Informational; not an error. */
  missingMembers: TemplateMember[]
}

// ---------------------------------------------------------------------------
// The forward map
// ---------------------------------------------------------------------------

/**
 * Rebuilds the template writer's own sheet-name-to-member mapping by replaying
 * `sanitizeSheetName` over `members` in order. Keys are lower-cased, because
 * Excel treats sheet names as case-insensitively unique and `sanitizeSheetName`
 * already tracks its `taken` set that way — so a user who retypes a tab name in
 * a different case still lands on the right member.
 *
 * `members` MUST be in the same order `buildImportTemplate` was given. See the
 * module doc.
 */
export function buildSheetNameToMemberMap(members: TemplateMember[]): Map<string, TemplateMember> {
  const taken = new Set<string>()
  const map = new Map<string, TemplateMember>()
  for (const member of members) {
    map.set(sanitizeSheetName(member.name, taken).toLowerCase(), member)
  }
  return map
}

// ---------------------------------------------------------------------------
// Cell reading
// ---------------------------------------------------------------------------

/**
 * The raw value of one cell, or `null` when the cell does not exist. Deliberately
 * the cell's own `v`, never a formatted string: I5 needs the untouched
 * number/string/boolean (a date arrives as a timezone-free serial under
 * `PARSER_READ_OPTIONS`), and formatting it here would re-introduce exactly the
 * locale dependence §I6.9 exists to remove.
 */
function cellValue(XLSX: XLSXModule, sheet: WorkSheet, row: number, column: number): CellValue {
  const cell = (sheet as Record<string, { v?: unknown } | undefined>)[
    XLSX.utils.encode_cell({ r: row, c: column })
  ]
  if (cell === undefined || cell.v === undefined) return null
  return cell.v as CellValue
}

function isEmptyCell(value: CellValue): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  return false
}

/** Column index by header text, so a reorder of `TEMPLATE_HEADERS` moves both the writer and this reader together. */
const COL = {
  slug: TEMPLATE_HEADERS.indexOf('Slug'),
  instrument: TEMPLATE_HEADERS.indexOf('Instrument'),
  investedAmount: TEMPLATE_HEADERS.indexOf('Amount invested'),
  currentValue: TEMPLATE_HEADERS.indexOf('Current value'),
  units: TEMPLATE_HEADERS.indexOf('Units'),
  monthlySip: TEMPLATE_HEADERS.indexOf('Monthly SIP'),
  startDate: TEMPLATE_HEADERS.indexOf('Start date'),
  maturityDate: TEMPLATE_HEADERS.indexOf('Maturity date'),
  nominee: TEMPLATE_HEADERS.indexOf('Nominee'),
  emergencyFund: TEMPLATE_HEADERS.indexOf('Emergency fund'),
  notes: TEMPLATE_HEADERS.indexOf('Notes'),
} as const

/**
 * Whether a sheet's first row is the template's header row.
 *
 * A PREFIX match, not an exact one, and that is deliberate: SPEC.md §I8.1's
 * fix loop is "download the rejects, fix in Excel, re-upload", and
 * `import-rejects.ts` writes `TEMPLATE_HEADERS` plus a trailing "Reason"
 * column. Requiring exactly twelve headers would refuse the file this feature
 * itself produced. Trailing columns beyond the twelve are read by nothing.
 */
function hasTemplateHeaders(XLSX: XLSXModule, sheet: WorkSheet): boolean {
  return TEMPLATE_HEADERS.every((header, column) => {
    const value = cellValue(XLSX, sheet, 0, column)
    return typeof value === 'string' && value.trim().toLowerCase() === header.toLowerCase()
  })
}

function readSheetRows(XLSX: XLSXModule, sheet: WorkSheet, member: TemplateMember): RawImportRow[] {
  const ref = (sheet as Record<string, unknown>)['!ref']
  if (typeof ref !== 'string') return []
  const range = XLSX.utils.decode_range(ref)

  const rows: RawImportRow[] = []
  for (let r = range.s.r + 1; r <= range.e.r; r += 1) {
    const row: RawImportRow = {
      member,
      // 1-based sheet row, so the header is row 1 and the first instrument is
      // row 2. `buildRejectsWorkbook` keys on this, and a user looking at the
      // same file in Excel sees the same number.
      rowNumber: r + 1,
      slug: cellValue(XLSX, sheet, r, COL.slug),
      instrumentName: cellValue(XLSX, sheet, r, COL.instrument),
      investedAmount: cellValue(XLSX, sheet, r, COL.investedAmount),
      currentValue: cellValue(XLSX, sheet, r, COL.currentValue),
      units: cellValue(XLSX, sheet, r, COL.units),
      monthlySip: cellValue(XLSX, sheet, r, COL.monthlySip),
      startDate: cellValue(XLSX, sheet, r, COL.startDate),
      maturityDate: cellValue(XLSX, sheet, r, COL.maturityDate),
      nominee: cellValue(XLSX, sheet, r, COL.nominee),
      emergencyFund: cellValue(XLSX, sheet, r, COL.emergencyFund),
      notes: cellValue(XLSX, sheet, r, COL.notes),
    }

    // A row with nothing in any of the twelve columns is not a template row at
    // all — it is the empty space below the last one, or a spacer a user left
    // behind. Dropping it is not the same as dropping an untouched PREFILLED
    // row, which still carries its slug and instrument name and is kept so I7
    // can bucket it as Skipped.
    const allEmpty =
      isEmptyCell(row.slug) &&
      isEmptyCell(row.instrumentName) &&
      isEmptyCell(row.investedAmount) &&
      isEmptyCell(row.currentValue) &&
      isEmptyCell(row.units) &&
      isEmptyCell(row.monthlySip) &&
      isEmptyCell(row.startDate) &&
      isEmptyCell(row.maturityDate) &&
      isEmptyCell(row.nominee) &&
      isEmptyCell(row.notes) &&
      isEmptyCell(row.emergencyFund)
    if (allEmpty) continue

    rows.push(row)
  }
  return rows
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Bytes, whatever shape the caller had them in. Every branch is duck-typed or
 * uses a cross-realm-safe predicate rather than `instanceof`: an `ArrayBuffer`
 * that crossed a realm boundary (a worker, an iframe, jsdom's globals vs
 * Node's) fails `instanceof ArrayBuffer` while being a perfectly good buffer,
 * and the failure mode is a `TypeError` from somewhere unrelated rather than a
 * clean refusal.
 */
async function toBytes(source: ImportWorkbookSource): Promise<Uint8Array> {
  if (ArrayBuffer.isView(source)) {
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
  }
  const blobLike = source as { arrayBuffer?: () => Promise<ArrayBuffer> }
  if (typeof blobLike.arrayBuffer === 'function') {
    return new Uint8Array(await blobLike.arrayBuffer())
  }
  return new Uint8Array(source as ArrayBuffer)
}

/**
 * Reads an uploaded template workbook into `RawImportRow[]`, one row per filled
 * template row, ready to hand straight to `bucketImportRows`.
 *
 * Read with `PARSER_READ_OPTIONS` (`{ cellDates: false }`), never options of
 * this module's own: that is what makes a date cell arrive as a timezone-free
 * serial for I5 to convert with integer arithmetic (SPEC.md §I6.9), and it is
 * pinned by `import-parser-traps.test.ts`.
 *
 * WHAT HAPPENS TO A SHEET THAT MATCHES NO MEMBER: its rows are not imported,
 * and its name is returned in `unrecognisedSheets`. It is neither silently
 * dropped nor guessed at. Guessing is the harm this whole module is shaped
 * against — with truncated and " (2)"-suffixed names, the nearest-name guess is
 * exactly the wrong answer for two similarly-named family members, and it would
 * file one person's money against the other with no visible symptom. Silently
 * dropping it is the other bad option: a user who renamed a tab would see their
 * holdings simply not appear, with nothing to act on. Reporting the name lets
 * the host say which tab it could not place, which the user can fix in Excel in
 * seconds using the same fix-and-reupload loop the rejects file already uses.
 *
 * Throws `ImportWorkbookError` when the bytes are not a readable workbook
 * (`unreadable_file`) or when no sheet in it carries the template's header row
 * (`not_a_template`). A workbook with at least one template-shaped sheet is
 * read, even if every sheet was renamed — that case comes back as rows `[]`
 * plus the unrecognised names, which is a far more useful thing to show than
 * "this isn't the template".
 */
export async function readImportWorkbook(
  source: ImportWorkbookSource,
  members: TemplateMember[],
): Promise<ImportWorkbookReadResult> {
  const XLSX = await loadSpreadsheetParser()
  const bytes = await toBytes(source)

  let workbook: ReturnType<XLSXModule['read']>
  try {
    workbook = XLSX.read(bytes, { type: 'array', ...PARSER_READ_OPTIONS })
  } catch {
    throw new ImportWorkbookError(
      'unreadable_file',
      'That file could not be read as an Excel workbook. Upload the .xlsx file downloaded from the template step.',
    )
  }

  const bySheetName = buildSheetNameToMemberMap(members)
  const rows: RawImportRow[] = []
  const unrecognisedSheets: string[] = []
  const seenMemberIds = new Set<string>()
  let templateShapedSheets = 0

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet || !hasTemplateHeaders(XLSX, sheet)) continue
    templateShapedSheets += 1

    const member = bySheetName.get(sheetName.trim().toLowerCase())
    if (!member) {
      unrecognisedSheets.push(sheetName)
      continue
    }

    seenMemberIds.add(member.id)
    rows.push(...readSheetRows(XLSX, sheet, member))
  }

  if (templateShapedSheets === 0) {
    throw new ImportWorkbookError(
      'not_a_template',
      'That workbook does not look like the import template. Download the template, fill it in, and upload that file.',
    )
  }

  return {
    rows,
    unrecognisedSheets,
    missingMembers: members.filter((member) => !seenMemberIds.has(member.id)),
  }
}
