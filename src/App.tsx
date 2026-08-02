import { Routes, Route, Navigate } from 'react-router-dom'
import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { Toaster } from '@/components/ui/toaster'
import { IdleLockGuard } from '@/components/idle-lock-guard'
import { RootGate } from '@/pages/RootGate'
import { DocsStub } from '@/pages/DocsStub'
import { Explore } from '@/pages/Explore'
import { LibrarySection } from '@/pages/LibrarySection'
import { InstrumentDetail } from '@/pages/InstrumentDetail'
import { Portfolio } from '@/pages/Portfolio'
import { Profile } from '@/pages/Profile'
import { Dashboard } from '@/pages/Dashboard'
import { Why } from '@/pages/Why'
import { Privacy } from '@/pages/Privacy'

export default function App() {
  return (
    <>
      {/*
        Outside <Routes> on purpose: mounted per route, the idle countdown would
        restart on every navigation and effectively never fire. Inside <SignedIn>
        so it costs nothing on the public library and /why pages, which hold no key.
      */}
      <SignedIn>
        <IdleLockGuard />
      </SignedIn>
      <Routes>
        <Route path="/" element={<RootGate />} />
        <Route path="/docs" element={<DocsStub />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/why" element={<Why />} />
        {/* Public on purpose: someone deciding whether to type their net worth
            into this app has to be able to read it before signing up. */}
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/explore/:sectionSlug" element={<LibrarySection />} />
        <Route path="/explore/:sectionSlug/:instrumentSlug" element={<InstrumentDetail />} />
        <Route
          path="/dashboard"
          element={
            <>
              <SignedIn>
                <Dashboard />
              </SignedIn>
              <SignedOut>
                <Navigate to="/" replace />
              </SignedOut>
            </>
          }
        />
        <Route
          path="/portfolio"
          element={
            <>
              <SignedIn>
                <Portfolio />
              </SignedIn>
              <SignedOut>
                <Navigate to="/" replace />
              </SignedOut>
            </>
          }
        />
        <Route
          path="/profile"
          element={
            <>
              <SignedIn>
                <Profile />
              </SignedIn>
              <SignedOut>
                <Navigate to="/" replace />
              </SignedOut>
            </>
          }
        />
      </Routes>
      <Toaster />
    </>
  )
}
