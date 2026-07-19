import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOnline, OFFLINE_WRITE_MESSAGE } from './use-online'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useOnline', () => {
  it('reports the browser state at mount', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(renderHook(() => useOnline()).result.current).toBe(false)
  })

  it('flips to offline when the browser fires the offline event', () => {
    const { result } = renderHook(() => useOnline())
    expect(result.current).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)
  })

  it('recovers when the connection comes back', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { result } = renderHook(() => useOnline())
    expect(result.current).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })

  it('removes its listeners on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    renderHook(() => useOnline()).unmount()
    const removed = remove.mock.calls.map((c) => c[0])
    expect(removed).toContain('online')
    expect(removed).toContain('offline')
  })

  it('states plainly that nothing is queued in the background (no write-queue in v1)', () => {
    expect(OFFLINE_WRITE_MESSAGE).toMatch(/nothing is queued/i)
  })
})
