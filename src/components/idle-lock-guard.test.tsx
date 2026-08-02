import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { IDBFactory } from 'fake-indexeddb'
import 'fake-indexeddb/auto'
import { generateDataKey, wrapDataKey, unwrapDataKey, generateSalt, deriveKeyFromPassphrase } from '@/lib/crypto'
import { getVault, setVault } from '@/lib/crypto/key-store'
import { IdleLockGuard } from './idle-lock-guard'

const HOUSEHOLD_ID = 'household-under-test'

/**
 * A real non-extractable data key, obtained the only way `setVault` accepts one
 * — by unwrapping. Using a fake here would test the mock, not the lock.
 */
async function storeRealVault() {
  const dataKey = await generateDataKey()
  const salt = generateSalt()
  const wrappingKey = await deriveKeyFromPassphrase('a-sufficiently-long-passphrase', salt)
  const wrapped = await wrapDataKey(dataKey, wrappingKey)
  const unwrapped = await unwrapDataKey(wrapped.wrapped, wrapped.iv, wrappingKey)
  await setVault({ householdId: HOUSEHOLD_ID, dataKey: unwrapped })
}

describe('IdleLockGuard', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
  })

  it('removes the data key from IndexedDB once the idle timeout elapses', async () => {
    await storeRealVault()
    expect(await getVault()).not.toBeNull()

    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <>
                  <IdleLockGuard timeoutMs={1_000} />
                  <div>dashboard</div>
                </>
              }
            />
            <Route path="/" element={<div>gate</div>} />
          </Routes>
        </MemoryRouter>,
      )

      expect(screen.getByText('dashboard')).toBeInTheDocument()
      vi.advanceTimersByTime(1_000)

      await waitFor(async () => {
        expect(await getVault()).toBeNull()
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('sends the user back to the gate, so a locked vault cannot leave a decrypted screen on display', async () => {
    await storeRealVault()

    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <>
                  <IdleLockGuard timeoutMs={1_000} />
                  <div>dashboard</div>
                </>
              }
            />
            <Route path="/" element={<div>gate</div>} />
          </Routes>
        </MemoryRouter>,
      )

      vi.advanceTimersByTime(1_000)

      await waitFor(() => {
        expect(screen.getByText('gate')).toBeInTheDocument()
      })
      expect(screen.queryByText('dashboard')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves the vault alone while the user is still active', async () => {
    await storeRealVault()

    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <>
                  <IdleLockGuard timeoutMs={1_000} />
                  <div>dashboard</div>
                </>
              }
            />
            <Route path="/" element={<div>gate</div>} />
          </Routes>
        </MemoryRouter>,
      )

      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(800)
        window.dispatchEvent(new Event('pointerdown'))
      }

      expect(await getVault()).not.toBeNull()
      expect(screen.getByText('dashboard')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
