import { useEffect, useId, useMemo, useRef } from 'react'
import { PieChart, Pie, Cell } from 'recharts'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { VaultFrame } from '@/components/vault-frame'
import type { AllocationSlice, AssetClass } from '@/lib/allocation'
// Copy: Documentation/design/COPY_DECK.md — "Allocation donut section".
// Labels and hex live in the shared asset-class identity module so the donut,
// the Explore grid and the section pages stay one system.
import { ASSET_LABELS, ASSET_HEX as ASSET_COLORS, RESERVE_HATCH } from '@/lib/asset-classes'

/**
 * One drawn arc. An asset class holding no reserve draws as a single arc, the
 * way it always has. A class holding some emergency fund draws as two adjacent
 * arcs — the open part in the class colour, then the reserve part hatched.
 *
 * Splitting inside the class rather than promoting the reserve to a slice of
 * its own is the honest reading of the data: `isEmergencyFund` is a per-holding
 * flag, so reserve money is *also* debt or equity money. Carving it out would
 * make the legend's "Debt 30%" stop being true of the household's debt. See
 * AllocationSlice.reserveValue in src/lib/allocation.ts.
 */
interface DonutSegment {
  key: string
  assetClass: AssetClass
  value: number
  reserve: boolean
}

export function toDonutSegments(allocation: AllocationSlice[]): DonutSegment[] {
  return allocation.flatMap((slice) => {
    // Clamp: reserveValue is a subset of value by construction, but a caller
    // hand-building a slice could disagree, and a negative open arc would
    // silently corrupt every angle after it.
    const reserve = Math.min(Math.max(slice.reserveValue ?? 0, 0), slice.value)
    if (reserve <= 0) {
      return [{ key: slice.assetClass, assetClass: slice.assetClass, value: slice.value, reserve: false }]
    }
    const open = slice.value - reserve
    const segments: DonutSegment[] = []
    if (open > 0) {
      segments.push({ key: `${slice.assetClass}-open`, assetClass: slice.assetClass, value: open, reserve: false })
    }
    segments.push({ key: `${slice.assetClass}-reserve`, assetClass: slice.assetClass, value: reserve, reserve: true })
    return segments
  })
}

const currency = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
function formatInr(value: number): string {
  return `₹${currency.format(value)}`
}

export type AllocationDonutState = 'loading' | 'empty' | 'populated'

interface AllocationDonutProps {
  state: AllocationDonutState
  allocation: AllocationSlice[]
  totalValue: number
}

export function AllocationDonut({ state, allocation, totalValue }: AllocationDonutProps) {
  // Recharts stamps each sector <path> with tabindex="-1". The chart lives
  // inside an aria-hidden wrapper (the labelled parent + text legend are the
  // accessible representation), and aria-hidden must not contain focusable
  // descendants — so strip the stray tabindex after render (axe: aria-hidden-focus).
  const chartRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    chartRef.current?.querySelectorAll('[tabindex]').forEach((el) => el.removeAttribute('tabindex'))
  }, [state, allocation])

  // SVG ids are document-global and this card can mount more than once (the
  // dashboard renders one, a future compare view could render two side by
  // side). useId gives a per-instance value; React 18 formats it as ":r0:",
  // and a colon inside url(#...) is not portable, so strip to [A-Za-z0-9].
  const hatchId = `ef-hatch-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const segments = useMemo(() => toDonutSegments(allocation), [allocation])
  const hasReserve = segments.some((segment) => segment.reserve)

  return (
    <section>
      <VaultFrame className="p-4 md:p-6 space-y-4">
      <h2 className="section-label">Where your money lives</h2>

      {state === 'loading' && (
        <div className="flex flex-col items-center gap-4 py-2" data-testid="allocation-donut-loading">
          <Skeleton className="h-40 w-40 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      )}

      {state === 'empty' && (
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          {/*
            Ghost/outline ring — SPEC.md §7 flags this as a non-trivial custom
            SVG (Recharts has no built-in "no data" ring mode) with a named
            simpler fallback (a single neutral-gray 100% Recharts segment).
            The ring is small and self-contained enough that building it
            directly was not meaningfully harder than the fallback, so we
            built the real thing rather than taking the shortcut.
          */}
          <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true" role="presentation">
            <circle
              cx="80"
              cy="80"
              r="64"
              fill="none"
              stroke="currentColor"
              strokeWidth="16"
              strokeDasharray="6 8"
              className="text-muted-foreground/30"
            />
          </svg>
          <div className="space-y-1">
            <p className="text-body font-medium">Nothing recorded yet.</p>
            <p className="text-body text-muted-foreground">
              Add your first investment or asset to see how your household's money is distributed.
            </p>
          </div>
          <Button variant="ghost" asChild>
            <Link to="/portfolio">Record a holding</Link>
          </Button>
        </div>
      )}

      {state === 'populated' && (
        <div className="space-y-4">
          <div className="flex justify-center" role="img" aria-label="Household asset allocation by class">
            {/*
              The labelled wrapper above is the accessible representation, and
              the <ul> legend below carries the real per-class values. Recharts
              exposes each sector as its own <svg>/<path> with no name, which
              trips axe's svg-img-alt; hide the decorative chart internals from
              assistive tech so the wrapper's single label speaks for it.
            */}
            <div aria-hidden="true" ref={chartRef}>
              <PieChart width={200} height={200}>
                {/*
                  Recharts has no hatch/texture fill of its own (SPEC.md §S7),
                  so the reserve treatment is a hand-wired SVG <pattern> that
                  Cells point at with fill="url(#…)" — the same escape hatch
                  Recharts documents for gradients. Geometry is the concept
                  folio's: a 5x5 tile rotated 45°, teal ground, one paper-
                  coloured rule. Rendered only when something uses it, so a
                  household with no emergency fund ships no dead def.
                */}
                {hasReserve && (
                  <defs>
                    <pattern id={hatchId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <rect width="5" height="5" fill={RESERVE_HATCH.ground} />
                      <line x1="0" y1="0" x2="0" y2="5" stroke={RESERVE_HATCH.rule} strokeWidth="2.2" />
                    </pattern>
                  </defs>
                )}
                <Pie
                  data={segments}
                  dataKey="value"
                  nameKey="assetClass"
                  innerRadius={56}
                  outerRadius={80}
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {segments.map((segment) => (
                    <Cell
                      key={segment.key}
                      fill={segment.reserve ? `url(#${hatchId})` : ASSET_COLORS[segment.assetClass]}
                    />
                  ))}
                </Pie>
              </PieChart>
            </div>
          </div>
          <ul className="space-y-1.5">
            {allocation.map((slice) => (
              <li key={slice.assetClass} className="flex items-center justify-between text-body">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: ASSET_COLORS[slice.assetClass] }}
                    aria-hidden="true"
                  />
                  {ASSET_LABELS[slice.assetClass]}
                </span>
                <span className="text-muted-foreground">{slice.percentage}%</span>
              </li>
            ))}
          </ul>
          <div className="pt-1">
            <p className="text-caption text-muted-foreground">Total recorded value</p>
            <p className="text-body font-semibold">{formatInr(totalValue)}</p>
          </div>
        </div>
      )}
      </VaultFrame>
    </section>
  )
}
