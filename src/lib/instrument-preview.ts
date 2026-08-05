/**
 * Deliberate card previews for the instrument list (2026-08-05 rework).
 *
 * The list used to render the full `returns` and `risk` paragraphs through
 * CSS `line-clamp-1`, which clipped mid-sentence ("over short periods...",
 * "no..."). The rule now: a card never shows a CSS-truncated string. What it
 * shows instead is derived from how the seed copy is actually written:
 *
 * - `summary` is already a one-to-two-sentence definition written to fit
 *   (max 178 chars across all 30 instruments) — it renders in full.
 * - `risk` copy leads with a level before an em-dash, semicolon or period
 *   ("High — concentrated in..."). riskLevel() takes that leading clause,
 *   which is a complete thought by construction, never a mid-sentence cut.
 *
 * The full returns/tax/liquidity/risk paragraphs stay on the detail page,
 * which is where COPY_DECK.md always placed them.
 */
export function riskLevel(risk: string): string {
  const lead = risk.split(/\s+—\s+|;|(?<=\.)\s/)[0].trim()
  const clean = lead.endsWith('.') ? lead.slice(0, -1) : lead
  return clean.length > 0 ? clean : risk
}
