# Household Financial Planning PWA — Claude Code Context

> Project-level CLAUDE.md. The global CLAUDE.md handles judgment; this file holds project facts.

## What this is
A public PWA for Indian households to learn what financial instruments exist, record what they actually hold across family members, and see household-level plan gaps via a scored Household Health panel. Core loop: 3-step onboarding (household → members → holdings) → personal dashboard (allocation donut + Health tier + 1 nudge). Also a PM portfolio piece — craft + architecture are the recruiter signal.

## Framework state
- **Framework:** Blueprint (rubric 3/5, locked 2026-06-13 — see `FRAMEWORK.md`)
- **Current phase:** 4 Slice execution — **COMPLETE**, shipped 2026-08-01, encryption shipped 2026-08-05, public surface redesigned and re-shipped 2026-08-12. No slice development remains for v1; the app is in ongoing iteration, not initial build. **A new feature cycle (D-016/D-017/D-018) is mid-framework as of 2026-08-17**: Phase 0 (intake) and Phase 1 (Solution Stage) both passed their gates, Phase 2 (Design) is next, not started. See `Documentation/solution/DECISIONS_LOG.md` D-016 through D-018.
- **Product name: Vittam** (Sanskrit for wealth), locked 2026-08-12. See `Documentation/brand/brand-guide.md` §1.
- **Gate status (2026-08-12):** suite **978/978** at `1b77ef2` on **`main`**, typecheck clean, live at `https://finance.gauravg.dev`, `db:seed` re-run and verified against the live API. This is the current gate. **This block was stale from roughly 2026-08-05 to 2026-08-12** — two prior sessions narrated CLAUDE.md updates in `memory/project.md` that were never actually committed (last commit touching this file before now was `bd9ce2f`). Do not trust a memory narrative's claim that this file was updated; check `git log -- CLAUDE.md` directly.
- **2026-08-12: whole public surface redesigned.** Landing page rebuilt, product named and branded (new favicon/app icon/logo/wordmark font, all sharing one source shape), `/why` restructured with jargon translated inline, Explore/LibrarySection/InstrumentDetail redesigned to a noob-friendly bar including the seeded instrument content itself. Signed-in app screens (Dashboard, Portfolio, Profile, onboarding, KeySetup, Unlock) untouched, out of scope for this pass. Full detail: `memory/session-2026-08-12.md` (project-root memory, not this folder).
- **2026-08-05: client-side encryption shipped (D-014/D-015).** Household data encrypted in the browser; server holds ciphertext and two wrapped key copies it cannot open. Verified at wire, database, and key level. No migration path for pre-encryption rows, by decision — 2 legacy plaintext households were backed up and deleted rather than migrated.
- **2026-08-06: the "stale load after every deploy" defect closed.** Root cause was never a caching-strategy problem: `vite-plugin-pwa` fell back to a bare `registerSW.js` with no update handling because nothing imported `virtual:pwa-register`. Fix was importing it in `main.tsx`, four lines. See `pwa-registration.config.test.ts` for the regression pin and the trap it guards (`injectRegister: false` in `vite.config.ts` looks like the fix and silently makes it worse).
- **Historic:** Feature-complete and live at HEAD `d169993` (2026-08-01 ship gate); suite 311/311 at the time. 2026-07-21 live click-through caught and fixed shipped P1 **B-001** (a dropped API field 294 green tests had missed). Full history in `memory/session-2026-08-0*.md` files (project-root memory).
- **Live at `https://finance.gauravg.dev`.** Domain `gauravg.dev` registered at Cloudflare; the app is a subdomain, the apex is reserved for the portfolio. The old `household-financial-pwa.vercel.app` **308-redirects permanently, path preserved, and is kept forever** because it was shared with recruiters. DNS lives at Cloudflare deliberately, not inside Vercel, because the same domain serves Vercel, Cloudflare and the Oracle VM.
- **Rollback rehearsal done and timed** (8s to CLI success, serving within 13s). It exposed a trap now in `RUNBOOK.md`: **after an Instant Rollback, Vercel stops auto-promoting** — the next push builds green, reports Ready, and never goes live. `vercel promote` is mandatory after any rollback.
- **Promotion to `main` is always explicit** (`git push origin <branch>:main`), never a bare push, because `main` auto-deploys to production. Verify a promotion actually landed via `/api/health`'s `commit_sha`, never assume from the push succeeding — this project has repeatedly found "pushed" and "deployed" are not the same claim.
- **Still owed:** Mobile width (390px) not independently re-screenshotted on the 2026-08-12 Explore/LibrarySection/InstrumentDetail redesign. A 2026-08-17 static audit found no hazard (mobile-first single column, `min-w-0` where it matters, 358px content width at 390px, longest unbroken seeded word is 14 characters against a fixed 32px `text-display`) — but reading classes is not looking at the screen, so this stays open. Blocked on the Chrome extension being connected; there is no Playwright or Puppeteer in this repo to fall back on. ~~Orphaned git worktree `agent-aa61ad45279b28a1f`~~ **removed 2026-08-17** after verifying it held no unique commits and that its uncommitted `site-header` WIP was fully superseded by `main`. Neon restore rehearsal against a pre-2026-08-01 timestamp still owed (the first attempt was vacuous, DB hadn't changed in 4 days). SEC-001 rate limiting is an honest FAIL, trigger = first real traffic or any Neon quota warning.
- **Vercel routing limitation (found 2026-07-11):** this project's zero-config Vercel build (`framework: vite`) only routes single-path-segment `/api/*` requests to the `api/[[...route]].ts` catch-all function — any second path segment 404s at the platform level before reaching Hono (confirmed via `vercel build`'s `.vercel/output/config.json`). Workaround in place: use query params (`?slug=`), not path segments (`/:slug`), for anything beyond a flat resource root.
- **Kill criterion:** Slice 0 deployed 2026-07-10 — **met**, 13 days ahead of the 2026-07-23 deadline
**Deploy target**: Vercel project `household-financial-pwa` — projectId `prj_oxXer9gsia37CTH29I018gz8yNUs`, orgId `team_3VVVuqz6VHXjBQCANdWIY7OF` (team `argaurs-projects`). **Runtime: `edge`** — set in `api/[[...route]].ts` and not a free choice: `hono/vercel`'s handler is Web fetch-style (Request → Response), and `runtime: 'nodejs'` silently drops the Response (Vercel logs "default export returned a Response" and the request hangs to timeout). Build uses Node `24.x`, framework `vite`, output `dist`. Read from `.vercel/project.json` and the api entry on 2026-08-05, not assumed.
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
