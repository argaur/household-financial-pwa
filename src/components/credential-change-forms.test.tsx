import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CryptoError } from '@/lib/crypto'
import { WeakPassphraseError } from '@/lib/passphrase-strength'
import type { HouseholdKeys } from '@/lib/household-keys-api'
import { ChangePassphraseForm, ResetRecoveryCodeForm } from './credential-change-forms'

const getToken = vi.fn().mockResolvedValue('test-token')
vi.mock('@clerk/clerk-react', () => ({ useAuth: () => ({ getToken }) }))

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))

const toast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }))

const changePassphrase = vi.fn()
const resetRecoveryCode = vi.fn()
vi.mock('@/lib/credential-change', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/credential-change')>()
  return {
    ...actual,
    changePassphrase: (...args: unknown[]) => changePassphrase(...args),
    resetRecoveryCode: (...args: unknown[]) => resetRecoveryCode(...args),
  }
})

const KEYS: HouseholdKeys = {
  householdId: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  kdfAlg: 'PBKDF2-SHA256',
  kdfIterations: 600_000,
  passphraseSalt: 'c2FsdC1vbmU',
  wrappedDekPassphrase: 'd3JhcHBlZC1wYXNz',
  passphraseWrapIv: 'aXYtcGFzcw',
  recoverySalt: 'c2FsdC10d28',
  wrappedDekRecovery: 'd3JhcHBlZC1yZWM',
  recoveryWrapIv: 'aXYtcmVj',
}

const CURRENT = 'quiet lantern rutabaga sundial 41'
const STRONG = 'amber trellis quartz meridian 77'
const WEAK = 'password1234'
const CODE = 'K4M2-9XQT-7B3W-ZR5N-6HJP-2VDC'

/** The message a wrong credential and a tampered blob must SHARE. */
const unwrapFailed = () =>
  new CryptoError('UNWRAP_FAILED', 'Could not unwrap the data key: wrong passphrase or recovery code, or the stored key was altered')

function type(labelPattern: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(labelPattern), { target: { value } })
}

beforeEach(() => {
  vi.clearAllMocks()
  getToken.mockResolvedValue('test-token')
})

describe('ChangePassphraseForm', () => {
  const onChanged = vi.fn()
  const renderForm = () => render(<ChangePassphraseForm keys={KEYS} onChanged={onChanged} />)

  it('says plainly that this happens in the browser and the server never sees the passphrase', () => {
    renderForm()
    expect(screen.getByText(/never (reaches|sees)/i)).toBeInTheDocument()
  })

  it('keeps the submit control disabled until the new passphrase clears the floor and matches', () => {
    renderForm()
    const submit = screen.getByRole('button', { name: /change my passphrase/i })
    expect(submit).toBeDisabled()

    type(/current passphrase/i, CURRENT)
    type(/^new passphrase/i, WEAK)
    type(/confirm/i, WEAK)
    expect(submit).toBeDisabled()

    type(/^new passphrase/i, STRONG)
    type(/confirm/i, STRONG)
    expect(submit).toBeEnabled()
  })

  it('refuses a weak new passphrase in the submit path too, and calls nothing', async () => {
    renderForm()
    type(/current passphrase/i, CURRENT)
    type(/^new passphrase/i, WEAK)
    type(/confirm/i, WEAK)

    // Bypasses the disabled button exactly as pressing Enter in a field would.
    fireEvent.submit(screen.getByTestId('change-passphrase-form'))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(changePassphrase).not.toHaveBeenCalled()
  })

  it('refuses when the confirmation does not match, and calls nothing', async () => {
    renderForm()
    type(/current passphrase/i, CURRENT)
    type(/^new passphrase/i, STRONG)
    type(/confirm/i, `${STRONG} nope`)
    fireEvent.submit(screen.getByTestId('change-passphrase-form'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/same one twice/i)
    expect(changePassphrase).not.toHaveBeenCalled()
  })

  it('refuses when the current passphrase is blank, and calls nothing', async () => {
    renderForm()
    type(/^new passphrase/i, STRONG)
    type(/confirm/i, STRONG)
    fireEvent.submit(screen.getByTestId('change-passphrase-form'))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(changePassphrase).not.toHaveBeenCalled()
  })

  it('passes the current and new passphrases through and reports success with a toast', async () => {
    const updated = { ...KEYS, wrappedDekPassphrase: 'bmV3LXdyYXA' }
    changePassphrase.mockResolvedValue(updated)
    renderForm()

    type(/current passphrase/i, CURRENT)
    type(/^new passphrase/i, STRONG)
    type(/confirm/i, STRONG)
    fireEvent.click(screen.getByRole('button', { name: /change my passphrase/i }))

    await waitFor(() => expect(changePassphrase).toHaveBeenCalledWith('test-token', KEYS, CURRENT, STRONG))
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated))
    expect(toast).toHaveBeenCalled()
    // The toast must describe the change without quoting any of it back.
    const announced = JSON.stringify(toast.mock.calls)
    expect(announced).not.toContain(CURRENT)
    expect(announced).not.toContain(STRONG)
  })

  it('gives one non-leaky message for a wrong current passphrase and for a tampered blob', async () => {
    changePassphrase.mockRejectedValue(unwrapFailed())
    renderForm()

    type(/current passphrase/i, 'the wrong one entirely')
    type(/^new passphrase/i, STRONG)
    type(/confirm/i, STRONG)
    fireEvent.click(screen.getByRole('button', { name: /change my passphrase/i }))

    const alert = await screen.findByRole('alert')
    // It must not name which of the two it was, and must not echo the input.
    expect(alert.textContent).not.toMatch(/tamper|altered|corrupt/i)
    expect(alert.textContent).not.toContain('the wrong one entirely')
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('surfaces the strength reasons from a WeakPassphraseError without echoing the passphrase', async () => {
    changePassphrase.mockRejectedValue(new WeakPassphraseError(['Use at least 12 characters.']))
    renderForm()

    type(/current passphrase/i, CURRENT)
    type(/^new passphrase/i, STRONG)
    type(/confirm/i, STRONG)
    fireEvent.click(screen.getByRole('button', { name: /change my passphrase/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/at least 12 characters/i)
    expect(alert.textContent).not.toContain(STRONG)
  })

  it('never renders a passphrase as readable text', () => {
    renderForm()
    type(/current passphrase/i, CURRENT)
    type(/^new passphrase/i, STRONG)

    for (const label of [/current passphrase/i, /^new passphrase/i, /confirm/i]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('type', 'password')
    }
    expect(document.body.textContent).not.toContain(CURRENT)
    expect(document.body.textContent).not.toContain(STRONG)
  })
})

describe('ResetRecoveryCodeForm', () => {
  const onReset = vi.fn()
  const renderForm = () => render(<ResetRecoveryCodeForm keys={KEYS} onReset={onReset} />)

  it('requires the current passphrase before it will issue anything', async () => {
    renderForm()
    const submit = screen.getByRole('button', { name: /new recovery code/i })
    expect(submit).toBeDisabled()

    fireEvent.submit(screen.getByTestId('reset-recovery-form'))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(resetRecoveryCode).not.toHaveBeenCalled()
  })

  it('warns that the current code stops working before the user commits', () => {
    renderForm()
    expect(screen.getByText(/stop working/i)).toBeInTheDocument()
  })

  it('shows the new code once, with the same shown-once warning as key setup', async () => {
    resetRecoveryCode.mockResolvedValue({ keys: KEYS, recoveryCode: CODE })
    renderForm()

    type(/current passphrase/i, CURRENT)
    fireEvent.click(screen.getByRole('button', { name: /new recovery code/i }))

    await waitFor(() => expect(resetRecoveryCode).toHaveBeenCalledWith('test-token', KEYS, CURRENT))
    expect(await screen.findByTestId('recovery-code')).toHaveTextContent(CODE)
    expect(screen.getByText(/shown once/i)).toBeInTheDocument()
    expect(screen.getByText(/cannot recover/i)).toBeInTheDocument()
  })

  it('gates completion behind the same acknowledgement checkbox as key setup', async () => {
    resetRecoveryCode.mockResolvedValue({ keys: KEYS, recoveryCode: CODE })
    renderForm()
    type(/current passphrase/i, CURRENT)
    fireEvent.click(screen.getByRole('button', { name: /new recovery code/i }))
    await screen.findByTestId('recovery-code')

    const done = screen.getByRole('button', { name: /^done$/i })
    expect(done).toBeDisabled()
    expect(onReset).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText(/saved my (new )?recovery code/i))
    await waitFor(() => expect(done).toBeEnabled())
    fireEvent.click(done)
    expect(onReset).toHaveBeenCalledWith(KEYS)
  })

  it('never puts the recovery code in a toast', async () => {
    resetRecoveryCode.mockResolvedValue({ keys: KEYS, recoveryCode: CODE })
    renderForm()
    type(/current passphrase/i, CURRENT)
    fireEvent.click(screen.getByRole('button', { name: /new recovery code/i }))
    await screen.findByTestId('recovery-code')

    expect(JSON.stringify(toast.mock.calls)).not.toContain(CODE)
  })

  it('gives one non-leaky message for a wrong passphrase, and issues no code', async () => {
    resetRecoveryCode.mockRejectedValue(unwrapFailed())
    renderForm()

    type(/current passphrase/i, 'the wrong one entirely')
    fireEvent.click(screen.getByRole('button', { name: /new recovery code/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).not.toMatch(/tamper|altered|corrupt/i)
    expect(screen.queryByTestId('recovery-code')).not.toBeInTheDocument()
    expect(onReset).not.toHaveBeenCalled()
  })

  it('masks the passphrase field and never renders it as text', () => {
    renderForm()
    type(/current passphrase/i, CURRENT)
    expect(screen.getByLabelText(/current passphrase/i)).toHaveAttribute('type', 'password')
    expect(document.body.textContent).not.toContain(CURRENT)
  })
})
