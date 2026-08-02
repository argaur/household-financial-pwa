import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * D-014 forbids decrypted data reaching the PWA cache. The service worker is
 * the one place that can cache a response without any application code running,
 * and its cache is not cleared by signing out — so a rule added here leaks
 * across sessions on a shared device.
 *
 * This reads the real `vite.config.ts` rather than a fixture. A test that
 * asserted against a copy of the config would keep passing after the config
 * changed, which is the failure mode it exists to prevent.
 */

/** Every route that carries ciphertext or key material. */
const ENCRYPTED_ENDPOINTS = [
  'https://finance.gauravg.dev/api/holdings',
  'https://finance.gauravg.dev/api/family-members',
  'https://finance.gauravg.dev/api/protection',
  'https://finance.gauravg.dev/api/household',
  'https://finance.gauravg.dev/api/household-keys',
  // The deleted route, kept in the list: if it ever returns, it must not be
  // cached either.
  'https://finance.gauravg.dev/api/dashboard',
]

function runtimeCachingPatterns(): RegExp[] {
  const source = readFileSync(resolve(__dirname, '../../vite.config.ts'), 'utf8')

  const block = source.slice(source.indexOf('runtimeCaching:'))
  const patterns = [...block.matchAll(/urlPattern:\s*(\/(?:[^/\\\n]|\\.)+\/[gimsuy]*)/g)].map(
    (match) => match[1],
  )

  expect(
    patterns.length,
    'found no urlPattern entries — the parser has drifted from the config, so this test is no longer checking anything',
  ).toBeGreaterThan(0)

  return patterns.map((literal) => {
    const lastSlash = literal.lastIndexOf('/')
    return new RegExp(literal.slice(1, lastSlash), literal.slice(lastSlash + 1))
  })
}

describe('service worker runtime caching', () => {
  it('caches no route that carries encrypted household data or key material', () => {
    const patterns = runtimeCachingPatterns()

    for (const endpoint of ENCRYPTED_ENDPOINTS) {
      for (const pattern of patterns) {
        expect(
          pattern.test(endpoint),
          `${pattern} would cache ${endpoint} — decrypted or key-bearing responses must never enter the PWA cache`,
        ).toBe(false)
      }
    }
  })

  it('still caches the public instrument library, so offline browsing is not silently lost', () => {
    const patterns = runtimeCachingPatterns()
    const library = 'https://finance.gauravg.dev/api/instruments?slug=ppf'

    expect(
      patterns.some((pattern) => pattern.test(library)),
      'no rule matches the instrument library — offline support for public content has been dropped',
    ).toBe(true)
  })
})
