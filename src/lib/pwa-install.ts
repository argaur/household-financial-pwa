/**
 * Slice 8 — custom install prompt plumbing.
 *
 * The browser fires `beforeinstallprompt` early in page load, but
 * SOLUTION_BRIEF/WIREFRAMES call for showing our own prompt only *after*
 * activation (first successful dashboard view) — so the event has to be
 * captured at boot and replayed later. Hence this module: `init()` runs from
 * main.tsx, the InstallPrompt component subscribes whenever it mounts.
 *
 * Calling preventDefault() on the event suppresses Chrome's own mini-infobar,
 * which is the whole point of a custom prompt — without it the user gets two
 * competing install affordances.
 */

/** Not in lib.dom yet — the shape Chrome actually fires. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'pwa:install-dismissed'

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function initInstallPrompt(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    notify()
  })

  // Fires whether the install came from our prompt or the browser's own UI.
  // Clearing here stops us offering to install an app that's already
  // installed, which browsers won't re-prompt for anyway.
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferred
}

/** True once the user has said "Not now" — we don't ask again on this device. */
export function isInstallDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export function markInstallDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // Worst case we ask again next session — acceptable.
  }
}

/**
 * Shows the browser's install dialog. Returns the user's choice, or null if
 * there was no deferred event to replay (already installed, unsupported
 * browser, or the event never fired).
 */
export async function showInstallPrompt(): Promise<'accepted' | 'dismissed' | null> {
  const event = deferred
  if (!event) return null
  // Single-use: the event cannot be replayed, so drop the reference before
  // awaiting to stop a double-click firing prompt() twice (which throws).
  deferred = null
  notify()
  await event.prompt()
  const { outcome } = await event.userChoice
  return outcome
}

/** Test seam — resets module state between tests. */
export function __resetInstallPromptForTests(): void {
  deferred = null
  listeners.clear()
}

/** Test seam — injects a deferred event without dispatching a real one. */
export function __setInstallPromptForTests(event: BeforeInstallPromptEvent | null): void {
  deferred = event
  notify()
}
