import type { BucketedRow, BucketedRows, ImportBucket } from '@/lib/import-bucketing'
import { cn } from '@/lib/utils'

/**
 * D-025 step I8 — the bulk-import review screen. `SPEC.md` §I4 and
 * `DATA_MODEL.md` note 16 are explicit that this screen, not the upload
 * control, IS the feature: it is the only place a household sees what a
 * parsed workbook resolved to before anything is written.
 *
 * State only, same discipline as `import-bucketing.ts` (I7): this component
 * never writes anywhere. `onCommit` is a callback the host wires to the
 * batch endpoint (I10) and the seal/commit path (I11), both out of scope
 * here — this component only ever hands back the Ready bucket's rows.
 *
 * §I6.1's 390px trap: `sm:` fires at 390px in this project, the primary
 * phone width, not Tailwind's default 640px. Every layout-changing or
 * full-width class below therefore uses `md:`, never `sm:` — named in the
 * spec: the bucket header rows and the primary commit CTA.
 */

export interface ImportReviewScreenProps {
  buckets: BucketedRows
  /** Named on the primary CTA — SPEC.md §I4 "Primary CTA". */
  ledgerName: string
  /** Fired with the Ready bucket's rows only. This component does not write anything itself. */
  onCommit: (readyRows: BucketedRow[]) => void
}

const BUCKET_ORDER: readonly ImportBucket[] = ['ready', 'needsAttention', 'possibleDuplicate', 'skipped']

const BUCKET_TITLES: Record<ImportBucket, string> = {
  ready: 'Ready',
  needsAttention: 'Needs attention',
  possibleDuplicate: 'Possible duplicate',
  skipped: 'Skipped',
}

const currency = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

function RowBlock({ row }: { row: BucketedRow }) {
  return (
    <div data-testid="import-review-row" className="min-w-0 space-y-1 border-b border-border-soft p-3 last:border-b-0">
      <div className="min-w-0 flex flex-col gap-0.5">
        <span className="text-caption text-muted-foreground">{row.member.name}</span>
        <span className="min-w-0 break-words text-body font-medium">{row.instrumentLabel}</span>
        {row.resolved && (
          <span className="tabular font-mono text-caption text-muted-foreground">
            ₹{currency.format(row.resolved.investedAmount)}
          </span>
        )}
      </div>
      {row.reasons.length > 0 && (
        <div className="min-w-0 space-y-0.5">
          {row.reasons.map((reason, index) => (
            <p key={index} className="min-w-0 break-words text-caption text-muted-foreground">
              {reason}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function BucketSection({ bucket, rows }: { bucket: ImportBucket; rows: BucketedRow[] }) {
  return (
    <details open={bucket === 'ready'} className="min-w-0 rounded-lg border bg-card">
      <summary className="flex min-h-11 min-w-0 cursor-pointer list-none items-center justify-between gap-2 p-3">
        <h3 className="min-w-0 break-words text-body font-semibold">{BUCKET_TITLES[bucket]}</h3>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-caption text-muted-foreground">
          {rows.length}
        </span>
      </summary>
      <div className="min-w-0 border-t border-border-soft">
        {rows.length === 0 ? (
          <p className="p-3 text-caption text-muted-foreground">No rows in this bucket.</p>
        ) : (
          rows.map((row) => <RowBlock key={`${row.member.id}-${row.rowNumber}`} row={row} />)
        )}
      </div>
    </details>
  )
}

export function ImportReviewScreen({ buckets, ledgerName, onCommit }: ImportReviewScreenProps) {
  const readyCount = buckets.ready.length
  const ctaLabel = `Add ${readyCount} holding${readyCount === 1 ? '' : 's'} to ${ledgerName}`

  return (
    <section className="min-w-0 space-y-3">
      {BUCKET_ORDER.map((bucket) => (
        <BucketSection key={bucket} bucket={bucket} rows={buckets[bucket]} />
      ))}

      <button
        type="button"
        disabled={readyCount === 0}
        onClick={() => onCommit(buckets.ready)}
        className={cn(
          'min-h-11 w-full min-w-0 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'md:w-auto',
        )}
      >
        {ctaLabel}
      </button>
    </section>
  )
}
