import { PieChart, Pie, Cell } from 'recharts'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { AllocationSlice, AssetClass } from '@/lib/dashboard-api'

// Copy: Documentation/design/COPY_DECK.md — "Allocation donut section".
const ASSET_LABELS: Record<AssetClass, string> = {
  equity: 'Equity',
  debt: 'Debt',
  gold: 'Gold',
  hybrid: 'Hybrid',
  'real-estate': 'Real Estate',
  alternative: 'Alternative',
}

// Raw hex, not Tailwind classes — Recharts' `fill`/inline `style` props need
// actual color strings. Values mirror tailwind.config.ts's `asset` palette
// 1:1; keep both in sync if the palette changes.
const ASSET_COLORS: Record<AssetClass, string> = {
  equity: '#2D6A6A',
  debt: '#475569',
  gold: '#B45309',
  hybrid: '#6D28D9',
  'real-estate': '#15803D',
  alternative: '#9F3939',
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
  return (
    <section className="rounded-lg border p-4 space-y-4">
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
            <PieChart width={200} height={200}>
              <Pie
                data={allocation}
                dataKey="value"
                nameKey="assetClass"
                innerRadius={56}
                outerRadius={80}
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
              >
                {allocation.map((slice) => (
                  <Cell key={slice.assetClass} fill={ASSET_COLORS[slice.assetClass]} />
                ))}
              </Pie>
            </PieChart>
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
    </section>
  )
}
