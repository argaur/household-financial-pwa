import { Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { HomeShell } from '@/pages/HomeShell'
import { DocsStub } from '@/pages/DocsStub'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomeShell />} />
        <Route path="/docs" element={<DocsStub />} />
      </Routes>
      <Toaster />
    </>
  )
}
