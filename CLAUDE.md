# Household Financial Planning PWA — Claude Code Context

> Project-level CLAUDE.md. The global CLAUDE.md handles judgment; this file holds project facts.

## What this is
A public PWA for Indian households to learn what financial instruments exist, record what they actually hold across family members, and see household-level plan gaps via a scored Household Health panel. Core loop: 3-step onboarding (household → members → holdings) → personal dashboard (allocation donut + Health tier + 1 nudge). Also a PM portfolio piece — craft + architecture are the recruiter signal.

## Framework state
- **Framework:** Blueprint (rubric 3/5, locked 2026-06-13 — see `FRAMEWORK.md`)
- **Current phase:** 4 Slice execution — **COMPLETE. All 11 slices (0–10) built + deployed** as of 2026-07-21. Slice 10 (the last — `/why` page + accessibility pass) shipped `63e9f5f`. Next is Phase 5/6 (Testing / Ship gate), which for this project reduces to the human-gated verification items below — there is no more slice development.
- **Gate status:** Feature-complete and live at HEAD `93bbe5f`; suite **310/310** across 42 files, typecheck / `check_events.py` / `npm run build` clean (re-measured 2026-07-29 — this line previously read "HEAD `27cd666`, suite 300/300", which had been stale since the B-004 flaky-test fix took the suite from 303 to 310). **2026-07-21 live human/browser click-through** (driven through Gaurav's real signed-in Chrome, which bypasses the Turnstile-on-signup wall) verified the deployed slices and **caught + fixed a shipped P1 bug, B-001**: `server/routes/dashboard.ts` dropped `result.nudge` from the response, so the Slice 7 nudge card rendered nowhere despite 294 green tests (the route→response seam was never asserted) — fixed `6e8ff4e`, live-verified. Accessibility: all 5 screens (`/why`, `/explore`, `/dashboard`, `/portfolio`, `/profile`) scan **0 axe violations** live (fixed contrast, focus rings, 44px targets, reduced-motion, + 2 Recharts-donut fixes `3ff9e42`/`9db5d5c`). **Still owed (all human-gated — Claude has exhausted the autonomous work):** (1) human click-throughs for Slices 2/4 (fresh account past Turnstile → pristine onboarding), 5 (add-protection), 8 (offline steps 6–12), 9 (destructive — disposable account); scripts in `Documentation/testing/ACCEPTANCE_CRITERIA.md`. (2) Two manual Clerk-dashboard steps for account deletion (webhook + `CLERK_WEBHOOK_SECRET`, enable self-service delete). (3) **Finding 2** — production runs Clerk **development** keys; needs a prod instance + `pk_live`/`sk_live` in Vercel Production env.
- **Vercel routing limitation (found 2026-07-11):** this project's zero-config Vercel build (`framework: vite`) only routes single-path-segment `/api/*` requests to the `api/[[...route]].ts` catch-all function — any second path segment 404s at the platform level before reaching Hono (confirmed via `vercel build`'s `.vercel/output/config.json`). Pre-existing on every route, not new — just never exercised until Slice 3's instrument-detail lookup. Workaround in place: use query params (`?slug=`), not path segments (`/:slug`), for anything beyond a flat resource root. Revisit before Slice 4 if holdings CRUD wants a `/api/holdings/:id` shape — either keep using query params or fix this properly with an explicit `vercel.json` rewrite.
- **Kill criterion:** Slice 0 deployed 2026-07-10 — **met**, 13 days ahead of the 2026-07-23 deadline
- **Live infra:** GitHub `argaur/household-financial-pwa` (public) · Vercel project `household-financial-pwa` (team `argaurs-projects`) · Neon Postgres (auto-provisioned via Vercel Marketplace, 7-table schema migrated) · PostHog (shared "Default project" in org `personal-lab-0p`) · Sentry (project `household-financial-pwa` in org `personal-lab-0p`, DSN configured) · Clerk (application created, keys in Vercel Production env)
- **Auth implementation note:** Session verification uses manual JWT checking via `jose` against Clerk's JWKS (`server/lib/auth.ts`), not `@hono/clerk-auth`/`@clerk/backend` — that combination hits an unresolved Vercel Edge Function bundler bug ("referencing unsupported modules: @clerk: #crypto") across multiple Clerk package versions. Do not reintroduce `@hono/clerk-auth` without re-testing an actual Vercel deploy first.
- **Directory convention:** only `api/[[...route]].ts` lives under `api/` — Vercel treats every file directly under `api/` as its own deployable Function regardless of whether anything imports it. All Hono app code, routes, lib, and server-side tests live in `server/`.
- **Test/E2E note:** Clerk's sign-up screen on this instance is gated by a Cloudflare Turnstile bot-check, which blocks headless Playwright automation (same class of issue as Slice 0's PostHog bot-detection). Automated verification relies on unit/integration tests against the real Hono app with a mocked session; live click-through verification of any auth-gated flow needs a human. Do not attempt to defeat the Turnstile check programmatically.
- **Parallel-agent note (2026-07-10):** Background subagents draw from the same account spend limit as the main session — dispatching multiple heavy agents in parallel can exhaust it mid-task with no warning, leaving uncommitted/partially-typed work in a worktree. If retrying parallel slice development, check remaining budget first, and always run `npm run typecheck` on an agent's work before trusting it (vitest doesn't type-check by default — a died-mid-task agent's code passed all its own unit tests while failing `tsc`).
- **Known gaps:** Vercel Preview-environment env vars (Clerk, Sentry) not yet set — Production only. `signup_failed`/`login_failed` analytics events unimplemented (Clerk's prebuilt UI has no failure callback without a custom auth form). Server-side Sentry error capture still deferred — only the client is wired (`server/app.ts:14`).

## Architecture
Vite + React SPA ↔ Hono API (Vercel Functions) ↔ Drizzle ORM ↔ Neon Postgres. Clerk for auth. PWA shell via vite-plugin-pwa (precached library + last-known dashboard, read-only offline). PostHog for analytics; Sentry for errors. The `analytics_events` table exists in the schema but **nothing writes to it** — D-005 planned a dual sink, it was never built, and D-012 supersedes it.

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
