import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * D-025 step I14 — import telemetry.
 *
 * The three events (METRICS_PLAN.md D-016 table, feature 7 row, plus the
 * already-shipped I4 row):
 *   - `bulk_import_template_downloaded` — no properties.
 *   - `bulk_import_completed` — `rows_clean`, `rows_rejected`. Row COUNTS
 *     only, never row contents.
 *   - `pii_disclosure_shown` — already implemented and tested in
 *     `src/components/pii-disclosure-step.test.tsx` (I4). Not duplicated
 *     here; verified to still match METRICS_PLAN.md below.
 *
 * `posthog-js` is mocked directly (not `@/lib/analytics`), the same
 * discipline `import-telemetry-scrubbing.test.ts` (I13) and `analytics.test.ts`
 * use, so what is asserted is the literal payload PostHog would receive, not
 * an intermediate call this project's own wrapper could reshape.
 */

vi.mock('posthog-js', () => ({
  default: { init: vi.fn(), register: vi.fn(), capture: vi.fn() },
}))

import posthog from 'posthog-js'
import { trackImportTemplateDownloaded, buildImportTemplate, type TemplateMember } from './import-template'
import { trackImportCompleted, commitImportBatch } from './import-commit'
import { bucketImportRows, type BucketedRows, type RawImportRow } from './import-bucketing'
import type { Instrument } from './instruments-api'
import type { Holding } from './holdings-api'
import { unlockTestVault, jsonResponse } from '@/test/encrypted-fixtures'
import { expectNoCallCarriesPortfolioShape } from '@/test/analytics-guard'

// ---------------------------------------------------------------------------
// Fixtures — needle discipline matching I12/I13: values that cannot appear
// anywhere by coincidence, so their absence from a fired payload is proof,
// not luck.
// ---------------------------------------------------------------------------

const MEMBER: TemplateMember = { id: 'member-thessaly', name: 'Thessaly Winterbourne' }
const READY_NOMINEE = 'Osric Falconbridge'
const READY_NOTES = 'quartzite-lantern-55210'
const READY_INVESTED = 82736451
const READY_CURRENT = 91827364

const NEEDLES = [
  'Thessaly Winterbourne',
  'Thessaly',
  'Winterbourne',
  READY_NOMINEE,
  'Osric',
  'Falconbridge',
  READY_NOTES,
  'quartzite-lantern',
  '55210',
  String(READY_INVESTED),
  String(READY_CURRENT),
]

function findNeedles(text: string): string[] {
  return NEEDLES.filter((needle) => text.includes(needle))
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
const INSTRUMENT_SKIPPED = makeInstrument('equity-small-cap-fund', 'Small Cap Fund', 1)
const INSTRUMENTS = [INSTRUMENT_READY, INSTRUMENT_SKIPPED]

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

/** Two rows: one Ready, one left untouched (Skipped) — a mixed bucket set, so rows_clean !== rows_rejected. */
function makeBuckets(): BucketedRows {
  const rows: RawImportRow[] = [
    {
      ...blankRow(2, INSTRUMENT_READY),
      investedAmount: READY_INVESTED,
      currentValue: READY_CURRENT,
      nominee: READY_NOMINEE,
      notes: READY_NOTES,
    },
    blankRow(3, INSTRUMENT_SKIPPED),
  ]
  const existingHoldings: Holding[] = []
  return bucketImportRows({ rows, instruments: INSTRUMENTS, existingHoldings })
}

beforeEach(() => {
  vi.mocked(posthog.capture).mockClear()
})

// ---------------------------------------------------------------------------
// bulk_import_template_downloaded
// ---------------------------------------------------------------------------

describe('trackImportTemplateDownloaded', () => {
  it('fires bulk_import_template_downloaded with no properties', () => {
    trackImportTemplateDownloaded()
    expect(posthog.capture).toHaveBeenCalledTimes(1)
    expect(posthog.capture).toHaveBeenCalledWith('bulk_import_template_downloaded', {})
  })

  it('carries no member name, note, amount or any other row content', () => {
    trackImportTemplateDownloaded()
    const call = vi.mocked(posthog.capture).mock.calls[0]!
    expect(findNeedles(JSON.stringify(call))).toEqual([])
    expectNoCallCarriesPortfolioShape(vi.mocked(posthog.capture))
  })

  it('is NOT fired by buildImportTemplate itself — building a workbook is not downloading one', async () => {
    await buildImportTemplate([MEMBER], INSTRUMENTS)
    expect(posthog.capture).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// bulk_import_completed
// ---------------------------------------------------------------------------

describe('trackImportCompleted', () => {
  it('fires bulk_import_completed with rows_clean and rows_rejected counted from the buckets', () => {
    const buckets = makeBuckets()
    expect(buckets.ready).toHaveLength(1)
    expect(buckets.ready[0]!.member.name).toBe(MEMBER.name) // fixture sanity check
    trackImportCompleted(buckets)
    expect(posthog.capture).toHaveBeenCalledTimes(1)
    expect(posthog.capture).toHaveBeenCalledWith('bulk_import_completed', { rows_clean: 1, rows_rejected: 1 })
  })

  it('sums needsAttention + possibleDuplicate + skipped into rows_rejected', () => {
    const buckets: BucketedRows = {
      ready: [],
      needsAttention: [{} as never],
      possibleDuplicate: [{} as never, {} as never],
      skipped: [{} as never, {} as never, {} as never],
    }
    trackImportCompleted(buckets)
    expect(posthog.capture).toHaveBeenCalledWith('bulk_import_completed', { rows_clean: 0, rows_rejected: 6 })
  })

  it('carries no member name, nominee, note or amount — counts only', () => {
    const buckets = makeBuckets()
    trackImportCompleted(buckets)
    const call = vi.mocked(posthog.capture).mock.calls[0]!
    expect(findNeedles(JSON.stringify(call))).toEqual([])
    expectNoCallCarriesPortfolioShape(vi.mocked(posthog.capture))
  })

  it('is NOT fired by commitImportBatch itself — the I13 zero-events pin on the commit path stays true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 'ok', inserted: 1 }, 201)))
    const buckets = makeBuckets()
    await unlockTestVault('household-1')
    await commitImportBatch({
      token: 'test-token',
      ledgerId: 'ledger-1',
      readyRows: buckets.ready,
      instruments: INSTRUMENTS,
    })
    expect(posthog.capture).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

// ---------------------------------------------------------------------------
// pii_disclosure_shown — already implemented (I4). Verified here only against
// METRICS_PLAN.md's definition, not re-tested end to end (see
// pii-disclosure-step.test.tsx for that).
// ---------------------------------------------------------------------------

describe('pii_disclosure_shown (I4, already implemented)', () => {
  it('matches METRICS_PLAN.md: surface is bulk_import or privacy, no other property', async () => {
    const { track } = await import('./analytics')
    // @ts-expect-error only `surface` is permitted on this event.
    const rejectsExtra = () => track('pii_disclosure_shown', { surface: 'bulk_import', memberName: 'x' })
    expect(typeof rejectsExtra).toBe('function')
    track('pii_disclosure_shown', { surface: 'bulk_import' })
    track('pii_disclosure_shown', { surface: 'privacy' })
    expect(posthog.capture).toHaveBeenCalledWith('pii_disclosure_shown', { surface: 'bulk_import' })
    expect(posthog.capture).toHaveBeenCalledWith('pii_disclosure_shown', { surface: 'privacy' })
  })
})
