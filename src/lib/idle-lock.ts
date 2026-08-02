/**
 * Idle auto-lock for the decrypted household data key.
 *
 * D-014 accepts a real limit: marking the key non-extractable stops a script
 * copying it out, but does not stop a script on our own origin calling decrypt
 * with it. Nothing in the browser removes that. What we can bound is how long
 * the key is reachable at all — so an unattended machine relocks itself, and
 * `onLock` is expected to clear the key from memory *and* IndexedDB.
 *
 * Activity is observed on an injected `EventTarget` rather than reaching for
 * `window`, so the behaviour is testable without a DOM and the caller decides
 * what counts as the app's surface.
 */

/**
 * Events that count as the user still being there.
 *
 * Deliberately excludes `mousemove` and `scroll`: both fire from momentum,
 * screen-reader traversal and stray desk knocks, which would hold the lock open
 * on a machine nobody is actually sitting at — the exact case this exists for.
 */
export const DEFAULT_ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'focus'] as const

/** Fifteen minutes: long enough not to interrupt data entry, short enough to matter. */
export const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000

export interface IdleLockOptions {
  /** How long the vault may stay unlocked with no user activity. Must be positive. */
  timeoutMs: number
  /** Called exactly once, when the timeout elapses. */
  onLock: () => void
  /** Where activity is observed — normally `window`. */
  target: EventTarget
  /** Overridable for callers with a different notion of activity. */
  activityEvents?: readonly string[]
}

/**
 * Start the idle lock.
 *
 * @returns a `stop` function. Calling it after the lock has already fired is
 *   safe and does nothing.
 */
export function startIdleLock({
  timeoutMs,
  onLock,
  target,
  activityEvents = DEFAULT_ACTIVITY_EVENTS,
}: IdleLockOptions): () => void {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(
      `startIdleLock: timeoutMs must be a positive number of milliseconds, got ${timeoutMs}.`,
    )
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let finished = false

  // Detaching on lock as well as on stop is the point of `finished`: once the
  // key is gone, a stray pointerdown must not restart a countdown that would
  // then "lock" an already-locked vault, and the listeners have no further job.
  const detach = () => {
    for (const event of activityEvents) target.removeEventListener(event, onActivity)
  }

  const fire = () => {
    if (finished) return
    finished = true
    detach()
    onLock()
  }

  const arm = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(fire, timeoutMs)
  }

  function onActivity() {
    if (finished) return
    arm()
  }

  for (const event of activityEvents) target.addEventListener(event, onActivity)
  arm()

  return () => {
    if (finished) return
    finished = true
    if (timer !== undefined) clearTimeout(timer)
    detach()
  }
}
