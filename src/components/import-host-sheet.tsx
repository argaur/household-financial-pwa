import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { PiiDisclosureStep } from '@/components/pii-disclosure-step'
import { ImportDropZone, type ImportFileRejection } from '@/components/import-drop-zone'
import { ImportReviewScreen, importReviewRowKey } from '@/components/import-review-screen'
import { buildImportTemplate, trackImportTemplateDownloaded, type TemplateMember } from '@/lib/import-template'
import { buildImportTemplateFilename } from '@/lib/import-filename'
import { readImportWorkbook, ImportWorkbookError } from '@/lib/import-workbook-read'
import { bucketImportRows, type BucketedRow, type BucketedRows, type RawImportRow } from '@/lib/import-bucketing'
import { buildRejectsWorkbook, buildRejectsFilename } from '@/lib/import-rejects'
import { commitImportBatch, trackImportCompleted, ImportCommitError } from '@/lib/import-commit'
import { downloadWorkbook } from '@/lib/workbook-download'
import { MAX_LEDGER_HOLDINGS } from '@/lib/ledgers-api'
import { useOnline, OFFLINE_WRITE_MESSAGE } from '@/lib/use-online'
import { track } from '@/lib/analytics'
import type { Instrument } from '@/lib/instruments-api'
import type { Holding } from '@/lib/holdings-api'

/**
 * D-025 step H4 — the bulk-import host surface.
 *
 * Chunk I built every piece of this feature and assembled none of them: the
 * disclosure step, the drop zone, the workbook reader, the bucketer, the
 * review screen, the rejects builder and the commit path were all complete,
 * tested, and unreachable. This component is the assembly, and it is the only
 * file in the feature that knows the ORDER of the steps.
 *
 * WHY A SHEET IN PORTFOLIO, NOT A ROUTE. Portfolio already holds the unlocked
 * vault, the decrypted member list, the instrument library and the target
 * ledger's holdings. A dedicated route would have to re-gate and re-fetch all
 * four, and would turn I9's leave-confirm into a router-blocking problem
 * instead of what it actually is: a confirm before the overlay closes. This
 * matches `AddHoldingSheet`, the other overlay that hosts a full sub-flow.
 *
 * CONTROLLED, AND WITHOUT A TRIGGER. `open`/`onOpenChange` is the whole entry
 * contract; the Portfolio button that opens it is step H5's job, not this
 * file's, so nothing here renders a trigger.
 *
 * NOTHING PARSED IS PERSISTED. Every parsed row lives in `useState` for the
 * span of one open sheet and dies with it — no storage, no cache, no draft.
 * I12's absence proof stays true because this file adds no new place to put a
 * row, and the two workbooks it saves to disk go out as an in-memory blob
 * whose object URL is revoked in a `finally` (`workbook-download.ts`).
 *
 * THE SEVEN EVENTS. METRICS_PLAN.md lines 320-326 specify seven events that
 * had no call site anywhere in Chunk I. Six of them fire from this file
 * (`bulk_import_duplicate_overridden` is the seventh and belongs to the
 * review screen, where the tap happens). Every one carries counts or a fixed
 * enum and nothing else. A FILE NAME IS NOT A SAFE PROPERTY: it carries the
 * ledger name by construction and can carry a member name, which is why
 * `bulk_import_file_rejected` names a reason rather than the file it refused.
 *
 * §I6.1's 390px trap: `sm:` fires at 390px in this project, not Tailwind's
 * default 640px, so every layout-changing class below is `md:`.
 */

/** Where the user is in the flow. Also the `bulk_import_abandoned` stage vocabulary, exactly. */
type ImportStage = 'disclosure' | 'upload' | 'review'

interface ParseResult {
  /** Kept because a `BucketedRow` cannot reproduce the original cells the rejects file has to carry. */
  rawRows: RawImportRow[]
  buckets: BucketedRows
  unrecognisedSheets: string[]
  missingMembers: TemplateMember[]
}

export interface ImportHostSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The ledger every committed row lands in. Never carried per row — see `holdings-batch.ts`. */
  ledgerId: string
  ledgerName: string
  /** Decrypted household members, in the order the template will write their tabs. */
  members: TemplateMember[]
  /** The full instrument library, the same list the rows are bucketed against. */
  instruments: Instrument[]
  /** The target ledger's holdings, DECRYPTED — duplicate detection needs both sides in plaintext. */
  existingHoldings: Holding[]
  /** Fired after a successful commit with the number of rows inserted, so the host can refetch. */
  onCommitted?: (inserted: number) => void
  /** Overridable so file names are deterministic in tests. */
  now?: () => Date
}

/**
 * Moves the rows the user promoted with "Add anyway" out of Possible
 * duplicate and into Ready, so both the rejects workbook and
 * `trackImportCompleted` see the same set of rows the commit actually sent.
 *
 * This is the H3 inconsistency made structural rather than argued about: a
 * promoted row is a committed row, and a committed row is not a rejected one.
 * Leaving it in Possible duplicate would put it in the rejects file the user
 * downloads to fix things, and re-uploading that file would add the row a
 * second time — a real duplicate, created by the tool that exists to avoid
 * one.
 */
function applyPromotions(buckets: BucketedRows, promotedRows: BucketedRow[]): BucketedRows {
  if (promotedRows.length === 0) return buckets
  const promotedKeys = new Set(promotedRows.map(importReviewRowKey))
  return {
    ready: [...buckets.ready, ...promotedRows],
    needsAttention: buckets.needsAttention,
    possibleDuplicate: buckets.possibleDuplicate.filter((row) => !promotedKeys.has(importReviewRowKey(row))),
    skipped: buckets.skipped,
  }
}

function countRejected(buckets: BucketedRows): number {
  return buckets.needsAttention.length + buckets.possibleDuplicate.length + buckets.skipped.length
}

/**
 * `ImportCommitError.status` to the fixed `bulk_import_failed` enum. The enum
 * has three values and so does this: 403 is the tenancy refusal
 * (`holdings-batch.ts`'s ledger-ownership and member checks), 409 is the row
 * cap, and everything else — a 400, a 500, a dropped connection — is a batch
 * error. No message text reaches the event.
 */
function failureReason(error: unknown): 'batch_error' | 'ledger_full' | 'forbidden' {
  if (error instanceof ImportCommitError) {
    if (error.status === 403) return 'forbidden'
    if (error.status === 409) return 'ledger_full'
  }
  return 'batch_error'
}

export function ImportHostSheet({
  open,
  onOpenChange,
  ledgerId,
  ledgerName,
  members,
  instruments,
  existingHoldings,
  onCommitted,
  now,
}: ImportHostSheetProps) {
  const { getToken } = useAuth()
  const online = useOnline()

  const [stage, setStage] = useState<ImportStage>('disclosure')
  const [parse, setParse] = useState<ParseResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Set the moment a commit succeeds, so the close that follows is reported
  // as a finished import rather than an abandoned one. A ref, not state: it
  // is read inside the close handler in the same tick the commit resolves.
  const committedRef = useRef(false)

  // Radix keeps a Sheet's content mounted between opens rather than
  // remounting it (the trap D-016 and M2 both paid for), so a reopened sheet
  // would otherwise show the previous upload's review screen. Reset during
  // render on the open transition, per React's "adjusting state when a prop
  // changes" pattern, so no stale step is ever painted.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setStage('disclosure')
      setParse(null)
      setBusy(false)
      setError(null)
      committedRef.current = false
    }
  }

  // "User opens the import entry point" (METRICS_PLAN.md line 320). Keyed on
  // `open` alone, so a reopen counts as a second start and a closed sheet
  // costs nothing at all.
  useEffect(() => {
    if (!open) return
    track('bulk_import_started', {})
  }, [open])

  const stageRef = useRef(stage)
  stageRef.current = stage

  /** Every close path funnels through here, so abandonment is counted once and in one place. */
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !committedRef.current) {
        track('bulk_import_abandoned', { stage: stageRef.current })
      }
      onOpenChange(next)
    },
    [onOpenChange],
  )

  const templateFilename = buildImportTemplateFilename(ledgerName, now ? now() : new Date())

  async function handleDownloadTemplate() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const workbook = await buildImportTemplate(members, instruments)
      await downloadWorkbook(workbook, templateFilename)
      trackImportTemplateDownloaded()
      setStage('upload')
    } catch {
      // Never a silent swallow. Staying on the disclosure step is deliberate:
      // there is no point offering an upload control for a file the user was
      // never given.
      setError('The template could not be created. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * The drop zone's own refusals. It shows its own message either way; this
   * only decides what, if anything, is counted.
   *
   * AN HONEST GAP, NOT A GUESS: METRICS_PLAN.md's `bulk_import_file_rejected`
   * enum is wrong_type / unreadable / wrong_shape / empty / too_many_rows.
   * None of those means "picked several files at once", so that refusal fires
   * no event rather than being filed under a value that would misdescribe it.
   * Adding an enum value is a METRICS_PLAN.md decision, not this file's.
   */
  function handleFileRejected(rejection: ImportFileRejection) {
    if (rejection === 'wrong_type') {
      track('bulk_import_file_rejected', { reason: 'wrong_type' })
    }
  }

  async function handleFileAccepted(file: File) {
    if (busy) return
    setBusy(true)
    setError(null)
    // SPEC.md §I8.2: a second upload REPLACES the review state. Clearing here
    // rather than merging is what makes that structural — there is nothing
    // left for the new rows to be folded into.
    setParse(null)

    try {
      const result = await readImportWorkbook(file, members)

      if (result.rows.length === 0) {
        track('bulk_import_file_rejected', { reason: 'empty' })
        setError(
          result.unrecognisedSheets.length > 0
            ? `No rows were found. These tabs did not match anyone in your household: ${result.unrecognisedSheets.join(', ')}. Rename them back and upload again.`
            : 'That file has no filled in rows yet. Add your holdings to the template and upload it again.',
        )
        return
      }

      if (result.rows.length > MAX_LEDGER_HOLDINGS) {
        // Counted before anything is bucketed, so the check costs nothing and
        // the user is not shown a review screen for a file that cannot commit.
        track('bulk_import_file_rejected', { reason: 'too_many_rows' })
        setError(
          `That file has more rows than a ledger can hold. The limit is ${MAX_LEDGER_HOLDINGS} holdings. Split it into smaller files and upload them one at a time.`,
        )
        return
      }

      const buckets = bucketImportRows({ rows: result.rows, instruments, existingHoldings })
      setParse({
        rawRows: result.rows,
        buckets,
        unrecognisedSheets: result.unrecognisedSheets,
        missingMembers: result.missingMembers,
      })
      track('bulk_import_review_shown', {
        rows_ready: buckets.ready.length,
        rows_attention: buckets.needsAttention.length,
        rows_duplicate: buckets.possibleDuplicate.length,
        rows_skipped: buckets.skipped.length,
      })
      setStage('review')
    } catch (caught) {
      if (caught instanceof ImportWorkbookError) {
        track('bulk_import_file_rejected', {
          reason: caught.code === 'not_a_template' ? 'wrong_shape' : 'unreadable',
        })
        // The reader's own messages name no cell value and no file name, so
        // they are safe to show verbatim (I6's contract).
        setError(caught.message)
        return
      }
      track('bulk_import_file_rejected', { reason: 'unreadable' })
      setError('That file could not be read. Upload the .xlsx file downloaded from the template step.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDownloadRejects(promotedRows: BucketedRow[]) {
    if (!parse || busy) return
    setBusy(true)
    setError(null)
    try {
      const effective = applyPromotions(parse.buckets, promotedRows)
      const workbook = await buildRejectsWorkbook(parse.rawRows, effective)
      await downloadWorkbook(workbook, buildRejectsFilename(ledgerName, now ? now() : new Date()))
      track('bulk_import_rejects_downloaded', { rows_rejected: countRejected(effective) })
    } catch {
      setError('The rejects file could not be created. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCommit(rowsToCommit: BucketedRow[]) {
    if (!parse || busy) return
    // The same refusal `NewLedgerModal` makes, for the same reason: there is
    // no write queue in v1, so a commit that appeared to work and then
    // dropped a household's holdings would be worse than one that plainly
    // waits. The CTA is already disabled while offline; this is the guard
    // behind it, so a programmatic click cannot get past the disabled state.
    if (!online) return

    setBusy(true)
    setError(null)
    try {
      const token = await getToken()
      const result = await commitImportBatch({ token, ledgerId, readyRows: rowsToCommit, instruments })

      // Counted from the buckets AS COMMITTED, promotions folded in, so
      // `rows_clean` is the number of rows that actually went to the server
      // and `rows_rejected` is what genuinely did not.
      const promotedRows = rowsToCommit.filter((row) => row.bucket === 'possibleDuplicate')
      trackImportCompleted(applyPromotions(parse.buckets, promotedRows))

      committedRef.current = true
      onCommitted?.(result.inserted)
      onOpenChange(false)
    } catch (caught) {
      track('bulk_import_failed', { reason: failureReason(caught) })
      setError(
        failureReason(caught) === 'ledger_full'
          ? `This ledger is full. It can hold ${MAX_LEDGER_HOLDINGS} holdings.`
          : 'Those holdings could not be added. Nothing was saved. Try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] min-w-0 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Import holdings into {ledgerName}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 min-w-0 space-y-4">
          {stage === 'disclosure' && (
            <PiiDisclosureStep
              ledgerName={ledgerName}
              memberNames={members.map((member) => member.name)}
              date={now ? now() : undefined}
              submitting={busy}
              onConfirm={handleDownloadTemplate}
              onCancel={() => handleOpenChange(false)}
            />
          )}

          {stage === 'upload' && (
            <div className="min-w-0 space-y-3">
              <p className="min-w-0 text-body text-foreground">
                Fill in the template, then upload it here. Nothing is saved until you review what it found.
              </p>
              <ImportDropZone
                disabled={busy}
                onFileAccepted={handleFileAccepted}
                onFileRejected={handleFileRejected}
              />
            </div>
          )}

          {stage === 'review' && parse && (
            <div className="min-w-0 space-y-3">
              {parse.unrecognisedSheets.length > 0 && (
                <p className="min-w-0 break-words text-caption text-muted-foreground">
                  These tabs did not match anyone in your household, so their rows were left out:{' '}
                  {parse.unrecognisedSheets.join(', ')}. Rename them back and upload again.
                </p>
              )}
              {parse.missingMembers.length > 0 && (
                <p className="min-w-0 break-words text-caption text-muted-foreground">
                  No tab was found for {parse.missingMembers.map((member) => member.name).join(', ')}.
                </p>
              )}
              <ImportReviewScreen
                buckets={parse.buckets}
                ledgerName={ledgerName}
                onCommit={handleCommit}
                onLeave={() => handleOpenChange(false)}
                onDownloadRejects={handleDownloadRejects}
                commitDisabled={!online || busy}
                commitDisabledNote={online ? undefined : OFFLINE_WRITE_MESSAGE}
              />
              <div className="min-w-0 space-y-2 border-t border-border-soft pt-3">
                <p className="min-w-0 text-caption text-muted-foreground">
                  Fixed something in Excel? Upload the file again. The new file replaces everything you see here.
                </p>
                <ImportDropZone
                  disabled={busy}
                  onFileAccepted={handleFileAccepted}
                  onFileRejected={handleFileRejected}
                />
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="min-w-0 break-words text-caption text-destructive">
              {error}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
