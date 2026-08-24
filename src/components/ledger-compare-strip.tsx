import { useEffect } from 'react'
import { computeLedgerComparison, type LedgerCompareInputHolding } from '@/lib/ledger-compare'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import type { Ledger } from '@/lib/ledgers-api'

interface LedgerCompareStripProps {
  /** The non-baseline ledger being viewed — its id gates the once-per-view telemetry, its `snapshotOf`/`createdAt` gate the D-018 §4 propagation note. */
  ledger: Ledger
  ledgerHoldings: LedgerCompareInputHolding[]
  /** Current's holdings — the compare baseline. Never the ledger's own holdings. */
  baselineHoldings: LedgerCompareInputHolding[]
}

const currency = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const points = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' })

/**
 * "+"/"−" plus the word for zero — direction must never rely on colour alone
 * (accessibility constraint from the task spec). U+2212 (real minus), not a
 * hyphen, matches the "+" prefix typographically.
 */
function formatSignedDelta(value: number, format: (n: number) => string, suffix = ''): string {
  if (value === 0) return 'No change'
  const sign = value > 0 ? '+' : '−'
  return `${sign}${format(Math.abs(value))}${suffix}`
}

/** "1 percentage point", not "1 percentage points". Only an exact 1 is singular. */
function percentagePointSuffix(value: number): string {
  return Math.abs(value) === 1 ? ' percentage point' : ' percentage points'
}

function deltaColorClass(value: number): string {
  if (value > 0) return 'text-primary'
  if (value < 0) return 'text-destructive'
  return 'text-muted-foreground'
}

/**
 * D-018 §2's three-number compare strip, rendered on a non-baseline ledger's
 * dashboard (DATA_MODEL.md:348-349 — never on the Current tab, and never
 * before at least one non-baseline ledger exists). Copy here is unspecified
 * by the design docs (D-019 accepted this as a wireframe gap); the
 * constraints this component was written against are plain language, zero
 * em-dashes, and direction shown as a sign/word pair rather than colour
 * alone.
 */
export function LedgerCompareStrip({ ledger, ledgerHoldings, baselineHoldings }: LedgerCompareStripProps) {
  // Once per ledger view, not on every re-render while holdings load or
  // change — the effect is keyed on the ledger's id, not on the holdings
  // arrays, so an edit inside the same ledger doesn't refire it.
  useEffect(() => {
    track('compare_strip_viewed', {})
  }, [ledger.id])

  const { ledger: totals, delta } = computeLedgerComparison(ledgerHoldings, baselineHoldings)

  return (
    <section aria-labelledby="ledger-compare-heading" className="rounded-lg border bg-card p-4 space-y-4">
      <h2 id="ledger-compare-heading" className="text-body font-semibold">
        Compared to Current
      </h2>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-caption text-muted-foreground">Current value (₹)</dt>
          <dd className="text-body font-medium">₹{currency.format(totals.totalValue)}</dd>
          <dd className={cn('text-caption', deltaColorClass(delta.totalValueDelta))}>
            {formatSignedDelta(delta.totalValueDelta, (n) => `₹${currency.format(n)}`)} vs Current
          </dd>
        </div>

        <div>
          <dt className="text-caption text-muted-foreground">Equity share</dt>
          <dd className="text-body font-medium">{points.format(totals.equitySharePercent)}%</dd>
          {/* Worded in percentage points, not "%", so a +5 here can never be
              misread as "5% more equity" (a percent-of-percent change). */}
          <dd className={cn('text-caption', deltaColorClass(delta.equitySharePercentagePointDelta))}>
            {formatSignedDelta(
              delta.equitySharePercentagePointDelta,
              (n) => points.format(n),
              percentagePointSuffix(delta.equitySharePercentagePointDelta),
            )}{' '}
            vs Current
          </dd>
        </div>

        <div>
          <dt className="text-caption text-muted-foreground">Monthly SIP amount (₹)</dt>
          <dd className="text-body font-medium">₹{currency.format(totals.monthlySipTotal)}</dd>
          <dd className={cn('text-caption', deltaColorClass(delta.monthlySipDelta))}>
            {formatSignedDelta(delta.monthlySipDelta, (n) => `₹${currency.format(n)}`)} vs Current
          </dd>
        </div>
      </dl>

      {ledger.snapshotOf && (
        <p className="text-caption text-muted-foreground">
          This ledger was copied from Current on {dateFormat.format(new Date(ledger.createdAt))}. Changes you make to
          Current after that date don't carry over here.
        </p>
      )}
    </section>
  )
}
