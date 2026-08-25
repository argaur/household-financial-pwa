import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { track } from '@/lib/analytics'
import { WHY_SECTIONS, WHY_REPO_URL, type WhyDecision } from '@/lib/why-decisions'

/**
 * "NN / Section title" — a numbered, ruled section header. Matches the one
 * on Landing.tsx (duplicated rather than extracted — two uses, not the
 * three-plus that earns a shared component) so a visitor bouncing between
 * `/` and `/why` reads it as one product, not two.
 */
function NumberedHeader({ number, title, id }: { number: string; title: string; id: string }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-border pb-3">
      <span className="font-mono text-title text-muted-foreground tabular" aria-hidden="true">
        {number}
      </span>
      <span className="text-muted-foreground" aria-hidden="true">
        /
      </span>
      <p className="section-label" id={id}>
        {title}
      </p>
    </div>
  )
}

/**
 * Public, non-auth-gated "Why these choices?" page (Slice 10) — the recruiter
 * surface. Content lives in src/lib/why-decisions.ts; this component only lays
 * it out, on the same numbered-section language as Landing.tsx (no new
 * palette, no new layout vocabulary).
 */
export function Why() {
  useEffect(() => {
    track('why_page_viewed', {})
  }, [])

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg md:max-w-2xl lg:max-w-5xl py-12 md:py-16 space-y-10">
        <header className="space-y-3">
          <p className="section-label">Why these choices?</p>
          <h1 className="font-serif text-hero">A household finance app, and the thinking behind it</h1>
          <p className="text-body-lg text-muted-foreground max-w-2xl">
            This is a portfolio piece. Below are the product and engineering calls worth explaining, each one against
            the alternative it beat.
          </p>
        </header>

        {WHY_SECTIONS.map((section, index) => (
          <section key={section.id} className="space-y-6" aria-labelledby={`why-${section.id}`}>
            <NumberedHeader number={String(index + 1).padStart(2, '0')} title={section.label} id={`why-${section.id}`} />
            <div className="space-y-1">
              <h2 className="font-serif text-heading">{section.title}</h2>
              <p className="text-caption text-muted-foreground">{section.blurb}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 md:gap-6">
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
            and Sentry. The full source is public, including the decision log this page draws from.
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
          <div className="space-y-2">
            <div>
              <Link
                to="/privacy"
                className="text-caption text-muted-foreground underline-offset-4 hover:underline focus-visible:underline"
              >
                What we can and cannot see
              </Link>
            </div>
            <div>
              <Link to="/" className="text-caption text-muted-foreground underline-offset-4 hover:underline focus-visible:underline">
                ← Back to the app
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  )
}

function DecisionCard({ decision }: { decision: WhyDecision }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4 md:p-6 shadow-card space-y-2">
      <h3 className="text-title font-semibold">{decision.heading}</h3>
      <p className="text-body">{decision.decision}</p>
      <p className="text-body text-muted-foreground">Instead of {decision.insteadOf}</p>
    </article>
  )
}
