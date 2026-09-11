import { useCallback, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * D-025 step H2 — the upload drop zone. SPEC.md §I4's "Upload" row is exact:
 * "A drop zone with a file button, one file at a time, `.xlsx` only." Both
 * paths are required, not one or the other: a drop zone alone is unusable on
 * touch and unreachable by keyboard, so the visible "Choose file" button is
 * the primary, always-present affordance and the drag surface is additive.
 *
 * THIS COMPONENT DOES NOT PARSE. It hands the accepted `File` to
 * `onFileAccepted` and stops — same seam as `PiiDisclosureStep`'s
 * `onConfirm` (I4) and `ImportReviewScreen`'s `onDownloadRejects` (I8).
 * Reading and validating the workbook's contents is `readImportWorkbook`'s
 * job (`src/lib/import-workbook-read.ts`, H1/H1b) and the host's (H3) to
 * call it. The only validation done here is the friendly first line the H1
 * module doc describes: rejecting an obviously-wrong file by extension
 * before a round trip through SheetJS. `readImportWorkbook` refuses non-template
 * content by header regardless, so this is convenience, never the security
 * boundary, and no copy in this file claims otherwise.
 *
 * TWO REFUSALS, BOTH STATED, NEITHER SILENT:
 *  - More than one file (dropped or chosen): SPEC.md's "one file at a time"
 *    is explicit that taking the first and ignoring the rest is wrong — the
 *    user picked several on purpose or by accident and either way needs to
 *    be told, not guessed for.
 *  - A file without a literal `.xlsx` extension.
 * Both refusals show a message and never call `onFileAccepted`.
 *
 * §I6.1's 390px trap: `sm:` fires at 390px in this project, not Tailwind's
 * default 640px, and SPEC.md §I6.1 names the upload drop zone specifically
 * as a surface that must use `md:`. The one full-width, layout-changing
 * control here — the "Choose file" button — uses `md:w-auto`, never `sm:`.
 *
 * No file content and no file NAME reaches analytics from this component —
 * it fires no analytics at all. A file name can carry a member name (H1's
 * sheet-name trap is the same fact from the other direction), so the
 * "Selected: <name>" confirmation below is UI-only, never logged.
 */

export interface ImportDropZoneProps {
  /**
   * Invoked once, with the accepted file, when a single `.xlsx` file is
   * chosen or dropped. This component does not read the file's bytes itself.
   */
  onFileAccepted: (file: File) => void
  disabled?: boolean
}

const ACCEPTED_EXTENSION = '.xlsx'

function isXlsxFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(ACCEPTED_EXTENSION)
}

export function ImportDropZone({ onFileAccepted, disabled = false }: ImportDropZoneProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)

  const acceptFiles = useCallback(
    (files: FileList | File[] | null) => {
      if (!files || files.length === 0) return
      const list = Array.from(files)

      if (list.length > 1) {
        setSelectedFileName(null)
        setMessage('Choose one file at a time. Drop or select a single .xlsx file.')
        return
      }

      const [file] = list
      if (!isXlsxFile(file)) {
        setSelectedFileName(null)
        setMessage('That file is not an .xlsx file. Upload the file downloaded from the template step.')
        return
      }

      setMessage(null)
      setSelectedFileName(file.name)
      onFileAccepted(file)
    },
    [onFileAccepted],
  )

  return (
    <div className="min-w-0 space-y-2">
      <div
        data-testid="import-drop-zone"
        onDragOver={(event) => {
          event.preventDefault()
          if (disabled) return
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragOver(false)
          if (disabled) return
          acceptFiles(event.dataTransfer.files)
        }}
        className={cn(
          'min-w-0 flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
          isDragOver ? 'border-primary bg-primary/5' : 'border-border-soft',
        )}
      >
        <p className="min-w-0 text-body text-foreground">
          Drag an .xlsx file here, or choose one from your device.
        </p>
        <Button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="w-full min-w-0 md:w-auto"
        >
          Choose file
        </Button>
        <label htmlFor={inputId} className="sr-only">
          Choose an .xlsx file to upload
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".xlsx"
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            acceptFiles(event.target.files)
            // Reset so choosing the same file twice in a row still fires a change event.
            event.target.value = ''
          }}
        />
      </div>

      {selectedFileName && !message && (
        <p
          className="min-w-0 truncate text-caption text-muted-foreground"
          data-testid="import-drop-zone-filename"
        >
          Selected: {selectedFileName}
        </p>
      )}

      {message && (
        <p role="alert" className="min-w-0 break-words text-caption text-destructive">
          {message}
        </p>
      )}
    </div>
  )
}
