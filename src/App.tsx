import { Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { RootGate } from '@/pages/RootGate'
import { DocsStub } from '@/pages/DocsStub'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<RootGate />} />
        <Route path="/docs" element={<DocsStub />} />
      </Routes>
      <Toaster />
    </>
  )
}
