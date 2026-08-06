import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import { initSentry } from './lib/sentry'
import { initPostHog } from './lib/posthog'
import { initInstallPrompt } from './lib/pwa-install'
import { initPwaUpdate } from './lib/pwa-update'
import { initTheme } from './lib/theme'
import { track } from './lib/analytics'
import App from './App'
import './styles/globals.css'

initSentry()
initPostHog()

// Apply light/dark before render — system setting by default, stored override
// if the user toggled. Nothing paints before this runs (client-rendered SPA),
// so no flash-of-wrong-theme handling is needed.
initTheme()

// Slice 8 — capture the browser's install offer at boot so the custom prompt
// can replay it later, post-activation (see components/install-prompt.tsx).
initInstallPrompt()

// Registers the service worker and, critically, reloads the page when a new
// one activates. See lib/pwa-update.ts — this comment used to claim the plugin
// handled registration on its own, which was true of the registration and
// false of the update, and is why a stale first load survived to production.
initPwaUpdate()

// Reports whether *this* load was served by an already-active worker.
// `controller` is null on the very first visit (the worker installs but doesn't
// control the page until the next load), which is exactly the hit/miss
// distinction pwa_shell_loaded wants.
if ('serviceWorker' in navigator) {
  track('pwa_shell_loaded', { cache_status: navigator.serviceWorker.controller ? 'hit' : 'miss' })
}

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

const root = createRoot(document.getElementById('root')!)

root.render(
  <StrictMode>
    <BrowserRouter>
      {clerkPublishableKey ? (
        <ClerkProvider publishableKey={clerkPublishableKey}>
          <App />
        </ClerkProvider>
      ) : (
        <App />
      )}
    </BrowserRouter>
  </StrictMode>,
)
