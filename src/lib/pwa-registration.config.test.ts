import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Two facts that keep the service worker's update path working. Neither is
 * expressible as a unit test of application code, and undoing either one
 * silently restores the stale-load defect with every other test still green —
 * which is exactly how it shipped in the first place.
 *
 * These read the real files rather than fixtures, for the same reason
 * `sw-cache-policy.test.ts` does: a test asserting against a copy keeps passing
 * after the original changes.
 */

function read(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), 'utf8')
}

describe('service worker registration wiring', () => {
  it('main.tsx calls initPwaUpdate, so the reload-on-update listener is attached', () => {
    const main = read('../main.tsx')

    expect(
      /initPwaUpdate\(\)/.test(main),
      'main.tsx no longer calls initPwaUpdate() — vite-plugin-pwa reverts to emitting a bare registerSW.js that never reloads the page, so every deploy serves one stale load',
    ).toBe(true)
  })

  it('vite.config.ts leaves injectRegister unset, which is what keeps skipWaiting on', () => {
    const config = read('../../vite.config.ts')

    expect(
      /injectRegister/.test(config),
      "injectRegister is set explicitly — vite-plugin-pwa only turns on workbox skipWaiting/clientsClaim for registerType 'autoUpdate' when injectRegister is 'auto' or null, so setting it here silently stops the new worker taking control. The import in pwa-update.ts is the correct lever; this option is not",
    ).toBe(false)
  })
})
