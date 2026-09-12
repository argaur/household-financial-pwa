/**
 * D-025 step I5 — the two India-specific parsing traps.
 *
 * Named "parser-traps" so `npm test -- parser-traps` selects exactly this
 * file, which is how the step is gated.
 *
 * SPEC.md §I6.9 and §I6.10 are the testable assertions this file exists for:
 *
 *   §I6.9  "Excel date serials are formatted from local date parts.
 *           Assertion: a serial for 1 January under an IST offset produces
 *           1 January, not 31 December. `toISOString()` appears nowhere in
 *           the parser."
 *   §I6.10 "Lakh grouping parses. Shorthand is rejected with a message,
 *           never guessed."
 *
 * ---------------------------------------------------------------------------
 * HOW THE DATE TEST IS MADE GENUINELY TIMEZONE-SENSITIVE
 *
 * A date test that passes under every offset proves nothing, so this file
 * does three things rather than one:
 *
 *   1. It pins the process timezone to Asia/Kolkata before any `Date` is
 *      constructed. Node re-reads `process.env.TZ`, so this is real on any
 *      host whose ICU data carries IANA zone names (Linux/CI). On the Windows
 *      dev box IANA names are ignored and the system zone is already IST, so
 *      the effective offset is the same either way.
 *   2. It asserts the effective offset really is IST (-330). Without this the
 *      whole date section could silently degrade into a vacuous pass on a UTC
 *      runner — an offset of 0 makes local parts and UTC parts identical, and
 *      a naive implementation would sail through.
 *   3. It asserts the COUNTERFACTUAL in-band: that the naive UTC-based
 *      implementation demonstrably produces "2025-12-31" for 1 January in
 *      this environment. That assertion is what proves the following
 *      assertions have teeth: the same input, through the parser, must come
 *      back "2026-01-01".
 *
 * Point 3 is the important one. It is not enough to assert the right answer;
 * this file also asserts that the wrong implementation would give a different,
 * named, wrong answer here.
 * ---------------------------------------------------------------------------
 */

// Must run before the first Date is constructed in this module.
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'Asia/Kolkata'

import { afterAll, describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  PARSER_READ_OPTIONS,
  parseAmountCell,
  parseDateCell,
} from './import-parser'

/**
 * Vitest isolates the module registry per file but not the worker process, so
 * a stray `process.env.TZ` would follow this file into whatever runs next in
 * the same worker. Files run sequentially inside a worker, so restoring it
 * here confines the change to this file.
 */
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

/** IST is +05:30, which `getTimezoneOffset()` reports as -330. */
const IST_OFFSET_MINUTES = -330

/** 1 January 2026 as an Excel 1900-system date serial. */
const SERIAL_1_JAN_2026 = 46023

// ---------------------------------------------------------------------------
// The environment guard, and the counterfactual that gives the date tests teeth
// ---------------------------------------------------------------------------

describe('timezone sensitivity of this file', () => {
  it('runs east of UTC at the IST offset, so local parts and UTC parts differ', () => {
    // If this fails, every date assertion below is vacuous rather than wrong.
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(IST_OFFSET_MINUTES)
  })

  it('proves a naive UTC-based implementation would report 31 December here', () => {
    // This is the exact naive implementation D-025 decision 8 forbids: build
    // the date from the serial in local time, then format it through
    // toISOString(). Under IST it loses a day. Asserted so that the passing
    // assertions below cannot be explained by "any implementation works here".
    const naive = new Date(1899, 11, 30 + SERIAL_1_JAN_2026).toISOString().slice(0, 10)
    expect(naive).toBe('2025-12-31')

    // The same trap applied to a Date cell rather than a serial.
    expect(new Date(2026, 0, 1).toISOString().slice(0, 10)).toBe('2025-12-31')
  })
})

// ---------------------------------------------------------------------------
// SPEC §I6.9 — Excel date serials
// ---------------------------------------------------------------------------

describe('SPEC §I6.9: Excel date serials are formatted from local date parts', () => {
  it('formats the serial for 1 January as 1 January, not 31 December', () => {
    const result = parseDateCell(SERIAL_1_JAN_2026, 'Start date')
    expect(result).toEqual({ ok: true, value: '2026-01-01' })
  })

  it('ignores the time fraction on a date-plus-time serial', () => {
    // 46023.99 is 1 January 2026, 23:45-ish. It is still 1 January.
    const result = parseDateCell(46023.99, 'Start date')
    expect(result).toEqual({ ok: true, value: '2026-01-01' })
  })

  it('formats a SheetJS date cell from its calendar day, not its UTC instant', () => {
    const result = parseDateCell(new Date(2026, 0, 1), 'Maturity date')
    expect(result).toEqual({ ok: true, value: '2026-01-01' })
  })

  it("honours Excel's 1900 leap-year bug rather than silently sliding a day", () => {
    // Serial 61 is 1 March 1900 in both Excel and reality.
    expect(parseDateCell(61, 'Start date')).toEqual({ ok: true, value: '1900-03-01' })
    // Serial 59 is 28 February 1900. It sits BELOW the phantom day, so the
    // 1900-system serial and the real calendar still agree here; the offset
    // the parser applies to serials 1..59 is one day different from the one it
    // applies above 60, which is the whole point of the bug.
    expect(parseDateCell(59, 'Start date')).toEqual({ ok: true, value: '1900-02-28' })
    expect(parseDateCell(1, 'Start date')).toEqual({ ok: true, value: '1900-01-01' })
    // Serial 60 is Excel's non-existent 29 February 1900. There is no correct
    // calendar answer, so it is rejected rather than guessed at.
    const phantom = parseDateCell(60, 'Start date')
    expect(phantom.ok).toBe(false)
  })

  it('accepts an unambiguous YYYY-MM-DD text date', () => {
    expect(parseDateCell('2026-01-01', 'Start date')).toEqual({ ok: true, value: '2026-01-01' })
    expect(parseDateCell('  2026-01-01  ', 'Start date')).toEqual({ ok: true, value: '2026-01-01' })
  })

  it('rejects an ambiguous slash date rather than guessing day-month order', () => {
    const result = parseDateCell('01/02/2026', 'Start date')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.column).toBe('Start date')
    expect(result.message).toContain('Start date')
    expect(result.message).not.toContain('01/02/2026')
  })

  it('treats a blank date cell as blank, not as an error', () => {
    expect(parseDateCell(null, 'Start date')).toEqual({ ok: true, value: null })
    expect(parseDateCell(undefined, 'Start date')).toEqual({ ok: true, value: null })
    expect(parseDateCell('   ', 'Start date')).toEqual({ ok: true, value: null })
  })

  it('reads date cells as serials, so the ambiguous Date branch is not the normal path', () => {
    // SheetJS returns a raw numeric serial when `cellDates` is false, and a
    // Date positioned at UTC midnight when it is true. The serial is the only
    // representation with no timezone in it at all, so it is the one the
    // upload step is pinned to.
    expect(PARSER_READ_OPTIONS.cellDates).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// SPEC §I6.9 — the structural half: toISOString appears nowhere in the parser
// ---------------------------------------------------------------------------

describe('SPEC §I6.9: toISOString appears nowhere in the parser', () => {
  it('has no toISOString call in import-parser.ts', () => {
    const source = readFileSync(resolve(__dirname, 'import-parser.ts'), 'utf8')
    expect(source).not.toContain('toISOString')
  })
})

// ---------------------------------------------------------------------------
// SPEC §I6.10 — lakh grouping parses
// ---------------------------------------------------------------------------

describe('SPEC §I6.10: lakh-grouped amounts parse', () => {
  it('parses Indian 2-2-3 grouping', () => {
    expect(parseAmountCell('1,50,000', 'Amount invested')).toEqual({ ok: true, value: 150000 })
    expect(parseAmountCell('12,34,567', 'Amount invested')).toEqual({ ok: true, value: 1234567 })
    expect(parseAmountCell('1,23,45,678', 'Amount invested')).toEqual({ ok: true, value: 12345678 })
  })

  it('parses ordinary 3-3-3 grouping', () => {
    expect(parseAmountCell('150,000', 'Amount invested')).toEqual({ ok: true, value: 150000 })
    expect(parseAmountCell('1,234,567', 'Amount invested')).toEqual({ ok: true, value: 1234567 })
  })

  it('parses an ungrouped string and a real numeric cell', () => {
    expect(parseAmountCell('150000', 'Amount invested')).toEqual({ ok: true, value: 150000 })
    expect(parseAmountCell(150000, 'Amount invested')).toEqual({ ok: true, value: 150000 })
  })

  it('parses a grouped amount with paise and with a rupee symbol', () => {
    expect(parseAmountCell('1,50,000.50', 'Current value')).toEqual({ ok: true, value: 150000.5 })
    expect(parseAmountCell(' ₹1,50,000 ', 'Current value')).toEqual({ ok: true, value: 150000 })
    expect(parseAmountCell('Rs. 1,50,000', 'Current value')).toEqual({ ok: true, value: 150000 })
    expect(parseAmountCell('INR 1,50,000', 'Current value')).toEqual({ ok: true, value: 150000 })
  })

  it('treats a blank amount cell as blank, not as an error', () => {
    expect(parseAmountCell(null, 'Amount invested')).toEqual({ ok: true, value: null })
    expect(parseAmountCell('', 'Amount invested')).toEqual({ ok: true, value: null })
    expect(parseAmountCell('   ', 'Amount invested')).toEqual({ ok: true, value: null })
  })

  it('rejects malformed grouping rather than stripping commas and hoping', () => {
    // Naive comma-stripping turns this into 150000. It is not a number any
    // convention produces, so it is a rejection, not a guess.
    const result = parseAmountCell('1,5,0,000', 'Amount invested')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('unreadable_amount')
  })

  it('rejects a number with trailing junk rather than letting Number() coerce it', () => {
    expect(parseAmountCell('150000 approx', 'Amount invested').ok).toBe(false)
    expect(parseAmountCell('1e5', 'Amount invested').ok).toBe(false)
    expect(parseAmountCell('--150000', 'Amount invested').ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// SPEC §I6.10 — shorthand is rejected, never guessed
// ---------------------------------------------------------------------------

/** Every shorthand form a user might reasonably type into a rupee column. */
const SHORTHAND_FORMS = [
  '1.5L',
  '1.5 L',
  '1.5l',
  '1.5L.',
  '1.5 lac',
  '1.5 lakh',
  '2 lakhs',
  '2Lakh',
  '1.2Cr',
  '1.2 cr',
  '1.2 crore',
  '3 crores',
  '50K',
  '50k',
  '50 thousand',
  '2M',
  '2 mn',
  '2 million',
  '1B',
  '1 bn',
  '1 billion',
]

describe('SPEC §I6.10: shorthand amounts are rejected, never guessed', () => {
  it.each(SHORTHAND_FORMS)('rejects %s instead of coercing it to a number', (form) => {
    const result = parseAmountCell(form, 'Amount invested')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('shorthand_amount')
  })

  it('names the column and what to do instead, in the rejection message', () => {
    const result = parseAmountCell('1.5L', 'Amount invested')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.column).toBe('Amount invested')
    expect(result.message).toContain('Amount invested')
    expect(result.message).toContain('full number in rupees')
  })

  it('never produces 150000 from "1.5L"', () => {
    const result = parseAmountCell('1.5L', 'Amount invested')
    expect(result.ok ? result.value : null).not.toBe(150000)
  })
})

// ---------------------------------------------------------------------------
// D-025's plaintext-leak requirement, applied to this step's own messages
// ---------------------------------------------------------------------------

describe('rejection messages name the column and the reason, never the value', () => {
  /**
   * Chosen to be unmistakable if echoed: every one of these fragments would
   * show up verbatim in a Sentry breadcrumb or a screenshot if the builder
   * interpolated the cell.
   */
  const UNMISTAKABLE = ['9,87,654', '987654', '87,654', '9876']

  const cases: Array<[string, () => { ok: boolean; message?: string }]> = [
    ['shorthand', () => parseAmountCell('9,87,654L', 'Amount invested')],
    ['unreadable amount', () => parseAmountCell('9,87,654 rupees-ish', 'Amount invested')],
    ['malformed grouping', () => parseAmountCell('9,8,7,654', 'Amount invested')],
    ['unreadable date', () => parseDateCell('9,87,654', 'Start date')],
  ]

  it.each(cases)('%s rejection echoes no part of the cell', (_label, run) => {
    const result = run()
    expect(result.ok).toBe(false)
    const message = result.message ?? ''
    for (const fragment of UNMISTAKABLE) {
      expect(message).not.toContain(fragment)
    }
  })
})
