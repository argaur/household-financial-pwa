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
 * KNOWN GAP, stated rather than hidden: only the *signed-out* surface could be
 * observed — signing in needs a password this session does not hold. The
 * signed-in shell (Clerk user button, Google profile images, any Clerk flow that
 * opens an iframe) may require hosts not listed here. This policy must be
 * exercised on a preview deploy while signed in before it reaches production.
 * That check belongs to step 11's rehearsal.
 */

function cspDirectives(): Map<string, string[]> {
  const config = JSON.parse(
    readFileSync(resolve(__dirname, '../../vercel.json'), 'utf8'),
  ) as { headers?: { headers: { key: string; value: string }[] }[] }

  const header = config.headers
    ?.flatMap((entry) => entry.headers)
    .find((h) => h.key.toLowerCase() === 'content-security-policy')

  expect(header, 'vercel.json serves no Content-Security-Policy header').toBeDefined()

  const directives = new Map<string, string[]>()
  for (const part of header!.value.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/)
    if (name) directives.set(name, values)
  }
  return directives
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
