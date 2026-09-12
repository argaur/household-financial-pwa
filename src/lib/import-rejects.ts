/**
 * D-025 step I9 — the rejects download.
 *
 * SPEC.md §I8.1 (open question 1, specced): "the rejects file is a filtered
 * copy of the original template", so the fix-and-reupload loop (§I4's "Row
 * rows" panel decision: "No inline editing in v1: the fix loop is download
 * the rejects, fix in Excel, re-upload") hands the household back the same
 * file shape it started from, with only the problem rows and why.
 *
 * "Filtered copy" is made structural here, not just documented: `REJECTS_HEADERS`
 * is `TEMPLATE_HEADERS` (`import-template.ts`, I3) spread with one column
 * appended, never a hand-typed list, so the two cannot drift apart if the
 * template's columns ever change. Sheet naming reuses `sanitizeSheetName`
 * from the same module rather than a second implementation.
 *
 * This module builds the workbook only. Downloading it to disk mirrors how
 * `PiiDisclosureStep` (I4) hands its host a computed file name and nothing
 * more — the entry point that would call `XLSX.writeFile` with this
 * module's output is the same not-yet-built host surface I4's own download
 * button is waiting on, and building it here would be scope this step does
 * not own.
 *
 * State only, same discipline as `import-bucketing.ts` (I7) and
 * `import-review-screen.tsx` (I8): nothing in this module writes to
 * localStorage, sessionStorage, IndexedDB, or a server. I12 later proves the
 * absence of persistence; this module does nothing that would make that
 * proof false.
 */

import type { BucketedRow, BucketedRows, RawImportRow } from './import-bucketing'
import { TEMPLATE_HEADERS, sanitizeSheetName, type TemplateMember } from './import-template'
import { localDateStamp, sanitizeForFilename } from './import-filename'
import { loadSpreadsheetParser } from './spreadsheet-parser-loader'

/**
 * Local type aliases reached via `typeof import('xlsx')`, matching
 * `import-template.ts`'s own workaround: `spreadsheet-parser-pwa.config.test.ts`
 * sweeps every source file for `import ... from 'xlsx'`, type-only imports
 * included, and a `typeof import(...)` type query does not match that scan.
 */
type XLSXModule = Awaited<ReturnType<typeof loadSpreadsheetParser>>
type WorkBook = ReturnType<XLSXModule['utils']['book_new']>

/** The template's twelve columns, plus a thirteenth carrying why the row didn't reach Ready. */
export const REJECTS_REASON_HEADER = 'Reason'
export const REJECTS_HEADERS = [...TEMPLATE_HEADERS, REJECTS_REASON_HEADER] as const

/** Indices derived from `TEMPLATE_HEADERS`, never hand-numbered: H1b inserted a column and every index after it moved. */
const COL = {
  slug: TEMPLATE_HEADERS.indexOf('Slug'),
  memberId: TEMPLATE_HEADERS.indexOf('Member id'),
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
  reason: TEMPLATE_HEADERS.length,
} as const

/**
 * A possible-duplicate row carries no reason from `import-bucketing.ts` (I7
 * leaves `reasons` empty there deliberately — nothing about the row itself
 * failed to parse), so this is the one reason text authored outside I6's
 * `buildValidationMessage` vocabulary. It names the situation, never a cell
 * value.
 */
const DUPLICATE_REASON = 'Already recorded for this member and instrument. Review it before adding it again.'

/**
 * Buckets other than Ready, in the review screen's own fixed order (needs
 * attention, then possible duplicate, then skipped) — SPEC.md §I4's "Rejects
 * download" panel decision: "always present when any row is outside Ready".
 * These are exactly those rows.
 */
export function selectRejectedRows(buckets: BucketedRows): BucketedRow[] {
  return [...buckets.needsAttention, ...buckets.possibleDuplicate, ...buckets.skipped]
}

/**
 * Plain-language reason for one rejected row. `needsAttention` and
 * `skipped` rows already carry I6-vocabulary reasons built by
 * `buildValidationMessage` and only ever reused, never rewritten, by
 * `import-bucketing.ts` — those are joined here verbatim. `possibleDuplicate`
 * rows fall back to `DUPLICATE_REASON`, the one case that vocabulary does
 * not cover.
 */
export function rejectReason(row: BucketedRow): string {
  if (row.reasons.length > 0) return row.reasons.join(' ')
  if (row.bucket === 'possibleDuplicate') return DUPLICATE_REASON
  return ''
}

function rawRowKey(memberId: string, rowNumber: number): string {
  return `${memberId}::${rowNumber}`
}

/**
 * Builds a workbook shaped like `buildImportTemplate`'s output (I3) — same
 * header row, one sheet per member, same column positions — filtered to only
 * the rows that did not reach Ready, each carrying why. `rawRows` supplies
 * the actual cell values: a `BucketedRow` alone only carries parsed/derived
 * fields (or, for a `needsAttention` row, nothing that failed to parse at
 * all), never the original input, so the raw rows this step's caller already
 * read off the upload are required here. A bucketed row whose raw row is not
 * found in `rawRows` is left out rather than guessed at.
 *
 * Asset class (§I3's "display only" column) is left blank: nothing in
 * `RawImportRow` carries it (`import-bucketing.ts`'s own module doc notes
 * this is deliberate — nothing downstream needs it), and it plays no part in
 * how a re-upload is parsed.
 *
 * REPLACE, NOT MERGE (SPEC.md §I8.2, D-025 open question 2): this function
 * takes `rawRows`/`buckets` as its only inputs and holds no state of its
 * own between calls. Calling it again with a second upload's rows and
 * buckets produces a workbook reflecting only that second upload — there is
 * nothing here for a first call's rows to be folded into, even by accident.
 */
export async function buildRejectsWorkbook(rawRows: RawImportRow[], buckets: BucketedRows): Promise<WorkBook> {
  const XLSX = await loadSpreadsheetParser()
  const wb = XLSX.utils.book_new()

  const rawByKey = new Map<string, RawImportRow>()
  for (const row of rawRows) rawByKey.set(rawRowKey(row.member.id, row.rowNumber), row)

  const rejected = selectRejectedRows(buckets)
  const byMember = new Map<string, { member: TemplateMember; rows: BucketedRow[] }>()
  for (const row of rejected) {
    const entry = byMember.get(row.member.id) ?? { member: row.member, rows: [] }
    entry.rows.push(row)
    byMember.set(row.member.id, entry)
  }

  const takenSheetNames = new Set<string>()
  for (const { member, rows } of byMember.values()) {
    const sheetRows: unknown[][] = [[...REJECTS_HEADERS]]

    for (const bucketedRow of rows) {
      const raw = rawByKey.get(rawRowKey(member.id, bucketedRow.rowNumber))
      if (!raw) continue

      const sheetRow: unknown[] = []
      sheetRow[COL.slug] = raw.slug ?? null
      // H1b: identity travels with the row, so a fixed-and-reuploaded rejects
      // file is read back against the right member even if the member list has
      // been reordered in between. Taken from the raw row's own member, which
      // is the member this sheet is being built for.
      sheetRow[COL.memberId] = raw.member.id
      sheetRow[COL.instrument] = raw.instrumentName ?? null
      sheetRow[COL.investedAmount] = raw.investedAmount ?? null
      sheetRow[COL.currentValue] = raw.currentValue ?? null
      sheetRow[COL.units] = raw.units ?? null
      sheetRow[COL.monthlySip] = raw.monthlySip ?? null
      sheetRow[COL.startDate] = raw.startDate ?? null
      sheetRow[COL.maturityDate] = raw.maturityDate ?? null
      sheetRow[COL.nominee] = raw.nominee ?? null
      sheetRow[COL.emergencyFund] = raw.emergencyFund ?? null
      sheetRow[COL.notes] = raw.notes ?? null
      sheetRow[COL.reason] = rejectReason(bucketedRow)
      sheetRows.push(sheetRow)
    }

    if (sheetRows.length <= 1) continue // every rejected row for this member had no matching raw row

    const ws = XLSX.utils.aoa_to_sheet(sheetRows)
    const sheetName = sanitizeSheetName(member.name, takenSheetNames)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  return wb
}

/**
 * `vittam-import-rejects-<ledger>-<date>.xlsx`. Reuses `import-filename.ts`'s
 * own sanitizing and local-date rules (I4, D-025 decision 8) rather than
 * re-deriving them — this is the same trap class, applied to a second file
 * name instead of a first.
 */
export function buildRejectsFilename(ledgerName: string, date: Date): string {
  return `vittam-import-rejects-${sanitizeForFilename(ledgerName)}-${localDateStamp(date)}.xlsx`
}
