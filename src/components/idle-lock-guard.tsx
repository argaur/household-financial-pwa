import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearVault } from '@/lib/crypto/key-store'
import { startIdleLock, DEFAULT_IDLE_TIMEOUT_MS } from '@/lib/idle-lock'

export interface IdleLockGuardProps {
  /** Overridable for tests. Production uses {@link DEFAULT_IDLE_TIMEOUT_MS}. */
  timeoutMs?: number
}

/**
 * Relocks the household vault after a period of inactivity.
 *
 * Renders nothing. Mounted once inside `<SignedIn>` rather than per page, so
 * the countdown survives navigation between the dashboard, portfolio and
 * profile — a lock that reset on every route change would almost never fire.
 *
 * Navigating to `/` after clearing matters as much as the clearing does: the
 * key being gone does not by itself remove already-decrypted values from a
 * rendered screen, so the locked vault has to take the screen with it.
 */
export function IdleLockGuard({ timeoutMs = DEFAULT_IDLE_TIMEOUT_MS }: IdleLockGuardProps) {
  const navigate = useNavigate()

  useEffect(() => {
    return startIdleLock({
      timeoutMs,
      target: window,
      onLock: () => {
        // Navigate whether or not clearing succeeded. A failed delete leaves the
        // key present, which is bad; leaving decrypted data on an unattended
        // screen as well would be worse.
        void clearVault().finally(() => navigate('/', { replace: true }))
      },
    })
  }, [timeoutMs, navigate])

  return null
}
