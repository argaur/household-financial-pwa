/**
 * D-025 step I5 — the two India-specific parsing traps.
 *
 * This module turns one raw spreadsheet cell into either a value or a
 * rejection. It does nothing else: bucketing (I7), the message builder's full
 * contract (I6), the review screen (I8) and the batch commit (I10/I11) are
 * separate steps and must not be folded in here.
 *
 * SPEC.md §I6.9 and §I6.10 are the two assertions this module exists to
 * satisfy, and `import-parser-traps.test.ts` is the file that proves them:
 *
 *   §I6.9  Excel date serials are formatted from local date parts. A serial
 *          for 1 January under an IST offset produces 1 January, not
 *          31 December. The UTC ISO formatter that §I6.9 names appears
 *          nowhere in this file -- not in code and not in prose, because the
 *          assertion is a source scan and a comment would satisfy it falsely.
 *          It is referred to below only as "the UTC formatter".
 *   §I6.10 Lakh grouping parses. Shorthand is rejected with a message, never
 *          guessed.
 *
 * ---------------------------------------------------------------------------
 * WHAT SHEETJS ACTUALLY RETURNS FOR A DATE CELL, VERIFIED NOT ASSUMED
 *
 * Probed against the pinned build (xlsx 0.20.3, the vendor tarball) on
 * 2026-09-11 by writing a workbook holding 1 January 2026 and reading it back
 * under two different process timezones:
 *
 *   read({ cellDates: false })  ->  { t: 'n', v: 46023 }
 *                                   A raw 1900-system serial. No Date object
 *                                   is constructed, so there is no timezone
 *                                   anywhere in the value.
 *
 *   read({ cellDates: true })   ->  { t: 'd', v: Date }
 *                                   The Date is positioned at UTC midnight of
 *                                   the sheet's calendar day. Identical
 *                                   instant under TZ=UTC and TZ=EST5EDT
 *                                   (2026-01-01T00:00:00.000Z both times), so
 *                                   the conversion itself is not
 *                                   timezone-dependent -- but reading LOCAL
 *                                   parts off it is. Under IST (+05:30) it
 *                                   reads back as 1 Jan 05:30 local, so local
 *                                   parts are right; under a NEGATIVE UTC
 *                                   offset it would read back as the previous
 *                                   day.
 *
 * That second finding is worth stating plainly because it runs slightly
 * against the framing in D-025 decision 8, which describes the trap as a Date
 * at LOCAL midnight being pushed backwards by the UTC formatter. Both framings
 * describe a real day-shift; they just sit on opposite sides of UTC.
 *
 * The response is to remove the ambiguity rather than pick a side: the parser
 * consumes SERIALS (`PARSER_READ_OPTIONS`), and converts them to calendar
 * parts with integer arithmetic that never constructs a `Date` at all. That
 * is correct under every offset, including UTC, and it satisfies §I6.9's
 * prohibition on the UTC formatter structurally rather than by discipline.
 *
 * The `Date` branch below is defensive only, for a caller that read with
 * `cellDates: true`. It uses local parts, matching §I6.9's wording and
 * `import-filename.ts`'s established approach, which is correct for IST and
 * every other non-negative UTC offset. It is not the supported path and the
 * test pins `PARSER_READ_OPTIONS.cellDates === false` so it stays that way.
 * ---------------------------------------------------------------------------
 */

import { buildValidationMessage, type ValidationRejectionCode } from './import-validation-messages'

/**
 * The SheetJS read options the upload step must use, so date cells arrive as
 * timezone-free serials. Spread into the `XLSX.read` call alongside `type`.
 * Pinned by `import-parser-traps.test.ts`.
 */
export const PARSER_READ_OPTIONS = { cellDates: false } as const

/** Anything `XLSX.utils.sheet_to_json` can hand back for a single cell. */
export type CellValue = string | number | boolean | Date | null | undefined

export type RejectionCode = ValidationRejectionCode

export interface ParseRejection {
  ok: false
  code: RejectionCode
  /** The column header, so the review screen can say where the problem is. */
  column: string
  /**
   * Plain-language reason. Names the column and what to do instead, and never
   * contains the cell value -- D-025's plaintext-leak requirement, because
   * these strings are the likeliest thing to reach a Sentry breadcrumb or a
   * screenshot. I6 owns this contract in full; this module must not violate it.
   */
  message: string
}

export type ParseResult<T> = { ok: true; value: T } | ParseRejection

function reject(code: RejectionCode, column: string, message: string): ParseRejection {
  return { ok: false, code, column, message }
}

// ---------------------------------------------------------------------------
// Excel date serials -> YYYY-MM-DD, with no Date object in the path
// ---------------------------------------------------------------------------

/**
 * Days from 1970-01-01 to a calendar date, inverted: Howard Hinnant's
 * `civil_from_days`. Pure integer arithmetic, so it has no timezone, no DST
 * and no epoch surprises. Valid across the whole range this app can see.
 */
function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719468
  const era = Math.floor(z / 146097)
  const dayOfEra = z - era * 146097
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  )
  const year = yearOfEra + era * 400
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153)
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1
  const month = monthPrime < 10 ? monthPrime + 3 : monthPrime - 9
  return { year: month <= 2 ? year + 1 : year, month, day }
}

/**
 * Serial of 1970-01-01 in Excel's 1900 date system, which counts a
 * 29 February 1900 that never existed. Serials at or above 61 carry that
 * phantom day and need the full offset; serials 1..59 sit below it and need
 * one day less.
 */
const EXCEL_EPOCH_OFFSET = 25569
const PHANTOM_LEAP_SERIAL = 60

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatParts(parts: { year: number; month: number; day: number }): string {
  return `${String(parts.year).padStart(4, '0')}-${pad2(parts.month)}-${pad2(parts.day)}`
}

/**
 * `YYYY-MM-DD` for an Excel 1900-system date serial, or `null` if the serial
 * has no real calendar day. The time fraction is discarded: a date-plus-time
 * serial is still that date.
 */
export function excelSerialToISODate(serial: number): string | null {
  if (!Number.isFinite(serial)) return null
  const wholeDays = Math.floor(serial)
  if (wholeDays < 1) return null
  if (wholeDays === PHANTOM_LEAP_SERIAL) return null // Excel's non-existent 29 Feb 1900
  const daysFromUnixEpoch =
    wholeDays > PHANTOM_LEAP_SERIAL ? wholeDays - EXCEL_EPOCH_OFFSET : wholeDays - EXCEL_EPOCH_OFFSET + 1
  return formatParts(civilFromDays(daysFromUnixEpoch))
}

/** `YYYY-MM-DD` from a Date's LOCAL fields, never the UTC formatter. See module doc. */
function localDatePartsToISODate(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null
  return formatParts({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() })
}

/** The one text date shape accepted, because every other shape is a guess about day/month order. */
const ISO_DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/

function parseISODateText(text: string): string | null {
  const match = ISO_DATE_TEXT.exec(text)
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  // Round-trip through the calendar so 2026-02-30 is rejected rather than rolled over.
  const roundTripped = formatParts(civilFromDays(daysFromCivil(year, month, day)))
  return roundTripped === text ? roundTripped : null
}

/** Hinnant's `days_from_civil`, the inverse of `civilFromDays`. Integer arithmetic only. */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yearOfEra = y - era * 400
  const dayOfYear = Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear
  return era * 146097 + dayOfEra - 719468
}

/**
 * One date cell -> `YYYY-MM-DD`, or `null` for a blank cell, or a rejection.
 * A blank cell is not an error: the template prefills every date column empty
 * on purpose.
 */
export function parseDateCell(raw: CellValue, column: string): ParseResult<string | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null }

  if (typeof raw === 'number') {
    const formatted = excelSerialToISODate(raw)
    return formatted === null
      ? reject('unreadable_date', column, buildValidationMessage('unreadable_date', column))
      : { ok: true, value: formatted }
  }

  if (raw instanceof Date) {
    const formatted = localDatePartsToISODate(raw)
    return formatted === null
      ? reject('unreadable_date', column, buildValidationMessage('unreadable_date', column))
      : { ok: true, value: formatted }
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed === '') return { ok: true, value: null }
    const formatted = parseISODateText(trimmed)
    return formatted === null
      ? reject('unreadable_date', column, buildValidationMessage('unreadable_date', column))
      : { ok: true, value: formatted }
  }

  // A boolean, or anything else a cell should never hold in a date column.
  return reject('unreadable_date', column, buildValidationMessage('unreadable_date', column))
}

// ---------------------------------------------------------------------------
// Amounts: lakh grouping parses, shorthand is refused
// ---------------------------------------------------------------------------

/**
 * Indian digit grouping is 2,2,3 from the right, not 3,3,3, so the two
 * conventions need separate patterns. Accepting either and rejecting anything
 * else is what stops "1,5,0,000" from being comma-stripped into 150000 -- a
 * number no convention produces, and therefore a typo, not a value.
 */
const WESTERN_GROUPED = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/
const INDIAN_GROUPED = /^\d{1,2}(?:,\d{2})*,\d{3}(?:\.\d+)?$/
const UNGROUPED = /^\d+(?:\.\d+)?$/

/** Leading currency marks a user may type. Stripping these changes no magnitude. */
const CURRENCY_PREFIX = /^(?:₹|rs\.?|inr)\s*/i

/**
 * Splits "1.5L" into its number and its trailing word. Deliberately narrow:
 * the suffix is letters and dots only, so "150000 approx" and "1e5" fall
 * through to the generic rejection instead of being mislabelled as shorthand.
 */
const NUMBER_WITH_SUFFIX = /^([\d,]*\.?\d+)\s*([a-z.]+)$/i

/**
 * Every shorthand magnitude word a user might reasonably type into a rupee
 * column. All of them are REJECTED. D-025's rejected alternatives is explicit:
 * "Guessing at shorthand amounts ('1.5L'). Rejected: a wrong guess about money
 * is worse than a clear rejection message."
 */
const SHORTHAND_SUFFIXES = new Set([
  'l',
  'lac',
  'lacs',
  'lakh',
  'lakhs',
  'lk',
  'cr',
  'crore',
  'crores',
  'k',
  'thousand',
  'thousands',
  'th',
  'm',
  'mn',
  'million',
  'millions',
  'b',
  'bn',
  'billion',
  'billions',
])

/**
 * One amount cell -> a number, or `null` for a blank cell, or a rejection.
 * Never coerces: a value that is not unambiguously a plain rupee amount comes
 * back as a rejection with a reason, and the caller decides what to do.
 */
export function parseAmountCell(raw: CellValue, column: string): ParseResult<number | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null }

  if (typeof raw === 'number') {
    return Number.isFinite(raw)
      ? { ok: true, value: raw }
      : reject('unreadable_amount', column, buildValidationMessage('unreadable_amount', column))
  }

  if (typeof raw !== 'string') {
    // A boolean, a Date, anything else. Not an amount, and not guessable.
    return reject('unreadable_amount', column, buildValidationMessage('unreadable_amount', column))
  }

  // Normalise the invisible characters spreadsheets love: NBSP and narrow NBSP.
  const trimmed = raw.replace(/[  ]/g, ' ').trim()
  if (trimmed === '') return { ok: true, value: null }

  const withoutCurrency = trimmed.replace(CURRENCY_PREFIX, '').trim()

  const suffixMatch = NUMBER_WITH_SUFFIX.exec(withoutCurrency)
  if (suffixMatch !== null) {
    const suffix = suffixMatch[2].toLowerCase().replace(/\./g, '')
    if (SHORTHAND_SUFFIXES.has(suffix)) {
      return reject('shorthand_amount', column, buildValidationMessage('shorthand_amount', column))
    }
    return reject('unreadable_amount', column, buildValidationMessage('unreadable_amount', column))
  }

  const sign = withoutCurrency.startsWith('-') ? -1 : 1
  const digits = withoutCurrency.replace(/^[+-]/, '')

  const grouped = WESTERN_GROUPED.test(digits) || INDIAN_GROUPED.test(digits)
  if (!grouped && !UNGROUPED.test(digits)) {
    return reject('unreadable_amount', column, buildValidationMessage('unreadable_amount', column))
  }

  const value = Number(digits.replace(/,/g, ''))
  if (!Number.isFinite(value)) {
    return reject('unreadable_amount', column, buildValidationMessage('unreadable_amount', column))
  }
  return { ok: true, value: sign * value }
}
