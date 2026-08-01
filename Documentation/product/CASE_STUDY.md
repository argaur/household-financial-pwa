> **DRAFT — awaiting Gaurav's approval.** Nothing here is signed off. No checklist box in this repo has been ticked on account of this document.

# Case Study — Household Financial Planning PWA

**Audience:** A recruiter or hiring manager with 3 minutes. Lead with outcomes and judgment, not technology lists.
**Process:** Claude drafts from `DECISIONS_LOG.md`. Gaurav reviews and approves. Linked from root README (the README is the landing page; this tells the story; `HOW_TO_USE.md` proves it works).

---

## Problem

An Indian household's money is scattered across a dozen products and two or three people — a spouse's PPF, a child's SSY, gold in a locker, an old LIC policy, mutual funds at three different platforms. Existing tools solve one half each: portfolio trackers show a single account's returns but have no concept of a household, and generic advisory apps explain instruments in the abstract while trying to sell you one. Nobody can answer the actual question a family has, which is not "how did my fund do this quarter" but "what do we own, what are we missing, and what should we fix first."

## What I built

A public, installable PWA where a household is the unit of account. Three fact-only onboarding steps — household, members, first holding — land you on a dashboard showing your real asset-class allocation, a Household Health tier scored on five binary checks, and exactly one prioritised next step linking to a plain-language explainer. No buy buttons: the product is education-first by hard constraint, not by style preference. A 30-instrument library across six asset classes covers what an Indian household actually holds.

**Live:** https://finance.gauravg.dev
**Code:** https://github.com/argaur/household-financial-pwa (public, deliberately — see D-004)

![Dashboard after onboarding: Household Health tier, allocation donut, and one prioritised next step](screenshots/hero-dashboard-2026-08-01.png)

*Captured live 2026-08-01, the moment right after onboarding step 3, per `PORTFOLIO_ANGLE.md`. Synthetic household: this repo is public and never carries real financial data.*

**Outcome:** eleven vertical slices from empty repo to feature-complete and live in six weeks (first deploy 2026-07-10, thirteen days inside a self-imposed 30-day kill criterion; feature-complete 2026-07-21), at ₹0/month infrastructure cost on free tiers, with a 310-test suite and zero axe accessibility violations across all five screens in production.

## Decisions and tradeoffs

| Decision | Rejected alternative | Why |
|---|---|---|
| Manual value entry only — no live prices (D-002) | Auto-pricing via mfapi.in, CoinGecko and a gold feed, as originally scoped | The dashboard's value is allocation and completeness, neither of which needs a live NAV. Three external integrations, their rate limits, CORS and failure modes bought nothing v1-critical. |
| Holdings-first critical path (D-001) | Library-first browsing; a populated demo dashboard with no signup | Fastest route to the "aha" moment of seeing *your own* household visualised. Literacy content should support that moment, not gate it. |
| Cut the demo-household button (D-003) | A full switchable demo mode | It would have reintroduced a second parallel critical path and a demo/real mode flag. Real onboarding is three steps — short enough to serve the same recruiter-viewing purpose. |
| Public repo (D-004) | Private repo with a sanitised public mirror | A private repo means the decision log can only be described, never verified. It also forces real secret hygiene immediately — and permanently bars committing any real household data. |
| Conservative numeric targets: 60% / 25% / 50% (D-006) | No numeric targets; or aggressive 80% / 40% / 70% | Zero prior data. A bar you clearly clear or clearly miss is informative; an arbitrary aggressive bar teaches you nothing when you miss it. |
| Kept the library at 30 instruments under review pressure (D-010, D-011) | Expanding to 32 to satisfy an analytics finding | See below — this is the decision I would defend hardest. |

### Holding a scope line, then rejecting the obvious fix

Late in testing, a review flagged a real defect in the telemetry: the `learn_card_slug` property on the nudge events was carrying route sentinels rather than genuine content slugs, diluting the field. The obvious fix — the one assumed when the finding was first logged — was to add emergency-fund and term-insurance learn-cards, taking the library from 30 to 32, and point the offending nudges at them.

I rejected it for two reasons.

The **measured** one: it would not have worked. Only one of six nudge destinations resolves to an instrument page at all; the other five navigate to `/portfolio`, `/profile` and `/explore`. Adding two cards would have converted exactly one sentinel and left four, so the field would still have needed a hardcoded route list to interpret. The fix was intuitive and wrong, and checking cost ten minutes.

The **structural** one: neither concept is an asset class. The library's six categories are an investment taxonomy. Term insurance is a protection product, already modelled in its own `protection` table; an emergency fund is a *purpose* attached to a holding, already modelled as an `is_emergency_fund` flag. Forcing both into the instrument taxonomy would have bent the domain model to serve an analytics field. The actual fix was smaller and honest: add a `target_type` property (`'learn_card' | 'route'`) sourced from a single `NUDGE_TARGET` map, so the telemetry describes what the destination genuinely is.

Scope had already been defended once here — 30 instruments was itself the middle option, chosen over 40 because it covers every instrument in a real validated household while staying finishable inside the kill criterion. The lesson worth stating: an analytics requirement is not a licence to reshape the domain model, and "add content until the field looks clean" is a scope increase wearing a bug fix's clothes.

### The bug 294 passing tests did not catch

The most instructive thing that happened on this project is B-001.

The Slice 7 nudge card — the single prioritised next step, the feature that closes the loop from "what's missing" to "go learn about it" — **never rendered in production.** Not once. The spec says exactly one nudge, never zero. Live, there were zero. A user signing in saw the allocation donut, then the install card, and nothing in between.

Every test was green. All 294 of them.

The cause was two well-tested units and one untested seam between them. `getDashboard()` computed the nudge correctly, and had a test proving it. `NudgeCard` rendered a nudge correctly, and had a test proving it — fed one directly. In between, `server/routes/dashboard.ts` hand-picked the response fields and simply omitted `nudge`. Nothing asserted that the route's serialised response carried what the function returned. The frontend then degraded silently when `nudge` was absent, so there was no crash, no console error, no Sentry event — nothing to notice.

Three things I took from it:

1. **Coverage of units is not coverage of the system.** Both sides of the seam were tested; the seam was the whole product surface. Hand-picking fields in a serialiser is exactly where a contract quietly diverges from its test.
2. **Graceful degradation is a monitoring hazard.** The frontend's defensive "render nothing if absent" is good code that turned a broken feature into an invisible one. Silent fallbacks need an accompanying alarm.
3. **Nothing replaced a human clicking through the live app.** Automated verification could not reach the auth-gated flows on this project — Clerk's sign-up sits behind a Cloudflare Turnstile that blocks headless automation, and I ruled defeating it out of bounds. A manual click-through of the deployed build caught in one session what a full green suite had missed for days.

The fix was one line of route code. The durable output was the regression test that should have existed: an integration test asserting the route always forwards a nudge in its response, never zero — written RED against both a zero-member and a full-coverage fixture before the fix went in.

## Architecture

```
  Browser (installable PWA)
  ┌──────────────────────────────────────────┐
  │  Vite + React + TS · Tailwind + shadcn   │
  │  Recharts (allocation donut)             │
  │  Service worker: precached library +     │
  │  library + /why (read-only offline)      │
  └───────────────┬──────────────────────────┘
                  │  HTTPS /api/*
                  ▼
  ┌──────────────────────────────────────────┐        ┌───────────┐
  │  Hono API on Vercel Functions            │◄──────►│  Clerk    │
  │  Session → household_id scoping on every │  JWT   │  (auth)   │
  │  request (app-layer multi-tenancy)       │  JWKS  └───────────┘
  └───────────────┬──────────────────────────┘
                  │  Drizzle ORM
                  ▼
  ┌──────────────────────────────────────────┐
  │  Neon serverless Postgres (7 tables)     │
  │  households · family_members · holdings ·│
  │  protection · instruments · goals ·      │
  │  analytics_events                        │
  └──────────────────────────────────────────┘

  Cross-cutting: one track() wrapper → PostHog (funnels, retention,
                 North Star). Sentry for client errors.
```

Two boundary choices worth naming. **Multi-tenancy is enforced in the application layer**, not Postgres row-level security — every request resolves `household_id` from the verified session before it touches data. **Session verification is hand-rolled JWT checking against Clerk's JWKS** rather than the official middleware, because that middleware hits an unresolved Vercel Edge bundler failure; the constraint is documented in the repo so the next person does not rediscover it the hard way.

## What I'd do differently

**Test the seams first, not the units first.** The one bug that reached production lived in the gap between two things I had tested well. On the next project the integration test that asserts a route's actual response shape gets written before the unit tests on either side of it — it is the cheaper test and it catches the more expensive class of bug.

**Book the human verification pass into the plan, not the end of it.** Because the auth-gated flows could not be automated, live click-through was always going to be mandatory, and treating it as a final step rather than a per-slice gate is what let B-001 sit in production. Several slices still await their human click-through for exactly this reason.

## Metrics

**No post-launch numbers yet.** The product is live but unmarketed, with no real user cohort, so reporting funnel percentages here would be reporting noise. The instrumentation is in place and the targets were set before launch — deliberately conservative, per D-006 — so they can be honestly cleared or missed:

| Metric | Target | Status |
|---|---|---|
| North Star — households raising Completeness tier by ≥1 within 30 days | 50% | Awaiting first cohort |
| Onboarding completion (all 3 steps, first session) | 60% | Awaiting first cohort |
| 14-day return rate | 25% | Awaiting first cohort |
| Nudge click-through (`nudge_shown` → `learn_card_clicked`) | Research question, no target | Awaiting first cohort |

What *is* measured today is build quality: 310/310 tests passing, clean typecheck and build, zero axe accessibility violations on all five screens in production, and ₹0/month infrastructure spend against a ₹0 ceiling.
