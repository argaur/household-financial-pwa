import { describe, it, expect, beforeEach } from 'vitest'
import { registerSWCalls, __resetRegisterSWCalls } from '@/test/pwa-register-stub'
import { initPwaUpdate } from './pwa-update'

/**
 * Regression cover for the stale-load defect proven on production 2026-08-05:
 * after a deploy the first load kept serving the previous build, and only a
 * second navigation self-corrected.
 *
 * The cause was that nothing imported `virtual:pwa-register`. vite-plugin-pwa
 * then falls back to emitting a bare `navigator.serviceWorker.register()`
 * script. `registerType: 'autoUpdate'` still makes the new worker skip waiting
 * and claim the page, so the worker updates — but only the virtual module
 * attaches the `activated` listener that reloads the page, so the load in
 * progress keeps the stale precached shell.
 */

describe('initPwaUpdate', () => {
  beforeEach(() => {
    __resetRegisterSWCalls()
  })

  it('registers through virtual:pwa-register, the only path that reloads on update', () => {
    initPwaUpdate()

    expect(
      registerSWCalls.length,
      'nothing registered — vite-plugin-pwa falls back to a bare registration with no update handling, which is the defect',
    ).toBe(1)
  })

  it('registers immediately rather than waiting for the window load event', () => {
    initPwaUpdate()

    expect(
      registerSWCalls[0]?.immediate,
      'immediate defaults to false, which defers registration to the load event and widens the window in which a stale shell is served',
    ).toBe(true)
  })
})
