# Solution Brief — Household Financial Planning PWA

**Date:** 2026-06-23
**Status:** Solution Approved (2026-06-23) — Phase 1 complete. Next: Phase 2 (Design).

---

## PRD Read-Back

1. **Problem:** Indian households have no single place to learn what financial instruments exist across asset classes, record what they actually hold across family members, and see household-level plan gaps — existing tools are single-account trackers or generic robo-advisors, never both education-first and household-level.
2. **Target user:** Indian retail investors/households who are literate enough to want to track real holdings but lack a consolidated, education-first view of their household's complete financial picture (modeled initially on Gaurav's own family: self, spouse, child).
3. **Success criteria:** Onboarding completion, return-visit retention, Household Portfolio Completeness Score growth, and demo-household engagement — see falsifiable rewrite below; none currently has a numeric target set.
4. **Hard constraints:** Education-not-advice wording only (regulatory line, not style); real auth required (stores household PII); mobile-first PWA; public product (must handle real households, not just Gaurav's data shape); single editor per household in v1.
5. **Explicit non-goals (from PRD):** AI chat, statement import, net-worth-over-time, shared/multi-editor access, push notifications, admin CMS, payments/billing, dedicated goal-planning UI.

**Falsifiable success criteria** (every criterion rewritten as `X% of [user] will [action] within [timeframe]`; anything that can't be made falsifiable is flagged as a non-goal or research question — never left vague):

| # | Original criterion (from PRD) | Falsifiable form | Measured by (event/metric) |
|---|---|---|---|
| 1 | Users complete onboarding without abandoning | **60%** of users who start onboarding will complete all 3 steps (household → members → holdings) within their first session | `onboarding_started` → `onboarding_completed` funnel in `analytics_events` + PostHog |
| 2 | Users return to update holdings or check nudges | **25%** of users who complete onboarding will return at least once within 14 days | Distinct `session_started` events per `user_id` with a 14-day gap check |
| 3 | Completeness Score increases as users add data | **50%** of households will increase their Completeness Score by ≥1 tier within 30 days of signup | `completeness_score_changed` event, before/after tier |
| 4 | ~~Demo-household lets a visitor experience value with zero entry~~ | Cut — demo-household button removed from v1 (Phase 1, Q3) | n/a |

**Resolved in Phase 1 interview (2026-06-23):**

- Numeric targets set above (60% / 25% / 50%) — deliberately conservative; this is an unmarketed v1 with no prior data.
- Completeness Score = fixed 5-check, equal-weight checklist (household coverage, emergency-fund-equivalent holding, both parents' protection logged, ≥3 of 6 asset classes held, all holdings have `current_value` set) → tier (0–1 Getting Started / 2–3 On Track / 4–5 Strong).
- Nudge logic = single inline nudge showing the first unmet check in the fixed order above, linking to its learn-card. Deterministic, no weighting/tuning needed.
- Instrument library = 6 sections × 5 instruments = 30 total (Equity, Debt, Gold, Hybrid/Guaranteed, Real Estate, Alternative) — validated against Gaurav's own real holdings so no asset class in his actual plan is unrepresentable.
- Budget ceiling = ₹0/month target (free tiers only); kill criterion = 30 days to deploy Slice 0.
- Repo visibility = public.
- Auto-pricing (mfapi.in/CoinGecko/gold) and the price-freshness-SLA ambiguity are both moot — manual value entry only in v1, no live price feeds.
- Demo-household ephemeral-vs-persisted ambiguity is moot — feature cut entirely.

**Still open (carried to DEFERRED Items below):**

- Multi-tenancy/data-isolation is implied by Clerk + per-household schema but has no explicit enforcement spec (e.g., row-level security vs. application-layer scoping) — a Phase 2 design decision, not a product-scope one.
- Data retention/deletion policy on account deletion is undecided.
- Concurrent-session behavior (same user, two devices) defaults to last-write-wins by omission — not explicitly chosen.
- "Mobile-first" breakpoint target (assumed 390px per global default) not explicitly confirmed for this project.

---

## Prior Art & Steal List

| Product | What it solved | Mechanic to steal | Where it applies in v1 |
|---|---|---|---|
| INDmoney | Consolidated net-worth view across many Indian + global asset classes in one dashboard | Single hero "everything in one view" dashboard pulling disparate asset classes (MF, FD, stocks, etc.) into one allocation visualization | Asset-class allocation donut (hero widget) on the Portfolio tab |
| Monarch Money (and the late Mint) | Guided onboarding that gets a new user to their "aha" moment (seeing full net worth) fast, with minimal friction | Linear, fact-only guided onboarding (3 short steps, no decisions deferred) before showing any dashboard | The household → members → holdings → dashboard onboarding flow |
| Kuvera / Groww | SIP tracking and reminders for recurring Indian MF investments | In-app SIP calendar as a lightweight, ownable substitute for push notifications | v1's "in-app SIP calendar instead of push notifications" decision |
| Duolingo | Turns a literacy/learning journey into a habit via a single visible health/streak score | A single scored "health" metric users want to watch increase, driving return visits without nagging | Household Portfolio Completeness Score + Household Health panel |
| NerdWallet | Marries financial education content directly to specific user situations without selling product | Short, situational "learn-card" content tied 1:1 to a nudge, with zero embedded buy/sell CTAs | Nudge → learn-card linking, enforcing the education-not-advice constraint |

---

## Core User Journey

A new user completes a 3-step, fact-only onboarding (household → members → first holding) and lands on a personal dashboard showing their real asset-class allocation, a Household Health tier, and one prioritized nudge — the instrument library is reached secondarily, never gating this path.

---

## v1 Feature List

| # | Feature | Why it's in v1 |
|---|---|---|
| 1 | 3-step guided onboarding (household → members → holdings) | The entire critical path to first value; locked Phase 1 Q1 |
| 2 | Manual holdings entry, kind-aware forms, all instrument types | Delivers the dashboard's core data without any external price-API dependency (Q2) |
| 3 | Portfolio dashboard — asset-class allocation donut (hero) | The "aha" moment of the core journey; what onboarding leads to |
| 4 | Household Health panel — 5-check completeness score + tier | Gives users a reason to return and a measurable North Star input (Q9) |
| 5 | Single ordered inline nudge → learn-card link | Closes the loop from "what's missing" to "go learn about it," enforcing education-not-advice (Q9) |
| 6 | Instrument library — 6 sections × 5 instruments (30 total) | Expresses the literacy half of the positioning at a bounded, finishable content scope (Q10) |
| 7 | Bottom tab nav (Home·Explore·Portfolio·Profile) + "+" FAB | Locked product navigation shape from the 2026-06-14 brainstorm |
| 8 | PWA shell (vite-plugin-pwa) — precached library + last-known dashboard | Locked offline/installability requirement; read-only, no write-queue |
| 9 | Custom PWA install prompt (post-activation) | Locked over native auto-prompt for UX control |
| 10 | "Why these choices?" in-app page | Recruiter/portfolio narrative surface (Q7 craft+architecture signal still benefits from this existing, even if not the primary pitch) |
| 11 | Global education-not-advice disclaimer + consent modal | Regulatory hard constraint, non-negotiable |
| 12 | Analytics: internal `analytics_events` table + PostHog | Both kept per Q5 — internal table for North Star funnel, PostHog for funnel/retention dashboards |
| 13 | Sentry error tracking | Default per template, no DIY substitute (Q5) |

---

## Explicit Non-Goals (v1)

| # | Not building | Why cut |
|---|---|---|
| 1 | Auto-price fetching (mfapi.in / CoinGecko / gold API) | Core loop doesn't need live prices; manual entry is sufficient for v1 (Q2) |
| 2 | Demo-household button / demo mode | Conflicts with the chosen holdings-first journey; real onboarding is fast enough to serve the same purpose (Q3) |
| 3 | AI chat / conversational interface | v2 — not needed for the literacy→tracking core loop |
| 4 | Bank/broker statement import | v2 — adds parsing/reconciliation complexity unneeded for manual-entry v1 |
| 5 | Net-worth-over-time charting | v2 — needs historical snapshots not captured in v1's schema |
| 6 | Shared/multi-editor household access | v2 — schema supports it, but v1 is single-editor only |
| 7 | Push notifications | v1 uses in-app SIP calendar instead |
| 8 | Admin CMS for instrument content | v1 content is curated JSON/MDX in-repo, edited via commits only |
| 9 | Payments / billing | Not a monetized product |
| 10 | Dedicated goal-planning UI | `goals` table exists (v1.5) but no UI in v1 |

---

## Technical Shape

| Decision | Choice | Rationale |
|---|---|---|
| Frontend | Vite + React + TypeScript + Tailwind + shadcn/ui + Recharts | Locked 2026-06-13 |
| API layer | Hono on Vercel Functions | Locked 2026-06-23 — lightweight, edge-compatible, pairs well with Drizzle |
| Database | Neon (serverless Postgres) | Locked 2026-06-14 — overridden from Supabase by Gaurav |
| ORM | Drizzle | Locked 2026-06-23 — lighter, faster cold starts on Vercel Functions hitting Neon vs. Prisma |
| Auth | Clerk | Locked 2026-06-23 — hosted UI fits a Vite SPA without a Next.js-specific auth library |
| Hosting | Frontend on Vercel; DB on Neon cloud | Locked 2026-06-14 |
| Repo visibility | **Public** | Locked Phase 1 Q4 — strongest portfolio signal; forces real secret/security hygiene now |

---

## Third-Party Services

| Service | Purpose | Cost | Lock-in risk | Decision |
|---|---|---|---|---|
| PostHog | Analytics (funnels/retention dashboards) | Free tier | Low (open source) | Kept alongside internal table (Q5) |
| Sentry | Error tracking | Free tier | Low | Default, no substitute (Q5) |
| Clerk | Auth | Free tier (10k MAU) | Medium (auth migration is non-trivial if ever swapped) | Locked Q-tech-decisions session |
| Neon | Database | Free tier | Medium (Postgres-compatible, but serverless-specific features add some lock-in) | Locked 2026-06-14 |
| Vercel | Hosting (frontend + API functions) | Free tier (Hobby) | Low (standard static+functions hosting) | Locked 2026-06-14 |

---

## Risk Register

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | Project stalls again (this is the third scope iteration: private viewer → public PWA → now scoped v1) | Medium — past-mistakes pattern of momentum loss across pivots | 30-day Slice 0 kill criterion forces a concrete deployed checkpoint instead of open-ended planning |
| 2 | Solo-developer bandwidth (competes with day job + household-plan work) | Medium | v1 scope deliberately cut to bounded content (30 instruments) and manual-entry-only data, no external API integration risk |
| 3 | Regulatory/compliance drift — nudge wording slips from educational into advisory over time | Low if disciplined, High impact if it happens | Education-not-advice is a hard constraint with disclaimer + consent modal; any nudge copy change should be checked against this before merge |
| 4 | Free-tier ceilings (Clerk 10k MAU, Neon/Vercel compute) hit unexpectedly if the portfolio piece gets real traffic | Low at v1 (no marketing push planned) | Clerk's free tier is the explicit first limiter to monitor; revisit budget if traffic grows |

**Cost & Kill budget** (mandatory — both numbers, no TBDs; also appended to `DECISIONS_LOG.md`):

| Budget | Value | Notes |
|---|---|---|
| Max monthly infra cost | ₹0/month target | Free tiers only across Neon, Vercel, Clerk, PostHog, Sentry. First service to hit its ceiling if usage grows: **Clerk** (10k MAU free tier) |
| Kill criterion | If Slice 0 (onboarding → dashboard, deployed end-to-end) isn't deployed within **30 days** → descope to Builder OS | Checked at every slice boundary |

---

## Recruiter Signal

This project demonstrates **craft and architecture**, not primarily the meta-narrative of product judgment (Phase 1 Q7: options B+C chosen over A). A hiring manager scanning in 60 seconds should see: (1) a polished, installable PWA with dark mode and a deliberate non-generic visual identity — evidence of design execution, not just functional UI; (2) a real multi-tenant backend (Hono + Drizzle + Neon + Clerk) handling actual household financial data with proper auth — evidence of backend architecture competence, not a frontend-only demo. The decision log and "Why these choices?" page still exist and remain inspectable, but they support the pitch rather than lead it.

---

## DEFERRED Items

| Item | Why deferred | Revisit before |
|---|---|---|
| Multi-tenancy/data-isolation enforcement mechanism (RLS vs. application-layer scoping) | Implementation-level design choice, not a product-scope decision | Phase 2 (Design) — `DATA_MODEL.md` |
| Data retention/deletion policy on account deletion | Not load-bearing for MVP feature set; needs a decision but doesn't block design | Phase 2, before auth/account-deletion flow is built |
| Concurrent-session behavior (same user, multiple devices) | No product decision made; defaults to last-write-wins by omission | Phase 2 — confirm explicitly rather than leaving implicit |
| Mobile-first breakpoint target | Assumed 390px (global CLAUDE.md default), not explicitly confirmed for this project | Phase 2 — `SPEC.md` |
