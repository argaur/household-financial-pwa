import { useCallback, useSyncExternalStore } from 'react'
import { track } from '@/lib/analytics'

/**
 * Theme wiring — the `.dark` palette in globals.css existed from Phase 2 but
 * nothing ever added the class. This module closes that gap (2026-08-05
 * design rework):
 *
 * - Default follows the OS setting live (`prefers-color-scheme`), including
 *   mid-session OS changes.
 * - A user override (the header toggle) persists in localStorage and wins
 *   over the OS from then on. Deliberate simplification: there is no
 *   "back to system" UI — the first toggle opts you into manual control,
 *   which is what pressing a light/dark switch means. Clearing site data
 *   restores the default.
 * - Everything guards `window.matchMedia`, which jsdom does not implement.
 *
 * No FOUC handling is needed: this is a fully client-rendered SPA behind a
 * strict CSP (no inline scripts allowed anyway), and nothing paints before
 * main.tsx runs initTheme().
 */

export type Theme = 'light' | 'dark'
export type ThemePreference = Theme | 'system'

const STORAGE_KEY = 'theme:preference'
const MEDIA_QUERY = '(prefers-color-scheme: dark)'

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    // Storage can be unavailable (private mode policies); the OS setting
    // still applies, the override just won't stick.
    return 'system'
  }
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(MEDIA_QUERY).matches
}

export function resolveTheme(preference: ThemePreference = readThemePreference()): Theme {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return preference
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  notify()
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // Best effort — the theme still applies for this page load.
  }
  applyTheme(resolveTheme(preference))
}

/**
 * Applies the stored/system theme and subscribes to OS changes. Call once at
 * boot (main.tsx), before render.
 */
export function initTheme(): void {
  applyTheme(resolveTheme())
  if (typeof window.matchMedia !== 'function') return
  const media = window.matchMedia(MEDIA_QUERY)
  // Older Safari exposes addListener only; both are guarded so jsdom (which
  // has neither matchMedia nor these methods) never throws.
  media.addEventListener?.('change', () => {
    if (readThemePreference() === 'system') applyTheme(resolveTheme())
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshot(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** The currently applied theme plus a persisted toggle, for the header. */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const theme = useSyncExternalStore(subscribe, snapshot)
  const toggleTheme = useCallback(() => {
    const next: Theme = snapshot() === 'dark' ? 'light' : 'dark'
    setThemePreference(next)
    track('feature_used', { feature_name: 'theme_toggled', theme: next })
  }, [])
  return { theme, toggleTheme }
}
