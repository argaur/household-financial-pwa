import { Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { RootGate } from '@/pages/RootGate'
import { DocsStub } from '@/pages/DocsStub'
import { Explore } from '@/pages/Explore'
import { LibrarySection } from '@/pages/LibrarySection'
import { InstrumentDetail } from '@/pages/InstrumentDetail'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<RootGate />} />
        <Route path="/docs" element={<DocsStub />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/explore/:sectionSlug" element={<LibrarySection />} />
        <Route path="/explore/:sectionSlug/:instrumentSlug" element={<InstrumentDetail />} />
      </Routes>
      <Toaster />
    </>
  )
}
