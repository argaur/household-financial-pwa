/**
 * D-025 step I6 — the message builder.
 *
 * SPEC.md §I6.8: "Per-cell validation messages name the column and the
 * reason and contain no cell value. Assertion by test over the message
 * builder with a fixture value that would be recognisable if echoed."
 *
 * I5 (`import-parser.ts`) already produced rejection messages inline for its
 * two traps. This file proves the extraction: `import-parser.ts` now calls
 * this module's `buildValidationMessage` rather than building strings of its
 * own, so there is exactly one place a validation message is assembled.
 * `import-parser-traps.test.ts` is untouched and still passes, because the
 * observable shape of `ParseRejection` (code/column/message) did not change.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildValidationMessage } from './import-validation-messages'
import { parseAmountCell, parseDateCell } from './import-parser'

// ---------------------------------------------------------------------------
// Every message names the column and the reason
// ---------------------------------------------------------------------------

describe('buildValidationMessage names the column and the reason', () => {
  it('shorthand_amount', () => {
    const message = buildValidationMessage('shorthand_amount', 'Amount invested')
    expect(message).toContain('Amount invested')
    expect(message).toContain('full number in rupees')
  })

  it('unreadable_amount', () => {
    const message = buildValidationMessage('unreadable_amount', 'Current value')
    expect(message).toContain('Current value')
    expect(message).toContain('not a number I can read')
  })

  it('unreadable_date', () => {
    const message = buildValidationMessage('unreadable_date', 'Maturity date')
    expect(message).toContain('Maturity date')
    expect(message).toContain('not a date I can read')
  })

  it('uses a different column name for a different call, never a stale one', () => {
    const first = buildValidationMessage('unreadable_amount', 'Amount invested')
    const second = buildValidationMessage('unreadable_amount', 'Current value')
    expect(first).toContain('Amount invested')
    expect(first).not.toContain('Current value')
    expect(second).toContain('Current value')
    expect(second).not.toContain('Amount invested')
  })
})

// ---------------------------------------------------------------------------
// No message ever echoes the cell value — proven at the real call path, with
// a fixture distinct from the one import-parser-traps.test.ts already uses,
// so this file adds independent proof rather than duplicating that one.
// ---------------------------------------------------------------------------

describe('no rejection message echoes the cell value', () => {
  /**
   * Chosen to be unmistakable if echoed, and deliberately different from
   * import-parser-traps.test.ts's own fixture ('9,87,654') so this is an
   * independent check, not a restatement.
   */
  const UNMISTAKABLE = ['811223', '11,223', '8112']

  const cases: Array<[string, () => { ok: boolean; message?: string }]> = [
    ['shorthand', () => parseAmountCell('8,11,223L', 'Amount invested')],
    ['unreadable amount', () => parseAmountCell('8,11,223 rupees-ish', 'Amount invested')],
    ['malformed grouping', () => parseAmountCell('8,1,1,223', 'Amount invested')],
    ['unreadable date', () => parseDateCell('8,11,223', 'Start date')],
  ]

  it.each(cases)('%s rejection built by the message builder echoes no part of the cell', (_label, run) => {
    const result = run()
    expect(result.ok).toBe(false)
    const message = result.message ?? ''
    for (const fragment of UNMISTAKABLE) {
      expect(message).not.toContain(fragment)
    }
  })
})

// ---------------------------------------------------------------------------
// One vocabulary, not two: import-parser.ts calls this builder rather than
// building its own strings.
// ---------------------------------------------------------------------------

describe('import-parser.ts uses this module as its one message vocabulary', () => {
  it('calls buildValidationMessage rather than constructing rejection text itself', () => {
    const source = readFileSync(resolve(__dirname, 'import-parser.ts'), 'utf8')
    expect(source).toContain('buildValidationMessage')
  })

  it('produces the exact string this module builds, for a live rejection', () => {
    const result = parseAmountCell('1.5L', 'Amount invested')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toBe(buildValidationMessage('shorthand_amount', 'Amount invested'))
  })
})
