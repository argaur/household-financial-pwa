BRIEF: Honest review of Vittam, a household financial planning PWA, from a consumer POV and a
recruiter/hiring-manager POV. Be genuinely critical, not encouraging. The builder wants real signal
before putting this on his resume, not validation.

PRODUCT FACTS (verified, not marketing):
- Live at https://finance.gauravg.dev. Source: github.com/argaur/household-financial-pwa (public).
  Portfolio case study: https://gauravg.dev/case-study-vittam.html
- Solo build, May to September 2026, ongoing.
- Stack: Vite + React + TypeScript + Tailwind + shadcn/ui (frontend), Hono on Vercel Functions
  (API), Drizzle ORM + Neon Postgres (data), Clerk (auth), PostHog + Sentry (observability).
- Core loop (v1, shipped in the first 6 weeks): 3-step onboarding (household name, members,
  first holding) then a household dashboard: a 5-check health tier, an allocation donut by
  asset class, and exactly one nudge (never zero, never a list).
- Client-side encryption: household holdings are encrypted in the browser before they reach the
  server. The server stores ciphertext and two wrapped key copies it cannot open. Key comes from
  a passphrase set separately from login (needed because Google sign-in has no password to derive
  a key from). A recovery code is shown once at signup, never stored server-side. Lose both the
  passphrase and the recovery code and the data is gone for good, even from a backup.
- Public instrument library at /explore: 30 instruments across 6 asset classes (Equity, Debt,
  Gold, Hybrid & Guaranteed, Real Estate, Alternative), each with typical returns, risk, minimum
  investment, tax treatment, liquidity. No account needed to browse.
- Shipped after v1 (this is the part not yet reflected anywhere except the portfolio case study):
  1. Strategy ledgers: a household can hold up to 4 what-if plans alongside "Current," each a
     full encrypted snapshot. Editing Current later does not change a saved ledger. A 3-number
     delta strip (total value, equity share, monthly SIP) compares a ledger against Current.
  2. AI counsel, on demand only: a "Review this ledger" button calls Claude Sonnet 5 through a
     thin server proxy that forwards decrypted plaintext to Anthropic for one request and writes
     nothing to Vittam's own database or logs. The suggestion is Apply (creates a new ledger
     carrying it) or Dismiss (nothing changes) -- never a background or proactive call. A fixed
     monthly call cap keeps cost near zero. This is a disclosed, narrow exception to the
     encryption claim (stated on both /why and /privacy): Anthropic's own API can retain the
     plaintext for up to 30 days per its standard retention policy, which the builder corrected
     in his own decision log after an earlier draft understated it.
  3. Bulk holdings import from Excel: download a template pre-filled with the household's member
     names, fill it in, upload it back. A review screen buckets every row into Ready, Needs
     attention, Possible duplicate, or Skipped; only Ready rows commit. Duplicate detection
     ignores amounts on purpose (a top-up and a duplicate look identical from amounts alone).
- Quality signals: 2,114/2,114 tests passing, 0 axe (accessibility) violations across production
  screens, INR 0/month infrastructure cost (all providers on free tiers).
- No live price feeds anywhere -- every value is typed in by hand, by design (a stale number
  that's always available beats a live one that sometimes isn't; also avoids depending on any
  external market-data API that could break the app).
- Education, not advice: nudges and content are observational only, link to learn-cards, never a
  buy action. This is a regulatory line (India, financial products), not a style choice.
- Multi-tenancy is enforced entirely at the application layer (every API route resolves
  household_id from the Clerk session), not with Postgres row-level security.

HONEST GAPS, STATED PLAINLY, NOT SOFTENED:
- The product has had exactly ONE real user, ever: the builder himself. Zero real traction, zero
  usage data, zero user research or interviews behind any design decision.
- Bulk Excel import has never been smoke-tested against a real, signed-in production session --
  it was built and verified with automated tests and a mocked session only. The builder is
  planning to test it himself on his phone before trusting it further.
- Instrument drift detection (what happens when an instrument in the public library changes or
  is removed after a household already holds it) is a documented decision, not a built feature.
  A ledger's historical holding reference can currently dangle with no warning shown.
- The 390px mobile breakpoint (the project's primary phone width target) has a standing,
  unresolved browser-automation tooling limitation across several sessions -- multiple UI
  changes have shipped to production without ever being visually confirmed at true 390px in a
  real browser, only via static code audits.
- The AI counsel feature and its supporting database migration only became fully live and
  wired up in the last few hours before this review was requested.
- No prompt caching, no user research, no design partner, no waitlist, no marketing of any kind.
  The builder describes it explicitly as "live, unmarketed."

QUESTIONS TO ANSWER, BOTH OF YOU INDEPENDENTLY AND BLIND TO EACH OTHER:

1. CONSUMER POV: Would a real Indian household actually want and trust this product as
   described? Is the value proposition ("see your family's money on one page") clear and
   differentiated, or does it read as "yet another finance tracker"? What in the product as
   described would make a real user bounce in the first five minutes? Is the encryption /
   AI-proxy tradeoff a selling point or a red flag to a non-technical user? Be specific, not
   generic praise or generic skepticism.

2. RECRUITER / HIRING-MANAGER POV: Does this read as a credible, differentiated signal of PM +
   builder ability for someone applying to senior PM or AI-strategy roles, or does it read as a
   generic AI-assisted side project that thousands of candidates now ship? What is the single
   strongest part of this story for a resume/portfolio context, and what is the single weakest
   part that a sharp interviewer would poke at first? How does the "solo build, AI-assisted,
   zero users" framing land in 2026's hiring market specifically -- does building fast with AI
   tools cut against the signal now that it's table stakes, or does something here still
   differentiate it? Compare it honestly to what an actually excellent PM portfolio project looks
   like, not to an average one.

For each of you: give 3 distinct honest takes/approaches to how Gaurav should think about and
frame this project (not 3 versions of the same opinion), one non-obvious insight neither an
enthusiastic booster nor a knee-jerk skeptic would immediately say, one concrete failure mode this
project or its framing risks, and the smallest, cheapest validation step that would most change
your view (e.g., what's the fastest way to find out if any of this actually lands with a real
person).
