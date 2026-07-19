import { useEffect, useState } from 'react'

/**
 * Tracks browser connectivity.
 *
 * Slice 8 uses this for two distinct jobs: telling the dashboard it's showing
 * cached data, and disabling write actions while offline. SPEC.md §7 requires
 * writes be *disabled* offline rather than silently queued — there is no
 * write-queue in v1, so a form that appeared to submit and then dropped the
 * data would be worse than one that plainly refuses.
 *
 * `navigator.onLine` is famously optimistic — it reports "online" for a
 * connected-but-useless network (captive portal, no route). That asymmetry is
 * fine for both uses here: a false "online" just means the request fails and
 * hits the normal error path, while a false "offline" is rare and only ever
 * over-warns.
 */
/**
 * Shown beside any disabled write control while offline. New copy for Slice 8
 * — COPY_DECK.md has no offline-write entry; flagged there for backfill.
 * Says plainly that nothing is being saved in the background, because the
 * whole risk here is a user assuming it will sync later.
 */
export const OFFLINE_WRITE_MESSAGE =
  "You're offline. Changes can't be saved until you reconnect — nothing is queued in the background."

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
