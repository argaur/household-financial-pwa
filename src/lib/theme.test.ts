import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))

import {
  initTheme,
  readThemePreference,
  resolveTheme,
  setThemePreference,
} from './theme'
import { track } from '@/lib/analytics'

type MediaListener = (event: { matches: boolean }) => void

function mockMatchMedia(matches: boolean) {
  const changeListeners: MediaListener[] = []
  const mql = {
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type: string, listener: MediaListener) => changeListeners.push(listener),
    removeEventListener: vi.fn(),
  }
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia
  return {
    setMatches(next: boolean) {
      mql.matches = next
      changeListeners.forEach((l) => l({ matches: next }))
    },
  }
}

describe('theme', () => {
  const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia')

  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    if (matchMediaDescriptor) Object.defineProperty(window, 'matchMedia', matchMediaDescriptor)
    else delete (window as { matchMedia?: unknown }).matchMedia
    vi.clearAllMocks()
  })

  it('defaults to system: applies dark when the OS prefers dark', () => {
    mockMatchMedia(true)
    initTheme()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(readThemePreference()).toBe('system')
  })

  it('defaults to system: stays light when the OS prefers light', () => {
    mockMatchMedia(false)
    initTheme()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('survives jsdom-like environments with no matchMedia at all', () => {
    delete (window as { matchMedia?: unknown }).matchMedia
    expect(() => initTheme()).not.toThrow()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('follows a live OS change while preference is system', () => {
    const media = mockMatchMedia(false)
    initTheme()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    media.setMatches(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('a stored override wins over the OS and persists', () => {
    mockMatchMedia(true) // OS says dark
    setThemePreference('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem('theme:preference')).toBe('light')

    // A later boot re-applies the override, not the OS setting.
    document.documentElement.classList.add('dark')
    initTheme()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('ignores a live OS change once an override is stored', () => {
    const media = mockMatchMedia(false)
    initTheme()
    setThemePreference('dark')
    media.setMatches(false)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('resolveTheme maps preferences with the OS as the system fallback', () => {
    mockMatchMedia(true)
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
    expect(resolveTheme('system')).toBe('dark')
  })

  it('treats garbage in storage as system', () => {
    window.localStorage.setItem('theme:preference', 'sepia')
    expect(readThemePreference()).toBe('system')
  })

  it('setThemePreference("system") clears the override', () => {
    mockMatchMedia(false)
    setThemePreference('dark')
    setThemePreference('system')
    expect(window.localStorage.getItem('theme:preference')).toBeNull()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('never fires analytics from plain init/apply paths', () => {
    mockMatchMedia(true)
    initTheme()
    setThemePreference('dark')
    expect(track).not.toHaveBeenCalled()
  })
})
