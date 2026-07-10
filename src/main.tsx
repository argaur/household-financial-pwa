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
