import { describe, it, expect, vi, beforeEach } from 'vitest'
import posthog from 'posthog-js'
import { initPostHog } from './posthog'

/**
 * The regression pin for the 2026-09-11 PostHog privacy hotfix.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS, AND WHY IT IS THE ONLY THING GUARDING THE FIX
 * ---------------------------------------------------------------------------
 * Both options pinned below are turned off by passing an EXPLICIT value that
 * overrides a posthog-js default. That makes their deletion silent:
 *
 *   - `autocapture` defaults to `true`
 *   - `disable_session_recording` defaults to `false` (i.e. recording allowed)
 *
 * So removing either line does not break a build, fail a type check, or change
 * any other test. It simply restores the leaking behaviour. Nothing in this
 * repository would notice except this file.
 *
 * That is the same trap shape as `injectRegister: false` in `vite.config.ts`,
 * recorded in this project's history as the thing that LOOKED like the fix and
 * silently made the defect worse.
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS ACTUALLY LEAKING
 * ---------------------------------------------------------------------------
 * `autocapture` sends an `$autocapture` event on every click, carrying the
 * clicked element's own text and all of its attributes. Measured against the
 * live shared "Web Fleet" project on 2026-09-11: 611 such events from this app
 * in 90 days, with `$el_text` values including real user-chosen labels
 * ("Minor's Equity Folio", "Aggressive Growth", "Spouse").
 *
 * This product encrypts household data in the browser so the server cannot
 * read it (D-014/D-015), and `EventMap` types the ledger events as
 * `Record<string, never>` so a ledger name cannot be sent deliberately. A
 * vendor default routed around a guard rail that was built on purpose.
 *
 * `disable_session_recording` was a latent version of the same problem: this
 * app consented client-side, and only a project-level toggle in a SHARED
 * PostHog project — outside this repository, covering every app pointed at it
 * — prevented capture. PostHog replay masks inputs by default but NOT text.
 */

vi.mock('posthog-js', () => ({
  default: { init: vi.fn(), register: vi.fn() },
}))

describe('PostHog init is configured to send no user content', () => {
  beforeEach(() => {
    vi.mocked(posthog.init).mockClear()
    vi.mocked(posthog.register).mockClear()
  })

  function initOptions(): Record<string, unknown> {
    initPostHog()
    expect(posthog.init).toHaveBeenCalledTimes(1)
    return vi.mocked(posthog.init).mock.calls[0]![1] as Record<string, unknown>
  }

  it('disables autocapture, which would otherwise send every clicked label', () => {
    expect(initOptions().autocapture).toBe(false)
  })

  it('disables session recording rather than relying on a shared project setting', () => {
    expect(initOptions().disable_session_recording).toBe(true)
  })

  it('still sends no pageview automatically, so page_viewed stays explicit', () => {
    expect(initOptions().capture_pageview).toBe(false)
  })

  /**
   * Pins the exact option key set, so a future edit that ADDS an option has to
   * come through this test rather than slipping in unexamined. A new option on
   * this call is a decision about what leaves the browser.
   */
  it('passes exactly the options this project has reviewed, and no others', () => {
    expect(Object.keys(initOptions()).sort()).toEqual(
      ['api_host', 'autocapture', 'capture_pageview', 'disable_session_recording', 'person_profiles'].sort(),
    )
  })

  it('registers only the fleet project tag as a super property', () => {
    initPostHog()
    expect(vi.mocked(posthog.register).mock.calls[0]![0]).toEqual({ project: 'financial-planning' })
  })
})
