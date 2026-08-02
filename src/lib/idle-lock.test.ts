import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startIdleLock } from './idle-lock'

/**
 * The idle lock is the only thing that bounds how long a decrypted data key
 * stays reachable on an unattended machine. D-014 accepts that a script on our
 * own origin can call decrypt with the key; shortening the window it exists in
 * is the mitigation that remains.
 */
describe('startIdleLock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('locks once the idle timeout elapses with no activity', () => {
    const onLock = vi.fn()
    const target = new EventTarget()

    startIdleLock({ timeoutMs: 60_000, onLock, target })

    vi.advanceTimersByTime(59_999)
    expect(onLock).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onLock).toHaveBeenCalledTimes(1)
  })

  it('restarts the countdown on user activity', () => {
    const onLock = vi.fn()
    const target = new EventTarget()

    startIdleLock({ timeoutMs: 60_000, onLock, target })

    vi.advanceTimersByTime(50_000)
    target.dispatchEvent(new Event('pointerdown'))

    // Without a reset this would already have locked at 60s.
    vi.advanceTimersByTime(50_000)
    expect(onLock).not.toHaveBeenCalled()

    vi.advanceTimersByTime(10_000)
    expect(onLock).toHaveBeenCalledTimes(1)
  })

  it('locks only once, however long the machine is left idle', () => {
    const onLock = vi.fn()
    const target = new EventTarget()

    startIdleLock({ timeoutMs: 1_000, onLock, target })

    vi.advanceTimersByTime(10_000)
    expect(onLock).toHaveBeenCalledTimes(1)
  })

  it('stops observing activity once locked, so a later event cannot revive the countdown', () => {
    const onLock = vi.fn()
    const target = new EventTarget()

    startIdleLock({ timeoutMs: 1_000, onLock, target })
    vi.advanceTimersByTime(1_000)
    expect(onLock).toHaveBeenCalledTimes(1)

    target.dispatchEvent(new Event('pointerdown'))
    vi.advanceTimersByTime(60_000)
    expect(onLock).toHaveBeenCalledTimes(1)
  })

  it('never locks after stop() is called', () => {
    const onLock = vi.fn()
    const target = new EventTarget()

    const stop = startIdleLock({ timeoutMs: 1_000, onLock, target })
    stop()

    vi.advanceTimersByTime(60_000)
    expect(onLock).not.toHaveBeenCalled()
  })

  it('stops listening after stop(), so activity does not re-arm it', () => {
    const onLock = vi.fn()
    const target = new EventTarget()

    const stop = startIdleLock({ timeoutMs: 1_000, onLock, target })
    stop()

    target.dispatchEvent(new Event('pointerdown'))
    vi.advanceTimersByTime(60_000)
    expect(onLock).not.toHaveBeenCalled()
  })

  it('refuses a non-positive timeout rather than locking instantly forever', () => {
    const onLock = vi.fn()
    const target = new EventTarget()

    expect(() => startIdleLock({ timeoutMs: 0, onLock, target })).toThrow(/positive/i)
    expect(() => startIdleLock({ timeoutMs: -1, onLock, target })).toThrow(/positive/i)
  })
})
