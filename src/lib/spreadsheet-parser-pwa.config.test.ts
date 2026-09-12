import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * D-025 steps I1 and I2, pinned together in one file because SPEC.md §I7 says
 * they must be: "Requirements 6 and 7 above pull opposite directions through
 * the same vite-plugin-pwa config and must be done in one pass with one test
 * file covering both."
 *
 *   §I6.7 — the parser chunk is in the precache list, so the import screen
 *           works offline.
 *   §I6.6 — the service worker caches no `/api/*` request or response body.
 *
 * The cheap way to satisfy §I6.7 is to widen `globPatterns`; the cheap way to
 * satisfy §I6.6 is to narrow the runtime rules. Done separately, one silently
 * undoes the other. Hence one file.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE PROVES, AND WHAT IT DOES NOT
 *
 * Every assertion below reads `package.json`, `package-lock.json`,
 * `vite.config.ts` and the loader module as TEXT. It therefore proves that the
 * CONFIGURATION SAYS the right thing. It does NOT execute a Vite build, so it
 * does NOT prove that the emitted `sw.js` actually lists the parser chunk in
 * its precache manifest, nor that the chunk was emitted at all.
 *
 * That gap is deliberate: a `vite build` inside the unit suite costs ~25s on
 * every run. The build-output check is a manual step — `npm run build`, then
 * grep the generated `dist/sw.js` precache manifest for the parser chunk — and
 * belongs in the Phase 5 gate.
 *
 * That manual check WAS run once when these assertions were written
 * (2026-09-11, with a throwaway dynamic import in `main.tsx` standing in for
 * the I3/I5 consumer that does not exist yet). It emitted
 * `assets/spreadsheet-parser-BGhuli8m.js` at 500.06 kB as a separate async
 * chunk, the manifest in `dist/sw.js` listed it, the precache count went 14 ->
 * 16 entries, and the main `index` chunk grew by 0.16 kB — so SheetJS did not
 * leak into the initial bundle. Until a real consumer lands in I3/I5 the
 * loader is unreferenced and Rollup emits no chunk at all, which is expected.
 *
 * Reading the real files rather than fixtures is the same choice
 * `sw-cache-policy.test.ts` and `pwa-registration.config.test.ts` made: a test
 * asserting against a copy keeps passing after the original changes.
 * ---------------------------------------------------------------------------
 */

const APP_ROOT = resolve(__dirname, '../..')

function read(relativeToAppRoot: string): string {
  return readFileSync(resolve(APP_ROOT, relativeToAppRoot), 'utf8')
}

/** The deterministic async chunk name pinned by `manualChunks` in vite.config.ts. */
const PARSER_CHUNK_NAME = 'spreadsheet-parser'

/** A representative emitted filename for that chunk, Rollup's default asset shape. */
const PARSER_CHUNK_PATH = `assets/${PARSER_CHUNK_NAME}-B7dK2xQa.js`

/**
 * Minimal glob -> RegExp for the only shapes workbox `globPatterns` uses here:
 * `**` (any depth), `*` (one segment), and a `{a,b,c}` extension group.
 * Anything outside that vocabulary throws rather than quietly matching, so a
 * rewritten pattern makes this test fail loudly instead of passing blindly.
 */
function globToRegExp(glob: string): RegExp {
  if (/[!()[\]+@?]/.test(glob)) {
    throw new Error(
      `globPatterns entry "${glob}" uses glob syntax this test cannot interpret — extend globToRegExp rather than trusting the assertion`,
    )
  }

  let source = ''
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i]
    if (char === '*') {
      if (glob[i + 1] === '*') {
        // `**/` matches zero or more path segments.
        if (glob[i + 2] === '/') {
          source += '(?:[^/]*/)*'
          i += 2
        } else {
          source += '.*'
          i += 1
        }
      } else {
        source += '[^/]*'
      }
    } else if (char === '{') {
      const close = glob.indexOf('}', i)
      if (close === -1) throw new Error(`unbalanced { in "${glob}"`)
      const alternatives = glob.slice(i + 1, close).split(',')
      source += `(?:${alternatives.map((alt) => alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`
      i = close
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${source}$`)
}

function viteConfig(): string {
  return read('vite.config.ts')
}

/** The `workbox: { ... }` block, so assertions cannot accidentally read the manifest block. */
function workboxBlock(): string {
  const source = viteConfig()
  const start = source.indexOf('workbox: {')
  expect(start, 'no workbox block found in vite.config.ts — the parser has drifted').toBeGreaterThan(
    -1,
  )
  return source.slice(start)
}

/** Same parse `sw-cache-policy.test.ts` uses, so both tests fail on the same drift. */
function runtimeCachingPatterns(): RegExp[] {
  const block = viteConfig().slice(viteConfig().indexOf('runtimeCaching:'))
  const literals = [...block.matchAll(/urlPattern:\s*(\/(?:[^/\\\n]|\\.)+\/[gimsuy]*)/g)].map(
    (match) => match[1],
  )

  expect(
    literals.length,
    'found no urlPattern entries — the parser has drifted from the config, so this test is no longer checking anything',
  ).toBeGreaterThan(0)

  return literals.map((literal) => {
    const lastSlash = literal.lastIndexOf('/')
    return new RegExp(literal.slice(1, lastSlash), literal.slice(lastSlash + 1))
  })
}

// ---------------------------------------------------------------------------
// I1 — SheetJS comes from the vendor, not the registry
// ---------------------------------------------------------------------------

describe('I1: SheetJS is pinned to the vendor tarball', () => {
  const VENDOR_TARBALL = /^https:\/\/cdn\.sheetjs\.com\/xlsx-(\d+\.\d+\.\d+)\/xlsx-\1\.tgz$/

  it('package.json points xlsx at a cdn.sheetjs.com tarball, not an npm semver range', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>
    }
    const spec = pkg.dependencies.xlsx

    expect(spec, 'xlsx is not in dependencies at all').toBeDefined()
    expect(
      VENDOR_TARBALL.test(spec),
      `xlsx is declared as "${spec}". D-025 open question 2 (resolved 2026-09-07) and SPEC.md §I7 require the vendor's own tarball URL — the npm registry copy of xlsx is frozen at an old release and is not the Community Edition the vendor ships`,
    ).toBe(true)
  })

  it('package-lock.json resolves xlsx from cdn.sheetjs.com, so an install cannot silently fall back to the registry', () => {
    const lock = JSON.parse(read('package-lock.json')) as {
      packages: Record<string, { resolved?: string }>
    }
    const entry = lock.packages['node_modules/xlsx']

    expect(entry, 'no node_modules/xlsx entry in package-lock.json').toBeDefined()
    expect(
      entry.resolved ?? '',
      'package-lock resolves xlsx somewhere other than cdn.sheetjs.com — npm ci would install the registry copy',
    ).toMatch(/^https:\/\/cdn\.sheetjs\.com\//)
  })
})

describe('I1: SheetJS is behind a dynamic-import seam', () => {
  it('the loader module reaches xlsx only through a dynamic import()', () => {
    const loader = read('src/lib/spreadsheet-parser-loader.ts')

    expect(
      /import\(\s*['"]xlsx['"]\s*\)/.test(loader),
      "spreadsheet-parser-loader.ts no longer calls import('xlsx') — without the dynamic import Rollup has no split point and SheetJS lands in the main bundle, blowing the 2s load target",
    ).toBe(true)

    expect(
      /^\s*import\s[^\n]*from\s+['"]xlsx['"]/m.test(loader),
      'spreadsheet-parser-loader.ts has a STATIC import of xlsx — that pulls SheetJS into the main bundle regardless of the dynamic import next to it',
    ).toBe(false)
  })

  it('no other source file statically imports xlsx', () => {
    const offenders: string[] = []

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          const text = readFileSync(full, 'utf8')
          if (/^\s*import\s[^\n]*from\s+['"]xlsx['"]/m.test(text)) {
            offenders.push(full)
          }
        }
      }
    }
    walk(resolve(APP_ROOT, 'src'))

    expect(
      offenders,
      'these files statically import xlsx, which defeats the dynamic-import seam and puts ~1MB of SheetJS in the initial bundle',
    ).toEqual([])
  })

  it('vite.config.ts pins the parser chunk to a stable name, so the precache assertion has something to name', () => {
    const config = viteConfig()

    expect(
      new RegExp(`['"]${PARSER_CHUNK_NAME}['"]`).test(config),
      `vite.config.ts no longer names the "${PARSER_CHUNK_NAME}" chunk — without manualChunks the async chunk is named after whichever module Rollup picks, and the precache assertion below stops meaning anything`,
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// I2 / SPEC §I6.7 — the parser chunk IS precached
// ---------------------------------------------------------------------------

describe('SPEC §I6.7: the parser chunk is in the precache list', () => {
  it('a globPatterns entry matches the emitted parser chunk', () => {
    const block = workboxBlock()
    const match = block.match(/globPatterns:\s*\[([^\]]*)\]/)

    expect(match, 'no globPatterns in the workbox block — nothing is precached at all').not.toBeNull()

    const patterns = [...match![1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
    expect(patterns.length, 'globPatterns is empty').toBeGreaterThan(0)

    expect(
      patterns.some((pattern) => globToRegExp(pattern).test(PARSER_CHUNK_PATH)),
      `no globPatterns entry (${patterns.join(', ')}) matches ${PARSER_CHUNK_PATH} — the import screen would need the network to parse a file, which is the one thing offline support is for`,
    ).toBe(true)
  })

  it('no globIgnores entry excludes the parser chunk again', () => {
    const block = workboxBlock()
    const match = block.match(/globIgnores:\s*\[([^\]]*)\]/)
    if (!match) return // absent is the safe state

    const ignores = [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
    for (const ignore of ignores) {
      expect(
        globToRegExp(ignore).test(PARSER_CHUNK_PATH),
        `globIgnores entry "${ignore}" excludes ${PARSER_CHUNK_PATH} — it matches globPatterns and is then dropped again, which is invisible in the config`,
      ).toBe(false)
    }
  })

  it('maximumFileSizeToCacheInBytes is set high enough for SheetJS, and is set explicitly', () => {
    const block = workboxBlock()
    const match = block.match(/maximumFileSizeToCacheInBytes:\s*([\d_*\s]+?)[,\n]/)

    expect(
      match,
      "maximumFileSizeToCacheInBytes is not set. Workbox's default is 2 MiB and the SheetJS chunk is close to it; a silently-skipped file is logged at build time and nowhere else, so this is pinned rather than left to the default",
    ).not.toBeNull()

    // The config writes this as a product of integer literals (`3 * 1024 *
    // 1024`). Multiply the factors out by hand rather than evaluating the
    // string — no code from a file ever gets executed here.
    const factors = match![1].replace(/_/g, '').trim().split('*')
    for (const factor of factors) {
      expect(
        /^\s*\d+\s*$/.test(factor),
        `maximumFileSizeToCacheInBytes is "${match![1].trim()}", which is not a product of plain integers — this test can no longer read it`,
      ).toBe(true)
    }
    const bytes = factors.reduce((total, factor) => total * Number(factor), 1)
    expect(
      bytes,
      'maximumFileSizeToCacheInBytes is below 2 MiB — large enough to start silently dropping the SheetJS chunk from the precache manifest',
    ).toBeGreaterThanOrEqual(2 * 1024 * 1024)
  })
})

// ---------------------------------------------------------------------------
// I2 / SPEC §I6.6 — no /api/* body, and no import row data, is cacheable
// ---------------------------------------------------------------------------

/**
 * ONE documented exception, and the test pins it to exactly one.
 *
 * SPEC §I6.6 is written absolutely ("caches no `/api/*` request or response
 * body"), but the shipped config has cached the public, read-only instrument
 * library since Slice 8, and `sw-cache-policy.test.ts` asserts that it still
 * does. The import screen needs that library offline to validate instrument
 * references, so dropping it would break §I6.7's own "the screen works
 * offline" goal. The two requirements are only consistent under the reading
 * that §I6.6 forbids any *new* /api caching and any route carrying household
 * data — which is what the assertion below enforces, by allowing exactly one
 * /api-matching rule and naming it.
 *
 * Flagged for Gaurav: the literal wording of §I6.6 and the existing
 * instrument-library guard cannot both be satisfied. This file takes the
 * reading that preserves the existing guard.
 */
const ALLOWED_API_CACHE_RULES = 1

describe('SPEC §I6.6: the service worker caches no /api/* body', () => {
  const API_URLS = [
    // Import feature (D-025) — the batch endpoint and everything it writes.
    'https://finance.gauravg.dev/api/holdings-batch',
    'https://finance.gauravg.dev/api/holdings',
    'https://finance.gauravg.dev/api/holdings?ledgerId=abc',
    'https://finance.gauravg.dev/api/ledgers',
    'https://finance.gauravg.dev/api/ledgers/abc/rows',
    // Everything else that carries household data or key material.
    'https://finance.gauravg.dev/api/family-members',
    'https://finance.gauravg.dev/api/protection',
    'https://finance.gauravg.dev/api/household',
    'https://finance.gauravg.dev/api/household-keys',
    'https://finance.gauravg.dev/api/dashboard',
    'https://finance.gauravg.dev/api/ai-suggestions',
    // A route that does not exist yet. If someone adds a broad /api/ rule,
    // this is the URL that catches it.
    'https://finance.gauravg.dev/api/anything-added-later',
  ]

  it('matches no /api route carrying import rows, household data, or key material', () => {
    const patterns = runtimeCachingPatterns()

    for (const url of API_URLS) {
      for (const pattern of patterns) {
        expect(
          pattern.test(url),
          `${pattern} would cache ${url} — SPEC §I6.6 forbids any /api/* request or response body entering the PWA cache, and the SW cache is not cleared by signing out`,
        ).toBe(false)
      }
    }
  })

  it('allows exactly one /api rule, the public instrument library, and no more', () => {
    const patterns = runtimeCachingPatterns()
    const apiMatching = patterns.filter((pattern) =>
      pattern.source.includes('api'),
    )

    expect(
      apiMatching.length,
      `${apiMatching.length} runtime rules reference /api. Exactly ${ALLOWED_API_CACHE_RULES} is allowed — the public, read-only instrument library. Any other /api rule is a §I6.6 violation; see the comment above this test`,
    ).toBe(ALLOWED_API_CACHE_RULES)

    expect(
      apiMatching[0].test('https://finance.gauravg.dev/api/instruments?slug=ppf'),
      'the one permitted /api rule is no longer the instrument library — whatever replaced it is caching an /api body that §I6.6 forbids',
    ).toBe(true)
  })

  it('the navigation fallback denylist is not mistaken for the caching guarantee', () => {
    const config = viteConfig()

    expect(
      /navigateFallbackDenylist:\s*\[\s*\/\^\\\/api\\\//.test(config),
      'navigateFallbackDenylist no longer excludes /api/ — this only governs SPA navigation fallback, never response caching, but losing it would start serving index.html for API navigations',
    ).toBe(true)
  })
})

describe('SPEC §I6.5/§I6.6: import-screen row data is not cached by any route rule', () => {
  it('no runtime rule matches a parsed-row or template request', () => {
    const patterns = runtimeCachingPatterns()
    const IMPORT_URLS = [
      'https://finance.gauravg.dev/api/holdings-batch',
      'https://finance.gauravg.dev/import',
      'https://finance.gauravg.dev/import/review',
      'https://finance.gauravg.dev/api/import/template',
    ]

    for (const url of IMPORT_URLS) {
      for (const pattern of patterns) {
        expect(
          pattern.test(url),
          `${pattern} would cache ${url} — parsed rows are memory-only by decision (SPEC §I6.5); a runtime cache entry would outlive the tab and survive sign-out`,
        ).toBe(false)
      }
    }
  })
})
