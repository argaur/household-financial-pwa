import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { track } from '@/lib/analytics'
import { prepareKeySetup, type PreparedKeySetup } from '@/lib/key-setup'
import { scorePassphrase, WeakPassphraseError, MIN_PASSPHRASE_LENGTH } from '@/lib/passphrase-strength'

interface KeySetupProps {
  /** Called once the vault is unlocked and the user has acknowledged the recovery code. */
  onReady: (prepared: PreparedKeySetup) => void
}

/**
 * The screen that creates a household's key.
 *
 * Written as the product's promise rather than a chore: the reason this app can
 * hold a family's whole balance sheet is that nobody but the household can read
 * it, and this is the screen where that becomes true. It is also the only place
 * a user can lock themselves out permanently, so the copy states the trade
 * plainly instead of burying it.
 *
 * The strength floor is enforced twice — the submit control is disabled, and
 * `prepareKeySetup` refuses independently (see `src/lib/passphrase-strength.ts`).
 * The second layer is the one that matters; the first is only there so the user
 * finds out before they press anything.
 */
export function KeySetup({ onReady }: KeySetupProps) {
  const [passphrase, setPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prepared, setPrepared] = useState<PreparedKeySetup | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [copyNotice, setCopyNotice] = useState<string | null>(null)
  const startedFired = useRef(false)

  useEffect(() => {
    if (startedFired.current) return
    startedFired.current = true
    // No passphrase, no code, no key material — only that the screen was
    // reached, so onboarding drop-off here is measured rather than guessed.
    track('key_setup_started', {})
  }, [])

  const strength = scorePassphrase(passphrase)
  const matches = passphrase.length > 0 && passphrase === confirmation
  const canSubmit = strength.acceptable && matches && !busy

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)

    // Layer 2. A form can be submitted with Enter, from devtools, or by a
    // refactor that loses the `disabled` prop — so the handler re-checks
    // everything the button was disabled for, and `prepareKeySetup` checks the
    // strength floor a third time inside itself before generating anything.
    if (!matches) {
      setError('Those two passphrases are different. Type the same one twice.')
      return
    }
    if (!strength.acceptable) {
      setError(strength.problems.join(' '))
      return
    }

    setBusy(true)
    try {
      setPrepared(await prepareKeySetup(passphrase))
      // The only checkpoint between key_setup_started and key_setup_completed —
      // splits drop-off during passphrase entry from drop-off on the
      // recovery-code screen. No secret here either.
      track('key_setup_step_completed', { step: 'passphrase' })
    } catch (err) {
      // WeakPassphraseError carries its reasons but never the passphrase.
      setError(
        err instanceof WeakPassphraseError
          ? err.problems.join(' ')
          : "We couldn't create your key on this device. Refresh the page and try again.",
      )
      track('error_shown', {
        error_type: 'key_setup_failed',
        surface: 'key_setup',
        message: err instanceof WeakPassphraseError ? 'weak_passphrase' : 'key_generation_failed',
      })
    } finally {
      setBusy(false)
    }
  }

  async function copyRecoveryCode() {
    if (!prepared) return
    try {
      await navigator.clipboard.writeText(prepared.recoveryCode)
      setCopyNotice('Copied. Paste it somewhere safe now.')
    } catch {
      setCopyNotice('This browser blocked copying. Select the code above and copy it by hand.')
    }
  }

  function downloadRecoveryCode() {
    if (!prepared) return
    try {
      const blob = new Blob(
        [
          'Household recovery code\n\n',
          `${prepared.recoveryCode}\n\n`,
          'This code, or your passphrase, is the only way to open your household data.\n',
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

  function acknowledgeAndContinue() {
    if (!prepared || !acknowledged) return
    track('key_setup_completed', {})
    onReady(prepared)
  }

  if (prepared) {
    return (
      <main className="min-h-screen bg-background text-foreground font-sans">
        <div className="container max-w-lg py-12 space-y-6">
          <Progress value={100} className="h-1" aria-label="Setup progress: step 2 of 2" />
          <p className="text-caption text-muted-foreground">Setting up your key, step 2 of 2</p>

          <header className="space-y-2">
            <h1 className="font-serif text-display">Your way back in.</h1>
            <p className="text-body text-muted-foreground">
              Write this down before you go on. It is shown once, here, and never again. Not in your account, not to
              us. If you forget your passphrase, this code is the only thing that opens your household. Lose both and
              your data cannot be recovered by anyone, including us.
            </p>
          </header>

          <div className="rounded-lg border p-4 space-y-2">
            <p id="recovery-code-label" className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
              Your recovery code
            </p>
            <p
              aria-labelledby="recovery-code-label"
              data-testid="recovery-code"
              className="font-mono text-title tracking-wider break-all select-all"
            >
              {prepared.recoveryCode}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={copyRecoveryCode}>
              Copy code
            </Button>
            <Button type="button" variant="outline" onClick={downloadRecoveryCode}>
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
            htmlFor="recovery-acknowledged"
            className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-body"
          >
            <Checkbox
              id="recovery-acknowledged"
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(checked === true)}
              className="mt-1"
            />
            <span>
              I have saved my recovery code somewhere safe. I understand that if I lose it and forget my passphrase, no
              one can recover my data. Not support, not a password reset, not you.
            </span>
          </label>

          <Button type="button" className="w-full" disabled={!acknowledged} onClick={acknowledgeAndContinue}>
            Continue
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg py-12 space-y-6">
        <Progress value={50} className="h-1" aria-label="Setup progress: step 1 of 2" />
        <p className="text-caption text-muted-foreground">Setting up your key, step 1 of 2</p>

        <header className="space-y-2">
          <h1 className="font-serif text-display">Only you can open this.</h1>
          <p className="text-body text-muted-foreground">
            Every number you record here is encrypted on this device before it leaves it. The key that opens it is made
            from a passphrase you choose now, and that passphrase never reaches our servers. That is exactly why what
            you hold is yours alone.
          </p>
          {/* The claim is made on this screen, so the limits belong on this
              screen too — one tap away, before anyone commits, not buried in a
              footer they reach afterwards. */}
          <Link
            to="/privacy"
            className="inline-flex min-h-11 items-center text-caption text-muted-foreground underline underline-offset-4"
          >
            What we can and cannot see, including the limits of that promise
          </Link>
        </header>

        <Separator />

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="passphrase">Choose a passphrase</Label>
            <Input
              id="passphrase"
              type="password"
              autoComplete="new-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              disabled={busy}
              aria-describedby="passphrase-strength passphrase-help"
              autoFocus
            />

            <Progress
              value={(strength.score / 4) * 100}
              className="h-1 motion-reduce:transition-none"
              aria-hidden="true"
            />
            <p id="passphrase-strength" role="status" className="text-caption text-muted-foreground">
              Strength: {strength.label}
              {passphrase.length > 0 && strength.problems.length > 0 ? `. ${strength.problems.join(' ')}` : ''}
            </p>

            <p id="passphrase-help" className="text-caption text-muted-foreground">
              At least {MIN_PASSPHRASE_LENGTH} characters; four unrelated words are easier to remember than a short
              scramble and harder to guess. This strength check runs here in your browser. The server never sees your
              passphrase, so it cannot check it, cannot reset it, and if you forget it, we cannot recover it for you.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="passphrase-confirm">Type it again</Label>
            <Input
              id="passphrase-confirm"
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

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {busy ? 'Creating your key…' : 'Create my key'}
          </Button>
        </form>
      </div>
    </main>
  )
}
