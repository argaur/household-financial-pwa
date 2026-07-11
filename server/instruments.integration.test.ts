import { describe, it, expect, beforeEach, vi } from 'vitest'
import { instrumentsSeedData } from './seed/instruments-data.js'

process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_ZmFrZS5jbGVyay5hY2NvdW50cy5kZXYk'

interface InstrumentRow {
  id: string
  slug: string
  category: number
  name: string
}

let rows: InstrumentRow[] = []

// Instruments are public read-only content — this fake db only needs to
// support select().from().where()/orderBy(), never insert, unlike the
// household/family-members mocks which also exercise the write path.
vi.mock('./lib/db.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (cond: { category?: number; slug?: string }) => ({
          orderBy: () => Promise.resolve(applyFilter(cond)),
          limit: () => Promise.resolve(applyFilter(cond).slice(0, 1)),
        }),
        orderBy: () => Promise.resolve([...rows].sort((a, b) => a.category - b.category)),
      }),
    }),
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
    rows = instrumentsSeedData.map((seed, i) => ({
      id: `id-${i + 1}`,
      slug: seed.slug,
      category: seed.category,
      name: seed.name,
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

  it('fetches a single instrument by slug', async () => {
    const res = await app.request('/api/instruments/equity-direct-stocks')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { instrument: InstrumentRow }
    expect(body.instrument.slug).toBe('equity-direct-stocks')
  })

  it('returns 404 for an unknown slug', async () => {
    const res = await app.request('/api/instruments/does-not-exist')
    expect(res.status).toBe(404)
  })
})
