# A9: 390px manual verification checklist

Status: NOT RUN. Blocked on tooling (session Chrome cannot resize below ~630px; iframe blocked by CSP frame-ancestors; CSS zoom does not change matchMedia). Must be run by a human, or an agent with a real device or Chrome DevTools device toolbar.

This project redefines Tailwind `sm` to 390px (not the default 640px). `md` is 768px. Verify at exactly 390px wide, using Chrome DevTools device toolbar (e.g. "iPhone 14 Pro" preset or a custom 390 width) or a real phone.

## What to watch for

1. **The `sm`=390px trap.** Anything using `sm:` with mobile-first intent will fire AT 390px, not above it. Watch for full-width elements that shrink, or single-column layouts that switch to multi-column, right at this width. One instance (`InstrumentDetail` CTA) was already found and fixed to use `md:` instead.
2. **Card flex-row overflow.** The Explore library cards are now a flex row: a text block (name/summary/risk) plus either a "+ Add" button or an "In ledger" badge. At 390px, confirm a long instrument name does not push the button off-screen, and does not squash the button below tap size.
3. **44px touch targets.** The "+ Add" button and the detail-page "Record this in my plan" CTA must both be comfortably tappable, not visually clipped or overlapping neighboring elements.
4. **Dark mode.** All new text/background colors should look correct in dark mode: no washed-out or invisible text, no light-mode color bleeding through.

## Routes to visit

- `/explore/<any-section-slug>`: Library section list (e.g. `/explore/equity` or whatever section slugs exist; check `src/lib/library-sections.ts` for real slugs)
- `/explore/<section-slug>/<instrument-slug>`: Instrument detail page for any instrument in that section

## Matrix to run

Run each combination at width 390px:

| # | Surface | Theme | Auth | Vault |
|---|---|---|---|---|
| 1 | Library section list | Light | Signed out | n/a |
| 2 | Library section list | Dark | Signed out | n/a |
| 3 | Library section list | Light | Signed in | Unlocked |
| 4 | Library section list | Dark | Signed in | Unlocked |
| 5 | Library section list | Light | Signed in | Locked |
| 6 | Instrument detail | Light | Signed out | n/a |
| 7 | Instrument detail | Dark | Signed out | n/a |
| 8 | Instrument detail | Light | Signed in | Unlocked |
| 9 | Instrument detail | Dark | Signed in | Unlocked |
| 10 | Instrument detail | Light | Signed in | Locked |
| 11 | Add-holding sheet, locked-vault state | Light | Signed in | Locked |
| 12 | Add-holding sheet, locked-vault state | Dark | Signed in | Locked |

For rows 11-12, open the "+ Add" sheet (or the detail page's "Record this in my plan" button) while the vault is locked to render the embedded `Unlock` component inside the sheet.

## How to reach the locked-vault state

1. Sign in normally so a household with keys exists.
2. Open DevTools → Application → IndexedDB, find this app's database, and delete the vault's data key record (or clear the whole IndexedDB database for the origin).
3. Reload. `getVault()` now returns null, so `resolveVaultState` resolves to `unlock` the next time it's called (e.g. when opening the "+ Add" sheet).
4. Open "+ Add" on any instrument, or the detail page CTA, to render the embedded unlock form inside the sheet.

## What to check on each pass

- No element overflows the viewport horizontally (no page-level horizontal scrollbar).
- The "+ Add" button and "In ledger" badge stay fully visible and tappable next to the card text, for both short and long instrument names.
- Buttons are not visually squashed below the 44px floor.
- No layout jumps to a wider/multi-column arrangement that should only happen at 768px (`md`) or above.
- Text is legible in dark mode: no unreadable contrast, no light-only colors.
- The embedded `Unlock` form inside the sheet renders cleanly, without its own page chrome, and both passphrase and recovery-code paths are reachable and readable.

## Pass condition

All 12 rows render with no horizontal overflow, no squashed or off-screen "+ Add" button, no premature `md`/`sm` breakpoint misfire, and legible dark-mode colors throughout. Any failure blocks promotion until fixed and re-verified.
