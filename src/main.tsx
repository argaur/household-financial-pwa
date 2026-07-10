import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import { initSentry } from './lib/sentry'
import { initPostHog } from './lib/posthog'
import App from './App'
import './styles/globals.css'

initSentry()
initPostHog()

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

const root = createRoot(document.getElementById('root')!)

// Slice 0 has no auth-gated screens yet — ClerkProvider is wired now so Slice 1
// (auth + household creation) doesn't need to touch main.tsx or the provider tree.
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
