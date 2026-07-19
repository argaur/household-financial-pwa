import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics'
import {
  getInstallPrompt,
  isInstallDismissed,
  markInstallDismissed,
  showInstallPrompt,
  subscribeInstallPrompt,
} from '@/lib/pwa-install'

// Copy: Documentation/design/COPY_DECK.md — "PWA Install Prompt", verbatim.
const HEADER = 'Add to your home screen'
const BODY = 'Install this as an app for quicker access and offline reading of the instrument library.'

interface InstallPromptProps {
  /** Analytics surface this prompt was rendered on (e.g. "dashboard"). */
  surface: string
}

/**
 * Custom install prompt, rendered only post-activation (currently: on the
 * dashboard, after a successful load) per the locked PWA design decision —
 * no interstitial on first visit.
 *
 * Renders nothing unless the browser actually offered an install: no deferred
 * `beforeinstallprompt` means either an unsupported browser or an app that's
 * already installed, and in both cases a dead "Install" button would be worse
 * than no button.
 */
export function InstallPrompt({ surface }: InstallPromptProps) {
  const [available, setAvailable] = useState(() => getInstallPrompt() !== null)
  const [dismissed, setDismissed] = useState(() => isInstallDismissed())
  const [prompted, setPrompted] = useState(false)

  useEffect(() => subscribeInstallPrompt(() => setAvailable(getInstallPrompt() !== null)), [])

  const visible = available && !dismissed
  useEffect(() => {
    if (!visible || prompted) return
    setPrompted(true)
    track('pwa_install_prompted', { surface })
  }, [visible, prompted, surface])

  if (!visible) return null

  async function handleInstall() {
    const outcome = await showInstallPrompt()
    if (outcome === 'accepted') {
      track('pwa_installed', { surface })
    }
    // A dismissed *native* dialog isn't a "not now" on our card — the browser
    // won't re-offer this session either way, so just stop showing the card.
    setAvailable(false)
  }

  function handleDismiss() {
    markInstallDismissed()
    setDismissed(true)
  }

  return (
    <section className="rounded-lg border p-4 space-y-2">
      <h2 className="section-label">{HEADER}</h2>
      <p className="text-body">{BODY}</p>
      <div className="flex gap-2 pt-1">
        <Button className="min-h-[44px]" onClick={handleInstall}>
          Install
        </Button>
        <Button variant="ghost" className="min-h-[44px]" onClick={handleDismiss}>
          Not now
        </Button>
      </div>
    </section>
  )
}
