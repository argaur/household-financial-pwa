/**
 * Content for the public "Why these choices?" page (Slice 10).
 * Drawn from Documentation/solution/DECISIONS_LOG.md (D-001..D-010) and the
 * engineering decisions recorded across Documentation/plan/PROGRESS.md.
 * Data-only — the page (src/pages/Why.tsx) just maps over this. Edit copy here.
 */

export interface WhyDecision {
  /** Short, scannable card title. */
  heading: string
  /** What was decided. */
  decision: string
  /** The named alternative that was rejected — a decision needs one. */
  insteadOf: string
  /** Why the decision beat the alternative. */
  why: string
}

export interface WhySection {
  id: string
  label: string
  title: string
  blurb: string
  decisions: WhyDecision[]
}

export const WHY_REPO_URL = 'https://github.com/argaur/household-financial-pwa'

export const WHY_SECTIONS: WhySection[] = [
  {
    id: 'product',
    label: 'Product judgment',
    title: 'What it does, and what it deliberately does not',
    blurb: 'Every feature here earned its place against a named alternative. These are the ones worth explaining.',
    decisions: [
      {
        heading: 'Your household first, the textbook second',
        decision:
          'Onboarding goes straight to recording what your family actually holds, then lands on a dashboard. The instrument library is always reachable but never gates you.',
        insteadOf: 'A library-first flow that teaches you before letting you track anything.',
        why: 'The "aha" is seeing your own household visualised. Literacy content should support that moment, not stand in front of it.',
      },
      {
        heading: 'No live price feeds in v1',
        decision: 'Every holding’s current value is entered by hand — mutual funds, gold, crypto, all of it.',
        insteadOf: 'Wiring up three market-data APIs so values refresh themselves.',
        why: 'The dashboard’s value — allocation and plan-completeness — does not need live prices. Three integrations, their rate limits and failure handling, for no v1-critical gain, is scope I chose not to carry.',
      },
      {
        heading: 'It never tells you to buy',
        decision: 'Every nudge and learn-card is observational and links to an explanation — never to a buy or invest action.',
        insteadOf: 'Personalised "you should invest in X" recommendations.',
        why: 'Personalised investment advice is a regulated activity. Staying strictly educational is a hard product line, not a stylistic one — it shapes every line of copy in the app.',
      },
      {
        heading: 'One honest health score, not a black box',
        decision:
          'Household Health is five equal-weight checks — member coverage, an emergency fund, both parents protected, three-plus asset classes, no stale values — and the nudge is always the first unmet one, in a fixed order.',
        insteadOf: 'A weighted or ML-tuned score, or deferring the checklist entirely.',
        why: 'With zero usage data, a deterministic checklist you can read top-to-bottom beats a weighting nobody can justify yet. It mirrors the gating logic from a real household plan.',
      },
    ],
  },
  {
    id: 'engineering',
    label: 'Engineering',
    title: 'The build decisions behind the polish',
    blurb: 'A few places where the interesting choice was underneath the surface, not on it.',
    decisions: [
      {
        heading: 'You cannot ask for another household’s data',
        decision:
          'Every API request resolves your household from your session on the server. The client never sends a household or member ID — the server derives them.',
        insteadOf: 'Trusting IDs supplied by the client, or leaning on Postgres row-level security.',
        why: 'No client-supplied ID means the entire "guess someone else’s ID" class of bug cannot happen. Each resource carries its own two-user isolation test.',
      },
      {
        heading: 'Verifying sessions the hard way, on purpose',
        decision: 'Sessions are verified by checking the JWT against Clerk’s public keys with jose, not the official Clerk backend SDK.',
        insteadOf: 'The batteries-included @clerk/backend / @hono/clerk-auth.',
        why: 'The Clerk SDK hit an unresolved Vercel Edge bundler bug across several versions. jose is pure Web Crypto and sidesteps it — the pragmatic call when a dependency fights the platform.',
      },
      {
        heading: 'Query params where REST wanted path segments',
        decision: 'Every API route is a single flat segment (/api/instruments?slug=…), not the nested /api/instruments/:slug shape.',
        insteadOf: 'The conventional nested-resource routing.',
        why: 'This project’s zero-config Vercel build only routes single-segment /api/* paths to the function; a second segment 404s at the platform before the code runs. Found in the build manifest, then designed around rather than fought.',
      },
      {
        heading: 'Works offline, and says so honestly',
        decision:
          'Offline, the last dashboard and the whole library still load; write forms disable themselves and state that nothing is queued. Signing out purges the cached dashboard.',
        insteadOf: 'A background write-queue that replays edits when you reconnect.',
        why: 'A sync queue is a data-integrity minefield for v1. Read-only offline that tells the truth about its limits is more trustworthy than a queue that silently drops edits. The sign-out purge is a data-isolation fix, not a nicety.',
      },
    ],
  },
]
