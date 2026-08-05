import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { track } from '@/lib/analytics'
import {
  LANDING_HERO,
  HOW_IT_WORKS,
  LANDING_PRIVACY,
  SEE_IT_FIRST,
  NOT_ADVICE,
} from '@/lib/landing-content'
import { WHY_REPO_URL } from '@/lib/why-decisions'

/**
 * Public landing page — what a signed-out visitor to `/` sees (RootGate).
 * Replaces being dropped straight onto the Clerk sign-in box: sign-in is now
 * a deliberate act at /sign-in, reached from the CTAs here.
 *
 * Content lives in src/lib/landing-content.ts; this component only lays it
 * out, on the locked design language (CFP one-pager: warm paper background,
 * serif display, section labels). Order follows what the page must earn:
 * what this is and that it is household-level; the privacy claim with its
 * limits one click away (D-014); the product visible before commitment.
 */
export function Landing() {
  useEffect(() => {
    track('feature_used', { feature_name: 'landing_viewed' })
  }, [])

  const cta = (cta_name: string, destination: string) => () =>
    track('cta_clicked', { cta_name, surface: 'landing', destination })

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg md:max-w-2xl lg:max-w-5xl py-12 md:py-16 space-y-12 lg:space-y-16">
        {/* Hero — who this is for, in the first heading */}
        <header className="space-y-4 lg:max-w-3xl">
          <p className="section-label">{LANDING_HERO.label}</p>
          <h1 className="font-display text-display">{LANDING_HERO.headline}</h1>
          <p className="text-body-lg text-muted-foreground">{LANDING_HERO.body}</p>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button asChild>
              <Link to="/sign-in?authView=sign-up" onClick={cta('create_your_plan', '/sign-in?authView=sign-up')}>
                {LANDING_HERO.primaryCta}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/sign-in" onClick={cta('sign_in', '/sign-in')}>
                {LANDING_HERO.secondaryCta}
              </Link>
            </Button>
          </div>
          <Link
            to="/explore"
            onClick={cta('browse_library', '/explore')}
            className="inline-flex min-h-11 items-center text-body text-muted-foreground underline-offset-4 underline decoration-border hover:text-foreground"
          >
            {LANDING_HERO.browseFirst}
          </Link>
        </header>

        <Separator />

        {/* The core loop, as three steps */}
        <section className="space-y-4" aria-labelledby="landing-how">
          <p className="section-label" id="landing-how">
            How it works
          </p>
          <div className="space-y-3 md:grid md:grid-cols-3 md:gap-3 md:space-y-0">
            {HOW_IT_WORKS.map((step) => (
              <article key={step.heading} className="rounded-lg border border-border bg-card p-4 md:p-6 shadow-card space-y-2">
                <p className="text-caption text-muted-foreground tabular">{step.step}</p>
                <h2 className="text-title font-semibold">{step.heading}</h2>
                <p className="text-body text-muted-foreground">{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <Separator />

        {/* The sharpest differentiator — the same claim /privacy makes, with
            its limits one click away. Never a stronger version than D-014. */}
        <section className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10 lg:space-y-0" aria-labelledby="landing-privacy">
          <div className="space-y-2">
            <p className="section-label" id="landing-privacy">
              {LANDING_PRIVACY.label}
            </p>
            <h2 className="font-display text-heading">{LANDING_PRIVACY.headline}</h2>
            <p className="text-body text-muted-foreground">{LANDING_PRIVACY.body}</p>
          </div>
          <div className="rounded-lg border border-dashed p-4 md:p-6 space-y-2">
            <p className="text-body text-muted-foreground">{LANDING_PRIVACY.cost}</p>
            <p className="text-body text-muted-foreground">{LANDING_PRIVACY.limitLead}</p>
            <Link
              to="/privacy"
              onClick={cta('privacy_note', '/privacy')}
              className="inline-flex min-h-11 items-center gap-1 text-body font-medium text-primary underline-offset-4 hover:underline focus-visible:underline"
            >
              {LANDING_PRIVACY.limitLink}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <Separator />

        {/* The product is inspectable without an account */}
        <section className="space-y-4" aria-labelledby="landing-see-first">
          <div className="space-y-1">
            <p className="section-label" id="landing-see-first">
              {SEE_IT_FIRST.label}
            </p>
            <h2 className="font-display text-heading">{SEE_IT_FIRST.heading}</h2>
            <p className="text-caption text-muted-foreground">{SEE_IT_FIRST.body}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 md:gap-4">
            {SEE_IT_FIRST.links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={cta(`see_first_${link.to.slice(1)}`, link.to)}
                className="flex min-h-11 items-center justify-between rounded-lg border border-border bg-card p-4 shadow-card hover:bg-accent/50 transition-colors"
              >
                <div>
                  <p className="text-title font-medium">{link.title}</p>
                  <p className="text-caption text-muted-foreground">{link.description}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>

        <Separator />

        {/* The regulatory line, stated as a feature rather than fine print */}
        <section className="space-y-2" aria-labelledby="landing-not-advice">
          <p className="section-label" id="landing-not-advice">
            {NOT_ADVICE.label}
          </p>
          <p className="text-body text-muted-foreground">{NOT_ADVICE.body}</p>
        </section>

        <footer className="space-y-1">
          <p className="text-caption text-muted-foreground">
            The full source is public. That includes the decision log this product is built from.
          </p>
          <a
            href={WHY_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-body font-medium text-primary underline-offset-4 hover:underline focus-visible:underline"
          >
            View the source on GitHub
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </footer>
      </div>
    </main>
  )
}
