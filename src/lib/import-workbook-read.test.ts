import { describe, expect, it } from 'vitest'

import {
  ImportWorkbookError,
  buildSheetNameToMemberMap,
  readImportWorkbook,
} from './import-workbook-read'
import { TEMPLATE_HEADERS, buildImportTemplate, type TemplateMember } from './import-template'
import { bucketImportRows, type RawImportRow } from './import-bucketing'
import { buildRejectsWorkbook } from './import-rejects'
import { PARSER_READ_OPTIONS, parseDateCell } from './import-parser'
import { loadSpreadsheetParser } from './spreadsheet-parser-loader'
import type { Instrument } from './instruments-api'

/**
 * D-025 step H1 — reading an uploaded workbook back into `RawImportRow[]`.
 *
 * The strongest available test is the round trip, and it is cheap because both
 * halves already exist: `buildImportTemplate` (I3) writes the file, this module
 * reads it, and `bucketImportRows` (I7) consumes the result. Every assertion
 * below therefore goes through the real, pinned SheetJS build via
 * `loadSpreadsheetParser`, never a hand-built fixture of what a sheet is
 * assumed to look like.
 *
 * THE TRAP THESE TESTS EXIST FOR: `sanitizeSheetName` is lossy — it truncates
 * at 31 characters and disambiguates collisions by ORDER. A reader that
 * recovered a member by matching a sheet name against member names would file
 * one member's holdings against another member, silently, with entirely
 * plausible amounts. The truncation and collision cases below are the
 * regression pins for exactly that.
 */

function makeInstrument(slug: string, name: string, category: number): Instrument {
  return {
    id: slug,
    slug,
    name,
    category,
    summary: 'A SIP-able fund bought in units with a 5-year lock-in and a maturity date.',
    returns: '',
    tax: '',
    liquidity: '',
    risk: '',
    eligibility: '',
    minInvestment: '',
    rateValue: null,
    rateAsOf: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

const INSTRUMENTS: Instrument[] = [
  makeInstrument('equity-nifty-50-index-fund', 'Nifty 50 Index Fund', 1),
  makeInstrument('equity-flexi-cap-fund', 'Flexi Cap Fund', 1),
  makeInstrument('debt-ppf', 'Public Provident Fund', 2),
]

/** Column index within `TEMPLATE_HEADERS`, by header text, so a column reorder cannot make these tests lie. */
function col(header: (typeof TEMPLATE_HEADERS)[number]): number {
  return TEMPLATE_HEADERS.indexOf(header)
}

type AnySheet = Record<string, unknown>

async function xlsx() {
  return loadSpreadsheetParser()
}

/** Writes one cell into an already-built sheet, the way a user typing into the template would. */
async function setCell(
  sheet: AnySheet,
  rowIndex: number,
  colIndex: number,
  value: string | number | boolean,
  numberFormat?: string,
): Promise<void> {
  const XLSX = await xlsx()
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })
  const type = typeof value === 'number' ? 'n' : typeof value === 'boolean' ? 'b' : 's'
  const cell: Record<string, unknown> = { t: type, v: value }
  if (numberFormat) cell.z = numberFormat
  sheet[address] = cell
}

/** The workbook as bytes, exactly as a download-then-upload round trip would produce. */
async function toArrayBuffer(workbook: Awaited<ReturnType<typeof buildImportTemplate>>): Promise<ArrayBuffer> {
  const XLSX = await xlsx()
  const written = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return written
}

/** Serial for 1 January 2026 in Excel's 1900 system — the value `import-parser.ts` probed and documented. */
const SERIAL_2026_01_01 = 46023

// ---------------------------------------------------------------------------
// The forward map, rebuilt rather than inverted
// ---------------------------------------------------------------------------

describe('sheet -> member identity is the template writer\'s own forward mapping', () => {
  it('maps each member to the sheet name the template writer would have given them', () => {
    const members: TemplateMember[] = [
      { id: 'm1', name: 'Gaurav' },
      { id: 'm2', name: 'Rinku' },
    ]
    const map = buildSheetNameToMemberMap(members)
    expect(map.get('gaurav')?.id).toBe('m1')
    expect(map.get('rinku')?.id).toBe('m2')
  })

  it('maps a name longer than 31 characters to its TRUNCATED sheet name', () => {
    const longName = 'Bartholomew Fitzwilliam Ashcroft the Third' // 41 characters
    const map = buildSheetNameToMemberMap([{ id: 'm1', name: longName }])
    const onlyKey = [...map.keys()][0]

    expect(onlyKey.length).toBeLessThanOrEqual(31)
    expect(map.get(onlyKey)?.id).toBe('m1')
    // The full name is NOT a key: an implementation that matched on member
    // names rather than rebuilding the forward map would find nothing here.
    expect(map.has(longName.toLowerCase())).toBe(false)
  })

  it('disambiguates two members who collide after truncation, in template order', () => {
    const members: TemplateMember[] = [
      { id: 'm1', name: 'Bartholomew Fitzwilliam Ashcroft the Elder' },
      { id: 'm2', name: 'Bartholomew Fitzwilliam Ashcroft the Younger' },
    ]
    const map = buildSheetNameToMemberMap(members)
    const keys = [...map.keys()]

    expect(keys).toHaveLength(2)
    expect(keys[0]).not.toBe(keys[1])
    expect(map.get(keys[0])?.id).toBe('m1')
    expect(map.get(keys[1])?.id).toBe('m2')
    expect(keys[1]).toContain('(2)')
  })
})

// ---------------------------------------------------------------------------
// The round trip
// ---------------------------------------------------------------------------

describe('round trip: buildImportTemplate -> bytes -> readImportWorkbook', () => {
  const MEMBERS: TemplateMember[] = [
    { id: 'm-gaurav', name: 'Gaurav' },
    { id: 'm-rinku', name: 'Rinku' },
  ]

  async function filledTemplate(): Promise<ArrayBuffer> {
    const wb = await buildImportTemplate(MEMBERS, INSTRUMENTS)
    // Row 0 is the header; row 1 is the first instrument row on each sheet.
    const gaurav = wb.Sheets['Gaurav'] as AnySheet
    await setCell(gaurav, 1, col('Amount invested'), 250000)
    await setCell(gaurav, 1, col('Current value'), 310000)
    await setCell(gaurav, 1, col('Start date'), SERIAL_2026_01_01, 'yyyy-mm-dd')

    const rinku = wb.Sheets['Rinku'] as AnySheet
    await setCell(rinku, 2, col('Amount invested'), '1,20,000')
    await setCell(rinku, 2, col('Current value'), 135000)
    await setCell(rinku, 2, col('Nominee'), 'Siya')

    return toArrayBuffer(wb)
  }

  it('files every row against the member whose sheet it came from', async () => {
    const result = await readImportWorkbook(await filledTemplate(), MEMBERS)

    expect(result.unrecognisedSheets).toEqual([])
    // One row per instrument per member — untouched rows included, so I7 can
    // bucket them as Skipped.
    expect(result.rows).toHaveLength(INSTRUMENTS.length * MEMBERS.length)

    const touched = result.rows.filter((row) => row.investedAmount !== null && row.investedAmount !== undefined)
    expect(touched).toHaveLength(2)
    expect(touched.map((row) => row.member.id)).toEqual(['m-gaurav', 'm-rinku'])
    expect(touched[0].investedAmount).toBe(250000)
    expect(touched[1].investedAmount).toBe('1,20,000')
    expect(touched[1].nominee).toBe('Siya')
  })

  it('carries the hidden slug column through, so I7 resolves identity by slug', async () => {
    const result = await readImportWorkbook(await filledTemplate(), MEMBERS)
    for (const row of result.rows) {
      expect(typeof row.slug).toBe('string')
      expect(INSTRUMENTS.map((instrument) => instrument.slug)).toContain(row.slug)
    }
  })

  it('numbers rows by their 1-based sheet row, so the rejects workbook (I9) can key on them', async () => {
    const result = await readImportWorkbook(await filledTemplate(), MEMBERS)
    const gauravRows = result.rows.filter((row) => row.member.id === 'm-gaurav')
    expect(gauravRows.map((row) => row.rowNumber)).toEqual([2, 3, 4])
  })

  it('reads a date cell as a timezone-free serial, not a Date (PARSER_READ_OPTIONS)', async () => {
    expect(PARSER_READ_OPTIONS.cellDates).toBe(false)

    const result = await readImportWorkbook(await filledTemplate(), MEMBERS)
    const dated = result.rows.find((row) => row.startDate !== null && row.startDate !== undefined)

    expect(dated?.startDate).toBe(SERIAL_2026_01_01)
    expect(dated?.startDate).not.toBeInstanceOf(Date)
    expect(parseDateCell(dated!.startDate, 'Start date')).toEqual({ ok: true, value: '2026-01-01' })
  })

  it('feeds bucketImportRows directly: touched rows are Ready, untouched prefilled rows are Skipped', async () => {
    const result = await readImportWorkbook(await filledTemplate(), MEMBERS)
    const buckets = bucketImportRows({
      rows: result.rows,
      instruments: INSTRUMENTS,
      existingHoldings: [],
    })

    expect(buckets.ready).toHaveLength(2)
    expect(buckets.needsAttention).toHaveLength(0)
    expect(buckets.skipped).toHaveLength(INSTRUMENTS.length * MEMBERS.length - 2)
    expect(buckets.skipped.every((row) => row.reasons[0] === 'Row left blank in the template.')).toBe(true)
    expect(buckets.ready.map((row) => row.member.id).sort()).toEqual(['m-gaurav', 'm-rinku'])
  })
})

// ---------------------------------------------------------------------------
// The trap: truncation and collision, through a real file
// ---------------------------------------------------------------------------

describe('the lossy-sheet-name trap, end to end', () => {
  it('files rows correctly for a member whose name exceeds 31 characters', async () => {
    const member: TemplateMember = { id: 'm-long', name: 'Bartholomew Fitzwilliam Ashcroft the Third' }
    const wb = await buildImportTemplate([member], INSTRUMENTS)
    const sheetName = wb.SheetNames[0]
    expect(sheetName.length).toBe(31)
    expect(sheetName).not.toBe(member.name)

    await setCell(wb.Sheets[sheetName] as AnySheet, 1, col('Amount invested'), 90000)
    await setCell(wb.Sheets[sheetName] as AnySheet, 1, col('Current value'), 95000)

    const result = await readImportWorkbook(await toArrayBuffer(wb), [member])
    expect(result.unrecognisedSheets).toEqual([])
    expect(result.rows.every((row) => row.member.id === 'm-long')).toBe(true)
    expect(result.rows.find((row) => row.investedAmount === 90000)?.member.name).toBe(member.name)
  })

  it('keeps two truncation-colliding members apart — each row lands on the right one', async () => {
    const elder: TemplateMember = { id: 'm-elder', name: 'Bartholomew Fitzwilliam Ashcroft the Elder' }
    const younger: TemplateMember = { id: 'm-younger', name: 'Bartholomew Fitzwilliam Ashcroft the Younger' }
    const members = [elder, younger]

    const wb = await buildImportTemplate(members, INSTRUMENTS)
    expect(wb.SheetNames).toHaveLength(2)
    expect(wb.SheetNames[0]).not.toBe(wb.SheetNames[1])
    // The two sheet names share their first 27 characters — a prefix or
    // best-effort name match would put both members' money in one place.
    expect(wb.SheetNames[0].slice(0, 27)).toBe(wb.SheetNames[1].slice(0, 27))

    await setCell(wb.Sheets[wb.SheetNames[0]] as AnySheet, 1, col('Amount invested'), 111111)
    await setCell(wb.Sheets[wb.SheetNames[0]] as AnySheet, 1, col('Current value'), 111111)
    await setCell(wb.Sheets[wb.SheetNames[1]] as AnySheet, 1, col('Amount invested'), 222222)
    await setCell(wb.Sheets[wb.SheetNames[1]] as AnySheet, 1, col('Current value'), 222222)

    const result = await readImportWorkbook(await toArrayBuffer(wb), members)
    expect(result.unrecognisedSheets).toEqual([])

    const elderRow = result.rows.find((row) => row.investedAmount === 111111)
    const youngerRow = result.rows.find((row) => row.investedAmount === 222222)
    expect(elderRow?.member.id).toBe('m-elder')
    expect(youngerRow?.member.id).toBe('m-younger')
  })

  it('maps two truncation-colliding members correctly even when the member list is REORDERED', async () => {
    // H1b: identity is RECORDED in the file (the hidden "Member id" column),
    // not recomputed from member order. Against the recompute-only reader this
    // fails, and the failure is the exact harm: the elder's money lands on the
    // younger.
    const elder: TemplateMember = { id: 'm-elder', name: 'Bartholomew Fitzwilliam Ashcroft the Elder' }
    const younger: TemplateMember = { id: 'm-younger', name: 'Bartholomew Fitzwilliam Ashcroft the Younger' }

    const wb = await buildImportTemplate([elder, younger], INSTRUMENTS)
    await setCell(wb.Sheets[wb.SheetNames[0]] as AnySheet, 1, col('Amount invested'), 111111)
    await setCell(wb.Sheets[wb.SheetNames[0]] as AnySheet, 1, col('Current value'), 111111)
    await setCell(wb.Sheets[wb.SheetNames[1]] as AnySheet, 1, col('Amount invested'), 222222)
    await setCell(wb.Sheets[wb.SheetNames[1]] as AnySheet, 1, col('Current value'), 222222)
    const bytes = await toArrayBuffer(wb)

    // The caller hands the reader the SAME members in the OPPOSITE order.
    const result = await readImportWorkbook(bytes, [younger, elder])

    expect(result.unrecognisedSheets).toEqual([])
    expect(result.rows.find((row) => row.investedAmount === 111111)?.member.id).toBe('m-elder')
    expect(result.rows.find((row) => row.investedAmount === 222222)?.member.id).toBe('m-younger')
  })

  it('still maps correctly when the members are passed in the same order the template used', async () => {
    // Order is the disambiguator, so this is the pin that a caller handing the
    // reader a differently-ordered member list is the one real hazard left.
    const a: TemplateMember = { id: 'm-a', name: 'Bartholomew Fitzwilliam Ashcroft the Elder' }
    const b: TemplateMember = { id: 'm-b', name: 'Bartholomew Fitzwilliam Ashcroft the Younger' }
    const first = buildSheetNameToMemberMap([a, b])
    const reversed = buildSheetNameToMemberMap([b, a])
    const key = [...first.keys()][0]
    expect(first.get(key)?.id).toBe('m-a')
    expect(reversed.get(key)?.id).toBe('m-b')
  })
})

// ---------------------------------------------------------------------------
// Sheets that are not a member's
// ---------------------------------------------------------------------------

describe('a sheet that matches no member', () => {
  /** Blanks the Member id column on every data row, i.e. a template built before H1b. */
  async function clearMemberIds(sheet: AnySheet): Promise<void> {
    const XLSX = await xlsx()
    const range = XLSX.utils.decode_range(sheet['!ref'] as string)
    for (let r = range.s.r + 1; r <= range.e.r; r += 1) {
      delete sheet[XLSX.utils.encode_cell({ r, c: col('Member id') })]
    }
  }

  it('a RENAMED tab is recovered by its recorded member id (H1b), not reported as unrecognised', async () => {
    const members: TemplateMember[] = [
      { id: 'm-gaurav', name: 'Gaurav' },
      { id: 'm-rinku', name: 'Rinku' },
    ]
    const wb = await buildImportTemplate(members, INSTRUMENTS)

    // The user renamed the second tab in Excel. Before H1b this lost the sheet
    // entirely; now the file itself still says whose it is.
    const XLSX = await xlsx()
    wb.Sheets['Rinku ka sheet'] = wb.Sheets['Rinku']
    delete wb.Sheets['Rinku']
    wb.SheetNames[1] = 'Rinku ka sheet'
    await setCell(wb.Sheets['Rinku ka sheet'] as AnySheet, 1, col('Amount invested'), 777777)
    await setCell(wb.Sheets['Rinku ka sheet'] as AnySheet, 1, col('Current value'), 777777)
    expect(XLSX.utils.encode_cell({ r: 0, c: 0 })).toBe('A1') // the loader really is the pinned build

    const result = await readImportWorkbook(await toArrayBuffer(wb), members)

    expect(result.unrecognisedSheets).toEqual([])
    expect(result.missingMembers).toEqual([])
    expect(result.rows.find((row) => row.investedAmount === 777777)?.member.id).toBe('m-rinku')
  })

  it('a renamed tab with NO recorded id is still reported, never guessed at and never silently dropped', async () => {
    const members: TemplateMember[] = [
      { id: 'm-gaurav', name: 'Gaurav' },
      { id: 'm-rinku', name: 'Rinku' },
    ]
    const wb = await buildImportTemplate(members, INSTRUMENTS)

    wb.Sheets['Rinku ka sheet'] = wb.Sheets['Rinku']
    delete wb.Sheets['Rinku']
    wb.SheetNames[1] = 'Rinku ka sheet'
    await clearMemberIds(wb.Sheets['Rinku ka sheet'] as AnySheet)
    await setCell(wb.Sheets['Rinku ka sheet'] as AnySheet, 1, col('Amount invested'), 777777)
    await setCell(wb.Sheets['Rinku ka sheet'] as AnySheet, 1, col('Current value'), 777777)

    const result = await readImportWorkbook(await toArrayBuffer(wb), members)

    expect(result.unrecognisedSheets).toEqual(['Rinku ka sheet'])
    // Nothing from the renamed sheet is imported, and nothing is attributed
    // to Rinku by proximity or by order.
    expect(result.rows.every((row) => row.member.id === 'm-gaurav')).toBe(true)
    expect(result.rows.some((row) => row.investedAmount === 777777)).toBe(false)
  })

  it('a recorded id that names NO supplied member is unrecognised, never name-matched as a second guess', async () => {
    const members: TemplateMember[] = [{ id: 'm-gaurav', name: 'Gaurav' }]
    // Built for a member who has since been deleted from the household, but
    // the tab is still called "Gaurav" — the name would match, the id does not.
    const wb = await buildImportTemplate([{ id: 'm-deleted', name: 'Gaurav' }], INSTRUMENTS)
    await setCell(wb.Sheets['Gaurav'] as AnySheet, 1, col('Amount invested'), 888888)
    await setCell(wb.Sheets['Gaurav'] as AnySheet, 1, col('Current value'), 888888)

    const result = await readImportWorkbook(await toArrayBuffer(wb), members)

    expect(result.unrecognisedSheets).toEqual(['Gaurav'])
    expect(result.rows).toEqual([])
    expect(result.missingMembers.map((member) => member.id)).toEqual(['m-gaurav'])
  })

  it('a DUPLICATED tab does not import a member\'s rows twice — the first sheet wins, the copy is reported', async () => {
    const members: TemplateMember[] = [{ id: 'm-gaurav', name: 'Gaurav' }]
    const wb = await buildImportTemplate(members, INSTRUMENTS)
    wb.Sheets['Gaurav (2)'] = wb.Sheets['Gaurav']
    wb.SheetNames.push('Gaurav (2)')

    const result = await readImportWorkbook(await toArrayBuffer(wb), members)
    expect(result.rows).toHaveLength(INSTRUMENTS.length)
    expect(result.unrecognisedSheets).toEqual(['Gaurav (2)'])
  })

  it('does not throw when at least one sheet is still a member sheet', async () => {
    const members: TemplateMember[] = [{ id: 'm-gaurav', name: 'Gaurav' }]
    const wb = await buildImportTemplate(members, INSTRUMENTS)
    wb.Sheets['Notes to self'] = wb.Sheets['Gaurav']
    wb.SheetNames.push('Notes to self')

    const result = await readImportWorkbook(await toArrayBuffer(wb), members)
    expect(result.unrecognisedSheets).toEqual(['Notes to self'])
    expect(result.rows).toHaveLength(INSTRUMENTS.length)
  })
})

// ---------------------------------------------------------------------------
// Files that are not the template
// ---------------------------------------------------------------------------

describe('a file that is not the import template', () => {
  it('is refused with a named error, not parsed into rows', async () => {
    const XLSX = await xlsx()
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['Date', 'Narration', 'Withdrawal', 'Deposit', 'Balance'],
      ['2026-01-01', 'UPI/ganesh', 500, null, 12000],
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'Statement')

    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    await expect(readImportWorkbook(buffer, [{ id: 'm1', name: 'Gaurav' }])).rejects.toBeInstanceOf(
      ImportWorkbookError,
    )
    await expect(readImportWorkbook(buffer, [{ id: 'm1', name: 'Gaurav' }])).rejects.toMatchObject({
      code: 'not_a_template',
    })
  })

  it('refuses a sheet named after a member that carries someone else\'s columns', async () => {
    const XLSX = await xlsx()
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['Date', 'Narration', 'Amount'],
      ['2026-01-01', 'UPI/ganesh', 500],
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'Gaurav')

    await expect(
      readImportWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer, [
        { id: 'm1', name: 'Gaurav' },
      ]),
    ).rejects.toMatchObject({ code: 'not_a_template' })
  })

  it('refuses a plain text file — SheetJS sniffs it as a one-row CSV, so the honest code is not_a_template', async () => {
    // Verified against the pinned build on 2026-09-11: `XLSX.read` does not
    // throw on arbitrary text, it parses it as a delimited sheet. So the
    // "unreadable" path is NOT what catches a wrong-file upload; the header
    // check is. Pinned here so a future reader does not assume otherwise.
    const notAWorkbook = new TextEncoder().encode('this is a text file, not an xlsx').buffer
    await expect(readImportWorkbook(notAWorkbook as ArrayBuffer, [{ id: 'm1', name: 'Gaurav' }])).rejects.toMatchObject(
      { code: 'not_a_template' },
    )
  })

  it('refuses corrupt bytes with unreadable_file rather than letting the parser error escape', async () => {
    // A truncated/corrupt ZIP: the xlsx container SheetJS really does reject.
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd, 0x00, 0x99, 0x42])
    const error = await readImportWorkbook(corrupt, [{ id: 'm1', name: 'Gaurav' }]).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ImportWorkbookError)
    expect((error as ImportWorkbookError).code).toBe('unreadable_file')
    // The refusal names no cell value and no internal parser text (I6's rule).
    expect((error as ImportWorkbookError).message).not.toMatch(/ZIP|Compression/i)
  })

  it('accepts a fixed-and-reuploaded rejects workbook, which carries one extra trailing column', async () => {
    const XLSX = await xlsx()
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      [...TEMPLATE_HEADERS, 'Reason'],
      ['equity-flexi-cap-fund', 'm1', 'Equity', 'Flexi Cap Fund', 400000, 450000, null, null, null, null, null, false, null, 'Amount invested is required.'],
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'Gaurav')

    const result = await readImportWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer, [
      { id: 'm1', name: 'Gaurav' },
    ])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].investedAmount).toBe(400000)
    expect(result.rows[0].slug).toBe('equity-flexi-cap-fund')
  })
})

// ---------------------------------------------------------------------------
// H1b: recorded identity, and the pre-H1b workbook that has none
// ---------------------------------------------------------------------------

describe('the recorded Member id column', () => {
  const LEGACY_HEADERS = TEMPLATE_HEADERS.filter((header) => header !== 'Member id')

  it('is a real column in the template, hidden alongside Slug', () => {
    expect([...TEMPLATE_HEADERS]).toContain('Member id')
    expect(TEMPLATE_HEADERS.indexOf('Member id')).toBe(TEMPLATE_HEADERS.indexOf('Slug') + 1)
  })

  it('falls back to the sheet-name map for a pre-H1b workbook with no Member id column at all', async () => {
    const XLSX = await xlsx()
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      [...LEGACY_HEADERS],
      ['equity-flexi-cap-fund', 'Equity', 'Flexi Cap Fund', 400000, 450000, null, null, null, null, null, false, 'old file'],
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'Gaurav')

    const result = await readImportWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer, [
      { id: 'm1', name: 'Gaurav' },
    ])

    expect(result.unrecognisedSheets).toEqual([])
    expect(result.rows).toHaveLength(1)
    // The legacy layout is read at ITS OWN column positions, not the new ones:
    // every column after Slug sits one to the left in that file.
    expect(result.rows[0].member.id).toBe('m1')
    expect(result.rows[0].slug).toBe('equity-flexi-cap-fund')
    expect(result.rows[0].instrumentName).toBe('Flexi Cap Fund')
    expect(result.rows[0].investedAmount).toBe(400000)
    expect(result.rows[0].currentValue).toBe(450000)
    expect(result.rows[0].notes).toBe('old file')
  })

  it('falls back to the sheet-name map when the column is present but blank on every row', async () => {
    const XLSX = await xlsx()
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      [...TEMPLATE_HEADERS],
      ['equity-flexi-cap-fund', '   ', 'Equity', 'Flexi Cap Fund', 400000, 450000, null, null, null, null, null, false, null],
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'Gaurav')

    const result = await readImportWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer, [
      { id: 'm1', name: 'Gaurav' },
    ])
    expect(result.unrecognisedSheets).toEqual([])
    expect(result.rows[0].member.id).toBe('m1')
  })
})

describe('the rejects workbook round trip keeps identity', () => {
  it('re-reads a rejects file against the right member even with the member list reordered', async () => {
    const elder: TemplateMember = { id: 'm-elder', name: 'Bartholomew Fitzwilliam Ashcroft the Elder' }
    const younger: TemplateMember = { id: 'm-younger', name: 'Bartholomew Fitzwilliam Ashcroft the Younger' }

    // Both members have one unparseable amount, so both land in needsAttention.
    const rawRows: RawImportRow[] = [elder, younger].map((member, index) => ({
      member,
      rowNumber: index + 2,
      slug: INSTRUMENTS[0].slug,
      instrumentName: INSTRUMENTS[0].name,
      investedAmount: member.id === 'm-elder' ? 'lots of money' : 'even more money',
      currentValue: 55000,
      units: null,
      monthlySip: null,
      startDate: null,
      maturityDate: null,
      nominee: null,
      emergencyFund: false,
      notes: null,
    }))
    const buckets = bucketImportRows({ rows: rawRows, instruments: INSTRUMENTS, existingHoldings: [] })
    expect(buckets.needsAttention).toHaveLength(2)

    const rejects = await buildRejectsWorkbook(rawRows, buckets)
    const XLSX = await xlsx()
    const bytes = XLSX.write(rejects, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

    // Reordered on the way back in, exactly the H1b hazard.
    const result = await readImportWorkbook(bytes, [younger, elder])

    expect(result.unrecognisedSheets).toEqual([])
    expect(result.rows.find((row) => row.investedAmount === 'lots of money')?.member.id).toBe('m-elder')
    expect(result.rows.find((row) => row.investedAmount === 'even more money')?.member.id).toBe('m-younger')
  })
})

// ---------------------------------------------------------------------------
// Nothing persists
// ---------------------------------------------------------------------------

describe('the reader writes nothing anywhere', () => {
  it('leaves localStorage and sessionStorage untouched, and makes no network call', async () => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    const members: TemplateMember[] = [{ id: 'm1', name: 'Gaurav' }]
    const wb = await buildImportTemplate(members, INSTRUMENTS)
    await setCell(wb.Sheets['Gaurav'] as AnySheet, 1, col('Amount invested'), 543210)
    await setCell(wb.Sheets['Gaurav'] as AnySheet, 1, col('Current value'), 543210)

    const before = globalThis.fetch
    let fetchCalls = 0
    globalThis.fetch = (async () => {
      fetchCalls += 1
      throw new Error('no network call expected')
    }) as typeof fetch
    try {
      const result = await readImportWorkbook(await toArrayBuffer(wb), members)
      expect(result.rows.length).toBeGreaterThan(0)
    } finally {
      globalThis.fetch = before
    }

    expect(fetchCalls).toBe(0)
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })
})
