import { describe, it, expect, vi, afterEach } from 'vitest'
import { downloadWorkbook, XLSX_MIME_TYPE } from './workbook-download'
import { loadSpreadsheetParser } from './spreadsheet-parser-loader'

/**
 * D-025 step H4 — how a workbook actually becomes a file.
 *
 * WHAT JSDOM CAN PROVE, AND WHAT IT CANNOT. jsdom has no downloads: an
 * `<a download>` click does not write anything to disk, and no assertion here
 * can say a file appeared in the user's Downloads folder. What it CAN prove is
 * every link in the chain up to the moment the browser takes over, and each of
 * those is a place this could silently be wrong:
 *
 *   1. The bytes are real. `XLSX.write(..., { type: 'array' })` output is read
 *      straight back through `XLSX.read` below and the cell values come out
 *      the other side, so this is not a zero-byte or HTML-shaped "file".
 *   2. The blob carries the OOXML media type, which is what decides whether
 *      Excel opens it or the browser treats it as junk.
 *   3. The anchor carries the exact file name asked for. A `download`
 *      attribute that is empty or wrong is the difference between
 *      `vittam-import-Current-2026-09-11.xlsx` and `download.bin`.
 *   4. The object URL is revoked and the anchor is removed. That one is not
 *      housekeeping: an un-revoked blob URL holding household data stays
 *      fetchable for the life of the document, which is the leak the whole of
 *      D-014 exists to close.
 *
 * Left to the real-browser pass, deliberately not faked here: that the click
 * opens a save dialog, that Excel/Sheets/LibreOffice open the result, and
 * anything about the file system.
 */

/**
 * The object-URL pair is patched ONTO the real `URL`, not swapped for a plain
 * object. Replacing the whole global would take the `URL` constructor with it,
 * which jsdom itself uses internally (tough-cookie calls `new URL` behind
 * `document.cookie`), so a whole-global stub turns unrelated reads into
 * "URL is not a constructor".
 */
const patchedUrlKeys: string[] = []

function patchUrl(key: 'createObjectURL' | 'revokeObjectURL', value: unknown) {
  patchedUrlKeys.push(key)
  Object.defineProperty(URL, key, { value, configurable: true, writable: true })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  for (const key of patchedUrlKeys.splice(0)) {
    Reflect.deleteProperty(URL, key)
  }
})

/** jsdom's `Blob` has no `arrayBuffer()`, so the bytes come back through `FileReader`. */
function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

/** Installs a recording object-URL pair and a non-navigating anchor, and returns what was captured. */
function captureDownload() {
  const blobs: Blob[] = []
  const revoked: string[] = []
  patchUrl('createObjectURL', (blob: Blob) => {
    blobs.push(blob)
    return 'blob:workbook-under-test'
  })
  patchUrl('revokeObjectURL', (url: string) => revoked.push(url))

  const clicked: HTMLAnchorElement[] = []
  const realCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const element = realCreate(tag)
    if (tag === 'a') {
      const anchor = element as HTMLAnchorElement
      anchor.click = () => clicked.push(anchor)
    }
    return element
  })

  return { blobs, revoked, clicked }
}

describe('downloadWorkbook — the file that actually reaches the user', () => {
  it('writes real .xlsx bytes: what goes into the blob reads back as the same workbook', async () => {
    const XLSX = await loadSpreadsheetParser()
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Slug', 'Amount invested'],
        ['equity-nifty-50-index-fund', 50000],
      ]),
      'Gaurav',
    )

    const { blobs } = captureDownload()
    await downloadWorkbook(workbook, 'vittam-import-Current-2026-09-11.xlsx')

    expect(blobs).toHaveLength(1)
    expect(blobs[0].size).toBeGreaterThan(0)
    const bytes = await blobToBytes(blobs[0])
    const reread = XLSX.read(bytes, { type: 'array' })
    expect(reread.SheetNames).toEqual(['Gaurav'])
    const rows = XLSX.utils.sheet_to_json(reread.Sheets['Gaurav'], { header: 1 }) as unknown[][]
    expect(rows[0]).toEqual(['Slug', 'Amount invested'])
    expect(rows[1]).toEqual(['equity-nifty-50-index-fund', 50000])
  })

  it('tags the blob with the OOXML media type, so the file opens as a spreadsheet', async () => {
    const XLSX = await loadSpreadsheetParser()
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Slug']]), 'Gaurav')

    const { blobs } = captureDownload()
    await downloadWorkbook(workbook, 'f.xlsx')

    expect(blobs[0].type).toBe(XLSX_MIME_TYPE)
    expect(XLSX_MIME_TYPE).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  })

  it('clicks one anchor carrying the exact file name asked for', async () => {
    const XLSX = await loadSpreadsheetParser()
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Slug']]), 'Gaurav')

    const { clicked } = captureDownload()
    await downloadWorkbook(workbook, 'vittam-import-rejects-Current-2026-09-11.xlsx')

    expect(clicked).toHaveLength(1)
    expect(clicked[0].download).toBe('vittam-import-rejects-Current-2026-09-11.xlsx')
    expect(clicked[0].href).toContain('blob:workbook-under-test')
  })

  it('revokes the object URL and leaves no anchor behind', async () => {
    const XLSX = await loadSpreadsheetParser()
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Slug']]), 'Gaurav')

    const anchorsBefore = document.querySelectorAll('a').length
    const { revoked } = captureDownload()
    await downloadWorkbook(workbook, 'f.xlsx')

    expect(revoked).toEqual(['blob:workbook-under-test'])
    expect(document.querySelectorAll('a').length).toBe(anchorsBefore)
  })

  it('leaves the workbook nowhere else: no storage key, no cache, after a save', async () => {
    const XLSX = await loadSpreadsheetParser()
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Slug', 'Persimmon Underhay']]), 'Gaurav')

    captureDownload()
    await downloadWorkbook(workbook, 'f.xlsx')

    expect(JSON.stringify(localStorage)).not.toContain('Persimmon')
    expect(JSON.stringify(sessionStorage)).not.toContain('Persimmon')
    expect(document.cookie).not.toContain('Persimmon')
  })
})
