import { describe, it, expect, beforeEach, vi } from 'vitest'
import { instrumentsSeedData } from './seed/instruments-data.js'

process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_ZmFrZS5jbGVyay5hY2NvdW50cy5kZXYk'

interface InstrumentRow {
  id: string
  slug: string
  category: number
  name: string
  [key: string]: unknown
}

let rows: InstrumentRow[] = []

// Captures the projection object passed to db.select({ ... }). The fake below
// applies it the way real Drizzle would, picking exactly those keys off each
// row. Without this the "exact key set" test would pass vacuously: a fake that
// ignores the projection returns whatever the fixture happens to hold, which
// proves nothing about what the route actually publishes.
let selectedFields: Record<string, unknown> | undefined

function project(source: InstrumentRow[]): Record<string, unknown>[] {
  if (!selectedFields) return source
  const keys = Object.keys(selectedFields)
  return source.map((row) => Object.fromEntries(keys.map((k) => [k, row[k] ?? null])))
}

// Instruments are public read-only content — this fake db only needs to
// support select().from().where()/orderBy(), never insert, unlike the
// household/family-members mocks which also exercise the write path.
vi.mock('./lib/db.js', () => ({
  db: {
    select: (fields?: Record<string, unknown>) => {
      selectedFields = fields
      return {
        from: () => ({
          where: (cond: { category?: number; slug?: string }) => ({
            orderBy: () => Promise.resolve(project(applyFilter(cond))),
            limit: () => Promise.resolve(project(applyFilter(cond)).slice(0, 1)),
          }),
          orderBy: () => Promise.resolve(project([...rows].sort((a, b) => a.category - b.category))),
        }),
      }
    },
  },
}))

let filterValue: { field: 'category' | 'slug'; value: number | string } | undefined
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    eq: (col: { name?: string }, value: number | string) => {
      filterValue = { field: col?.name === 'slug' ? 'slug' : 'category', value }
      return { __filter: { field: filterValue.field, value } }
    },
    asc: (col: unknown) => col,
  }
})

function applyFilter(_cond: unknown): InstrumentRow[] {
  if (!filterValue) return rows
  if (filterValue.field === 'category') return rows.filter((r) => r.category === filterValue!.value)
  return rows.filter((r) => r.slug === filterValue!.value)
}

const { app } = await import('./app.js')

describe('instruments routes — public read', () => {
  beforeEach(() => {
    filterValue = undefined
    selectedFields = undefined
    rows = instrumentsSeedData.map((seed, i) => ({
      ...seed,
      id: `id-${i + 1}`,
      createdAt: '2026-01-01T00:00:00.000Z',
      // Stands in for a column someone adds to `instruments` later without
      // meaning to publish it (an editorial draft note, an internal flag).
      // The route must not return it. This row field is what gives the
      // key-set test below something real to catch.
      internalDraftNote: 'not for public consumption',
    }))
  })

  it('requires no Authorization header', async () => {
    const res = await app.request('/api/instruments')
    expect(res.status).toBe(200)
  })

  it('lists all 30 seeded instruments', async () => {
    const res = await app.request('/api/instruments')
    const body = (await res.json()) as { instruments: InstrumentRow[] }
    expect(body.instruments).toHaveLength(30)
  })

  it('filters by category', async () => {
    const res = await app.request('/api/instruments?category=1')
    const body = (await res.json()) as { instruments: InstrumentRow[] }
    expect(body.instruments).toHaveLength(5)
    expect(body.instruments.every((i) => i.category === 1)).toBe(true)
  })

  it('rejects an out-of-range category with 400', async () => {
    const res = await app.request('/api/instruments?category=7')
    expect(res.status).toBe(400)
  })

  it('rejects a non-numeric category with 400', async () => {
    const res = await app.request('/api/instruments?category=equity')
    expect(res.status).toBe(400)
  })

  it('fetches a single instrument by slug via query param', async () => {
    const res = await app.request('/api/instruments?slug=equity-direct-stocks')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { instrument: InstrumentRow }
    expect(body.instrument.slug).toBe('equity-direct-stocks')
  })

  it('returns 404 for an unknown slug', async () => {
    const res = await app.request('/api/instruments?slug=does-not-exist')
    expect(res.status).toBe(404)
  })

  describe('rate-assumption catalog fields (E1/E2, D-024 projection engine)', () => {
    // Named assumedRateAsOf, not rateAsOf as SPEC.md originally drafted:
    // instruments.rate_as_of was already taken by the unrelated library
    // display field, which keeps its name and meaning here.
    const NEW_FIELDS = ['assumedAnnualRatePct', 'rateSource', 'assumedRateAsOf'] as const

    it('carries the three rate-assumption fields on every instrument', async () => {
      const res = await app.request('/api/instruments')
      const body = (await res.json()) as { instruments: Record<string, unknown>[] }
      for (const item of body.instruments) {
        for (const field of NEW_FIELDS) {
          expect(Object.keys(item), `${String(item.slug)} is missing ${field}`).toContain(field)
        }
      }
    })

    it('returns the seeded rate, source and as-of date for an instrument that has one', async () => {
      const seeded = instrumentsSeedData.find((s) => s.assumedAnnualRatePct !== null)
      expect(seeded, 'seed must contain at least one rated instrument').toBeDefined()

      const res = await app.request(`/api/instruments?slug=${seeded!.slug}`)
      const body = (await res.json()) as { instrument: Record<string, unknown> }
      // Read from the seed rather than hardcoding: these are published rates
      // that change quarterly, and a hardcoded copy here would rot silently.
      expect(body.instrument.assumedAnnualRatePct).toBe(seeded!.assumedAnnualRatePct)
      expect(body.instrument.rateSource).toBe(seeded!.rateSource)
      expect(body.instrument.assumedRateAsOf).toBe(seeded!.assumedRateAsOf)
    })

    it('returns null on all three for an instrument with no published rate', async () => {
      const unrated = instrumentsSeedData.find((s) => s.assumedAnnualRatePct === null)
      expect(unrated).toBeDefined()

      const res = await app.request(`/api/instruments?slug=${unrated!.slug}`)
      const body = (await res.json()) as { instrument: Record<string, unknown> }
      for (const field of NEW_FIELDS) {
        expect(body.instrument[field], `${unrated!.slug}.${field}`).toBeNull()
      }
    })

    // Leak-by-default pin, not a style preference. listInstruments used to do
    // a bare db.select().from(instruments) and the route returned the row
    // straight through as JSON, which meant every column added to the table
    // became public the moment it existed, with nobody deciding to publish it.
    // The response shape is now an explicit projection, and this test fails if
    // it ever goes back to being an accident of the schema. The fixture rows
    // carry an extra `internalDraftNote` field precisely so this can catch it.
    it('publishes exactly the documented key set and no other column', async () => {
      const expected = [
        'id',
        'slug',
        'category',
        'name',
        'summary',
        'returns',
        'tax',
        'liquidity',
        'risk',
        'eligibility',
        'minInvestment',
        'rateValue',
        'rateAsOf',
        'assumedAnnualRatePct',
        'rateSource',
        'assumedRateAsOf',
        'createdAt',
      ].sort()

      const listRes = await app.request('/api/instruments')
      const listBody = (await listRes.json()) as { instruments: Record<string, unknown>[] }
      for (const item of listBody.instruments) {
        expect(Object.keys(item).sort(), String(item.slug)).toEqual(expected)
      }

      const oneRes = await app.request('/api/instruments?slug=debt-ppf')
      const oneBody = (await oneRes.json()) as { instrument: Record<string, unknown> }
      expect(Object.keys(oneBody.instrument).sort()).toEqual(expected)
    })
  })
})
