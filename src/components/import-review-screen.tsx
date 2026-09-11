import { useState } from 'react'
import type { BucketedRow, BucketedRows, ImportBucket } from '@/lib/import-bucketing'
import { cn } from '@/lib/utils'
import { track } from '@/lib/analytics'

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
 * `onDownloadRejects` and `onLeave` are the same kind of seam: this screen
 * only ever asks its host to act, matching `PiiDisclosureStep`'s
 * `onConfirm` pattern (I4) — it never builds the rejects workbook itself
 * (that is `import-rejects.ts`, I9) and never navigates anywhere itself.
 *
 * §I6.1's 390px trap: `sm:` fires at 390px in this project, the primary
 * phone width, not Tailwind's default 640px. Every layout-changing or
 * full-width class below therefore uses `md:`, never `sm:` — named in the
 * spec: the bucket header rows, the primary commit CTA, and (I9) the
 * rejects download button.
 *
 * I9's leave confirm (SPEC.md §I4 "Leaving the screen": "A confirm step,
 * because parsed rows are memory-only and leaving discards them") is a
 * self-contained inline block, the same pattern `holding-form.tsx` already
 * uses for its own destructive confirm (`confirmingDelete`): the copy shows
 * BEFORE `onLeave` is ever called, never after, so there is no path from
 * clicking "Cancel import" straight to a discard.
 *
 * H3 — "Add anyway" on Possible duplicate rows. A duplicate row is not
 * broken (SPEC.md/METRICS_PLAN.md's rationale: the ledger already holds
 * that instrument for that member, regardless of amount), so unlike Needs
 * attention or Skipped there is nothing to fix by re-uploading — the same
 * file re-run against the same ledger gets the same verdict. Each Possible
 * duplicate row gets an "Add anyway" button that promotes it into the
 * commit set. Promotion is tracked as a `Set` of row keys local to this
 * component, not by moving the row to another bucket: the row stays visible
 * under Possible duplicate, marked "Added" with an "Undo" button, so the
 * user always sees where it came from and can reverse the decision without
 * hunting for it after it jumps sections. The primary CTA's count and
 * `onCommit` both add promoted rows to the Ready bucket. `Undo` clears the
 * promotion silently; it never re-fires the analytics event, and there is
 * no "un-override" event (METRICS_PLAN.md defines none).
 */

export interface ImportReviewScreenProps {
  buckets: BucketedRows
  /** Named on the primary CTA — SPEC.md §I4 "Primary CTA". */
  ledgerName: string
  /**
   * Fired with the Ready bucket's rows plus any Possible duplicate rows the
   * user promoted via "Add anyway" (H3) — never Needs-attention or Skipped.
   * This component does not write anything itself.
   */
  onCommit: (rowsToCommit: BucketedRow[]) => void
  /**
   * Fired once the user confirms leaving the screen. Renders the "Cancel
   * import" affordance and its confirm step when provided; omit to hide the
   * leave affordance entirely (e.g. a host with no other place to go yet).
   */
  onLeave?: () => void
  /**
   * Fired when the rejects download is requested. Rendered only while at
   * least one row sits outside Ready, per SPEC.md §I4's "Rejects download"
   * panel decision. Omit to hide the button.
   */
  onDownloadRejects?: () => void
}

const BUCKET_ORDER: readonly ImportBucket[] = ['ready', 'needsAttention', 'possibleDuplicate', 'skipped']

const BUCKET_TITLES: Record<ImportBucket, string> = {
  ready: 'Ready',
  needsAttention: 'Needs attention',
  possibleDuplicate: 'Possible duplicate',
  skipped: 'Skipped',
}

const currency = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/** Stable identity for a row within a review session — used both as a React list key and as the promotion-set key. */
function rowKey(row: BucketedRow): string {
  return `${row.member.id}-${row.rowNumber}`
}

function RowBlock({
  row,
  isPromoted,
  onTogglePromote,
}: {
  row: BucketedRow
  /** Present only for Possible duplicate rows — undefined elsewhere hides the affordance entirely. */
  isPromoted?: boolean
  onTogglePromote?: () => void
}) {
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
      {onTogglePromote && (
        <div className="min-w-0 flex items-center gap-2">
          {isPromoted ? (
            <>
              <span className="rounded-full bg-muted px-2 py-0.5 text-caption font-medium text-muted-foreground">
                Added
              </span>
              <button
                type="button"
                onClick={onTogglePromote}
                className="min-h-11 min-w-0 rounded-md border px-3 py-1 text-caption font-medium text-muted-foreground"
              >
                Undo
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onTogglePromote}
              className="min-h-11 min-w-0 rounded-md border px-3 py-1 text-caption font-medium"
            >
              Add anyway
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function BucketSection({
  bucket,
  rows,
  promotedKeys,
  onTogglePromote,
}: {
  bucket: ImportBucket
  rows: BucketedRow[]
  /** Only meaningful for the Possible duplicate bucket — omitted elsewhere. */
  promotedKeys?: Set<string>
  onTogglePromote?: (row: BucketedRow) => void
}) {
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
          rows.map((row) => (
            <RowBlock
              key={rowKey(row)}
              row={row}
              isPromoted={bucket === 'possibleDuplicate' ? promotedKeys?.has(rowKey(row)) : undefined}
              onTogglePromote={
                bucket === 'possibleDuplicate' && onTogglePromote ? () => onTogglePromote(row) : undefined
              }
            />
          ))
        )}
      </div>
    </details>
  )
}

export function ImportReviewScreen({ buckets, ledgerName, onCommit, onLeave, onDownloadRejects }: ImportReviewScreenProps) {
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const [promotedKeys, setPromotedKeys] = useState<Set<string>>(new Set())

  const promotedRows = buckets.possibleDuplicate.filter((row) => promotedKeys.has(rowKey(row)))
  const readyCount = buckets.ready.length + promotedRows.length
  const ctaLabel = `Add ${readyCount} holding${readyCount === 1 ? '' : 's'} to ${ledgerName}`
  const rejectedCount = buckets.needsAttention.length + buckets.possibleDuplicate.length + buckets.skipped.length

  const handleTogglePromote = (row: BucketedRow) => {
    const key = rowKey(row)
    setPromotedKeys((previous) => {
      const next = new Set(previous)
      if (next.has(key)) {
        // Undo — no analytics event. METRICS_PLAN.md defines no "un-override" event.
        next.delete(key)
      } else {
        next.add(key)
        track('bulk_import_duplicate_overridden', {})
      }
      return next
    })
  }

  return (
    <section className="min-w-0 space-y-3">
      {onLeave && (
        <div className="min-w-0">
          {confirmingLeave ? (
            <div className="min-w-0 space-y-2 rounded-lg border bg-card p-3">
              <p className="text-caption text-muted-foreground">
                The rows you reviewed live only in this browser tab. Leaving now discards them for good.
              </p>
              <div className="flex flex-col gap-2 md:flex-row">
                <button
                  type="button"
                  onClick={onLeave}
                  className="min-h-11 min-w-0 rounded-md border border-destructive px-4 py-2 font-medium text-destructive md:w-auto"
                >
                  Leave without saving
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingLeave(false)}
                  className="min-h-11 min-w-0 rounded-md border px-4 py-2 font-medium md:w-auto"
                >
                  Keep reviewing
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingLeave(true)}
              className="min-h-11 min-w-0 rounded-md border px-4 py-2 font-medium text-muted-foreground md:w-auto"
            >
              Cancel import
            </button>
          )}
        </div>
      )}

      {BUCKET_ORDER.map((bucket) => (
        <BucketSection
          key={bucket}
          bucket={bucket}
          rows={buckets[bucket]}
          promotedKeys={bucket === 'possibleDuplicate' ? promotedKeys : undefined}
          onTogglePromote={bucket === 'possibleDuplicate' ? handleTogglePromote : undefined}
        />
      ))}

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <button
          type="button"
          disabled={readyCount === 0}
          onClick={() => onCommit([...buckets.ready, ...promotedRows])}
          className={cn(
            'min-h-11 w-full min-w-0 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'md:w-auto',
          )}
        >
          {ctaLabel}
        </button>

        {onDownloadRejects && rejectedCount > 0 && (
          <button
            type="button"
            onClick={onDownloadRejects}
            className="min-h-11 w-full min-w-0 rounded-md border px-4 py-2 font-medium md:w-auto"
          >
            Download rejects
          </button>
        )}
      </div>
    </section>
  )
}
