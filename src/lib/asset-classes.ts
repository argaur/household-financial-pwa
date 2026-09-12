import type { AssetClass } from '@/lib/allocation'

/**
 * The asset-class identity in one place — label, color value, and the
 * Tailwind utility literals that carry the same color into the UI.
 *
 * The palette itself is defined once as per-theme CSS variables in
 * globals.css, and surfaced two ways: as Tailwind utilities (tailwind.config
 * .ts's `asset` group) for class-name consumers, and as `hsl(var(--…))`
 * strings below for Recharts' `fill` and inline `style` props, which need a
 * color value rather than a class name. Both point at the same variables, so
 * there is one source of truth and nothing to keep manually in sync.
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
 * The `asset` palette as colour *references*, not literals.
 *
 * Until 2026-09-11 this held the LIGHT hexes and nothing else, so the
 * allocation donut and its legend dots painted light-theme colours in dark
 * mode — the one place in the app that ignored the per-theme palette. The
 * old comment here called that out and deferred it, on the theory that
 * fixing it meant reading computed custom properties at render time.
 *
 * It does not. `hsl(var(--c-equity))` is a valid CSS colour value, and both
 * consumers accept one: an inline `style.backgroundColor` on the legend dot,
 * and an SVG `fill` presentation attribute on the Recharts <Cell>, which is
 * parsed as CSS and so resolves `var()` the same way. The variables are
 * already defined per theme in globals.css, so the donut now follows the
 * theme with no component change and no new colour.
 *
 * The name stays ASSET_HEX for its callers; the values are no longer hex.
 * Kept in sync with tailwind.config.ts's `asset` group, which points at the
 * same variables.
 */
export const ASSET_HEX: Record<AssetClass, string> = {
  equity: 'hsl(var(--c-equity))',
  debt: 'hsl(var(--c-debt))',
  gold: 'hsl(var(--c-gold))',
  hybrid: 'hsl(var(--c-hybrid))',
  'real-estate': 'hsl(var(--c-real-estate))',
  alternative: 'hsl(var(--c-alt))',
}

/**
 * The reserve (emergency fund) mark — `--c-ef` and `--card`, as references.
 *
 * Not an asset class, which is why it lives outside ASSET_HEX: emergency fund
 * is a per-holding flag that cuts across classes (globals.css says the same
 * thing at `--c-ef`). The donut paints the flagged part of a class with a
 * hatch built from these two: teal ground, surface-coloured rules.
 *
 * Theme-aware from 2026-09-11, same fix and same reasoning as ASSET_HEX
 * above — the <pattern>'s `fill` and `stroke` are presentation attributes,
 * which are parsed as CSS and resolve `var()`. `--card` is deliberately the
 * rule colour rather than a fixed paper white: the stripes are meant to read
 * as the surface showing through, so they have to follow the surface.
 */
export const RESERVE_HATCH = {
  /** --c-ef, per theme. */
  ground: 'hsl(var(--c-ef))',
  /** --card, per theme — the rule between the stripes. */
  rule: 'hsl(var(--card))',
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
