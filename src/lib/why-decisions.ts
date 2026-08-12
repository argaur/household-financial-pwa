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
  /**
   * The named alternative that was rejected, plus why it lost — written as
   * one flowing sentence or two, rendered after a literal "Instead of "
   * lead-in. A decision needs a named alternative, and the reasoning reads
   * better next to it than in a separate labeled field.
   */
  insteadOf: string
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
        insteadOf:
          'a library-first flow that teaches you before letting you track anything. The real payoff is seeing your own household on screen, so the learning content supports that moment instead of standing in front of it.',
      },
      {
        heading: 'No live price feeds in v1',
        decision: 'Every holding’s current value is entered by hand: mutual funds, gold, crypto, all of it.',
        insteadOf:
          'wiring up three market-data services so values refresh themselves. The dashboard’s value comes from your allocation and how complete your plan is, and neither needs live prices, so three integrations and their failure handling were scope worth skipping.',
      },
      {
        heading: 'It never tells you to buy',
        decision: 'Every nudge and learn-card is observational and links to an explanation, never to a buy or invest action.',
        insteadOf:
          'personalised "you should invest in X" recommendations. Personalised investment advice is a regulated activity in India, so staying strictly educational is a hard line, not a style choice. It shapes every line of copy in the app.',
      },
      {
        heading: 'One honest health score, not a black box',
        decision:
          'Household Health is five equal-weight checks: member coverage, an emergency fund, both parents protected, three-plus asset classes, no stale values. The nudge is always the first unmet one, in a fixed order.',
        insteadOf:
          'a weighted or machine-learned score, or putting the checklist off for later. With no usage data yet, a plain checklist anyone can read top to bottom beats a weighting nobody can justify. It mirrors how a real household plan checks itself.',
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
          'Every request to the server works out your household from your login session. Your browser never sends a household or member ID; the server figures them out itself.',
        insteadOf:
          'trusting an ID sent by the browser, or leaning on a database feature that would filter rows automatically. If the browser can never supply an ID, the entire "guess someone else’s ID" class of bug cannot happen. Each resource carries its own test proving two different users cannot see each other’s data.',
      },
      {
        heading: 'Verifying logins the hard way, on purpose',
        decision:
          'A login is checked by validating a signed digital pass, called a JWT, straight against Clerk’s own public signing keys, using a small library called jose. A JWT is what proves you’re signed in without asking for your password again on every request.',
        insteadOf:
          'Clerk’s own official toolkit for this, known as the Clerk backend SDK. That toolkit hit an unresolved bug in the tool Vercel uses to package code for its fast edge servers, across several versions. jose checks the same pass using only standard web security code, so it sidesteps the bug entirely, the pragmatic call when a dependency fights the platform it runs on.',
      },
      {
        heading: 'Web addresses with a question mark, not a folder path',
        decision:
          'Every API address is one flat piece with the details tacked on after a question mark, like /api/instruments?slug=gold, instead of built into the path like a folder, like /api/instruments/gold.',
        insteadOf:
          'the usual folder-style web address. This project’s build only forwards single-segment /api/* addresses to the server function; a second segment gets rejected by the platform before the code ever runs. Found by reading the build output, then designed around rather than fought.',
      },
      {
        heading: 'Offline reading, and an honest limit',
        decision:
          'Offline, the whole 30-instrument library and this page load from a copy already saved on your device. The signed-in dashboard does not: it needs Clerk’s login check, which loads from the internet, so with no network there is no verified session and nothing safe to show.',
        insteadOf:
          'claiming a full offline dashboard, or showing saved financial data without checking who is asking. Saving pages for offline was never the hard part. Showing a household’s balances because they happen to sit in a saved copy, with nothing checking who is asking, is a privacy hole dressed up as a feature. A smaller promise that is actually true beats a bigger one that is not.',
      },
    ],
  },
]
