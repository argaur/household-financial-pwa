import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { track } from '@/lib/analytics'
import { getSectionByUrlSlug } from '@/lib/library-sections'
import { getInstrument, type Instrument } from '@/lib/instruments-api'
import { ASSET_DOT_CLASS } from '@/lib/asset-classes'
import { cn } from '@/lib/utils'

type State = 'loading' | 'loaded' | 'error'

type FieldRow = { key: keyof Instrument; label: string }

// Split from one flat 6-field grid into two tiers (2026-08-12 rework): the
// three questions a first-time investor actually asks up front, the
// remaining detail below a divider as the fine print. Mirrors the
// "headline numbers, then footnotes" shape of a printed CFP one-pager, and
// the two-tier pattern already established on /why (Product judgment /
// Engineering).
const HEADLINE_FIELDS: FieldRow[] = [
  { key: 'returns', label: 'Typical returns' },
  { key: 'risk', label: 'Risk level' },
  { key: 'minInvestment', label: 'Minimum investment' },
]

const FINE_PRINT_FIELDS: FieldRow[] = [
  { key: 'tax', label: 'Tax treatment' },
  { key: 'liquidity', label: 'Liquidity (how fast you can get your money back)' },
  { key: 'eligibility', label: 'Who can invest' },
]

// Copy: Documentation/design/COPY_DECK.md — "Instrument detail page".
// Layout: Documentation/design/WIREFRAMES.md — 3c. Instrument Detail Page.
export function InstrumentDetail() {
  const { sectionSlug, instrumentSlug } = useParams<{ sectionSlug: string; instrumentSlug: string }>()
  const section = sectionSlug ? getSectionByUrlSlug(sectionSlug) : undefined
  const [state, setState] = useState<State>('loading')
  const [instrument, setInstrument] = useState<Instrument | null>(null)
  const viewedFired = useRef(false)

  useEffect(() => {
    if (!instrumentSlug) return
    let cancelled = false
    setState('loading')
    ;(async () => {
      try {
        const result = await getInstrument(instrumentSlug)
        if (cancelled) return
        setInstrument(result)
        setState('loaded')
      } catch {
        if (cancelled) return
        setState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [instrumentSlug])

  useEffect(() => {
    if (instrument && !viewedFired.current) {
      viewedFired.current = true
      track('instrument_viewed', { section: section?.urlSlug ?? '', instrument_slug: instrument.slug })
    }
  }, [instrument, section])

  if (!section || !instrumentSlug) return <Navigate to="/explore" replace />

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg md:max-w-2xl lg:max-w-3xl py-12 md:py-16 space-y-6">
        <Link
          to={`/explore/${section.urlSlug}`}
          className="inline-flex min-h-11 items-center text-caption text-muted-foreground hover:underline"
        >
          ← {section.title}
        </Link>

        {state === 'loading' && (
          <div className="space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {state === 'error' && (
          <p className="text-caption text-destructive">We couldn't load this instrument. Refresh to try again.</p>
        )}

        {state === 'loaded' && instrument && (
          <>
            <header className="space-y-2">
              <p className="section-label flex items-center gap-2">
                <span
                  className={cn('h-2 w-2 shrink-0 rounded-full', ASSET_DOT_CLASS[section.assetClass])}
                  aria-hidden="true"
                />
                {section.title.toUpperCase()}
              </p>
              <h1 className="font-display text-display">{instrument.name}</h1>
              <p className="text-body-lg text-muted-foreground">{instrument.summary}</p>
            </header>

            <Separator />

            {/* Tier 1: the three questions a first-time investor actually
                asks up front, plus the current rate when there is one — the
                headline numbers. Two facing columns at ≥768px, the CFP
                one-pager's fact table, not a long single scroll. */}
            <div className="space-y-4">
              <p className="section-label">Should you care?</p>
              <dl className="grid gap-y-4 md:grid-cols-2 md:gap-x-10 md:gap-y-5">
                {HEADLINE_FIELDS.map(({ key, label }) => (
                  <div key={key}>
                    <dt className="text-caption font-medium text-muted-foreground">{label}</dt>
                    <dd className="text-body">{instrument[key] as string}</dd>
                  </div>
                ))}

                {instrument.rateValue !== null && instrument.rateAsOf !== null && (
                  <div className="md:col-span-2">
                    <dt className="text-caption font-medium text-muted-foreground">Current rate</dt>
                    <dd className="text-body">{instrument.rateValue}%</dd>
                    <p className="text-caption text-muted-foreground mt-1">
                      Rate as of {instrument.rateAsOf}. Verify before investing. Government rates change quarterly.
                    </p>
                  </div>
                )}
              </dl>
            </div>

            <Separator />

            {/* Tier 2: the fine print, still worth reading, just not what a
                beginner asks first. */}
            <div className="space-y-4">
              <p className="section-label">The fine print</p>
              <dl className="grid gap-y-4 md:grid-cols-2 md:gap-x-10 md:gap-y-5">
                {FINE_PRINT_FIELDS.map(({ key, label }) => (
                  <div key={key}>
                    <dt className="text-caption font-medium text-muted-foreground">{label}</dt>
                    <dd className="text-body">{instrument[key] as string}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
