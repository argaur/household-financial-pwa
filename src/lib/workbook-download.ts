/**
 * D-025 step H4 — the one place a SheetJS workbook becomes a file on the
 * user's disk.
 *
 * Two workbooks reach disk in this feature, the template (I3) and the rejects
 * file (I9), and both modules deliberately stopped at "returns a `WorkBook`"
 * because saving is a host concern. This is that host concern, factored out
 * of the host component so there is exactly one saving path rather than two
 * hand-rolled ones that can drift.
 *
 * WHY NOT `XLSX.writeFile`. SheetJS's `writeFile` decides for itself how to
 * emit the bytes: in a browser it does its own anchor-and-`URL.createObjectURL`
 * dance, and whether it revokes that URL is its business, not ours. `download.ts`
 * exists because an un-revoked blob URL holding household data stays fetchable
 * for the life of the document, and that guarantee is not one to hand to a
 * vendor's convenience wrapper. `XLSX.write(..., { type: 'array' })` returns
 * plain bytes and nothing else, which is exactly the seam that lets
 * `triggerBlobDownload` own the lifetime.
 *
 * SheetJS is reached only through `loadSpreadsheetParser`, never a static
 * `import ... from 'xlsx'`: `spreadsheet-parser-pwa.config.test.ts` sweeps
 * `src/` for that mistake, because one static import anywhere undoes the ~1MB
 * chunk split for the whole app.
 */

import { loadSpreadsheetParser } from './spreadsheet-parser-loader'
import { triggerBlobDownload } from './download'

type XLSXModule = Awaited<ReturnType<typeof loadSpreadsheetParser>>
type WorkBook = ReturnType<XLSXModule['utils']['book_new']>

/** The registered media type for an OOXML workbook. Excel, Sheets and LibreOffice all key off it. */
export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Serialise a workbook and save it under `filename`.
 *
 * Nothing is written anywhere else: the bytes exist as an in-memory blob for
 * the span of one click and the object URL is revoked in a `finally` by
 * `triggerBlobDownload`. That keeps I12's absence proof true — the workbook
 * never reaches localStorage, sessionStorage, IndexedDB or a cache.
 */
export async function downloadWorkbook(workbook: WorkBook, filename: string): Promise<void> {
  const XLSX = await loadSpreadsheetParser()
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  triggerBlobDownload(filename, new Blob([bytes], { type: XLSX_MIME_TYPE }))
}
