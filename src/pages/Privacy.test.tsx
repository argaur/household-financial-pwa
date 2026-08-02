import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expectNoAxeViolations } from '@/test/axe'
import { WHAT_THE_SERVER_STILL_LEARNS, WHAT_IS_NOT_LEAKED } from '@/lib/privacy-note'
import { Privacy } from './Privacy'

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))

function renderPage() {
  return render(
    <MemoryRouter>
      <Privacy />
    </MemoryRouter>,
  )
}

/**
 * These are not copy tests. D-014's claim — "we cannot read your data" — is only
 * defensible while its limits are published beside it, and the specific risk is
 * that a later edit quietly softens the page into marketing. Each case below
 * pins one thing the page is not allowed to stop saying.
 */
describe('Privacy', () => {
  it('leads with the claim', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /we cannot read your data/i })).toBeInTheDocument()
  })

  it('states the limit of the claim, that we serve the code doing the encrypting', () => {
    renderPage()
    expect(screen.getByText(/serve you the code that does the encrypting/i)).toBeInTheDocument()
    expect(screen.getByText(/not the same as saying this is impossible to break/i)).toBeInTheDocument()
  })

  it('publishes every item of what the server still learns, not a subset', () => {
    renderPage()
    // A partial list is worse than none: it reads as complete.
    for (const item of WHAT_THE_SERVER_STILL_LEARNS) {
      expect(screen.getByText(item)).toBeInTheDocument()
    }
  })

  it('publishes what is deliberately not leaked, so the list above is not read as the whole story', () => {
    renderPage()
    for (const item of WHAT_IS_NOT_LEAKED) {
      expect(screen.getByText(item)).toBeInTheDocument()
    }
  })

  it('states the XSS limit that no browser encryption scheme closes', () => {
    renderPage()
    expect(screen.getByText(/does not stop a script running on this site/i)).toBeInTheDocument()
    expect(screen.getByText(/They do not close it/i)).toBeInTheDocument()
  })

  it('says plainly that a lost passphrase and recovery code means the data is gone', () => {
    renderPage()
    expect(screen.getByText(/If both are gone, your data is gone/i)).toBeInTheDocument()
  })

  it('points at the export, since that is the only thing that survives losing the key', () => {
    renderPage()
    expect(screen.getByText(/download of everything in readable form/i)).toBeInTheDocument()
  })

  it('has zero axe violations', async () => {
    const { container } = renderPage()
    await expectNoAxeViolations(container)
  })
})
