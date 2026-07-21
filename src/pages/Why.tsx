import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { track } from '@/lib/analytics'
import { WHY_SECTIONS, WHY_REPO_URL, type WhyDecision } from '@/lib/why-decisions'

/**
 * Public, non-auth-gated "Why these choices?" page (Slice 10) — the recruiter
 * surface. Content lives in src/lib/why-decisions.ts; this component only lays
 * it out, reusing the locked design tokens (no new palette).
 */
export function Why() {
  useEffect(() => {
    track('why_page_viewed', {})
  }, [])

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg py-12 space-y-10">
        <header className="space-y-2">
          <p className="section-label">Why these choices?</p>
          <h1 className="font-display text-display">A household-finance app, and the reasoning behind it</h1>
          <p className="text-body text-muted-foreground">
            This is a portfolio piece. Below are the product and engineering calls worth explaining — each one against
            the alternative it beat.
          </p>
        </header>

        {WHY_SECTIONS.map((section) => (
          <section key={section.id} className="space-y-4" aria-labelledby={`why-${section.id}`}>
            <div className="space-y-1">
              <p className="section-label" id={`why-${section.id}`}>
                {section.label}
              </p>
              <h2 className="font-display text-heading">{section.title}</h2>
              <p className="text-caption text-muted-foreground">{section.blurb}</p>
            </div>

            <div className="space-y-3">
              {section.decisions.map((decision) => (
                <DecisionCard key={decision.heading} decision={decision} />
              ))}
            </div>
          </section>
        ))}

        <Separator />

        <footer className="space-y-3">
          <p className="text-body text-muted-foreground">
            Built with Vite, React and TypeScript; Hono on Vercel Functions; Drizzle and Neon Postgres; Clerk, PostHog
            and Sentry. The full source — including the decision log this page draws from — is public.
          </p>
          <a
            href={WHY_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-body font-medium text-primary underline-offset-4 hover:underline focus-visible:underline"
          >
            View the source on GitHub
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <div>
            <Link to="/" className="text-caption text-muted-foreground underline-offset-4 hover:underline focus-visible:underline">
              ← Back to the app
            </Link>
          </div>
        </footer>
      </div>
    </main>
  )
}

function DecisionCard({ decision }: { decision: WhyDecision }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-card space-y-3">
      <h3 className="text-title font-medium">{decision.heading}</h3>
      <dl className="space-y-2">
        <div>
          <dt className="section-label">Decision</dt>
          <dd className="text-body">{decision.decision}</dd>
        </div>
        <div>
          <dt className="section-label">Instead of</dt>
          <dd className="text-body text-muted-foreground">{decision.insteadOf}</dd>
        </div>
        <div>
          <dt className="section-label">Why</dt>
          <dd className="text-body">{decision.why}</dd>
        </div>
      </dl>
    </article>
  )
}
