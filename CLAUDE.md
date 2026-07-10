# Household Financial Planning PWA — Claude Code Context

> Project-level CLAUDE.md. The global CLAUDE.md handles judgment; this file holds project facts.

## What this is
A public PWA for Indian households to learn what financial instruments exist, record what they actually hold across family members, and see household-level plan gaps via a scored Household Health panel. Core loop: 3-step onboarding (household → members → holdings) → personal dashboard (allocation donut + Health tier + 1 nudge). Also a PM portfolio piece — craft + architecture are the recruiter signal.

## Framework state
- **Framework:** Blueprint (rubric 3/5, locked 2026-06-13 — see `FRAMEWORK.md`)
- **Current phase:** 4 Slice execution — Slice 1 (Auth + household creation) shipped and deployed 2026-07-10
- **Gate status:** Slice 1 live at https://household-financial-pwa.vercel.app — next up is Slice 2 (Family members CRUD / Onboarding Step 2)
- **Kill criterion:** Slice 0 deployed 2026-07-10 — **met**, 13 days ahead of the 2026-07-23 deadline
- **Live infra:** GitHub `argaur/household-financial-pwa` (public) · Vercel project `household-financial-pwa` (team `argaurs-projects`) · Neon Postgres (auto-provisioned via Vercel Marketplace, 7-table schema migrated) · PostHog (shared "Default project" in org `personal-lab-0p`) · Sentry (project `household-financial-pwa` in org `personal-lab-0p`, DSN configured) · Clerk (application created, keys in Vercel Production env)
- **Auth implementation note:** Session verification uses manual JWT checking via `jose` against Clerk's JWKS (`server/lib/auth.ts`), not `@hono/clerk-auth`/`@clerk/backend` — that combination hits an unresolved Vercel Edge Function bundler bug ("referencing unsupported modules: @clerk: #crypto") across multiple Clerk package versions. Do not reintroduce `@hono/clerk-auth` without re-testing an actual Vercel deploy first.
- **Directory convention:** only `api/[[...route]].ts` lives under `api/` — Vercel treats every file directly under `api/` as its own deployable Function regardless of whether anything imports it. All Hono app code, routes, lib, and server-side tests live in `server/`.
- **Known gaps:** Vercel Preview-environment env vars (Clerk, Sentry) not yet set — Production only. `signup_failed`/`login_failed` analytics events unimplemented (Clerk's prebuilt UI has no failure callback without a custom auth form).

## Architecture
Vite + React SPA ↔ Hono API (Vercel Functions) ↔ Drizzle ORM ↔ Neon Postgres. Clerk for auth. PWA shell via vite-plugin-pwa (precached library + last-known dashboard, read-only offline). PostHog + internal `analytics_events` table for analytics; Sentry for errors.

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
