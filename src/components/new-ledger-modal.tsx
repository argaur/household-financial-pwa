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
  ledgerGoalSchema,
  LedgerCapReachedError,
  LedgerCopyError,
  MAX_GOAL_LABEL_CHARS,
  MAX_LEDGER_NAME_CHARS,
  type Ledger,
  type LedgerGoal,
} from '@/lib/ledgers-api'
import type { Holding } from '@/lib/holdings-api'

type LedgerSource = 'copy' | 'blank'

/**
 * D-024 G2 — the goal option is a THIRD choice beside blank and copy, but
 * choosing it swaps the modal's body in place rather than opening a second
 * surface (D-024 decision 3, SPEC.md G4). `'options'` is the blank/copy
 * picker this modal already had; `'goal'` is the new form.
 */
type ModalStep = 'options' | 'goal'

interface GoalFormValues {
  label: string
  targetAmount: string
  targetYear: string
  monthlyCapacity: string
}

interface GoalFormErrors {
  label?: string
  targetAmount?: string
  targetYear?: string
  monthlyCapacity?: string
}

const EMPTY_GOAL_FORM: GoalFormValues = { label: '', targetAmount: '', targetYear: '', monthlyCapacity: '' }

/**
 * Validates the goal step's raw string inputs against `ledgerGoalSchema` —
 * the same schema `postLedger` in ledgers-api.ts enforces before sealing —
 * and turns each schema violation into one on-screen message per field, so
 * the mapping from "what zod rejected" to "what the user sees" lives in one
 * place and stays inline rather than closing the modal or using a toast.
 */
function buildGoalOrErrors(values: GoalFormValues): { goal: LedgerGoal } | { errors: GoalFormErrors } {
  const candidate = {
    label: values.label.trim(),
    targetAmountInr: values.targetAmount.trim() === '' ? NaN : Number(values.targetAmount),
    targetYear: values.targetYear.trim() === '' ? NaN : Number(values.targetYear),
    monthlyCapacityInr: values.monthlyCapacity.trim() === '' ? null : Number(values.monthlyCapacity),
  }
  const parsed = ledgerGoalSchema.safeParse(candidate)
  if (parsed.success) return { goal: parsed.data }

  const errors: GoalFormErrors = {}
  for (const issue of parsed.error.issues) {
    const field = issue.path[0]
    if (field === 'label' && !errors.label) errors.label = 'Keep this to 80 characters or fewer.'
    if (field === 'targetAmountInr' && !errors.targetAmount) {
      errors.targetAmount = 'Enter a whole rupee amount greater than zero.'
    }
    if (field === 'targetYear' && !errors.targetYear) errors.targetYear = 'Enter a valid target year.'
    if (field === 'monthlyCapacityInr' && !errors.monthlyCapacity) {
      errors.monthlyCapacity = 'Enter a whole rupee amount, zero or more.'
    }
  }
  return { errors }
}

/**
 * The horizon the goal step prefills: target year minus the current year.
 * Computed fresh on every render from the target-year field rather than
 * stored in its own state, so it is always in sync with what the user typed
 * and needs no reset of its own on reopen.
 */
function computeHorizonYears(targetYear: string): string {
  if (targetYear.trim() === '') return ''
  const year = Number(targetYear)
  if (!Number.isFinite(year)) return ''
  return String(year - new Date().getFullYear())
}

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
  const [step, setStep] = useState<ModalStep>('options')
  const [goalForm, setGoalForm] = useState<GoalFormValues>(EMPTY_GOAL_FORM)
  const [goalErrors, setGoalErrors] = useState<GoalFormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The dialog stays mounted between opens (Radix hides it via CSS, doesn't
  // unmount), so without this a reopened modal shows the previous ledger's
  // name and error state. Reset only on the open transition itself — not on
  // every unreadableCount change while already open, which would blow away
  // whatever the user is mid-typing whenever holdings refetch. The goal step
  // and its fields reset the same way, plus the modal always reopens on the
  // options step, never mid-goal-form — this is the same Radix reset trap
  // the ledger slice already paid for once (2026-08-25), now covered here too.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) {
      setName('')
      setSource(defaultSource(unreadableCount))
      setStep('options')
      setGoalForm(EMPTY_GOAL_FORM)
      setGoalErrors({})
      setError(null)
    }
  }, [open])

  const trimmed = name.trim()
  const nameValid = trimmed.length > 0 && trimmed.length <= MAX_LEDGER_NAME_CHARS
  const horizonYears = computeHorizonYears(goalForm.targetYear)

  function selectSource(next: LedgerSource) {
    if (next === 'copy' && copyDisabled) return
    setSource(next)
  }

  function setGoalField(field: keyof GoalFormValues, value: string) {
    setGoalForm((prev) => ({ ...prev, [field]: value }))
  }

  function describeCreateError(err: unknown): string {
    if (err instanceof LedgerCapReachedError) {
      return 'You already have 4 ledgers, the most this household can hold. Delete one to create another.'
    }
    if (err instanceof LedgerCopyError) {
      return 'The copy could not be made, so nothing was changed. Try again, or start empty instead.'
    }
    return 'Something went wrong. Please try again.'
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // The submit button is disabled for the same condition, so this only
    // guards a programmatic form submit (e.g. pressing Enter in the name
    // field before the button's disabled state has re-rendered).
    if (submitting || !online || !nameValid) return

    if (step === 'goal') {
      const result = buildGoalOrErrors(goalForm)
      if ('errors' in result) {
        // Inline, modal stays open — never a toast, never a close. SPEC.md
        // G6/G4's goal-step decision.
        setGoalErrors(result.errors)
        return
      }
      setGoalErrors({})
      setSubmitting(true)
      setError(null)
      try {
        const token = await getToken()
        // Same hand-creation function a goalless blank ledger uses — a
        // ledger that gains a goal stays origin 'manual' and is never routed
        // through anything AI-related (Chunk G is deliberately AI-free).
        const ledger = await createBlankLedger(token, trimmed, result.goal)
        track('ledger_created', { source: 'blank' })
        onCreated(ledger, 'blank')
      } catch (err) {
        setError(describeCreateError(err))
      } finally {
        setSubmitting(false)
      }
      return
    }

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
      setError(describeCreateError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{step === 'goal' ? 'Plan toward a goal' : 'New ledger'}</DialogTitle>
          <DialogDescription>
            {step === 'goal'
              ? 'Tell us what this strategy is aiming for.'
              : 'Give this strategy a name and choose where it starts from.'}
          </DialogDescription>
        </DialogHeader>

        {/* noValidate: the goal step's target-amount field is deliberately allowed to
            receive a decimal (so it can be rejected inline with our own message,
            per the goal-step's own copy) rather than being silently blocked by the
            browser's native number-input step mismatch before handleSubmit runs. */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
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

          {step === 'options' ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Starting point</legend>

              <label
                className={`flex items-start gap-3 rounded-lg border p-3 ${copyDisabled ? 'opacity-50' : 'cursor-pointer'}`}
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

              <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
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

              <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
                <input
                  type="radio"
                  name="ledger-source"
                  value="goal"
                  checked={false}
                  onChange={() => setStep('goal')}
                  disabled={submitting}
                  className="mt-1"
                />
                <span>
                  <span className="block text-body font-medium">Plan toward a goal</span>
                  <span className="block text-caption text-muted-foreground">
                    Set a target and build a strategy toward it.
                  </span>
                </span>
              </label>
            </fieldset>
          ) : (
            <div className="space-y-4">
              <Button type="button" variant="ghost" onClick={() => setStep('options')} disabled={submitting} className="px-0">
                Back
              </Button>

              <div className="space-y-2">
                <Label htmlFor="goal-label">What are you saving for?</Label>
                <Input
                  id="goal-label"
                  value={goalForm.label}
                  onChange={(e) => setGoalField('label', e.target.value)}
                  disabled={submitting}
                  maxLength={MAX_GOAL_LABEL_CHARS}
                  placeholder="e.g. A down payment"
                />
                {goalErrors.label && <p className="text-caption text-destructive">{goalErrors.label}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal-target-amount">Target amount (₹)</Label>
                <Input
                  id="goal-target-amount"
                  type="number"
                  min="1"
                  value={goalForm.targetAmount}
                  onChange={(e) => setGoalField('targetAmount', e.target.value)}
                  disabled={submitting}
                />
                {goalErrors.targetAmount && <p className="text-caption text-destructive">{goalErrors.targetAmount}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal-target-year">Target year</Label>
                <Input
                  id="goal-target-year"
                  type="number"
                  value={goalForm.targetYear}
                  onChange={(e) => setGoalField('targetYear', e.target.value)}
                  disabled={submitting}
                  placeholder="e.g. 2033"
                />
                {goalErrors.targetYear && <p className="text-caption text-destructive">{goalErrors.targetYear}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal-horizon">Years to reach it</Label>
                <Input id="goal-horizon" value={horizonYears} readOnly disabled />
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal-monthly-capacity">What can you add each month? (optional, ₹)</Label>
                <Input
                  id="goal-monthly-capacity"
                  type="number"
                  min="0"
                  value={goalForm.monthlyCapacity}
                  onChange={(e) => setGoalField('monthlyCapacity', e.target.value)}
                  disabled={submitting}
                />
                {goalErrors.monthlyCapacity && (
                  <p className="text-caption text-destructive">{goalErrors.monthlyCapacity}</p>
                )}
              </div>
            </div>
          )}

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
