import { useMemo, type CSSProperties, type SVGProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * Guilloché rosette — the engraved banknote motif behind the landing cover.
 *
 * Documentation/design/COMPONENT_SHOWCASE.md's "D-016 Slice 5 — Mint/Treasury
 * Motif Components" table: `GuillocheMotif | static, decorative | text-brass,
 * --guilloche-opacity (.38 light / .35 dark) | Landing cover only — code-drawn
 * SVG, not raster`.
 *
 * The geometry is ported from the approved concept folio
 * (Documentation/design/concept/vittam-mint-folio.html, the `[data-guilloche]`
 * block in its script): `rings` congruent ellipses sharing one centre, each
 * rotated a further `180 / rings` degrees, inside a single hairline ring. The
 * moiré that reads as engraving is the interference between those overlapping
 * strokes, so the ring count is the only knob the folio exposes — 30 on the
 * landing cover, 26 on the net-worth card, 36 on the folio cover.
 *
 * Generated in the component rather than shipped as a pasted path so the ring
 * count stays a parameter and the strokes stay real vectors at any size.
 * `currentColor` is what lets `text-brass` drive it in both themes.
 *
 * The opacity is `opacity-[var(--guilloche-opacity)]`, a class, not an inline
 * style. React treats `opacity` in the `style` prop as a numeric property and
 * coerces a `var(...)` string to `NaN`, which drops the rule silently — the
 * motif renders at full strength and nothing errors. Pinned by a test below.
 *
 * Purely decorative: `aria-hidden`, `focusable={false}` (IE/Edge legacy tab
 * stop), `pointer-events-none`. It carries no meaning a screen reader loses.
 */
export type GuillocheMotifProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  /** Number of rotated ellipses. Folio values: 26, 30 (landing cover), 36. */
  rings?: number
}

const DEFAULT_RINGS = 30

/**
 * Milliseconds between one ring's reveal and the next. 16ms across 30 rings
 * is a 464ms sweep; with the 520ms per-ring duration the whole rosette is
 * open in about a second. Small enough that the rings read as one opening
 * flower rather than as thirty separate events.
 */
const RING_STAGGER_MS = 16

export function GuillocheMotif({ rings = DEFAULT_RINGS, className, ...props }: GuillocheMotifProps) {
  const count = Math.max(1, Math.trunc(rings))

  // Memoised on `count` alone, which is the only thing it depends on and is
  // static in every current caller. Without this, 30 style objects and 30
  // rotations are rebuilt on every render of the page that hosts the motif,
  // and 30 new object identities defeat React's reconciliation for shapes
  // that never actually change.
  const ringProps = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => {
        const rotation = (index * 180) / count
        return {
          rotation,
          style: {
            '--ring-rotation': `${rotation}deg`,
            animationDelay: `${index * RING_STAGGER_MS}ms`,
          } as CSSProperties,
        }
      }),
    [count],
  )

  return (
    <svg
      viewBox="0 0 200 200"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
      data-testid="guilloche-motif"
      className={cn('pointer-events-none select-none text-brass opacity-[var(--guilloche-opacity)]', className)}
      {...props}
    >
      {ringProps.map(({ rotation, style }, index) => (
        <ellipse
          key={index}
          cx="100"
          cy="100"
          rx="92"
          ry="34"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.45"
          // Kept as an attribute, not folded into the CSS keyframe: the
          // keyframe only exists under `prefers-reduced-motion:
          // no-preference`, so without it a reduced-motion visitor would
          // get `count` identical un-rotated ellipses instead of a rosette.
          transform={`rotate(${rotation} 100 100)`}
          className="guilloche-ring"
          style={style}
        />
      ))}
      <circle
        cx="100"
        cy="100"
        r="97"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.6"
        className="guilloche-rim"
        style={{ animationDelay: `${count * RING_STAGGER_MS}ms` }}
      />
    </svg>
  )
}
