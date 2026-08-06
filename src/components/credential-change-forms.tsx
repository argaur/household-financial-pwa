import { useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { track } from '@/lib/analytics'
import { useOnline, OFFLINE_WRITE_MESSAGE } from '@/lib/use-online'
import { isCryptoError } from '@/lib/crypto'
import { changePassphrase, resetRecoveryCode, CredentialVerificationError } from '@/lib/credential-change'
import { scorePassphrase, WeakPassphraseError, MIN_PASSPHRASE_LENGTH } from '@/lib/passphrase-strength'
import type { HouseholdKeys } from '@/lib/household-keys-api'

/**
 * The two credential-rotation forms on the Profile screen.
 *
 * Both re-wrap the same data key under a new credential. Nothing stored is
 * re-encrypted and nothing else changes — which is also why they are two
 * clearly separate actions rather than one "security settings" form: each one
 * overwrites a copy that is the only remaining way back into the household's
 * data, so they must never be able to run into each other.
 *
 * Copy follows `KeySetup.tsx`: state plainly that this happens in the browser,
 * that the server never sees the passphrase, and that nobody can recover it.
 * No passphrase, recovery code or key byte is ever logged, put in a toast, or
 * attached to an analytics property.
 */

/** One message for a wrong credential AND for a tampered blob. AES-GCM cannot tell them apart, and neither should this. */
const UNWRAP_MESSAGE = 'That passphrase did not open your key. Check it and try again.'

/** Turn any failure into words that never leak what was typed or which check failed. */
function describe(err: unknown): string {
  if (err instanceof WeakPassphraseError) return err.problems.join(' ')
  if (isCryptoError(err) && err.code === 'UNWRAP_FAILED') return UNWRAP_MESSAGE
  if (err instanceof CredentialVerificationError) {
    return 'We could not verify the new key on this device, so nothing was changed. Try again.'
  }
  return 'Something went wrong and nothing was changed. Try again in a moment.'
}

interface ChangePassphraseFormProps {
  keys: HouseholdKeys
  /** Fresh key material, so the screen keeps working from what is now stored. */
  onChanged: (keys: HouseholdKeys) => void
}

export function ChangePassphraseForm({ keys, onChanged }: ChangePassphraseFormProps) {
  const { getToken } = useAuth()
  const { toast } = useToast()
  const online = useOnline()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const strength = scorePassphrase(next)
  const matches = next.length > 0 && next === confirmation
  const hasCurrent = current.length > 0
  const canSubmit = hasCurrent && strength.acceptable && matches && !busy

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)

    // Layer 2. The button above is disabled for all of these, but a form can be
    // submitted with Enter, from devtools, or by a refactor that drops the
    // `disabled` prop — and `changePassphrase` checks the strength floor a
    // third time before it derives anything.
    if (!hasCurrent) {
      setError('Enter your current passphrase. It is what unlocks the key so it can be re-wrapped.')
      return
    }
    if (!matches) {
      setError('Those two passphrases are different. Type the same one twice.')
      return
    }
    if (!strength.acceptable) {
      setError(strength.problems.join(' '))
      return
    }
    if (!online) {
      setError(OFFLINE_WRITE_MESSAGE)
      return
    }

    setBusy(true)
    try {
      const token = await getToken()
      const updated = await changePassphrase(token, keys, current, next)
      // Cleared before anything else, so a passphrase never outlives the
      // request that needed it.
      setCurrent('')
      setNext('')
      setConfirmation('')
      track('feature_used', { feature_name: 'change_passphrase' })
      toast({
        title: 'Passphrase changed',
        description: 'Use your new passphrase next time you unlock. Your recovery code still works.',
      })
      onChanged(updated)
    } catch (err) {
      setError(describe(err))
      track('error_shown', {
        error_type: 'change_passphrase_failed',
        surface: 'profile',
        message: err instanceof WeakPassphraseError ? 'weak_passphrase' : 'rewrap_failed',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} data-testid="change-passphrase-form" className="space-y-4" noValidate>
      <p className="text-body text-muted-foreground">
        Your data is not re-encrypted and nothing you have recorded changes. Only the lock around your key is replaced.
        It happens here in your browser, so neither passphrase ever reaches our servers.
      </p>

      <div className="space-y-2">
        <Label htmlFor="current-passphrase">Current passphrase</Label>
        <Input
          id="current-passphrase"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          disabled={busy}
          aria-describedby="current-passphrase-help"
        />
        <p id="current-passphrase-help" className="text-caption text-muted-foreground">
          Required. Being signed in is not enough. Without it there is no way to open your key and re-wrap it.
        </p>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="new-passphrase">New passphrase</Label>
        <Input
          id="new-passphrase"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          disabled={busy}
          aria-describedby="new-passphrase-strength new-passphrase-help"
        />

        <Progress
          value={(strength.score / 4) * 100}
          className="h-1 motion-reduce:transition-none"
          aria-hidden="true"
        />
        <p id="new-passphrase-strength" role="status" className="text-caption text-muted-foreground">
          Strength: {strength.label}
          {next.length > 0 && strength.problems.length > 0 ? `. ${strength.problems.join(' ')}` : ''}
        </p>
        <p id="new-passphrase-help" className="text-caption text-muted-foreground">
          At least {MIN_PASSPHRASE_LENGTH} characters. This check runs in your browser. The server never sees your
          passphrase, so it cannot reset it, and if you forget it we cannot recover it for you.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-passphrase">Confirm new passphrase</Label>
        <Input
          id="confirm-passphrase"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          disabled={busy}
        />
      </div>

      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full min-h-11" disabled={!canSubmit}>
        {busy ? 'Changing your passphrase…' : 'Change my passphrase'}
      </Button>
    </form>
  )
}

interface ResetRecoveryCodeFormProps {
  keys: HouseholdKeys
  /** Called once the user has acknowledged saving the new code. */
  onReset: (keys: HouseholdKeys) => void
}

export function ResetRecoveryCodeForm({ keys, onReset }: ResetRecoveryCodeFormProps) {
  const { getToken } = useAuth()
  const { toast } = useToast()
  const online = useOnline()

  const [current, setCurrent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ keys: HouseholdKeys; recoveryCode: string } | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [copyNotice, setCopyNotice] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)

    if (current.length === 0) {
      setError('Enter your current passphrase. It is what proves this is you before a new code is issued.')
      return
    }
    if (!online) {
      setError(OFFLINE_WRITE_MESSAGE)
      return
    }

    setBusy(true)
    try {
      const token = await getToken()
      const result = await resetRecoveryCode(token, keys, current)
      setCurrent('')
      setIssued(result)
      track('feature_used', { feature_name: 'reset_recovery_code' })
    } catch (err) {
      setError(describe(err))
      track('error_shown', {
        error_type: 'reset_recovery_code_failed',
        surface: 'profile',
        message: 'rewrap_failed',
      })
    } finally {
      setBusy(false)
    }
  }

  async function copyCode() {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued.recoveryCode)
      setCopyNotice('Copied. Paste it somewhere safe now.')
    } catch {
      setCopyNotice('This browser blocked copying. Select the code above and copy it by hand.')
    }
  }

  function downloadCode() {
    if (!issued) return
    try {
      const blob = new Blob(
        [
          'Household recovery code\n\n',
          `${issued.recoveryCode}\n\n`,
          'This code, or your passphrase, is the only way to open your household data.\n',
          'It replaces any earlier code, which no longer works.\n',
          'Nobody can recover either one for you, including us.\n',
        ],
        { type: 'text/plain' },
      )
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'household-recovery-code.txt'
      link.click()
      URL.revokeObjectURL(url)
      setCopyNotice('Saved to your downloads. Move it somewhere you will still have in ten years.')
    } catch {
      setCopyNotice('This browser blocked the download. Select the code above and copy it by hand.')
    }
  }

  function finish() {
    if (!issued || !acknowledged) return
    const updated = issued.keys
    setIssued(null)
    setAcknowledged(false)
    setCopyNotice(null)
    toast({
      title: 'Recovery code replaced',
      description: 'Your previous code no longer works. Your passphrase is unchanged.',
    })
    onReset(updated)
  }

  if (issued) {
    return (
      <div className="space-y-4">
        <p className="text-body text-muted-foreground">
          Write this down before you close this. It is shown once, here, and never again. Not in your account, not to
          us. Your previous recovery code stopped working the moment this one was issued. If you forget your passphrase,
          this code is the only thing that opens your household, and we cannot recover it for you.
        </p>

        <div className="rounded-lg border p-4 space-y-2">
          <p id="new-recovery-code-label" className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
            Your new recovery code
          </p>
          <p
            aria-labelledby="new-recovery-code-label"
            data-testid="recovery-code"
            className="font-mono text-title tracking-wider break-all select-all"
          >
            {issued.recoveryCode}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={copyCode}>
            Copy code
          </Button>
          <Button type="button" variant="outline" className="min-h-11" onClick={downloadCode}>
            Download as a file
          </Button>
        </div>
        {copyNotice && (
          <p role="status" className="text-caption text-muted-foreground">
            {copyNotice}
          </p>
        )}

        <Separator />

        <label
          htmlFor="new-recovery-acknowledged"
          className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-body"
        >
          <Checkbox
            id="new-recovery-acknowledged"
            checked={acknowledged}
            onCheckedChange={(checked) => setAcknowledged(checked === true)}
            className="mt-1"
          />
          <span>
            I have saved my new recovery code somewhere safe. I understand that if I lose it and forget my passphrase,
            no one can recover my data. Not support, not a password reset, not you.
          </span>
        </label>

        <Button type="button" className="w-full min-h-11" disabled={!acknowledged} onClick={finish}>
          Done
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} data-testid="reset-recovery-form" className="space-y-4" noValidate>
      <p className="text-body text-muted-foreground">
        A new code is generated in your browser and replaces the old one. Your current recovery code will stop working
        immediately, and your passphrase and your data are both left exactly as they are.
      </p>

      <div className="space-y-2">
        <Label htmlFor="recovery-reset-passphrase">Current passphrase</Label>
        <Input
          id="recovery-reset-passphrase"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          disabled={busy}
          aria-describedby="recovery-reset-help"
        />
        <p id="recovery-reset-help" className="text-caption text-muted-foreground">
          Required. It never reaches our servers. It is used here to open your key so the new code can be wrapped
          around it.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full min-h-11" disabled={current.length === 0 || busy}>
        {busy ? 'Generating your code…' : 'Generate a new recovery code'}
      </Button>
    </form>
  )
}
