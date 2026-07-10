# Progress — Household Financial Planning PWA

**Rule:** Exactly 5 lines per entry, written at every slice boundary BEFORE `/compact`. Newest entry on top. This is the context-reset anchor — Claude re-reads the top entry + `DECISIONS_LOG.md` before starting the next slice.

---

## 2026-07-10 — after Slice 0

1. **Slices done:** Slice 0 (Walking Skeleton) — deployed and verified live.
2. **Current state:** https://household-financial-pwa.vercel.app is live. Frontend shell (Vite+React+Tailwind+shadcn, design tokens applied) renders; `/api/health` returns `{status, version, commit_sha, db:"ok"}` against a real Neon Postgres (7-table schema migrated); PostHog client wired and verified end-to-end via direct API call (headless-browser smoke testing can't trigger it — PostHog correctly filters `HeadlessChrome` UA-CH brand as bot traffic); client-side Sentry wired (no DSN yet — see Open decisions); typed event registry + `scripts/check_events.py` CI check in place; public repo at github.com/argaur/household-financial-pwa.
3. **Next slice:** Slice 1 — Auth + household creation (Clerk + Hono + Drizzle + Neon multi-tenancy proof). Riskiest assumption: every Hono route can reliably resolve `household_id` from the Clerk session server-side with zero client-supplied IDs accepted.
4. **Open decisions:** Awaiting Gaurav — (a) Clerk account + application (publishable + secret key) before Slice 1 can start; (b) Sentry project creation is blocked by an org-level "members can't create projects" permission on personal-lab-0p — needs Gaurav to flip that setting or create the project himself and hand over the DSN.
5. **Kill criterion check:** Slice 0 deployed 2026-07-10, well within the 2026-07-23 deadline. OK.
