import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useOnline, OFFLINE_WRITE_MESSAGE } from '@/lib/use-online'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { track } from '@/lib/analytics'
import {
  createBlankLedger,
  createLedgerFromCurrent,
  LedgerCapReachedError,
  LedgerCopyError,
  LedgersApiError,
  MAX_LEDGER_NAME_CHARS,
  type Ledger,
} from '@/lib/ledgers-api'
import type { Holding } from '@/lib/holdings-api'

type LedgerSource = 'copy' | 'blank'

interface NewLedgerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The household's currently-displayed Current holdings, already decrypted. */
  sourceHoldings: Holding[]
  /**
   * Rows Current failed to decrypt. THE SAFETY RULE: a copy made while this is
   * >0 would silently omit holdings the user believes are there, so "Copy my
   * current holdings" is disabled whenever it is nonzero — "Start empty"
   * stays available regardless.
   */
  unreadableCount: number
  onCreated: (ledger: Ledger, source: LedgerSource) => void
}

/** Documentation/design/DATA_MODEL.md's ledger states table: "blank-or-copy toggle defaulted to copy." */
function defaultSource(unreadableCount: number): LedgerSource {
  return unreadableCount > 0 ? 'blank' : 'copy'
}

export function NewLedgerModal({ open, onOpenChange, sourceHoldings, unreadableCount, onCreated }: NewLedgerModalProps) {
  const { getToken } = useAuth()
  const online = useOnline()
  const copyDisabled = unreadableCount > 0

  const [name, setName] = useState('')
  const [source, setSource] = useState<LedgerSource>(() => defaultSource(unreadableCount))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The dialog stays mounted between opens (Radix hides it via CSS, doesn't
  // unmount), so without this a reopened modal shows the previous ledger's
  // name and error state. Reset only on the open transition itself — not on
  // every unreadableCount change while already open, which would blow away
  // whatever the user is mid-typing whenever holdings refetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) {
      setName('')
      setSource(defaultSource(unreadableCount))
      setError(null)
    }
  }, [open])

  const trimmed = name.trim()
  const nameValid = trimmed.length > 0 && trimmed.length <= MAX_LEDGER_NAME_CHARS

  function selectSource(next: LedgerSource) {
    if (next === 'copy' && copyDisabled) return
    setSource(next)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // The submit button is disabled for the same condition, so this only
    // guards a programmatic form submit (e.g. pressing Enter in the name
    // field before the button's disabled state has re-rendered).
    if (submitting || !online || !nameValid) return

    // Belt and braces. Three things already stop `source` being 'copy' while
    // rows are unreadable: the radio is disabled, selectSource() refuses the
    // transition, and the default flips to 'blank'. This last check is here
    // anyway because the failure it prevents is the worst this feature can
    // produce — a ledger the user believes mirrors what they own, silently
    // missing the rows that could not be decrypted, with nothing on screen
    // saying so. A guard that never fires is a cheap price for that.
    if (source === 'copy' && copyDisabled) return

    setSubmitting(true)
    setError(null)
    try {
      const token = await getToken()
      const ledger =
        source === 'copy'
          ? await createLedgerFromCurrent(token, trimmed, sourceHoldings)
          : await createBlankLedger(token, trimmed)
      track('ledger_created', { source })
      onCreated(ledger, source)
    } catch (err) {
      if (err instanceof LedgerCapReachedError) {
        setError('You already have 4 ledgers, the most this household can hold. Delete one to create another.')
      } else if (err instanceof LedgerCopyError) {
        setError('The copy could not be made, so nothing was changed. Try again, or start empty instead.')
      } else if (err instanceof LedgersApiError) {
        setError('Something went wrong. Please try again.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New ledger</DialogTitle>
          <DialogDescription>Give this strategy a name and choose where it starts from.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ledger-name">Ledger name</Label>
            <Input
              id="ledger-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              maxLength={MAX_LEDGER_NAME_CHARS}
              placeholder="e.g. Aggressive growth"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Starting point</legend>

            <label
              className={`flex items-start gap-3 rounded-md border p-3 ${copyDisabled ? 'opacity-50' : 'cursor-pointer'}`}
            >
              <input
                type="radio"
                name="ledger-source"
                value="copy"
                checked={source === 'copy'}
                onChange={() => selectSource('copy')}
                disabled={submitting || copyDisabled}
                className="mt-1"
              />
              <span>
                <span className="block text-body font-medium">Copy my current holdings</span>
                <span className="block text-caption text-muted-foreground">
                  {copyDisabled
                    ? 'Some holdings could not be read, so a copy would be incomplete. Choose the option below instead.'
                    : 'Start from a snapshot of what you already have recorded in Current.'}
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
              <input
                type="radio"
                name="ledger-source"
                value="blank"
                checked={source === 'blank'}
                onChange={() => selectSource('blank')}
                disabled={submitting}
                className="mt-1"
              />
              <span>
                <span className="block text-body font-medium">Start empty</span>
                <span className="block text-caption text-muted-foreground">Build this strategy from scratch.</span>
              </span>
            </label>
          </fieldset>

          {error && <p className="text-caption text-destructive">{error}</p>}
          {!online && <p className="text-caption text-muted-foreground">{OFFLINE_WRITE_MESSAGE}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!online || submitting || !nameValid}>
              {submitting ? 'Creating…' : 'Create ledger'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
