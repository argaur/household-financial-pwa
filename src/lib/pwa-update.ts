/**
 * Service worker registration.
 *
 * This module exists because of a defect proven on production 2026-08-05: the
 * first load after every deploy served the previous build, and only a second
 * navigation self-corrected. For a visitor who opens the link once and never
 * reloads — the case this app is built for — that meant never seeing the
 * current build at all.
 *
 * Nothing imported `virtual:pwa-register`, so vite-plugin-pwa fell back to
 * emitting its own `registerSW.js`: a bare `navigator.serviceWorker.register()`
 * with no update handling. `registerType: 'autoUpdate'` still set workbox's
 * `skipWaiting`/`clientsClaim`, so the new worker did install and claim the
 * page. What was missing is the other half — the virtual module attaches an
 * `activated` listener that calls `window.location.reload()` when the
 * activation is an update, and that listener is the only thing that tells the
 * running page its precached shell is now stale.
 *
 * Importing `registerSW` also suppresses the emitted `registerSW.js`, so there
 * is exactly one registration path rather than two.
 *
 * Do NOT set `injectRegister` in vite.config.ts to achieve the same
 * suppression: the plugin only enables skipWaiting/clientsClaim for
 * `autoUpdate` when `injectRegister` is `'auto'` or null, so setting it
 * explicitly stops the new worker taking control and makes the defect worse.
 * `pwa-registration.config.test.ts` pins both halves of that.
 *
 * Tradeoff accepted: the reload discards unsaved form input if a deploy lands
 * while a form is open. That needs a deploy concurrent with an open form, and
 * the alternative — a NetworkFirst navigation strategy — reopens the offline
 * scope settled in D-013/B-005.
 */

import { registerSW } from 'virtual:pwa-register'

export function initPwaUpdate(): void {
  // `immediate` registers now rather than deferring to the window `load`
  // event. Waiting would widen the window in which a stale shell is served,
  // which is the whole thing this is here to close.
  registerSW({ immediate: true })
}
