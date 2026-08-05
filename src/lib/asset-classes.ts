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

export const ASSET_HEX: Record<AssetClass, string> = {
  equity: '#2D6A6A',
  debt: '#475569',
  gold: '#B45309',
  hybrid: '#6D28D9',
  'real-estate': '#15803D',
  alternative: '#9F3939',
}

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
