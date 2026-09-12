/**
 * D-025 step I1 — the split point that keeps SheetJS out of the main bundle.
 *
 * SheetJS is roughly a megabyte. SPEC.md §I7 requires it to be "loaded by
 * dynamic import so the main bundle and the 2s load target are untouched", so
 * every consumer must come through here and nothing may `import ... from
 * 'xlsx'` at the top level. `spreadsheet-parser-pwa.config.test.ts` sweeps
 * `src/` for exactly that mistake, because one static import anywhere silently
 * undoes the split for the whole app.
 *
 * The dynamic import below is what Rollup turns into a separate async chunk;
 * `manualChunks` in `vite.config.ts` pins that chunk's name to
 * `spreadsheet-parser`, and the workbox `globPatterns` entry then precaches it
 * (SPEC.md §I6.7), so the import screen works offline.
 *
 * This is the seam only. The real template builder and row parser land in
 * D-025 steps I3 and I5 and belong in this chunk, reached through this module.
 */

/** The SheetJS surface this feature is allowed to use. Widen deliberately. */
export type SpreadsheetParser = typeof import('xlsx')

let pending: Promise<SpreadsheetParser> | null = null

/**
 * Resolves the SheetJS module, fetching its chunk on first call.
 *
 * The promise is memoised rather than the module: two near-simultaneous calls
 * (a user who clicks "download template" while a file is already dropping)
 * must not start two fetches. A rejected load is not memoised, so a failure
 * caused by being briefly offline can be retried by calling again.
 */
export function loadSpreadsheetParser(): Promise<SpreadsheetParser> {
  if (pending === null) {
    pending = import('xlsx').catch((error: unknown) => {
      pending = null
      throw error
    })
  }
  return pending
}

/** Test seam: drops the memoised chunk promise. Not used by application code. */
export function resetSpreadsheetParserForTests(): void {
  pending = null
}
