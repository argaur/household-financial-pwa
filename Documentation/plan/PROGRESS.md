# Progress — Household Financial Planning PWA

**Rule:** Exactly 5 lines per entry, written at every slice boundary BEFORE `/compact`. Newest entry on top. This is the context-reset anchor — Claude re-reads the top entry + `DECISIONS_LOG.md` before starting the next slice.

---

## 2026-07-10 — after Slice 1

1. **Slices done:** Slice 1 (Auth + household creation) — deployed and verified live.
2. **Current state:** Clerk sign-up/sign-in gates the app; a household row is created and scoped to the Clerk user server-side, proven via a two-user isolation integration test. Onboarding Step 1 (household name) is the only onboarding UI so far — Steps 2/3 come in Slices 2/4. Auth verification uses manual JWT checking via `jose` against Clerk's JWKS, not `@hono/clerk-auth`/`@clerk/backend` — that combination hit an unresolved Vercel Edge Function bundler bug ("referencing unsupported modules: @clerk: #crypto") across multiple Clerk package versions; `jose` (pure Web Crypto) sidesteps it entirely. Also discovered and fixed a latent issue dating to Slice 0: every file directly under `api/` (including `.test.ts` files) was being deployed as its own separate Vercel Function — moved all non-entrypoint code to `server/`, leaving `api/[[...route]].ts` as the sole entrypoint. Sentry DSN now configured (created directly in the Sentry dashboard as Owner — the org's "Let Members Create Projects" toggle is plan-gated/locked, and the Sentry MCP integration's token authenticates as a member regardless of dashboard role).
3. **Next slice:** Slice 2 — Family members CRUD (Onboarding Step 2). Riskiest assumption: the Slice 1 household-scoping pattern generalizes cleanly to a second resource without route-specific isolation bugs.
4. **Open decisions:** Vercel Preview-environment env vars (Clerk keys, Sentry DSN) are Production-only for now — the Vercel CLI's non-interactive preview-branch flow returned a self-contradictory `git_branch_required` loop; needs the dashboard or another CLI attempt. `signup_failed`/`login_failed` analytics events are deliberately unimplemented (Clerk's prebuilt sign-in/up components don't expose a failure callback without a fully custom auth form) — documented in `HOW_TO_USE.md`, revisit if a custom auth form is ever built for other reasons.
5. **Kill criterion check:** Slice 0 deployed 2026-07-10, well within the 2026-07-23 deadline. Slice 1 also shipped same-day. OK.

---

## 2026-07-10 — after Slice 0

1. **Slices done:** Slice 0 (Walking Skeleton) — deployed and verified live.
2. **Current state:** https://household-financial-pwa.vercel.app is live. Frontend shell (Vite+React+Tailwind+shadcn, design tokens applied) renders; `/api/health` returns `{status, version, commit_sha, db:"ok"}` against a real Neon Postgres (7-table schema migrated); PostHog client wired and verified end-to-end via direct API call (headless-browser smoke testing can't trigger it — PostHog correctly filters `HeadlessChrome` UA-CH brand as bot traffic); client-side Sentry wired (no DSN yet — see Open decisions); typed event registry + `scripts/check_events.py` CI check in place; public repo at github.com/argaur/household-financial-pwa.
3. **Next slice:** Slice 1 — Auth + household creation (Clerk + Hono + Drizzle + Neon multi-tenancy proof). Riskiest assumption: every Hono route can reliably resolve `household_id` from the Clerk session server-side with zero client-supplied IDs accepted.
4. **Open decisions:** Awaiting Gaurav — (a) Clerk account + application (publishable + secret key) before Slice 1 can start; (b) Sentry project creation is blocked by an org-level "members can't create projects" permission on personal-lab-0p — needs Gaurav to flip that setting or create the project himself and hand over the DSN.
5. **Kill criterion check:** Slice 0 deployed 2026-07-10, well within the 2026-07-23 deadline. OK.
