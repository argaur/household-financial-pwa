import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { track } from '@/lib/analytics'
import { getSectionByUrlSlug } from '@/lib/library-sections'
import { getInstrument, type Instrument } from '@/lib/instruments-api'

type State = 'loading' | 'loaded' | 'error'

const FIELD_LABELS: Array<{ key: keyof Instrument; label: string }> = [
  { key: 'returns', label: 'Typical returns' },
  { key: 'tax', label: 'Tax treatment' },
  { key: 'liquidity', label: 'Liquidity' },
  { key: 'risk', label: 'Risk level' },
  { key: 'eligibility', label: 'Who can invest' },
  { key: 'minInvestment', label: 'Minimum investment' },
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
      <div className="container max-w-lg py-12 space-y-6">
        <Link to={`/explore/${section.urlSlug}`} className="text-caption text-muted-foreground hover:underline">
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
              <p className="section-label">{section.title.toUpperCase()}</p>
              <h1 className="font-display text-display">{instrument.name}</h1>
              <p className="text-body text-muted-foreground">{instrument.summary}</p>
            </header>

            <Separator />

            <dl className="space-y-4">
              {FIELD_LABELS.map(({ key, label }) => (
                <div key={key}>
                  <dt className="text-caption font-medium text-muted-foreground">{label}</dt>
                  <dd className="text-body">{instrument[key] as string}</dd>
                </div>
              ))}

              {instrument.rateValue !== null && instrument.rateAsOf !== null && (
                <div>
                  <dt className="text-caption font-medium text-muted-foreground">Current rate</dt>
                  <dd className="text-body">{instrument.rateValue}%</dd>
                  <p className="text-caption text-muted-foreground mt-1">
                    Rate as of {instrument.rateAsOf}. Verify before investing — government rates change quarterly.
                  </p>
                </div>
              )}
            </dl>
          </>
        )}
      </div>
    </main>
  )
}
