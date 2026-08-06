/**
 * Test double for `virtual:pwa-register`.
 *
 * That specifier is created by vite-plugin-pwa at build time. `vitest.config.ts`
 * is a separate config that does not load the plugin, so the module does not
 * exist under test and any import of it fails at transform time. The vitest
 * config aliases the specifier here instead.
 *
 * It records calls rather than asserting on them, so a test can check *how*
 * registration was requested — `immediate` in particular, which decides whether
 * the service worker registers at once or waits for the window `load` event.
 */

export interface RegisterSWOptions {
  immediate?: boolean
  onNeedRefresh?: () => void
  onOfflineReady?: () => void
  onRegisteredSW?: (url: string, registration: ServiceWorkerRegistration | undefined) => void
  onRegisterError?: (error: unknown) => void
}

export const registerSWCalls: RegisterSWOptions[] = []

export function registerSW(options: RegisterSWOptions = {}): (reloadPage?: boolean) => Promise<void> {
  registerSWCalls.push(options)
  return async () => {}
}

export function __resetRegisterSWCalls(): void {
  registerSWCalls.length = 0
}
