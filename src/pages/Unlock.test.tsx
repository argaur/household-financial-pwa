import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import 'fake-indexeddb/auto'
import {
  deriveKeyFromPassphrase,
  deriveKeyFromRecoveryCode,
  generateDataKey,
  generateRecoveryCode,
  generateSalt,
  toBase64Url,
  wrapDataKey,
  KDF_ALG,
  PBKDF2_ITERATIONS,
} from '@/lib/crypto'
import { getVault, clearVault } from '@/lib/crypto/key-store'
import type { HouseholdKeys } from '@/lib/household-keys-api'
import { expectStructuralA11y } from '@/test/a11y'
import { expectNoAxeViolations } from '@/test/axe'
import { Unlock } from './Unlock'

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

const HOUSEHOLD_ID = 'household-under-test'

/**
 * Build real key material for an arbitrary passphrase.
 *
 * Deliberately does NOT go through `prepareKeySetup`: the point of several of
 * these tests is a passphrase that today's floor would reject, which an
 * existing household may perfectly well have been created with.
 */
async function keyMaterialFor(passphrase: string, recoveryCode: string): Promise<HouseholdKeys> {
  const passphraseSalt = generateSalt()
  const recoverySalt = generateSalt()
  const dataKey = await generateDataKey()
  const passphraseCopy = await wrapDataKey(dataKey, await deriveKeyFromPassphrase(passphrase, passphraseSalt))
  const recoveryCopy = await wrapDataKey(dataKey, await deriveKeyFromRecoveryCode(recoveryCode, recoverySalt))
  return {
    householdId: HOUSEHOLD_ID,
    kdfAlg: KDF_ALG,
    kdfIterations: PBKDF2_ITERATIONS,
    passphraseSalt: toBase64Url(passphraseSalt),
    wrappedDekPassphrase: passphraseCopy.wrapped,
    passphraseWrapIv: passphraseCopy.iv,
    recoverySalt: toBase64Url(recoverySalt),
    wrappedDekRecovery: recoveryCopy.wrapped,
    recoveryWrapIv: recoveryCopy.iv,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const PASSPHRASE = 'quiet lantern rutabaga sundial 41'
/** An existing household whose passphrase would never clear today's floor. */
const LEGACY_PASSPHRASE = 'letmein'

let keys: HouseholdKeys
let legacyKeys: HouseholdKeys
let recoveryCode: string
let legacyRecoveryCode: string

beforeAll(async () => {
  recoveryCode = generateRecoveryCode()
  legacyRecoveryCode = generateRecoveryCode()
  keys = await keyMaterialFor(PASSPHRASE, recoveryCode)
  legacyKeys = await keyMaterialFor(LEGACY_PASSPHRASE, legacyRecoveryCode)
}, 60_000)

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  await clearVault()
  track.mockClear()
})

function passphraseField() {
  return screen.getByLabelText(/your passphrase/i)
}

describe('Unlock — passphrase', () => {
  it('restores the vault for the right household', async () => {
    const onUnlocked = vi.fn()
    render(<Unlock keys={keys} onUnlocked={onUnlocked} />)
    fireEvent.change(passphraseField(), { target: { value: PASSPHRASE } })
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))

    await waitFor(() => expect(onUnlocked).toHaveBeenCalled(), { timeout: 20_000 })
    expect((await getVault())?.householdId).toBe(HOUSEHOLD_ID)
  }, 30_000)

  it('does not apply the strength floor — an existing weak passphrase still opens the household', async () => {
    const onUnlocked = vi.fn()
    render(<Unlock keys={legacyKeys} onUnlocked={onUnlocked} />)
    fireEvent.change(passphraseField(), { target: { value: LEGACY_PASSPHRASE } })
    // Nothing about the control may depend on strength here.
    expect(screen.getByRole('button', { name: /unlock/i })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))

    await waitFor(() => expect(onUnlocked).toHaveBeenCalled(), { timeout: 20_000 })
    expect(await getVault()).not.toBeNull()
  }, 30_000)

  it('shows a clear error and leaves the vault locked on a wrong passphrase', async () => {
    const onUnlocked = vi.fn()
    render(<Unlock keys={keys} onUnlocked={onUnlocked} />)
    fireEvent.change(passphraseField(), { target: { value: 'a different quiet lantern 42' } })
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))

    const alert = await screen.findByRole('alert', undefined, { timeout: 20_000 })
    expect(alert).toHaveTextContent(/didn't unlock/i)
    expect(onUnlocked).not.toHaveBeenCalled()
    expect(await getVault()).toBeNull()
  }, 30_000)

  it('says exactly the same thing for a tampered blob as for a wrong passphrase', async () => {
    const wrapped = keys.wrappedDekPassphrase
    const tampered: HouseholdKeys = {
      ...keys,
      wrappedDekPassphrase: (wrapped[0] === 'A' ? 'B' : 'A') + wrapped.slice(1),
    }

    const first = render(<Unlock keys={keys} onUnlocked={vi.fn()} />)
    fireEvent.change(passphraseField(), { target: { value: 'a different quiet lantern 42' } })
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))
    const wrongMessage = (await screen.findByRole('alert', undefined, { timeout: 20_000 })).textContent
    first.unmount()

    render(<Unlock keys={tampered} onUnlocked={vi.fn()} />)
    fireEvent.change(passphraseField(), { target: { value: PASSPHRASE } })
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))
    const tamperedMessage = (await screen.findByRole('alert', undefined, { timeout: 20_000 })).textContent

    expect(tamperedMessage).toBe(wrongMessage)
    // And neither message names a cause an attacker could use as an oracle.
    expect(wrongMessage).not.toMatch(/tamper|corrupt|altered|invalid key|blob/i)
  }, 60_000)

  it('never echoes the attempted passphrase in the error', async () => {
    render(<Unlock keys={keys} onUnlocked={vi.fn()} />)
    fireEvent.change(passphraseField(), { target: { value: 'hunter2 lantern rutabaga' } })
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))
    const alert = await screen.findByRole('alert', undefined, { timeout: 20_000 })
    expect(alert.textContent).not.toContain('hunter2')
  }, 30_000)
})

describe('Unlock — recovery code', () => {
  function switchToRecovery() {
    fireEvent.click(screen.getByRole('button', { name: /recovery code instead/i }))
  }

  it('opens the household with the recovery code', async () => {
    const onUnlocked = vi.fn()
    render(<Unlock keys={keys} onUnlocked={onUnlocked} />)
    switchToRecovery()
    fireEvent.change(screen.getByLabelText(/recovery code/i), { target: { value: recoveryCode } })
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))

    await waitFor(() => expect(onUnlocked).toHaveBeenCalled(), { timeout: 20_000 })
    expect((await getVault())?.householdId).toBe(HOUSEHOLD_ID)
  }, 30_000)

  it('accepts a lowercase, differently grouped retype', async () => {
    const retyped = recoveryCode.replace(/-/g, '').toLowerCase().replace(/(.{6})/g, '$1 ').trim()
    const onUnlocked = vi.fn()
    render(<Unlock keys={keys} onUnlocked={onUnlocked} />)
    switchToRecovery()
    fireEvent.change(screen.getByLabelText(/recovery code/i), { target: { value: retyped } })
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))

    await waitFor(() => expect(onUnlocked).toHaveBeenCalled(), { timeout: 20_000 })
  }, 30_000)

  it('rejects a malformed code without pretending it might have been right', async () => {
    render(<Unlock keys={keys} onUnlocked={vi.fn()} />)
    switchToRecovery()
    fireEvent.change(screen.getByLabelText(/recovery code/i), { target: { value: 'not-a-real-code' } })
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))

    const alert = await screen.findByRole('alert', undefined, { timeout: 20_000 })
    expect(alert).toBeInTheDocument()
    expect(await getVault()).toBeNull()
  }, 30_000)

  it('can be switched back to the passphrase', () => {
    render(<Unlock keys={keys} onUnlocked={vi.fn()} />)
    switchToRecovery()
    fireEvent.click(screen.getByRole('button', { name: /use my passphrase/i }))
    expect(passphraseField()).toBeInTheDocument()
  })
})

describe('Unlock — copy and analytics', () => {
  it('is honest that no one can reset the passphrase for the user', () => {
    render(<Unlock keys={keys} onUnlocked={vi.fn()} />)
    expect(screen.getByText(/cannot reset it for you/i)).toBeInTheDocument()
  })

  it('reports the unlock method and nothing secret', async () => {
    render(<Unlock keys={keys} onUnlocked={vi.fn()} />)
    fireEvent.change(passphraseField(), { target: { value: PASSPHRASE } })
    fireEvent.click(screen.getByRole('button', { name: /unlock/i }))

    await waitFor(() => expect(track).toHaveBeenCalledWith('vault_unlocked', { method: 'passphrase' }), {
      timeout: 20_000,
    })
    const emitted = JSON.stringify(track.mock.calls)
    expect(emitted).not.toContain(PASSPHRASE)
    expect(emitted).not.toContain(recoveryCode)
    for (const value of Object.values(keys)) {
      if (typeof value === 'string' && value.length > 12) expect(emitted).not.toContain(value)
    }
  }, 30_000)
})

describe('Unlock — embedded variant', () => {
  it('drops the full-page shell that the standalone route keeps', () => {
    const embedded = render(<Unlock keys={keys} embedded onUnlocked={vi.fn()} />)
    expect(embedded.container.querySelector('.min-h-screen')).toBeNull()
    expect(embedded.container.querySelector('h1')).toBeNull()
    embedded.unmount()

    const standalone = render(<Unlock keys={keys} onUnlocked={vi.fn()} />)
    expect(standalone.container.querySelector('.min-h-screen')).not.toBeNull()
    expect(standalone.container.querySelector('h1')).not.toBeNull()
  })

  it('keeps the recovery-code switch and both help texts reachable', () => {
    render(<Unlock keys={keys} embedded onUnlocked={vi.fn()} />)
    expect(screen.getByText(/cannot reset it for you/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /recovery code instead/i }))
    expect(screen.getByLabelText(/recovery code/i)).toBeInTheDocument()
    expect(screen.getByText(/upper or lower case/i)).toBeInTheDocument()
  })
})

describe('Unlock — accessibility', () => {
  it('passes the structural checks on the passphrase step', () => {
    const { container } = render(<Unlock keys={keys} onUnlocked={vi.fn()} />)
    expectStructuralA11y(container)
  })

  it('has zero axe violations on the passphrase step', async () => {
    const { container } = render(<Unlock keys={keys} onUnlocked={vi.fn()} />)
    await expectNoAxeViolations(container)
  })

  it('passes the structural checks on the recovery-code step', () => {
    const { container } = render(<Unlock keys={keys} onUnlocked={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /recovery code instead/i }))
    expectStructuralA11y(container)
  })

  it('has zero axe violations on the recovery-code step', async () => {
    const { container } = render(<Unlock keys={keys} onUnlocked={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /recovery code instead/i }))
    await expectNoAxeViolations(container)
  })
})
