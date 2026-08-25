import type { AssetClass } from '@/lib/allocation'

/**
 * The asset-class identity in one place — label, hex, and the Tailwind
 * utility literals that carry the same color into the UI.
 *
 * The palette itself is defined once in tailwind.config.ts (`asset` group)
 * and mirrored here as raw hex because Recharts' `fill` and inline `style`
 * props need actual color strings, not class names. Keep the two in sync.
 *
 * Brand note (Documentation/brand/brand-guide.md): this palette originally
 * shipped scoped to the allocation donut only. The 2026-08-05 design rework
 * widened its remit to the instrument library, so a class reads the same
 * color on the dashboard donut, the Explore grid and a section page. It is
 * still never used for generic UI chrome.
 *
 * The class maps below are full literals, never interpolated — Tailwind's
 * scanner cannot see through template strings (same pattern as
 * health-tier-card.tsx's TIER_CLASSES).
 */

export const ASSET_LABELS: Record<AssetClass, string> = {
  equity: 'Equity',
  debt: 'Debt',
  gold: 'Gold',
  hybrid: 'Hybrid',
  'real-estate': 'Real Estate',
  alternative: 'Alternative',
}

/**
 * Light-theme values of the `asset` palette, resolved to hex.
 *
 * These are the LIGHT values only — the CSS vars behind them
 * (--c-equity … --c-alt in globals.css) are native per-theme, and a hex
 * literal cannot follow `.dark`. Recharts is the only consumer, so the
 * dark-mode donut currently paints the light hexes; making it theme-aware
 * means reading the computed custom properties at render time, which is a
 * component change and not this pass's job.
 *
 * Updated 2026-08-25 from the retired v1 teal-era hexes to the mint palette.
 */
export const ASSET_HEX: Record<AssetClass, string> = {
  equity: '#1E7A5A',
  debt: '#4E6B80',
  gold: '#A07E2B',
  hybrid: '#924578',
  'real-estate': '#566F39',
  alternative: '#A04A3A',
}

/**
 * The reserve (emergency fund) mark — `--c-ef` and `--card`, resolved to hex.
 *
 * Not an asset class, which is why it lives outside ASSET_HEX: emergency fund
 * is a per-holding flag that cuts across classes (globals.css says the same
 * thing at `--c-ef`). The donut paints the flagged part of a class with a
 * hatch built from these two: teal ground, paper-coloured rules.
 *
 * Same LIGHT-theme-only limitation as ASSET_HEX above, and for the same
 * reason: an SVG <pattern>'s fill is a literal, and a literal cannot follow
 * `.dark`.
 */
export const RESERVE_HATCH = {
  /** --c-ef, light. */
  ground: '#2E7D8C',
  /** --card, light — the rule between the stripes. */
  rule: '#FAFCF8',
} as const

/** Legend/identity dot — the same mark the donut legend uses. */
export const ASSET_DOT_CLASS: Record<AssetClass, string> = {
  equity: 'bg-asset-equity',
  debt: 'bg-asset-debt',
  gold: 'bg-asset-gold',
  hybrid: 'bg-asset-hybrid',
  'real-estate': 'bg-asset-real-estate',
  alternative: 'bg-asset-alternative',
}

/** Left accent edge on library cards — identity, not decoration. */
export const ASSET_ACCENT_CLASS: Record<AssetClass, string> = {
  equity: 'border-l-asset-equity',
  debt: 'border-l-asset-debt',
  gold: 'border-l-asset-gold',
  hybrid: 'border-l-asset-hybrid',
  'real-estate': 'border-l-asset-real-estate',
  alternative: 'border-l-asset-alternative',
}
