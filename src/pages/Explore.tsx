import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { track } from '@/lib/analytics'
import { LIBRARY_SECTIONS } from '@/lib/library-sections'

// Copy: Documentation/design/COPY_DECK.md — "Explore" tab / section cards.
// Layout: Documentation/design/WIREFRAMES.md — 3a. Explore — Library Sections.
export function Explore() {
  useEffect(() => {
    track('nav_tab_clicked', { tab_name: 'explore' })
  }, [])

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg py-12 space-y-6">
        <header className="space-y-1">
          <p className="section-label">Explore</p>
          <h1 className="font-display text-display">What can you invest in?</h1>
          <p className="text-body text-muted-foreground">30 instruments across 6 asset classes, explained plainly.</p>
        </header>

        <Separator />

        <div className="space-y-3">
          {LIBRARY_SECTIONS.map((section) => (
            <Link
              key={section.urlSlug}
              to={`/explore/${section.urlSlug}`}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-card hover:bg-accent/50 transition-colors"
            >
              <div>
                <p className="text-title font-medium">{section.title}</p>
                <p className="text-caption text-muted-foreground">{section.subLabel}</p>
                <p className="text-xs text-muted-foreground mt-1">5 instruments</p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
