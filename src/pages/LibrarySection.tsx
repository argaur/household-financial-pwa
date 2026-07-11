import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { track } from '@/lib/analytics'
import { getSectionByUrlSlug } from '@/lib/library-sections'
import { listInstruments, type Instrument } from '@/lib/instruments-api'

type State = 'loading' | 'loaded' | 'error'

// Copy: Documentation/design/COPY_DECK.md — instrument list shows Name/Returns/Risk only.
// Layout: Documentation/design/WIREFRAMES.md — 3b. Library Section — Instrument List.
export function LibrarySection() {
  const { sectionSlug } = useParams<{ sectionSlug: string }>()
  const section = sectionSlug ? getSectionByUrlSlug(sectionSlug) : undefined
  const [state, setState] = useState<State>('loading')
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const viewedFired = useRef(false)

  useEffect(() => {
    if (!section) return
    let cancelled = false
    setState('loading')
    ;(async () => {
      try {
        const result = await listInstruments(section.category)
        if (cancelled) return
        setInstruments(result)
        setState('loaded')
      } catch {
        if (cancelled) return
        setState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [section])

  useEffect(() => {
    if (section && !viewedFired.current) {
      viewedFired.current = true
      track('library_section_viewed', { section: section.urlSlug })
    }
  }, [section])

  if (!section) return <Navigate to="/explore" replace />

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg py-12 space-y-6">
        <Link to="/explore" className="text-caption text-muted-foreground hover:underline">
          ← Explore
        </Link>

        <header className="space-y-1">
          <h1 className="font-display text-display">{section.title}</h1>
          <p className="text-body text-muted-foreground">{section.subLabel}</p>
        </header>

        <Separator />

        {state === 'loading' && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        )}

        {state === 'error' && (
          <p className="text-caption text-destructive">We couldn't load this section. Refresh to try again.</p>
        )}

        {state === 'loaded' && (
          <div className="space-y-3">
            {instruments.map((instrument) => (
              <Link
                key={instrument.slug}
                to={`/explore/${section.urlSlug}/${instrument.slug}`}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-card hover:bg-accent/50 transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <p className="text-body font-medium">{instrument.name}</p>
                  <p className="text-caption text-muted-foreground line-clamp-1">Returns: {instrument.returns}</p>
                  <p className="text-caption text-muted-foreground line-clamp-1">Risk: {instrument.risk}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
