import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { track } from '@/lib/analytics'
import { getSectionByUrlSlug } from '@/lib/library-sections'
import { listInstruments, type Instrument } from '@/lib/instruments-api'
import { ASSET_DOT_CLASS } from '@/lib/asset-classes'
import { riskLevel, riskGloss } from '@/lib/instrument-preview'
import { cn } from '@/lib/utils'

type State = 'loading' | 'loaded' | 'error'

// Copy: Documentation/design/COPY_DECK.md — instrument cards show name,
// summary and risk level; the full returns/tax/liquidity paragraphs belong
// to the detail page. (Until 2026-08-05 this list clamped the full returns
// and risk paragraphs to one CSS line each, clipping them mid-sentence —
// see src/lib/instrument-preview.ts for the deliberate rule that replaced
// that.) Layout: WIREFRAMES.md — 3b, mobile; the ≥768px two-column grid is
// the 2026-08-05 desktop derivation. The header dot ties the section to the
// same class color the Explore grid and the allocation donut use.
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
      <div className="container max-w-lg md:max-w-3xl lg:max-w-4xl py-12 md:py-16 space-y-6">
        <Link
          to="/explore"
          className="inline-flex min-h-11 items-center text-caption text-muted-foreground hover:underline"
        >
          ← Explore
        </Link>

        <header className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span
              className={cn('h-2.5 w-2.5 shrink-0 rounded-full', ASSET_DOT_CLASS[section.assetClass])}
              aria-hidden="true"
            />
            <h1 className="font-display text-display">{section.title}</h1>
          </div>
          <p className="text-body text-muted-foreground">{section.subLabel}</p>
        </header>

        <Separator />

        {state === 'loading' && (
          <div className="grid gap-3 md:grid-cols-2 md:gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        )}

        {state === 'error' && (
          <p className="text-caption text-destructive">We couldn't load this section. Refresh to try again.</p>
        )}

        {state === 'loaded' && (
          <div className="grid gap-3 md:grid-cols-2 md:gap-4">
            {instruments.map((instrument) => {
              const level = riskLevel(instrument.risk)
              const gloss = riskGloss(level)
              return (
                <Link
                  key={instrument.slug}
                  to={`/explore/${section.urlSlug}/${instrument.slug}`}
                  className="group flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4 shadow-card transition-colors hover:bg-accent/50 md:p-6"
                >
                  <div className="min-w-0 space-y-1.5">
                    <p className="text-body font-medium md:text-title">{instrument.name}</p>
                    <p className="text-body text-muted-foreground">{instrument.summary}</p>
                    <p className="text-caption text-muted-foreground">
                      <span className="font-medium">Risk:</span> {level}
                      {gloss ? `. ${gloss.charAt(0).toUpperCase()}${gloss.slice(1)}.` : ''}
                    </p>
                  </div>
                  <ChevronRight
                    className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
