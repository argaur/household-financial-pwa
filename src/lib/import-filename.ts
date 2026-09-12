/**
 * D-025 step I4 — the bulk-import template's download file name.
 *
 * SPEC.md §I4, "Template download": "The file name carries the household's
 * ledger name and the date, so a stale download is identifiable by its
 * name." This module is the one place that name is built, so the disclosure
 * step and the eventual download button never re-derive it differently.
 *
 * The date part is built from local date fields (`getFullYear`/`getMonth`/
 * `getDate`), never `toISOString()`. D-025 decision 8 names this exact trap
 * for Excel serial dates under the IST offset (`toISOString()` reports the
 * UTC day, which can be a different calendar day from the browser's local
 * day); a file name stamped with the wrong day is the same class of bug
 * applied to a file name instead of a cell, so it gets the same fix here on
 * principle even though this call site is a plain `Date`, not a serial.
 */

/** Characters Windows, macOS and common browsers all refuse in a saved file name. */
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g

/** `2026-9-1` is ambiguous next to a ledger name; always zero-padded. */
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** `YYYY-MM-DD` from the date's local fields, never from `toISOString()`. See module doc. */
export function localDateStamp(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * Filesystem-safe stand-in for a ledger name: invalid characters become a
 * space (so "Retirement / Growth" doesn't collide with "Retirement Growth"),
 * repeated whitespace collapses, and the result is trimmed. Falls back to
 * "ledger" for a name that sanitizes to nothing, so the file name is never
 * left with a bare trailing hyphen.
 */
export function sanitizeForFilename(rawName: string): string {
  const cleaned = rawName
    .replace(INVALID_FILENAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length === 0 ? 'ledger' : cleaned.replace(/ /g, '-')
}

/** `vittam-import-<ledger>-<date>.xlsx`, the template download's file name. */
export function buildImportTemplateFilename(ledgerName: string, date: Date): string {
  return `vittam-import-${sanitizeForFilename(ledgerName)}-${localDateStamp(date)}.xlsx`
}
