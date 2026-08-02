import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { IDBFactory } from 'fake-indexeddb'
import 'fake-indexeddb/auto'
import { deriveKeyFromRecoveryCode, fromBase64Url, unwrapDataKey } from '@/lib/crypto'
import { getVault, clearVault } from '@/lib/crypto/key-store'
import { getPendingKeyMaterial, clearPendingKeyMaterial } from '@/lib/crypto/pending-key-material'
import { expectStructuralA11y } from '@/test/a11y'
import { expectNoAxeViolations } from '@/test/axe'
import { KeySetup } from './KeySetup'

/**
 * KeySetup always renders inside the router in the real app (HouseholdGate
 * mounts it), and it links to the privacy note. Wrapping here rather than at
 * each of the sixteen call sites keeps those cases reading as they did.
 */
function render(ui: ReactElement) {
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>,
  })
}

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

const STRONG = 'quiet lantern rutabaga sundial 41'

function passphraseField() {
  return screen.getByLabelText(/choose a passphrase/i)
}
function confirmField() {
  return screen.getByLabelText(/type it again/i)
}
function submitButton() {
  return screen.getByRole('button', { name: /create my key/i })
}

async function typeStrongPassphrase() {
  fireEvent.change(passphraseField(), { target: { value: STRONG } })
  fireEvent.change(confirmField(), { target: { value: STRONG } })
}

describe('KeySetup — the passphrase floor', () => {
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    await clearVault()
    await clearPendingKeyMaterial()
    track.mockClear()
  })

  // Both enforcement layers are asserted for every one of these. The disabled
  // button is layer one; the submit handler refusing a value that reaches it
  // anyway is layer two, and layer two is the one that actually holds.
  const WEAK: Array<[label: string, value: string]> = [
    ['a value under the length floor', 'lantern'],
    ['a breach-list password padded with digits', 'password1234'],
    ['the same value in mixed case', 'PaSSworD123!'],
    ['a l33t-substituted variant', 'P@ssw0rd1234'],
    ['a l33t-substituted app-context value', 'F1n4nc14lPl4nn1ng'],
    ['a single repeated character', 'aaaaaaaaaaaaaa'],
  ]

  it.each(WEAK)('layer 1: disables the submit control for %s', (_label, weak) => {
    render(<KeySetup onReady={vi.fn()} />)
    fireEvent.change(passphraseField(), { target: { value: weak } })
    fireEvent.change(confirmField(), { target: { value: weak } })
    expect(submitButton()).toBeDisabled()
  })

  it.each(WEAK)('layer 2: refuses %s even when the disabled control is bypassed', async (_label, weak) => {
    const onReady = vi.fn()
    const { container } = render(<KeySetup onReady={onReady} />)
    fireEvent.change(passphraseField(), { target: { value: weak } })
    fireEvent.change(confirmField(), { target: { value: weak } })

    // A disabled button does not stop a form being submitted — by Enter, by a
    // script, or by a future refactor that drops the `disabled` prop.
    const form = container.querySelector('form')
    expect(form).not.toBeNull()
    fireEvent.submit(form as HTMLFormElement)

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(onReady).not.toHaveBeenCalled()
    // The point of layer 2: no key material of any kind came into existence.
    expect(await getVault()).toBeNull()
    expect(await getPendingKeyMaterial()).toBeNull()
    expect(screen.queryByTestId('recovery-code')).not.toBeInTheDocument()
  })

  it('shows a strength meter that reacts to what is typed', () => {
    render(<KeySetup onReady={vi.fn()} />)
    fireEvent.change(passphraseField(), { target: { value: 'password1234' } })
    expect(screen.getByRole('status')).toHaveTextContent(/too weak/i)
    fireEvent.change(passphraseField(), { target: { value: STRONG } })
    expect(screen.getByRole('status')).not.toHaveTextContent(/too weak/i)
  })

  it('says plainly that the check runs in this browser and that we cannot recover the passphrase', () => {
    render(<KeySetup onReady={vi.fn()} />)
    expect(screen.getByText(/runs here in your browser/i)).toBeInTheDocument()
    expect(screen.getByText(/we cannot recover it for you/i)).toBeInTheDocument()
  })

  it('keeps the submit control disabled until the confirmation matches', () => {
    render(<KeySetup onReady={vi.fn()} />)
    fireEvent.change(passphraseField(), { target: { value: STRONG } })
    fireEvent.change(confirmField(), { target: { value: `${STRONG}x` } })
    expect(submitButton()).toBeDisabled()
    fireEvent.change(confirmField(), { target: { value: STRONG } })
    expect(submitButton()).toBeEnabled()
  })

  it('refuses a mismatched confirmation submitted directly, and creates nothing', async () => {
    const { container } = render(<KeySetup onReady={vi.fn()} />)
    fireEvent.change(passphraseField(), { target: { value: STRONG } })
    fireEvent.change(confirmField(), { target: { value: `${STRONG}x` } })
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(await getPendingKeyMaterial()).toBeNull()
  })
})

describe('KeySetup — the recovery code', () => {
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    await clearVault()
    await clearPendingKeyMaterial()
    track.mockClear()
  })

  async function completeThePassphraseStep() {
    render(<KeySetup onReady={vi.fn()} />)
    await typeStrongPassphrase()
    fireEvent.click(submitButton())
    return screen.findByTestId('recovery-code', undefined, { timeout: 20_000 })
  }

  it('shows a readable, hyphen-grouped code once the passphrase is set', async () => {
    const code = await completeThePassphraseStep()
    expect(code.textContent).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{1,4}){5,6}$/)
  })

  it('wrapped the data key twice, under different IVs', async () => {
    await completeThePassphraseStep()
    const material = (await getPendingKeyMaterial())!.material
    expect(material.passphraseWrapIv).not.toBe(material.recoveryWrapIv)
    expect(material.wrappedDekPassphrase).not.toBe(material.wrappedDekRecovery)
  })

  it('shows a code that really does open the key — round trip, no mocks', async () => {
    const code = await completeThePassphraseStep()
    const material = (await getPendingKeyMaterial())!.material
    const wrappingKey = await deriveKeyFromRecoveryCode(
      code.textContent as string,
      fromBase64Url(material.recoverySalt),
      material.kdfIterations,
    )
    const dataKey = await unwrapDataKey(material.wrappedDekRecovery, material.recoveryWrapIv, wrappingKey)
    expect(dataKey.type).toBe('secret')
  }, 30_000)

  it('will not continue until the "we cannot recover this" box is ticked', async () => {
    await completeThePassphraseStep()
    const continueButton = screen.getByRole('button', { name: /continue/i })
    expect(continueButton).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(continueButton).toBeEnabled())
  })

  it('hands the caller the household id it unlocked the vault for', async () => {
    const onReady = vi.fn()
    render(<KeySetup onReady={onReady} />)
    await typeStrongPassphrase()
    fireEvent.click(submitButton())
    await screen.findByTestId('recovery-code', undefined, { timeout: 20_000 })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(await screen.findByRole('button', { name: /continue/i }))

    await waitFor(() => expect(onReady).toHaveBeenCalled())
    const vault = await getVault()
    expect(onReady.mock.calls[0][0].householdId).toBe(vault?.householdId)
  }, 30_000)
})

describe('KeySetup — analytics', () => {
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    await clearVault()
    await clearPendingKeyMaterial()
    track.mockClear()
  })

  it('reports that the screen was shown, so drop-off is measured rather than guessed', () => {
    render(<KeySetup onReady={vi.fn()} />)
    expect(track).toHaveBeenCalledWith('key_setup_started', expect.anything())
  })

  // key_setup_started fires on mount and key_setup_completed only fires after
  // the recovery code has been shown AND acknowledged — two sub-steps with no
  // checkpoint between them. Without this event, a household that never
  // manages a strong-enough passphrase and one that generates a key but
  // abandons the recovery-code screen look identical in the funnel: both are
  // "started, never completed." This event splits them.
  it('reports the passphrase step finishing, distinguishing passphrase drop-off from recovery-code drop-off', async () => {
    render(<KeySetup onReady={vi.fn()} />)
    expect(track).not.toHaveBeenCalledWith('key_setup_step_completed', expect.anything())

    await typeStrongPassphrase()
    fireEvent.click(submitButton())
    await screen.findByTestId('recovery-code', undefined, { timeout: 20_000 })

    expect(track).toHaveBeenCalledWith('key_setup_step_completed', { step: 'passphrase' })
  }, 30_000)

  it('never puts the passphrase, the recovery code or key material in a property', async () => {
    render(<KeySetup onReady={vi.fn()} />)
    await typeStrongPassphrase()
    fireEvent.click(submitButton())
    const code = await screen.findByTestId('recovery-code', undefined, { timeout: 20_000 })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(await screen.findByRole('button', { name: /continue/i }))
    await waitFor(() => expect(track).toHaveBeenCalledWith('key_setup_completed', expect.anything()))

    const material = await getPendingKeyMaterial()
    const emitted = JSON.stringify(track.mock.calls)
    expect(emitted).not.toContain(STRONG)
    expect(emitted).not.toContain(code.textContent)
    expect(emitted).not.toContain((code.textContent as string).replace(/-/g, ''))
    // Nothing wrapped, salted or IV'd leaks either — even though it is opaque.
    if (material) {
      for (const value of Object.values(material.material)) {
        if (typeof value === 'string') expect(emitted).not.toContain(value)
      }
    }
  }, 30_000)
})

describe('KeySetup — accessibility', () => {
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    await clearVault()
    await clearPendingKeyMaterial()
    track.mockClear()
  })

  it('passes the structural checks on the passphrase step', () => {
    const { container } = render(<KeySetup onReady={vi.fn()} />)
    expectStructuralA11y(container)
  })

  it('has zero axe violations on the passphrase step', async () => {
    const { container } = render(<KeySetup onReady={vi.fn()} />)
    await expectNoAxeViolations(container)
  })

  it('passes the structural checks on the recovery-code step', async () => {
    const { container } = render(<KeySetup onReady={vi.fn()} />)
    await typeStrongPassphrase()
    fireEvent.click(submitButton())
    await screen.findByTestId('recovery-code', undefined, { timeout: 20_000 })
    expectStructuralA11y(container)
  }, 30_000)

  it('has zero axe violations on the recovery-code step', async () => {
    const { container } = render(<KeySetup onReady={vi.fn()} />)
    await typeStrongPassphrase()
    fireEvent.click(submitButton())
    await screen.findByTestId('recovery-code', undefined, { timeout: 20_000 })
    await expectNoAxeViolations(container)
  }, 30_000)

  it('announces the strength meter and the error without needing focus to move', () => {
    render(<KeySetup onReady={vi.fn()} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    fireEvent.change(passphraseField(), { target: { value: 'password1234' } })
    expect(screen.getByRole('status')).toHaveTextContent(/too weak/i)
  })
})
