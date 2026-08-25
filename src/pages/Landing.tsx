import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SampleOnePager } from '@/components/sample-one-pager'
import { track } from '@/lib/analytics'
import {
  LANDING_HERO,
  LANDING_TRUST,
  LANDING_PROBLEM,
  LANDING_FIGURES,
  HOW_IT_WORKS,
  LANDING_PRIVACY,
  SEE_IT_FIRST,
  LANDING_BUILT,
  NOT_ADVICE,
  LANDING_CREDIT,
} from '@/lib/landing-content'
import { WHY_REPO_URL } from '@/lib/why-decisions'

/**
 * Public landing page — what a signed-out visitor to `/` sees (RootGate).
 * Replaces being dropped straight onto the Clerk sign-in box: sign-in is now
 * a deliberate act at /sign-in, reached from the CTAs here.
 *
 * Content lives in src/lib/landing-content.ts; this component only lays it
 * out, on the locked design language (CFP one-pager: warm paper background,
 * serif display, section labels, "would a CFP put this in a printed client
 * plan?"). Section order follows what the page must earn, in this order:
 * who this is for and that it is household-level (hero); the trust strip;
 * the diagnosis of the actual pain; the figures that back the diagnosis;
 * how the product works; the privacy claim, the page's one inversion; the
 * product visible before commitment; the build decisions behind it; and
 * finally the regulatory line and credit, in the footer.
 */
const FADE_UP_STYLE = `
  @keyframes landing-fade-up {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (prefers-reduced-motion: no-preference) {
    .landing-fade-up {
      animation: landing-fade-up 0.5s ease-out both;
    }
  }
`

/**
 * "NN / Section title" — a numbered, ruled section header. The numeral sits
 * in a printed-document left gutter; the title carries the existing
 * section-label style. Used by sections 01, 03 and 04 (section 02, the
 * privacy band, is the page's one full-bleed inversion and sets its own
 * numeral inline against the mint).
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

export function Landing() {
  useEffect(() => {
    track('feature_used', { feature_name: 'landing_viewed' })
  }, [])

  const cta = (cta_name: string, destination: string) => () =>
    track('cta_clicked', { cta_name, surface: 'landing', destination })

  return (
    <main className="min-h-screen bg-background text-foreground font-sans paper-grain">
      <style>{FADE_UP_STYLE}</style>

      {/* Hero + trust strip */}
      <section className="container max-w-lg md:max-w-2xl lg:max-w-5xl pt-12 pb-8 md:pt-16 md:pb-10">
        {/* items-center, not items-start: the sample card is roughly twice
            the height of the left column, and top-aligning the two left a
            large dead area under the audience line at lg. Seen in the
            rendered capture at 1280, not predicted from the markup. */}
        <div className="lg:grid lg:grid-cols-12 lg:gap-10 lg:items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="landing-fade-up space-y-3" style={{ animationDelay: '0ms' }}>
              <div className="space-y-1">
                <p className="font-wordmark text-heading text-primary">{LANDING_HERO.brandName}</p>
                <p className="text-body text-muted-foreground max-w-md">
                  {LANDING_HERO.brandMeaning} {LANDING_HERO.brandRelevance}
                </p>
              </div>
              <p className="section-label">{LANDING_HERO.label}</p>
              <h1 className="font-serif text-hero lg:max-w-[16ch]">
                {LANDING_HERO.headlineBefore}
                <span className="text-primary">{LANDING_HERO.headlineEmphasis}</span>
                {LANDING_HERO.headlineAfter}
              </h1>
            </div>
            <p className="landing-fade-up text-body-lg text-foreground" style={{ animationDelay: '150ms' }}>
              {LANDING_HERO.body}
            </p>
            <div className="landing-fade-up flex flex-col sm:flex-row gap-3 pt-2" style={{ animationDelay: '300ms' }}>
              <Button asChild className="min-h-11">
                <Link to="/sign-in?authView=sign-up" onClick={cta('create_your_plan', '/sign-in?authView=sign-up')}>
                  {LANDING_HERO.primaryCta}
                </Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/sign-in" onClick={cta('sign_in', '/sign-in')}>
                  {LANDING_HERO.secondaryCta}
                </Link>
              </Button>
            </div>
            <p className="landing-fade-up text-body text-muted-foreground" style={{ animationDelay: '450ms' }}>
              {LANDING_HERO.audience}
            </p>
          </div>

          {/* Right column: a live sample one-pager, real components, synthetic data */}
          <div className="mt-8 lg:mt-0 lg:col-span-5">
            <SampleOnePager />
          </div>
        </div>

        {/* Trust strip */}
        <div className="mt-8 md:mt-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-4">
          {LANDING_TRUST.items.map((item, index) => (
            <span key={item} className="contents">
              {index > 0 && (
                <span aria-hidden="true" className="text-muted-foreground">
                  &middot;
                </span>
              )}
              <span className="text-caption text-muted-foreground">{item}</span>
            </span>
          ))}
        </div>
      </section>

      <Separator />

      {/* Problem — the diagnosis, before the figures that back it */}
      <section className="container max-w-lg md:max-w-2xl lg:max-w-5xl py-10 md:py-12" aria-label="The problem this solves">
        <div className="grid gap-6 md:grid-cols-3">
          {LANDING_PROBLEM.map((beat) => (
            <div key={beat.heading} className="space-y-1.5">
              <h2 className="text-title font-semibold">{beat.heading}</h2>
              <p className="text-body text-muted-foreground">{beat.body}</p>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* Figures row */}
      <section className="container max-w-lg md:max-w-2xl lg:max-w-5xl py-10 md:py-12" aria-label="The product in numbers">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border rounded-lg border border-border">
          {LANDING_FIGURES.map((figure) => (
            <div key={figure.label} className="p-4 md:p-6 text-center space-y-1">
              <p className="font-serif text-display tabular">{figure.value}</p>
              <p className="text-caption text-muted-foreground">{figure.label}</p>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* 01 / How it works */}
      <section className="container max-w-lg md:max-w-2xl lg:max-w-5xl py-10 md:py-12 space-y-6" aria-labelledby="landing-how">
        <NumberedHeader number="01" title="How it works" id="landing-how" />
        <div className="grid gap-5 md:grid-cols-3 md:gap-6">
          {HOW_IT_WORKS.map((step) => (
            <div key={step.heading} className="flex gap-3">
              <span className="w-8 shrink-0 font-mono text-title text-muted-foreground tabular" aria-hidden="true">
                {step.step.replace('Step ', '0')}
              </span>
              <div className="space-y-1.5">
                <h2 className="text-title font-semibold">{step.heading}</h2>
                <p className="text-body text-muted-foreground">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 02 / Privacy — the page's only inversion, full-bleed */}
      <section className="bg-primary text-primary-foreground" aria-labelledby="landing-privacy">
        <div className="container max-w-lg md:max-w-2xl lg:max-w-5xl py-10 md:py-14 space-y-4">
          <div className="flex items-baseline gap-2 border-b border-primary-foreground/40 pb-3" aria-hidden="true">
            <span className="font-mono text-title tabular">02</span>
            <span>/</span>
            <span className="section-label text-primary-foreground">Privacy</span>
          </div>
          <h2 className="font-serif text-heading" id="landing-privacy">
            {LANDING_PRIVACY.headline}
          </h2>
          <p className="text-body-lg">{LANDING_PRIVACY.body}</p>
          <p className="text-body-lg">{LANDING_PRIVACY.cost}</p>
          <p className="text-body-lg">{LANDING_PRIVACY.limitLead}</p>
          <Link
            to="/privacy"
            onClick={cta('privacy_note', '/privacy')}
            className="inline-flex min-h-11 items-center gap-1 text-body font-medium text-primary-foreground underline underline-offset-4"
          >
            {LANDING_PRIVACY.limitLink}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <Separator />

      {/* 03 / See it first */}
      <section className="container max-w-lg md:max-w-2xl lg:max-w-5xl py-10 md:py-12 space-y-6" aria-labelledby="landing-see-first">
        <NumberedHeader number="03" title="See it first" id="landing-see-first" />
        <p className="text-caption text-muted-foreground">{SEE_IT_FIRST.body}</p>
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

      {/* 04 / How it was built */}
      <section className="container max-w-lg md:max-w-2xl lg:max-w-5xl py-10 md:py-12 space-y-6" aria-labelledby="landing-built">
        <NumberedHeader number="04" title="How it was built" id="landing-built" />
        <div className="grid gap-4 md:grid-cols-3 md:gap-6">
          {LANDING_BUILT.map((decision) => (
            <div key={decision.heading} className="rounded-lg border border-border bg-card p-4 md:p-6 shadow-card space-y-2">
              <h2 className="text-title font-semibold">{decision.heading}</h2>
              <p className="text-body text-muted-foreground">Instead of {decision.instead}</p>
            </div>
          ))}
        </div>
        <Link
          to="/why"
          onClick={cta('how_it_was_built', '/why')}
          className="inline-flex min-h-11 items-center gap-1 text-body font-medium text-primary underline-offset-4 hover:underline focus-visible:underline"
        >
          Read the full decision log
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>

      {/* Footer — the regulatory line demoted to a ruled note, plus credit */}
      <footer className="container max-w-lg md:max-w-2xl lg:max-w-5xl py-10 md:py-12 space-y-3 border-t border-border">
        <p className="text-caption text-muted-foreground">{NOT_ADVICE.body}</p>
        <p className="text-caption text-muted-foreground">
          The full source is public. That includes the decision log this product is built from.
        </p>
        <a
          href={WHY_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={cta('view_source', WHY_REPO_URL)}
          className="inline-flex min-h-11 items-center gap-1 text-body font-medium text-primary underline-offset-4 hover:underline focus-visible:underline"
        >
          View the source on GitHub
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </a>
        <p className="text-caption text-muted-foreground">{LANDING_CREDIT}</p>
      </footer>
    </main>
  )
}
