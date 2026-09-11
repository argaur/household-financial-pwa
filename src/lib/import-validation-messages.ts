/**
 * D-025 step I6 — the message builder.
 *
 * SPEC.md §I6.8: "Per-cell validation messages name the column and the
 * reason and contain no cell value."
 *
 * This is the single place a per-cell rejection message is assembled.
 * `import-parser.ts` (I5) calls `buildValidationMessage` for all three of
 * its rejection codes rather than building strings of its own, so there is
 * one message vocabulary, not two that can drift apart.
 *
 * The hard constraint that makes the "never echoes the value" guarantee
 * structural rather than a discipline: this function's signature has no
 * parameter for the raw cell value at all. It cannot leak what it is never
 * given.
 */

/** The three rejection reasons I5's cell parsers can produce. */
export type ValidationRejectionCode = 'shorthand_amount' | 'unreadable_amount' | 'unreadable_date'

/**
 * Plain-language rejection text for one column and one reason. Never takes
 * the offending cell value -- these strings are the likeliest thing to reach
 * a Sentry breadcrumb or a user's screenshot (D-025's plaintext-leak
 * requirement).
 */
export function buildValidationMessage(code: ValidationRejectionCode, column: string): string {
  switch (code) {
    case 'shorthand_amount':
      return `${column} uses a shorthand amount. Enter the full number in rupees instead, for example 150000 or 1,50,000.`
    case 'unreadable_amount':
      return `${column} is not a number I can read. Enter digits in rupees, with or without commas, for example 150000 or 1,50,000.`
    case 'unreadable_date':
      return `${column} is not a date I can read. Use a real date cell, or type the date as YYYY-MM-DD.`
  }
}
