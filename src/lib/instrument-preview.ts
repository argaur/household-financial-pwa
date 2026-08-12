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

/**
 * A one-clause, plain-word gloss for the handful of risk levels that appear
 * as a clean short word in the seed data (High, Low, Moderate, and so on).
 * Some instruments' risk field leads with a longer sentence instead (see
 * riskLevel's own doc comment) — those aren't in this map on purpose, so a
 * card shows the level alone rather than a gloss stitched onto the wrong
 * clause. Card-level UI copy only; does not touch the underlying seed data.
 */
const RISK_GLOSS: Record<string, string> = {
  'Very low': "you're very unlikely to lose money you put in",
  Low: "you're unlikely to lose money you put in",
  Moderate: 'the value can dip before it grows, but rarely by a lot',
  'Moderate to high': 'the value can swing a fair amount before it grows',
  High: 'the value can drop a lot in the short term',
  'Very high': 'the value can drop sharply and take years to recover',
}

export function riskGloss(level: string): string | null {
  return RISK_GLOSS[level] ?? null
}
