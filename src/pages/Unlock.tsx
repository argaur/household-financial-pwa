import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { track } from '@/lib/analytics'
import type { HouseholdKeys } from '@/lib/household-keys-api'
import { unlockWithPassphrase, unlockWithRecoveryCode } from '@/lib/key-setup'

interface UnlockProps {
  /** The household's stored wrapped key material. */
  keys: HouseholdKeys
  /** Called once the vault holds the household's data key. */
  onUnlocked: () => void
  /**
   * Presentation only. When set, the full-page shell and the `<h1>` are dropped
   * so this can sit inside a surface that already has its own chrome and title
   * (the Explore "+ Add" sheet). Nothing about the unlock itself changes: same
   * calls, same one-message-per-method failure, same analytics.
   */
  embedded?: boolean
}

type Method = 'passphrase' | 'recovery_code'

/**
 * The return-visit screen: the household exists, its key material is on the
 * server, and this browser cannot open it — a new device, cleared storage, or a
 * future idle lock.
 *
 * No strength floor here, deliberately. The floor governs *setting* a
 * passphrase; applying it to an existing one would lock out households created
 * before it existed, or before it was raised, which is the one failure this
 * whole design cannot recover from.
 *
 * One error message per method, for every kind of failure. AES-GCM cannot
 * distinguish a wrong credential from an altered blob, and the UI must not
 * invent a distinction that would hand an attacker an oracle.
 */
export function Unlock({ keys, onUnlocked, embedded = false }: UnlockProps) {
  const [method, setMethod] = useState<Method>('passphrase')
  const [passphrase, setPassphrase] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const secret = method === 'passphrase' ? passphrase : recoveryCode

  function switchMethod(next: Method) {
    setMethod(next)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || secret.trim().length === 0) return
    setBusy(true)
    setError(null)

    try {
      if (method === 'passphrase') {
        await unlockWithPassphrase(keys, passphrase)
      } else {
        await unlockWithRecoveryCode(keys, recoveryCode)
      }
      track('vault_unlocked', { method })
      onUnlocked()
    } catch {
      // Intentionally one message for every failure mode of this method. The
      // caught error is not inspected and not rendered: its text distinguishes
      // a malformed code from a failed unwrap, and that difference is exactly
      // what must not reach the screen.
      setError(
        method === 'passphrase'
          ? "That didn't unlock your household. Check the passphrase and try again."
          : "That didn't unlock your household. Check the recovery code and try again.",
      )
      track('error_shown', {
        error_type: 'vault_unlock_failed',
        surface: 'unlock',
        message: method === 'passphrase' ? 'passphrase_unlock_failed' : 'recovery_code_unlock_failed',
      })
      setBusy(false)
      return
    }
    setBusy(false)
  }

  const content = (
    <>
      {embedded ? (
        <header className="space-y-2">
          <h3 className="font-serif text-title">Unlock your household.</h3>
          <p className="text-body text-muted-foreground">
            Your passphrase or your recovery code opens the key. This browser doesn't have it yet.
          </p>
        </header>
      ) : (
        <header className="space-y-2">
          <h1 className="font-serif text-display">Unlock your household.</h1>
          <p className="text-body text-muted-foreground">
            Your data is encrypted with a key that only your passphrase or your recovery code opens. This browser
            doesn't have that key yet. That happens on a new device, or when storage has been cleared. Nothing has been lost; it just
            has to be opened here.
          </p>
        </header>
      )}

      <Separator />

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {method === 'passphrase' ? (
          <div className="space-y-2">
            <Label htmlFor="unlock-passphrase">Your passphrase</Label>
            <Input
              id="unlock-passphrase"
              type="password"
              autoComplete="current-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              disabled={busy}
              aria-describedby="unlock-help"
              autoFocus
            />
            <p id="unlock-help" className="text-caption text-muted-foreground">
              It is checked here in your browser, against the encrypted key itself. We never receive it, and we
              cannot reset it for you.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="unlock-recovery-code">Recovery code</Label>
            <Input
              id="unlock-recovery-code"
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="characters"
              className="font-mono"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              disabled={busy}
              aria-describedby="unlock-recovery-help"
              autoFocus
            />
            <p id="unlock-recovery-help" className="text-caption text-muted-foreground">
              The code you saved when you set this up. Upper or lower case, with or without the hyphens. It all
              works.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-caption text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={busy || secret.trim().length === 0}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </Button>
      </form>

      {method === 'passphrase' ? (
        <Button type="button" variant="ghost" className="px-0" onClick={() => switchMethod('recovery_code')}>
          Use my recovery code instead
        </Button>
      ) : (
        <Button type="button" variant="ghost" className="px-0" onClick={() => switchMethod('passphrase')}>
          Use my passphrase instead
        </Button>
      )}
    </>
  )

  // Embedded: the host surface owns the chrome and the title, so this renders
  // as a plain block. The standalone /unlock route keeps its page shell.
  if (embedded) return <div className="space-y-6">{content}</div>

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg py-12 space-y-6">{content}</div>
    </main>
  )
}
