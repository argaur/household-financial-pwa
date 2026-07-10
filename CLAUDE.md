# Household Financial Planning PWA — Claude Code Context

> Project-level CLAUDE.md. The global CLAUDE.md handles judgment; this file holds project facts.

## What this is
A public PWA for Indian households to learn what financial instruments exist, record what they actually hold across family members, and see household-level plan gaps via a scored Household Health panel. Core loop: 3-step onboarding (household → members → holdings) → personal dashboard (allocation donut + Health tier + 1 nudge). Also a PM portfolio piece — craft + architecture are the recruiter signal.

## Framework state
- **Framework:** Blueprint (rubric 3/5, locked 2026-06-13 — see `FRAMEWORK.md`)
- **Current phase:** 3 Plan — complete ("Plan approved" 2026-07-10, Gaurav authorized session-level autonomous decision-making)
- **Gate status:** Plan approved 2026-07-10 — next gate is Phase 4 Slice execution (`/slice`), starting with Slice 0 (Walking Skeleton)
- **Kill criterion:** If Slice 0 (onboarding → dashboard, deployed end-to-end) isn't deployed by **2026-07-23** → descope to Builder OS

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
