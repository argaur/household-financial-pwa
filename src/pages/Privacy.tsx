import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Separator } from '@/components/ui/separator'
import { track } from '@/lib/analytics'
import {
  PRIVACY_CLAIM,
  WHAT_THE_SERVER_STILL_LEARNS,
  WHAT_IS_NOT_LEAKED,
  XSS_LIMIT,
  LOST_PASSPHRASE,
} from '@/lib/privacy-note'

/**
 * Public privacy note (D-014, step 13). Not auth-gated: someone deciding
 * whether to type their net worth into this app needs to read it *before*
 * signing up.
 *
 * Layout follows the argument rather than decorating it. The claim comes first
 * because it is the reason to trust the app; the limit comes immediately after,
 * on the same card, because a limit on a later screen is a limit nobody reads.
 * Content lives in src/lib/privacy-note.ts.
 */
export function Privacy() {
  useEffect(() => {
    track('feature_used', { feature_name: 'privacy_note_viewed' })
  }, [])

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg md:max-w-2xl lg:max-w-3xl py-12 md:py-16 space-y-10">
        <header className="space-y-2">
          <p className="section-label">Privacy</p>
          <h1 className="font-serif text-display">{PRIVACY_CLAIM.headline}</h1>
          <p className="text-body text-muted-foreground">{PRIVACY_CLAIM.body}</p>
        </header>

        {/* The limit sits with the claim, not further down the page. */}
        <section className="rounded-lg border border-dashed p-4 space-y-2" aria-labelledby="privacy-limit">
          <p className="section-label" id="privacy-limit">
            And what that does not mean
          </p>
          <p className="text-body text-muted-foreground">{PRIVACY_CLAIM.limit}</p>
        </section>

        <Separator />

        <section className="space-y-4" aria-labelledby="privacy-learns">
          <div className="space-y-1">
            <p className="section-label" id="privacy-learns">
              What we can still see
            </p>
            <h2 className="font-serif text-heading">The complete list</h2>
            <p className="text-caption text-muted-foreground">
              Not a summary. If something is missing from this list, that is a mistake we want to hear about.
            </p>
          </div>
          <ul className="space-y-2 text-body text-muted-foreground list-disc pl-5">
            {WHAT_THE_SERVER_STILL_LEARNS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="space-y-4" aria-labelledby="privacy-not-leaked">
          <div className="space-y-1">
            <p className="section-label" id="privacy-not-leaked">
              What we cannot see
            </p>
            <h2 className="font-serif text-heading">Things that would otherwise leak, and do not</h2>
          </div>
          <ul className="space-y-2 text-body text-muted-foreground list-disc pl-5">
            {WHAT_IS_NOT_LEAKED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <Separator />

        <section className="space-y-2" aria-labelledby="privacy-xss">
          <h2 className="font-serif text-heading" id="privacy-xss">
            {XSS_LIMIT.heading}
          </h2>
          <p className="text-body text-muted-foreground">{XSS_LIMIT.body}</p>
        </section>

        <section className="space-y-2" aria-labelledby="privacy-lost">
          <h2 className="font-serif text-heading" id="privacy-lost">
            {LOST_PASSPHRASE.heading}
          </h2>
          <p className="text-body text-muted-foreground">{LOST_PASSPHRASE.body}</p>
        </section>

        <Separator />

        <p className="text-caption text-muted-foreground">
          The reasoning behind these choices, and the alternatives they beat, is on{' '}
          <Link to="/why" className="underline underline-offset-4">
            the decisions page
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
