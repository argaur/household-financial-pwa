import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { expectNoAxeViolations } from '@/test/axe'
import { VaultLockedNotice } from './vault-locked-notice'

describe('VaultLockedNotice', () => {
  it('explains that the browser, not the account, is what is missing the key', () => {
    render(<VaultLockedNotice surface="portfolio" />)
    // Gaurav's report, 2026-09-13: signing in on a second device felt like the
    // account itself was device-bound. The words have to say the opposite —
    // the account travelled, the key did not.
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/this browser/i)
    expect(text).toMatch(/passphrase|recovery code/i)
    expect(text).not.toMatch(/went wrong|error/i)
  })

  it('offers a way to the unlock screen', () => {
    render(<VaultLockedNotice surface="portfolio" />)
    expect(screen.getByRole('link', { name: /unlock/i })).toHaveAttribute('href', '/')
  })

  it('never renders any monetary value', () => {
    render(<VaultLockedNotice surface="portfolio" />)
    expect(document.body.textContent ?? '').not.toMatch(/₹/)
  })

  it('gives each screen its own grammatical heading', () => {
    // One record, three screens: "holdings ARE locked" and "account IS
    // locked" cannot be produced by interpolating a noun into one template.
    const { rerender } = render(<VaultLockedNotice surface="portfolio" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/holdings are locked/i)
    rerender(<VaultLockedNotice surface="profile" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/account is locked/i)
    rerender(<VaultLockedNotice surface="dashboard" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/plan is locked/i)
  })

  it('has no axe violations', async () => {
    const { container } = render(<VaultLockedNotice surface="portfolio" />)
    await expectNoAxeViolations(container)
  })
})
