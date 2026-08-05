import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { track } from '@/lib/analytics'
import { LIBRARY_SECTIONS } from '@/lib/library-sections'
import { ASSET_ACCENT_CLASS } from '@/lib/asset-classes'
import { cn } from '@/lib/utils'

// Copy: Documentation/design/COPY_DECK.md — "Explore" tab / section cards.
// Layout: Documentation/design/WIREFRAMES.md — 3a. Explore — Library Sections.
// Desktop (2026-08-05 rework): WIREFRAMES.md only ever specified the 390px
// column, so the ≥768px layout is derived here from the same metaphor — the
// six asset classes as a contents grid, each card carrying its class color
// from the shared identity palette (the one the allocation donut already
// uses). The accent is an identity edge, not chrome: the text still names
// the class, so no information is color-only.
export function Explore() {
  useEffect(() => {
    track('nav_tab_clicked', { tab_name: 'explore' })
  }, [])

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg md:max-w-3xl lg:max-w-5xl py-12 md:py-16 space-y-6">
        <header className="space-y-1">
          <p className="section-label">Explore</p>
          <h1 className="font-display text-display">What can you invest in?</h1>
          <p className="text-body text-muted-foreground">30 instruments across 6 asset classes, explained plainly.</p>
        </header>

        <Separator />

        <div className="grid gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
          {LIBRARY_SECTIONS.map((section) => (
            <Link
              key={section.urlSlug}
              to={`/explore/${section.urlSlug}`}
              className={cn(
                'group flex flex-col justify-between gap-5 rounded-lg border border-border border-l-4 bg-card p-4 shadow-card transition-colors hover:bg-accent/50 md:p-6',
                ASSET_ACCENT_CLASS[section.assetClass],
              )}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-title font-medium">{section.title}</p>
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-body text-muted-foreground">{section.subLabel}</p>
              </div>
              <p className="text-caption text-muted-foreground">5 instruments</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
