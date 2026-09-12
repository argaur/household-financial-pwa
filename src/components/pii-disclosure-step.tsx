import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics'
import { buildImportTemplateFilename } from '@/lib/import-filename'

/**
 * D-025 step I4 — the disclosure that stands between a household and the
 * bulk-import template download.
 *
 * SPEC.md §I4 is explicit: "A step before the download, not a checkbox
 * beside it." This component is deliberately a full step of its own
 * content, not a small checkbox control meant to sit next to a button —
 * there is nothing here that could be collapsed into one. Unlike
 * `AiConsentStep` (src/components/ai-consent-step.tsx), which is a body
 * swapped into an already-open host `Dialog`, this step renders plain
 * semantic markup with no Radix Dialog primitives of its own: D-025's entry
 * point ("a secondary action on the ledger's holdings view", SPEC.md §I4)
 * is not yet built, and nothing says this step is necessarily modal. A
 * future host can drop this into a `DialogContent`, a full-page wizard
 * step, or anywhere else a `<section>` fits without this component caring.
 *
 * This step does not touch the network and does not build or download the
 * workbook itself — `buildImportTemplate` (src/lib/import-template.ts,
 * step I3) does that. `onConfirm` is the seam: it receives the computed
 * file name and is the only thing this step does on confirm, matching the
 * `AiConsentStep` pattern of a disclosure step that hands off to its host
 * rather than performing the action itself.
 *
 * PII DISCLOSURE, NOT MITIGATION: D-025's hard requirements list is
 * explicit that a browser extension with file access is outside Vittam's
 * trust boundary, and that this is disclosed, never engineered around. This
 * component does not attempt to detect, block, or warn conditionally about
 * any specific extension — the copy below states the boundary once, plainly,
 * for every download.
 */

export interface PiiDisclosureStepProps {
  /** The ledger the template is being generated for. Named in the file name and in the confirm button's label. */
  ledgerName: string
  /** Household member names the template's tabs will carry. Never a count-only summary — SPEC.md §I4 requires the file's contents to be stated, and a name list is what makes that concrete. */
  memberNames: string[]
  /** Defaults to `new Date()`. Overridable so the file name is deterministic in tests. */
  date?: Date
  /** Invoked once, with the computed file name, when "Download template" is clicked. Does not itself build or save the file — see the module doc. */
  onConfirm: (filename: string) => void
  /** Invoked when the user backs out. Must not also invoke `onConfirm`. */
  onCancel: () => void
  /** True while a download triggered by a previous confirm is still in flight. */
  submitting?: boolean
}

export function PiiDisclosureStep({
  ledgerName,
  memberNames,
  date,
  onConfirm,
  onCancel,
  submitting = false,
}: PiiDisclosureStepProps) {
  const filename = buildImportTemplateFilename(ledgerName, date ?? new Date())

  // Fires once per mount, not once per prop change — the event means "this
  // warning rendered", matching how compare_strip_viewed is keyed
  // (src/components/ledger-compare-strip.tsx) rather than depending on
  // ledgerName or memberNames, neither of which the event may carry anyway
  // (METRICS_PLAN.md's property discipline: row counts and surfaces only).
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    track('pii_disclosure_shown', { surface: 'bulk_import' })
  }, [])

  const memberList = memberNames.join(', ')

  return (
    <section aria-labelledby="pii-disclosure-heading" className="space-y-4">
      <div className="space-y-1">
        <h2 id="pii-disclosure-heading" className="text-title font-semibold">
          Before you download this file
        </h2>
        <p className="text-body text-foreground">
          This file will hold {memberList || 'your household members'}' names, and the holdings you fill in against
          them.
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-body text-foreground">
          Vittam encrypts your data in your browser and on our servers. Once this file saves to your device, it is a
          plain file on your device, outside that protection. Anyone with access to your device can open it.
        </p>
        <p className="text-body text-foreground">
          A browser extension with access to your files can read this one too, the same as any other file you save.
          That is outside what Vittam can see or control.
        </p>
        <p className="text-caption text-muted-foreground" data-testid="pii-disclosure-filename">
          The file will be named <span className="font-mono">{filename}</span>, so an old download is easy to tell
          apart from a fresh one.
        </p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Not now
        </Button>
        <Button
          type="button"
          onClick={() => onConfirm(filename)}
          disabled={submitting}
          className="w-full md:w-auto"
        >
          Download template
        </Button>
      </div>
    </section>
  )
}
