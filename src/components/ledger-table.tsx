import type { Holding } from '@/lib/holdings-api'
import type { Instrument } from '@/lib/instruments-api'
import { cn } from '@/lib/utils'

interface LedgerTableProps {
  /** The rows to render — always a real subset of a ledger's holdings, never Current's. */
  holdings: Holding[]
  /** Looked up per row by `instrumentId` to resolve a display name. */
  instruments: Instrument[]
  /**
   * Denominator for each row's weight column and the total row's 100%.
   * Defaults to the sum of `holdings`' own `currentValue` when omitted —
   * pass the full ledger's total explicitly whenever `holdings` is a
   * subset of a larger ledger (e.g. one member's slice), so weight reads
   * against the whole ledger, not just the subset passed in.
   */
  ledgerTotalValue?: number
  /** Opens the same edit sheet a Current holding card opens — a row is the edit trigger, matching the baseline list's own row-is-the-trigger pattern. */
  onSelect: (holding: Holding) => void
}

const currency = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

function instrumentName(instruments: Instrument[], instrumentId: string): string {
  return instruments.find((i) => i.id === instrumentId)?.name ?? 'Holding'
}

/**
 * COMPONENT_SHOWCASE.md's D-016 Slice 5 "LedgerTable" entry: `font-mono
 * .num`, `--panel` header bg, a double-rule total row — the folio's Portfolio
 * plate (Documentation/design/concept/vittam-mint-folio.html's `.ledger-table`
 * / `tr.total`). Used for non-baseline ledger views only; the baseline/
 * Current view keeps its own card-grid rendering, unchanged (src/pages/Portfolio.tsx).
 */
export function LedgerTable({ holdings, instruments, ledgerTotalValue, onSelect }: LedgerTableProps) {
  const rows = holdings.map((holding) => ({
    holding,
    label: instrumentName(instruments, holding.instrumentId),
    value: Number(holding.currentValue),
  }))
  const rowsTotal = rows.reduce((sum, row) => sum + row.value, 0)
  const denominator = ledgerTotalValue ?? rowsTotal

  function weightPercent(value: number): string {
    if (denominator <= 0) return '0%'
    return `${Math.round((value / denominator) * 100)}%`
  }

  if (rows.length === 0) return null

  return (
    <table className="w-full border-collapse text-body">
      <thead>
        <tr className="bg-panel">
          <th className="p-2 text-left font-mono text-[10px] font-medium uppercase tracking-[.14em] text-muted-foreground">
            Instrument
          </th>
          <th className="p-2 text-right font-mono text-[10px] font-medium uppercase tracking-[.14em] text-muted-foreground">
            Value
          </th>
          <th className="p-2 text-right font-mono text-[10px] font-medium uppercase tracking-[.14em] text-muted-foreground">
            Wt
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ holding, label, value }) => (
          <tr
            key={holding.id}
            role="button"
            tabIndex={0}
            aria-label={label}
            onClick={() => onSelect(holding)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(holding)
              }
            }}
            className="cursor-pointer border-b border-border-soft transition-colors hover:bg-accent/50"
          >
            <td className="p-2 text-left">{label}</td>
            <td className="tabular p-2 text-right font-mono text-caption">₹{currency.format(value)}</td>
            <td className="tabular p-2 text-right font-mono text-caption">{weightPercent(value)}</td>
          </tr>
        ))}
        <tr className={cn('border-double border-foreground font-semibold', 'border-t-[3px]')}>
          <td className="p-2 pt-3 text-left">Total</td>
          <td className="tabular p-2 pt-3 text-right font-mono text-caption">₹{currency.format(rowsTotal)}</td>
          <td className="tabular p-2 pt-3 text-right font-mono text-caption">{weightPercent(rowsTotal)}</td>
        </tr>
      </tbody>
    </table>
  )
}
