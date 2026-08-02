# Household Financial Planning PWA — Claude Code Context

> Project-level CLAUDE.md. The global CLAUDE.md handles judgment; this file holds project facts.

## What this is
A public PWA for Indian households to learn what financial instruments exist, record what they actually hold across family members, and see household-level plan gaps via a scored Household Health panel. Core loop: 3-step onboarding (household → members → holdings) → personal dashboard (allocation donut + Health tier + 1 nudge). Also a PM portfolio piece — craft + architecture are the recruiter signal.

## Framework state
- **Framework:** Blueprint (rubric 3/5, locked 2026-06-13 — see `FRAMEWORK.md`)
- **Current phase:** 4 Slice execution — **COMPLETE. All 11 slices (0–10) built + deployed** as of 2026-07-21. Slice 10 (the last — `/why` page + accessibility pass) shipped `63e9f5f`. Next is Phase 5/6 (Testing / Ship gate), which for this project reduces to the human-gated verification items below — there is no more slice development.
- **Gate status (2026-08-02):** suite **908/908 across 75 files** at `abe3cce` on **`origin/e2ee-wip`** — typecheck, `npm run build` and `check_events.py` clean. `main`/production is unchanged at `719d022`; the encryption branch is not promoted (see the Framework state note below and D-014). The rest of this bullet describes the state at the 2026-08-01 ship gate and is kept for history — **the "311/311 across 42 files" figure below is superseded.**
- **Historic gate status:** Feature-complete and live at HEAD `d169993`; suite **311/311** across 42 files, typecheck / `check_events.py` / `npm run build` clean (re-measured 2026-07-29 — this line previously read "HEAD `27cd666`, suite 300/300", which had been stale since the B-004 flaky-test fix took the suite from 303 to 310). **2026-07-21 live human/browser click-through** (driven through Gaurav's real signed-in Chrome, which bypasses the Turnstile-on-signup wall) verified the deployed slices and **caught + fixed a shipped P1 bug, B-001**: `server/routes/dashboard.ts` dropped `result.nudge` from the response, so the Slice 7 nudge card rendered nowhere despite 294 green tests (the route→response seam was never asserted) — fixed `6e8ff4e`, live-verified. Accessibility: all 5 screens (`/why`, `/explore`, `/dashboard`, `/portfolio`, `/profile`) scan **0 axe violations** live (fixed contrast, focus rings, 44px targets, reduced-motion, + 2 Recharts-donut fixes `3ff9e42`/`9db5d5c`). **2026-08-01 — the big close-out session. Read this before assuming anything above is current.**

- **Live at `https://finance.gauravg.dev`.** Domain `gauravg.dev` registered at Cloudflare; the app is a subdomain, the apex is reserved for the portfolio. The old `household-financial-pwa.vercel.app` **308-redirects permanently, path preserved, and is kept forever** because it was shared with recruiters. DNS lives at Cloudflare deliberately, not inside Vercel, because the same domain serves Vercel, Cloudflare and the Oracle VM.
- **Finding 2 CLOSED.** Production runs `pk_live`, verified by reading the deployed bundle, not the dashboard. It sat open for weeks because Clerk production instances need DNS records and `*.vercel.app` cannot take custom DNS — so it was never a dashboard toggle. Clerk is configured as a **secondary** application, putting its records under `clerk.finance.gauravg.dev` and leaving the apex free. `server/lib/auth.ts` needed no change; it derives the JWKS URL from the publishable key. Google SSO required its own OAuth credentials (dev instances use Clerk's shared ones) and is configured and proven against Google's own consent screen.
- **Rollback rehearsal done and timed** (8s to CLI success, serving within 13s). It exposed a trap now in `RUNBOOK.md`: **after an Instant Rollback, Vercel stops auto-promoting** — the next push builds green, reports Ready, and never goes live. `vercel promote` is mandatory after any rollback.
- **Two false claims found and corrected, both by finally running verification that had been outstanding:** **D-012** — the internal `analytics_events` sink from D-005 was never built; `track()` only calls PostHog. **D-013** — the offline dashboard never worked (**B-005**): Clerk's library loads from a remote script, so offline there is no session and the authenticated shell renders nothing. `/why` renders fine offline, which isolates it. Offline is now scoped to the library and `/why`, which are genuinely verified.
- **Still owed:** (1) **Slice 9 steps 9–12**, ending in the destructive delete — the only end-to-end test of the production webhook. (2) **Neon restore rehearsal** — Free plan confirmed (6h window, 1 GB); the first attempt was vacuous because the DB had not changed in four days, and must be redone against a pre-2026-08-01 timestamp. (3) **`CASE_STUDY.md` sign-off** — it has its hero screenshot now. (4) Slices 2/4/5 click-throughs remain nominally owed, but 2 and 4 were walked end-to-end during this session's onboarding and 5 during protection entry.
- **Next cycle, agreed 2026-08-01:** design rework and a real landing page showing features. New build work, not close-out — scope it fresh, do not fold it into this gate.
- **Vercel routing limitation (found 2026-07-11):** this project's zero-config Vercel build (`framework: vite`) only routes single-path-segment `/api/*` requests to the `api/[[...route]].ts` catch-all function — any second path segment 404s at the platform level before reaching Hono (confirmed via `vercel build`'s `.vercel/output/config.json`). Pre-existing on every route, not new — just never exercised until Slice 3's instrument-detail lookup. Workaround in place: use query params (`?slug=`), not path segments (`/:slug`), for anything beyond a flat resource root. Revisit before Slice 4 if holdings CRUD wants a `/api/holdings/:id` shape — either keep using query params or fix this properly with an explicit `vercel.json` rewrite.
- **Kill criterion:** Slice 0 deployed 2026-07-10 — **met**, 13 days ahead of the 2026-07-23 deadline
- **Live infra:** GitHub `argaur/household-financial-pwa` (public) · Vercel project `household-financial-pwa` (team `argaurs-projects`) · Neon Postgres (auto-provisioned via Vercel Marketplace, 7-table schema migrated) · PostHog (shared "Default project" in org `personal-lab-0p`) · Sentry (project `household-financial-pwa` in org `personal-lab-0p`, DSN configured) · Clerk (application created, keys in Vercel Production env)
- **Auth implementation note:** Session verification uses manual JWT checking via `jose` against Clerk's JWKS (`server/lib/auth.ts`), not `@hono/clerk-auth`/`@clerk/backend` — that combination hits an unresolved Vercel Edge Function bundler bug ("referencing unsupported modules: @clerk: #crypto") across multiple Clerk package versions. Do not reintroduce `@hono/clerk-auth` without re-testing an actual Vercel deploy first.
- **Directory convention:** only `api/[[...route]].ts` lives under `api/` — Vercel treats every file directly under `api/` as its own deployable Function regardless of whether anything imports it. All Hono app code, routes, lib, and server-side tests live in `server/`.
- **Test/E2E note:** Clerk's sign-up screen on this instance is gated by a Cloudflare Turnstile bot-check, which blocks headless Playwright automation (same class of issue as Slice 0's PostHog bot-detection). Automated verification relies on unit/integration tests against the real Hono app with a mocked session; live click-through verification of any auth-gated flow needs a human. Do not attempt to defeat the Turnstile check programmatically.
- **Parallel-agent note (2026-07-10):** Background subagents draw from the same account spend limit as the main session — dispatching multiple heavy agents in parallel can exhaust it mid-task with no warning, leaving uncommitted/partially-typed work in a worktree. If retrying parallel slice development, check remaining budget first, and always run `npm run typecheck` on an agent's work before trusting it (vitest doesn't type-check by default — a died-mid-task agent's code passed all its own unit tests while failing `tsc`).
- **Known gaps:** Vercel Preview-environment env vars (Clerk, Sentry) not yet set — Production only. `signup_failed`/`login_failed` analytics events unimplemented (Clerk's prebuilt UI has no failure callback without a custom auth form). Server-side Sentry error capture still deferred — only the client is wired (`server/app.ts:14`).

## Architecture
Vite + React SPA ↔ Hono API (Vercel Functions) ↔ Drizzle ORM ↔ Neon Postgres. Clerk for auth. PWA shell via vite-plugin-pwa — **library and `/why` are offline-capable; the authenticated dashboard is not** (B-005: Clerk's library loads from a remote script, so offline there is no session; scope corrected in D-013). PostHog for analytics; Sentry for errors. The `analytics_events` table exists in the schema but **nothing writes to it** — D-005 planned a dual sink, it was never built, and D-012 supersedes it.

## Stack
Vite + React + TypeScript + Tailwind + shadcn/ui + Recharts (frontend) · Hono on Vercel Functions (API) · Drizzle (ORM) · Neon (DB) · Clerk (auth) · PostHog + Sentry.

## Key constraints
- Education, not advice — nudges/content are observational only, link to learn-cards, never buy actions (regulatory line, not style)
- Manual value entry only in v1 — no live price feeds (mfapi.in/CoinGecko/gold cut, see `DECISIONS_LOG.md` D-002)
- Public repo — never commit/seed real household financial data, synthetic sample data only
- Single editor per household in v1
- Mobile-first breakpoints confirmed (Phase 2 Stage 0, 2026-07-02): 390px / 768px / 1280px
- Multi-tenancy: app-layer scoping (Hono resolves `household_id` from Clerk session per request, no Postgres RLS)
- Data retention: hard delete cascade on Clerk `user.deleted` webhook
- Concurrency: last-write-wins

## Source of truth
- Scope: `Documentation/solution/SOLUTION_BRIEF.md` — design does not re-litigate
- Decisions: `Documentation/solution/DECISIONS_LOG.md` — re-anchor here after /compact
- Progress: `Documentation/plan/PROGRESS.md` — 5 lines per slice boundary
- Events: `Documentation/solution/METRICS_PLAN.md` ↔ analytics registry, same commit

## Do not
- Skip a phase gate or auto-advance ("looks good" ≠ "approved")
- Absorb scope mid-slice — route back to Solution Stage
- Commit a slice that hasn't been smoke-run in the live app
