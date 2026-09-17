/**
 * D-025 step I13 — Sentry and PostHog scrubbing audit.
 *
 * D-025's hard-requirements list: "Sentry breadcrumbs, session replay, and
 * console output must be audited and scrubbed of row data."
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE IS, AND WHAT IT IS NOT
 *
 * This step is an audit of *default-on* instrumentation, not a feature. Three
 * of the four surfaces below are settled by reading configuration, not by
 * observing behaviour, and saying otherwise would be dishonest. Each block
 * therefore declares which it is:
 *
 *   BEHAVIOUR — the flow is driven and the surface is observed. A planted leak
 *               makes it fail. The console block and the DOM-breadcrumb block
 *               are of this kind, and each carries its own planted-leak
 *               self-test so a green result cannot be the instrument looking
 *               at nothing (same discipline as `import-no-persistence.test.ts`).
 *
 *   CONFIG    — the answer comes from what is passed to `Sentry.init` /
 *               `posthog.init` and from the vendor's own defaults. These tests
 *               pin the literal options object, in the style of
 *               `csp-policy.test.ts` and `sw-cache-policy.test.ts`, so the
 *               configuration cannot drift without a deliberate edit here.
 *
 * ---------------------------------------------------------------------------
 * THE FINDING, RECORDED RATHER THAN FIXED
 *
 * `src/lib/posthog.ts` does not pass `autocapture`, and posthog-js defaults it
 * to `true` (`node_modules/posthog-js/dist/module.js`, defaults blob:
 * `token:"",autocapture:!0,`). Autocapture sends an `$autocapture` event for
 * every click on an `a`/`button`/`form`/`input`/`select`/`textarea`/`label`,
 * carrying the clicked element's own `text` and all of its attributes.
 *
 * The import review screen's primary CTA reads
 * `Add ${readyCount} holding(s) to ${ledgerName}` — a holding count and a
 * user-chosen ledger name, i.e. exactly the two facts `EventMap`'s
 * `ledger_created` / `ledger_edited` / `compare_strip_viewed` are typed as
 * `Record<string, never>` to keep out of PostHog.
 *
 * This is not hypothetical: the Web Fleet project (486719) has ingested 611
 * `$autocapture` events tagged `project = 'financial-planning'` in the last 90
 * days, with `$el_text` values recorded.
 *
 * No production change is made here. The tests below record the current
 * configuration exactly; closing the leak (adding `autocapture: false`) will
 * make `pins the exact options object handed to posthog.init` fail, which is
 * the point — the fix must be a deliberate edit to this file too.
 * ---------------------------------------------------------------------------
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { createElement } from 'react'
// Sentry's own DOM serialiser, the exact function `breadcrumbsIntegration`
// calls to build a `ui.click` breadcrumb target
// (`@sentry/browser/.../integrations/breadcrumbs.js` -> `htmlTreeAsString`).
// `@sentry/core` is a transitive dependency of the declared `@sentry/react`,
// not a new one; using the real serialiser is the whole point, since a
// hand-rolled imitation would prove nothing about what Sentry sends.
import { htmlTreeAsString } from '@sentry/core'

import { bucketImportRows, type BucketedRows, type RawImportRow } from './import-bucketing'
import { parseAmountCell, parseDateCell } from './import-parser'
import { buildRejectsWorkbook, buildRejectsFilename } from './import-rejects'
import { commitImportBatch } from './import-commit'
import { ImportReviewScreen } from '@/components/import-review-screen'
import type { Instrument } from './instruments-api'
import type { Holding } from './holdings-api'
import type { TemplateMember } from './import-template'
import { unlockTestVault, jsonResponse } from '@/test/encrypted-fixtures'
import { expectNoCallCarriesPortfolioShape } from '@/test/analytics-guard'

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
}))

vi.mock('posthog-js', () => ({
  default: { init: vi.fn(), register: vi.fn(), capture: vi.fn() },
}))

import * as Sentry from '@sentry/react'
import posthog from 'posthog-js'
import { initSentry } from './sentry'
import { initPostHog } from './posthog'

// ---------------------------------------------------------------------------
// Fixtures — same needle discipline as import-no-persistence.test.ts: values
// that cannot appear anywhere by coincidence.
// ---------------------------------------------------------------------------

const MEMBER: TemplateMember = { id: 'member-zephyrina', name: 'Zephyrina Quillsworth' }
const LEDGER_NAME = 'Quixotry Reserve'

const READY_INVESTED_TEXT = '7,46,31,829'
const READY_INVESTED_NUMBER = '74631829'
const READY_CURRENT = 93847162
const READY_UNITS = 58392617
const READY_SIP = 4172639
const READY_START_DATE = '2031-07-19'
const READY_NOMINEE = 'Thaddeus Mooncastle'
const READY_NOTES = 'blueprint-okapi-verandah-17714'

const ATTENTION_SHORTHAND = '9.37L'
const ATTENTION_NOTES = 'granular-zither-88231'

const DUPLICATE_INVESTED = 61728394
const DUPLICATE_NOMINEE = 'Persimmon Underhay'

/** Every string a telemetry payload would have to contain for this to be a leak. */
const NEEDLES: readonly string[] = [
  'Zephyrina Quillsworth',
  'Zephyrina',
  'Quillsworth',
  READY_NOMINEE,
  'Thaddeus',
  'Mooncastle',
  DUPLICATE_NOMINEE,
  'Persimmon',
  'Underhay',
  READY_NOTES,
  'okapi-verandah',
  '17714',
  ATTENTION_NOTES,
  'zither',
  '88231',
  READY_INVESTED_TEXT,
  READY_INVESTED_NUMBER,
  String(READY_CURRENT),
  String(READY_UNITS),
  String(READY_SIP),
  String(DUPLICATE_INVESTED),
  ATTENTION_SHORTHAND,
  READY_START_DATE,
]

/**
 * The ledger name is deliberately NOT in `NEEDLES` above: the review screen's
 * CTA renders it on purpose, and so does the rejects filename. It is tracked
 * separately because whether it may reach *telemetry* is a different question
 * from whether it may reach the screen.
 */
const LEDGER_NEEDLES: readonly string[] = ['Quixotry Reserve', 'Quixotry']

function findNeedles(text: string, needles: readonly string[] = NEEDLES): string[] {
  return needles.filter((needle) => text.includes(needle))
}

function makeInstrument(slug: string, name: string, category: number): Instrument {
  return {
    id: slug,
    slug,
    name,
    category,
    summary: '',
    returns: '',
    tax: '',
    liquidity: '',
    risk: '',
    eligibility: '',
    minInvestment: '',
    rateValue: null,
    rateAsOf: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

const INSTRUMENT_READY = makeInstrument('equity-nifty-50-index-fund', 'Nifty 50 Index Fund', 1)
const INSTRUMENT_ATTENTION = makeInstrument('equity-flexi-cap-fund', 'Flexi Cap Fund', 1)
const INSTRUMENT_DUPLICATE = makeInstrument('equity-mid-cap-fund', 'Mid Cap Fund', 1)
const INSTRUMENT_SKIPPED = makeInstrument('equity-small-cap-fund', 'Small Cap Fund', 1)
const INSTRUMENTS = [INSTRUMENT_READY, INSTRUMENT_ATTENTION, INSTRUMENT_DUPLICATE, INSTRUMENT_SKIPPED]

function blankRow(rowNumber: number, instrument: Instrument): RawImportRow {
  return {
    member: MEMBER,
    rowNumber,
    slug: instrument.slug,
    instrumentName: instrument.name,
    investedAmount: null,
    currentValue: null,
    units: null,
    monthlySip: null,
    startDate: null,
    maturityDate: null,
    nominee: null,
    emergencyFund: false,
    notes: null,
  }
}

function rawRows(): RawImportRow[] {
  return [
    {
      ...blankRow(2, INSTRUMENT_READY),
      investedAmount: READY_INVESTED_TEXT,
      currentValue: READY_CURRENT,
      units: READY_UNITS,
      monthlySip: READY_SIP,
      startDate: READY_START_DATE,
      nominee: READY_NOMINEE,
      notes: READY_NOTES,
    },
    {
      ...blankRow(3, INSTRUMENT_ATTENTION),
      investedAmount: ATTENTION_SHORTHAND,
      currentValue: 12345678,
      notes: ATTENTION_NOTES,
    },
    {
      ...blankRow(4, INSTRUMENT_DUPLICATE),
      investedAmount: DUPLICATE_INVESTED,
      currentValue: DUPLICATE_INVESTED,
      nominee: DUPLICATE_NOMINEE,
    },
    blankRow(5, INSTRUMENT_SKIPPED),
  ]
}

const EXISTING_HOLDINGS: Holding[] = [
  {
    id: 'holding-existing',
    householdId: 'household-1',
    memberId: MEMBER.id,
    instrumentId: INSTRUMENT_DUPLICATE.id,
    assetClass: 'equity',
    investedAmount: '1',
    currentValue: '1',
    units: null,
    monthlySip: null,
    startDate: null,
    maturityDate: null,
    nominee: null,
    isEmergencyFund: false,
    notes: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

// ---------------------------------------------------------------------------
// The flow under test — parse (I5), bucket (I7), render and drive the review
// screen (I8), build the rejects workbook (I9), seal and commit (I11).
// ---------------------------------------------------------------------------

async function runFullImportFlow(): Promise<{ buckets: BucketedRows; wireUrl: string; wireBody: string }> {
  const rows = rawRows()

  // I5 — the cell parsers, including both rejection paths, since a rejection is
  // the most likely place a value would be echoed into a message or a log.
  parseAmountCell(READY_INVESTED_TEXT, 'Amount invested')
  parseAmountCell(ATTENTION_SHORTHAND, 'Amount invested')
  parseDateCell(READY_START_DATE, 'Start date')
  parseDateCell(READY_NOTES, 'Start date')

  const buckets = bucketImportRows({ rows, instruments: INSTRUMENTS, existingHoldings: EXISTING_HOLDINGS })

  let committed: BucketedRows['ready'] = []
  render(
    createElement(ImportReviewScreen, {
      buckets,
      ledgerName: LEDGER_NAME,
      onCommit: (readyRows) => {
        committed = readyRows
      },
      onLeave: () => {},
      onDownloadRejects: () => {},
    }),
  )
  for (const summary of Array.from(document.querySelectorAll('summary'))) {
    fireEvent.click(summary)
  }
  fireEvent.click(screen.getByRole('button', { name: /Download rejects/ }))
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`Add 1 holding to ${LEDGER_NAME}`) }))
  expect(committed).toHaveLength(1)

  await buildRejectsWorkbook(rows, buckets)
  buildRejectsFilename(LEDGER_NAME, new Date('2026-09-11T10:00:00Z'))

  const vault = await unlockTestVault('household-1')
  expect(vault.householdId).toBe('household-1')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 'ok', inserted: 1 }, 201)))
  const result = await commitImportBatch({
    token: 'test-token',
    ledgerId: 'ledger-1',
    readyRows: committed,
    instruments: INSTRUMENTS,
  })
  expect(result.inserted).toBe(1)

  const call = vi.mocked(fetch).mock.calls[0] as unknown as [unknown, RequestInit | undefined]
  return { buckets, wireUrl: String(call[0]), wireBody: String(call[1]?.body) }
}

// ---------------------------------------------------------------------------
// 1. Sentry — CONFIG
// ---------------------------------------------------------------------------

describe('Sentry init options (CONFIG: read from what initSentry passes, not observed)', () => {
  beforeEach(() => {
    vi.mocked(Sentry.init).mockClear()
    vi.stubEnv('VITE_SENTRY_DSN', 'https://examplePublicKey@o0.ingest.sentry.io/0')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  /**
   * The literal pin. Every telemetry-relevant Sentry option is either in this
   * object or absent from it, and "absent" is the load-bearing half: there is
   * no `beforeSend`, no `beforeBreadcrumb`, no `denyUrls`, no `sendDefaultPii`,
   * and no replay. Adding any of them must break this test.
   */
  it('pins the exact options object handed to Sentry.init', () => {
    initSentry()

    expect(Sentry.init).toHaveBeenCalledTimes(1)
    const options = vi.mocked(Sentry.init).mock.calls[0]![0] as Record<string, unknown>

    expect(Object.keys(options).sort()).toEqual(
      ['dsn', 'environment', 'integrations', 'release', 'tracesSampleRate'].sort(),
    )
    expect(options.tracesSampleRate).toBe(0.1)
    expect(options.integrations).toHaveLength(1)
    expect((options.integrations as Array<{ name: string }>)[0]!.name).toBe('BrowserTracing')
  })

  /**
   * Session replay, the second of D-025's three named surfaces. It is off
   * because nothing turns it on: `replayIntegration()` is never constructed and
   * neither sample rate is set. That matters specifically here because Sentry's
   * replay masks INPUTS by default but not TEXT, and the review screen renders
   * member names and rupee amounts as ordinary text nodes, not inputs.
   */
  it('enables no session replay, so the review screen is never recorded', () => {
    initSentry()
    const options = vi.mocked(Sentry.init).mock.calls[0]![0] as Record<string, unknown>

    expect(options).not.toHaveProperty('replaysSessionSampleRate')
    expect(options).not.toHaveProperty('replaysOnErrorSampleRate')
    const names = (options.integrations as Array<{ name: string }>).map((i) => i.name)
    expect(names.some((name) => /replay/i.test(name))).toBe(false)
  })

  it('does not opt in to sendDefaultPii', () => {
    initSentry()
    const options = vi.mocked(Sentry.init).mock.calls[0]![0] as Record<string, unknown>
    expect(options.sendDefaultPii).toBeUndefined()
  })

  it('initialises nothing at all when no DSN is configured', () => {
    vi.stubEnv('VITE_SENTRY_DSN', '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    initSentry()
    expect(Sentry.init).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// 2. Sentry DOM breadcrumbs — BEHAVIOUR
// ---------------------------------------------------------------------------

/**
 * `breadcrumbsIntegration` defaults to `{ console: true, dom: true, fetch: true,
 * history: true, sentry: true, xhr: true }` and nothing here overrides it, so
 * DOM breadcrumbs are on. The question D-025 actually asks is what a `ui.click`
 * breadcrumb from this screen would CONTAIN, and that is decided by
 * `htmlTreeAsString`, which is called below on the real rendered DOM.
 *
 * Its rule (`@sentry/core/.../utils-hoist/browser.js`): tag name, `#id`,
 * `.class` for every class, then only these attributes —
 * `['aria-label', 'type', 'name', 'title', 'alt']`. Text content is never read.
 * So the answer is "no", but it is one `title={row.member.name}` tooltip away
 * from "yes", which is why this is a test and not a note.
 */
describe('Sentry DOM breadcrumbs (BEHAVIOUR: real serialiser, real rendered DOM)', () => {
  afterEach(cleanup)

  function renderReviewScreen() {
    const buckets = bucketImportRows({
      rows: rawRows(),
      instruments: INSTRUMENTS,
      existingHoldings: EXISTING_HOLDINGS,
    })
    render(
      createElement(ImportReviewScreen, {
        buckets,
        ledgerName: LEDGER_NAME,
        onCommit: () => {},
        onLeave: () => {},
        onDownloadRejects: () => {},
      }),
    )
    for (const summary of Array.from(document.querySelectorAll('summary'))) {
      fireEvent.click(summary)
    }
  }

  /** Every element Sentry could ever be handed as a click target on this screen. */
  function serialiseEveryElement(): string {
    return Array.from(document.body.querySelectorAll('*'))
      .map((element) => htmlTreeAsString(element))
      .join(' ')
  }

  it('renders the row values it is supposed to render, so the fixture is real', () => {
    renderReviewScreen()
    expect(document.body.textContent).toContain('Zephyrina Quillsworth')
    expect(document.body.textContent).toContain('7,46,31,829')
  })

  it('serialises no row value into any possible ui.click breadcrumb target', () => {
    renderReviewScreen()
    expect(findNeedles(serialiseEveryElement())).toEqual([])
  })

  it('does not leak the ledger name into a breadcrumb target either', () => {
    renderReviewScreen()
    expect(findNeedles(serialiseEveryElement(), LEDGER_NEEDLES)).toEqual([])
  })

  /**
   * The self-test. A green result above is only worth anything if this
   * serialiser would actually have caught a leak, so one is planted on each of
   * the five attributes Sentry reads, one at a time.
   */
  it.each(['aria-label', 'title', 'alt', 'name', 'type'])(
    'catches a member name planted on the `%s` attribute of a review row',
    (attribute) => {
      renderReviewScreen()
      const row = document.querySelector('[data-testid="import-review-row"]')!
      row.setAttribute(attribute, MEMBER.name)
      expect(findNeedles(serialiseEveryElement())).toContain('Zephyrina Quillsworth')
    },
  )

  it('catches an amount planted in a className, which Sentry serialises in full', () => {
    renderReviewScreen()
    const row = document.querySelector('[data-testid="import-review-row"]')!
    row.classList.add(`amount-${READY_INVESTED_NUMBER}`)
    expect(findNeedles(serialiseEveryElement())).toContain(READY_INVESTED_NUMBER)
  })
})

// ---------------------------------------------------------------------------
// 3. Console — BEHAVIOUR
// ---------------------------------------------------------------------------

/**
 * The third of D-025's named surfaces, and the one with real teeth: Sentry's
 * console breadcrumb handler copies the arguments verbatim —
 * `data: { arguments: handlerData.args }` plus a joined `message`
 * (`@sentry/browser/.../integrations/breadcrumbs.js`) — so a single
 * `console.log(row)` anywhere in the import flow ships the whole row to Sentry
 * on the next error, with no scrubber in the way (there is no `beforeBreadcrumb`;
 * see the CONFIG block above).
 *
 * This is therefore held by discipline, not by structure, which is exactly the
 * kind of guarantee that needs a test watching it.
 */
describe('Console output during the import flow (BEHAVIOUR: every console method spied)', () => {
  const METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'table', 'dir', 'group'] as const
  let spies: Array<ReturnType<typeof vi.spyOn>>

  beforeEach(() => {
    spies = METHODS.filter((method) => typeof console[method] === 'function').map((method) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(console, method as any).mockImplementation(() => {}),
    )
  })

  afterEach(() => {
    for (const spy of spies) spy.mockRestore()
    cleanup()
    vi.unstubAllGlobals()
  })

  function consoleText(): string {
    return spies
      .flatMap((spy) => spy.mock.calls)
      .map((args) => args.map((arg: unknown) => (typeof arg === 'string' ? arg : safeStringify(arg))).join(' '))
      .join(' ')
  }

  function safeStringify(value: unknown): string {
    try {
      return JSON.stringify(value, (_key, entry) => (entry instanceof Error ? entry.message : entry)) ?? String(value)
    } catch {
      return String(value)
    }
  }

  it('writes no row value to any console method across parse, review, rejects and commit', async () => {
    await runFullImportFlow()
    expect(findNeedles(consoleText())).toEqual([])
  })

  it('writes nothing to the console at all', async () => {
    await runFullImportFlow()
    const calls = spies.flatMap((spy) => spy.mock.calls)
    expect(calls).toEqual([])
  })

  /** Self-test: the spy set does catch a planted log, on every method it watches. */
  it.each(['log', 'warn', 'error', 'debug'] as const)('catches a row planted on console.%s', (method) => {
    console[method]('import row', { member: MEMBER.name, invested: READY_INVESTED_NUMBER })
    expect(findNeedles(consoleText())).toContain('Zephyrina Quillsworth')
  })
})

// ---------------------------------------------------------------------------
// 4. Sentry fetch / XHR breadcrumbs — BEHAVIOUR for the URL, CONFIG for the body
// ---------------------------------------------------------------------------

describe('Sentry fetch breadcrumbs for POST /api/holdings-batch', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  /**
   * BEHAVIOUR. A fetch breadcrumb's `data` is `{ ...fetchData, status_code }`,
   * and `fetchData` is `{ method, url }` — the request body reaches only the
   * `hint`, which is handed to `beforeBreadcrumb` and never serialised into the
   * event sent to Sentry. So the URL is the part that actually travels, and it
   * is the part asserted here.
   */
  it('sends a request URL carrying no row value and no ledger name', async () => {
    const { wireUrl } = await runFullImportFlow()
    expect(wireUrl).toContain('/api/holdings-batch')
    expect(findNeedles(wireUrl)).toEqual([])
    expect(findNeedles(wireUrl, LEDGER_NEEDLES)).toEqual([])
  })

  /**
   * And the body is ciphertext regardless, so even a future `beforeBreadcrumb`
   * that started attaching `hint.input` would have nothing to leak. I12 owns
   * this claim; it is restated here because it is what makes the fetch surface
   * safe by construction rather than by Sentry's choice of what to serialise.
   */
  it('would have nothing to leak even if the body were captured, because it is sealed', async () => {
    const { wireBody } = await runFullImportFlow()
    expect(findNeedles(wireBody)).toEqual([])
    expect(wireBody).toContain('ciphertext')
  })
})

// ---------------------------------------------------------------------------
// 5. PostHog — CONFIG for the init options, BEHAVIOUR for what the flow fires
// ---------------------------------------------------------------------------

describe('PostHog init options (CONFIG: read from what initPostHog passes)', () => {
  beforeEach(() => {
    vi.mocked(posthog.init).mockClear()
    vi.mocked(posthog.register).mockClear()
  })

  /**
   * THE I13 FINDING LIVES IN THIS ASSERTION.
   *
   * `autocapture` is not in this list, and posthog-js defaults it to `true`.
   * So `$autocapture` events fire for every button click in the app, carrying
   * the clicked element's own `text` — which for the import review screen's
   * primary CTA is `Add <n> holdings to <ledger name>`.
   *
   * Also absent, and also defaults-on at the vendor: `disable_session_recording`
   * (replay is gated by a PostHog *project* setting, currently off for the
   * shared "Web Fleet" project — a setting this repo does not control), and
   * `mask_all_element_attributes` (autocapture records every attribute of the
   * clicked element as `attr__*`).
   *
   * When the leak is closed, this test fails and must be updated deliberately.
   * That is the intended behaviour of a pin, not a defect in it.
   */
  it('pins the exact options object handed to posthog.init', () => {
    initPostHog()

    expect(posthog.init).toHaveBeenCalledTimes(1)
    const options = vi.mocked(posthog.init).mock.calls[0]![1] as Record<string, unknown>

    expect(Object.keys(options).sort()).toEqual(
      ['api_host', 'autocapture', 'capture_pageview', 'disable_session_recording', 'person_profiles'].sort(),
    )
    expect(options.capture_pageview).toBe(false)
    expect(options.person_profiles).toBe('identified_only')

    /**
     * I-leak-1, CLOSED 2026-09-11. This assertion is the regression guard:
     * posthog-js defaults `autocapture` to `true`, so DELETING the line in
     * `posthog.ts` silently reopens the leak rather than causing any visible
     * failure elsewhere. This test is the only thing that would notice.
     */
    expect(options.autocapture).toBe(false)

    /**
     * I-leak-2, CLOSED 2026-09-11. posthog-js defaults this to `false` (i.e.
     * recording NOT disabled), so deleting the line in `posthog.ts` opts this
     * app back in silently, exactly like the autocapture line above. No replay
     * was ever captured, but only because the SHARED Web Fleet project has
     * replay off at the project level -- a setting outside this repository,
     * covering every app pointed at it. Setting it here removes that
     * dependency in the safe direction.
     */
    expect(options.disable_session_recording).toBe(true)

    /**
     * STILL UNSET, stated as a finding rather than an approval. It governs what
     * autocapture records, so it matters much less now that autocapture is off.
     * Left visible rather than quietly dropped from this assertion.
     */
    expect(options.mask_all_element_attributes).toBeUndefined()
  })

  it('registers only the fleet project tag as a super property', () => {
    initPostHog()
    expect(posthog.register).toHaveBeenCalledTimes(1)
    expect(vi.mocked(posthog.register).mock.calls[0]![0]).toEqual({ project: 'financial-planning' })
  })
})

describe('PostHog events fired by the import flow (BEHAVIOUR)', () => {
  beforeEach(() => {
    vi.mocked(posthog.capture).mockClear()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('fires no analytics event at all during parse, review, rejects and commit', async () => {
    await runFullImportFlow()
    expect(vi.mocked(posthog.capture).mock.calls).toEqual([])
  })

  it('carries no portfolio shape on anything it does fire', async () => {
    await runFullImportFlow()
    expectNoCallCarriesPortfolioShape(vi.mocked(posthog.capture))
  })
})

describe('What the typed EventMap does and does not permit (CONFIG: type-level)', () => {
  /**
   * The registry is tight where it was written tight. These two lines compile
   * only because the excess-property check rejects them, which is the proof
   * that a row value cannot be bolted onto a typed event.
   */
  it('rejects an extra property on a closed event', async () => {
    const { track } = await import('./analytics')
    // @ts-expect-error `pii_disclosure_shown` accepts `surface` and nothing else.
    const shown = () => track('pii_disclosure_shown', { surface: 'bulk_import', memberName: MEMBER.name })
    // @ts-expect-error `ledger_edited` is `Record<string, never>`: no properties at all.
    const edited = () => track('ledger_edited', { rows: 11, ledgerName: LEDGER_NAME })
    expect(typeof shown).toBe('function')
    expect(typeof edited).toBe('function')
  })

  /**
   * TWO TYPE-LEVEL HOLES, recorded rather than closed — both predate D-025 and
   * both are app-wide, not import-specific:
   *
   *   `feature_used` is `{ feature_name: string; [key: string]: unknown }`. The
   *   index signature means it accepts ANY property, including a member name or
   *   an amount. It is the one event in the registry that the excess-property
   *   check cannot police.
   *
   *   `error_shown.message` is a free-form `string`. Several call sites pass a
   *   caught error's message straight into it (`holding-form.tsx`,
   *   `member-form.tsx`, `OnboardingStep2.tsx`), so any future error text that
   *   quotes a cell value would travel. `import-validation-messages.ts` is
   *   already built so it cannot produce such a string — it has no parameter for
   *   the cell value — and `ImportCommitError` carries enum-like codes, so the
   *   import flow does not currently feed this hole.
   *
   * This test exists to make both facts fail loudly if the shapes change.
   */
  it('still has the two open-ended event shapes this audit found', async () => {
    const { track } = await import('./analytics')
    const leaky = () =>
      track('feature_used', { feature_name: 'bulk_import', member_name: MEMBER.name, invested: READY_CURRENT })
    const freeText = () => track('error_shown', { error_type: 'x', surface: 'y', message: 'any string at all' })
    expect(typeof leaky).toBe('function')
    expect(typeof freeText).toBe('function')
  })
})
