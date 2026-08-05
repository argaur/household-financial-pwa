import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * D-014's honest limit is that a script running on our own origin can call
 * decrypt with the key, because we serve the JavaScript. The CSP is what bounds
 * *which* scripts can run at all, so it is the closest thing to a mitigation
 * that exists — and a policy that quietly loses a directive fails open.
 *
 * The host list below was derived on 2026-08-02 by loading the live app and
 * reading its actual network requests, plus the Sentry ingest host extracted
 * from the deployed bundle. It is not recalled and it is not from documentation.
 *
 * GAP CLOSED 2026-08-05 by the step-11 preview rehearsal. The signed-in shell
 * was walked end to end on a preview deploy — key setup, an encrypted write,
 * dashboard render, sign-out, sign-in, recovery-code unlock — and produced zero
 * CSP violations, so no additional host is needed for the authenticated surface.
 *
 * One host WAS missing, and only a live probe found it: Turnstile's
 * `challenges.cloudflare.com`, which Clerk's sign-up screen requires. It was
 * deliberately omitted so the rehearsal could observe the failure rather than
 * guess, and the failure duly arrived —
 *   blockedURI https://challenges.cloudflare.com/turnstile/v0/api.js
 *   directive  script-src-elem
 * Existing users would have signed in normally while every new sign-up broke.
 * Both policies now carry it; see the test below.
 */

type HeaderRule = {
  source: string
  has?: { type: string; value: string }[]
  missing?: { type: string; value: string }[]
  headers: { key: string; value: string }[]
}

const PREVIEW_HOST_PATTERN = '.*\\.vercel\\.app'

function headerRules(): HeaderRule[] {
  const config = JSON.parse(readFileSync(resolve(__dirname, '../../vercel.json'), 'utf8')) as {
    headers?: HeaderRule[]
  }
  return config.headers ?? []
}

function parseDirectives(value: string): Map<string, string[]> {
  const directives = new Map<string, string[]>()
  for (const part of value.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/)
    if (name) directives.set(name, values)
  }
  return directives
}

/**
 * The production policy. Selected by the rule that is *excluded* on preview
 * hosts, so this stays the policy `finance.gauravg.dev` actually serves even
 * after the preview rule was added below — a `find()` on the first CSP header
 * would have silently started asserting the wrong one.
 */
function cspDirectives(): Map<string, string[]> {
  const header = headerRules()
    .filter((rule) => rule.missing?.some((c) => c.type === 'host' && c.value === PREVIEW_HOST_PATTERN))
    .flatMap((rule) => rule.headers)
    .find((h) => h.key.toLowerCase() === 'content-security-policy')

  expect(header, 'vercel.json serves no production Content-Security-Policy header').toBeDefined()
  return parseDirectives(header!.value)
}

/** The policy served only on `*.vercel.app` preview deployments. */
function previewCspDirectives(): Map<string, string[]> {
  const header = headerRules()
    .filter((rule) => rule.has?.some((c) => c.type === 'host' && c.value === PREVIEW_HOST_PATTERN))
    .flatMap((rule) => rule.headers)
    .find((h) => h.key.toLowerCase() === 'content-security-policy')

  expect(header, 'vercel.json serves no preview Content-Security-Policy header').toBeDefined()
  return parseDirectives(header!.value)
}

describe('Content-Security-Policy', () => {
  it('allows every third-party host the running app was observed to need', () => {
    const d = cspDirectives()

    // Clerk serves clerk-js in chunks and is also the auth API origin.
    expect(d.get('script-src')).toContain('https://clerk.finance.gauravg.dev')
    expect(d.get('connect-src')).toContain('https://clerk.finance.gauravg.dev')
    // Observed: POST https://us.i.posthog.com/e/
    expect(d.get('connect-src')).toContain('https://us.i.posthog.com')
    // Configured api_host in src/lib/posthog.ts
    expect(d.get('connect-src')).toContain('https://us.posthog.com')
    // Extracted from the deployed bundle's Sentry DSN.
    expect(d.get('connect-src')).toContain('https://o4511631534587904.ingest.us.sentry.io')
    // Observed: the Google button on the sign-in screen.
    expect(d.get('img-src')).toContain('https://img.clerk.com')
    // index.html preconnects and loads the webfont stylesheet.
    expect(d.get('style-src')).toContain('https://fonts.googleapis.com')
    expect(d.get('font-src')).toContain('https://fonts.gstatic.com')
  })

  it('allows the Turnstile bot-check that gates the sign-up screen', () => {
    const d = cspDirectives()

    // Observed on the 2026-08-05 preview rehearsal, on the live policy:
    //   blockedURI https://challenges.cloudflare.com/turnstile/v0/api.js
    //   directive  script-src-elem
    // Clerk's sign-up screen is Turnstile-gated on this project, so without
    // these two hosts every EXISTING user signs in fine and every NEW user is
    // locked out of sign-up — a failure that reads as a Clerk outage, not a
    // CSP bug. script-src loads the widget; frame-src renders its challenge.
    expect(d.get('script-src')).toContain('https://challenges.cloudflare.com')
    expect(d.get('frame-src')).toContain('https://challenges.cloudflare.com')
  })

  it('permits no script execution route that would defeat the policy', () => {
    const scriptSrc = cspDirectives().get('script-src') ?? []

    expect(scriptSrc).not.toContain("'unsafe-inline'")
    expect(scriptSrc).not.toContain("'unsafe-eval'")
    expect(scriptSrc).not.toContain('*')
    expect(scriptSrc, 'script-src must be present and restrictive').toContain("'self'")
  })

  it('closes the directives an attacker reaches for when script-src holds', () => {
    const d = cspDirectives()

    // Without default-src, any directive not listed is unrestricted.
    expect(d.get('default-src')).toContain("'self'")
    expect(d.get('object-src')).toContain("'none'")
    expect(d.get('base-uri')).toContain("'self'")
    // Clickjacking a signed-in dashboard is a real path to reading decrypted data.
    expect(d.get('frame-ancestors')).toContain("'none'")
    // Stops a form posting a decrypted payload to an attacker's origin.
    expect(d.get('form-action')).toContain("'self'")
  })

  it('does not allow the encrypted API to be called from anywhere but this origin', () => {
    const connectSrc = cspDirectives().get('connect-src') ?? []

    expect(connectSrc).toContain("'self'")
    expect(connectSrc).not.toContain('*')
    expect(connectSrc).not.toContain('https:')
  })
})

/**
 * A preview deployment runs on `*.vercel.app`, where Clerk's *development*
 * instance serves from `*.clerk.accounts.dev` rather than the production
 * `clerk.finance.gauravg.dev`. The preview policy exists so step 11's rehearsal
 * can sign in at all; these tests exist so it stays a host swap and never
 * becomes a relaxation that drifts back into production.
 */
describe('Content-Security-Policy — preview deployments', () => {
  const PRODUCTION_CLERK = 'https://clerk.finance.gauravg.dev'
  const PREVIEW_CLERK = 'https://*.clerk.accounts.dev'

  it('is the production policy with only the Clerk host swapped', () => {
    const prod = cspDirectives()
    const preview = previewCspDirectives()

    expect([...preview.keys()]).toEqual([...prod.keys()])

    for (const [name, prodValues] of prod) {
      const expected = prodValues.map((v) => (v === PRODUCTION_CLERK ? PREVIEW_CLERK : v))
      expect(preview.get(name), `preview ${name} diverges from production beyond the Clerk host`).toEqual(
        expected,
      )
    }
  })

  it('never serves the preview policy on the production host', () => {
    const previewRules = headerRules().filter((rule) =>
      rule.has?.some((c) => c.type === 'host' && c.value === PREVIEW_HOST_PATTERN),
    )

    expect(previewRules.length, 'exactly one rule may widen the policy for previews').toBe(1)
    // Without the matching `missing` guard on the production rule, both rules
    // match a preview host and the served header becomes order-dependent.
    const productionRules = headerRules().filter((rule) =>
      rule.headers.some((h) => h.key.toLowerCase() === 'content-security-policy'),
    )
    expect(productionRules.length).toBe(2)
    for (const rule of productionRules) {
      const guarded =
        rule.has?.some((c) => c.value === PREVIEW_HOST_PATTERN) ||
        rule.missing?.some((c) => c.value === PREVIEW_HOST_PATTERN)
      expect(guarded, `CSP rule "${rule.source}" matches every host — the two policies would collide`).toBe(
        true,
      )
    }
  })

  it('keeps every hardening directive the production policy has', () => {
    const d = previewCspDirectives()

    expect(d.get('script-src')).not.toContain("'unsafe-inline'")
    expect(d.get('script-src')).not.toContain("'unsafe-eval'")
    expect(d.get('script-src')).not.toContain('*')
    expect(d.get('object-src')).toContain("'none'")
    expect(d.get('frame-ancestors')).toContain("'none'")
    expect(d.get('base-uri')).toContain("'self'")
    expect(d.get('connect-src')).not.toContain('https:')
  })
})
