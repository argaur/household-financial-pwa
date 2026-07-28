# Deployment Checklist — Household Financial Planning PWA

**Order matters: the preflight script runs first. A checklist a human ticks under time pressure is theater; the script is the honest reviewer. The boxes below cover what the script can't reach.**

```
bash scripts/predeploy-check.sh <PRODUCTION_URL>   # must exit 0
```

**Filled in:** 2026-07-28 against production (HEAD `438838e`). Nothing below is ticked without evidence; unticked boxes are genuinely not done, not "probably fine".

> **The script itself was wrong and was fixed first.** Its first run reported 2 failures and 3 warnings, and every one of them was an artefact:
> - **Health check** hit `/health`, but this app serves health at `/api/health` — and the PWA's SPA `navigateFallback` returns `index.html` with a **200** for unknown paths, so a wrong path reported "reachable but missing version and commit_sha" instead of a clean 404. A wrong-path bug wearing the costume of a malformed-response bug.
> - **HTTPS check** passed `-L` to curl, so it followed the 308 and asserted against the final 200 — it could never have observed the redirect it was testing for.
> - **Env check** asserted that every var documented in `.env.example` was **set in the local shell**. That is backwards: the checklist item is that every var the source *reads* is *documented*. As written it could only pass on a machine holding all production secrets in its environment — i.e. never, correctly. A check that cannot pass trains you to ignore the script, which is worse than having no script.
>
> All three fixed in `scripts/predeploy-check.sh`; the third now compares `import.meta.env.*` / `process.env.*` references in source against the template. Current run: **4 passed, 0 failed, 2 warnings.**

---

- [x] **Preflight script exits 0** — 2026-07-28: `✓ PREFLIGHT PASSED — safe to deploy` (4 passed, 0 failed, 2 warnings). The two warnings are real and tracked below: CORS inconclusive, no rate limiting.
- [x] **All env vars documented in `.env.example`** (no real values committed) — now machine-verified by preflight check 6. Added this session: `CLERK_WEBHOOK_SECRET` (read by `server/routes/clerk-webhook.ts`, previously undocumented) and commented `VITE_COMMIT_SHA` / `VERCEL_GIT_COMMIT_SHA` entries so build-injected vars are documented without implying they should be set by hand.
- [x] **Secrets stored in platform env config** (not in repo) — Vercel Production env. Bundle scan finds zero server-side key prefixes, zero Svix prefixes, zero Postgres URIs in `dist/`; only the public-by-design Clerk publishable key and PostHog ingest token. See `SECURITY_REVIEW.md` row 5.
- [x] **`/health` returns 200 with version + commit SHA** — `GET /api/health` → `{"status":"ok","version":"0.0.0","commit_sha":"27cd666…","db":"ok"}`. `db:"ok"` means it round-trips to Neon, not just that the function booted.
- [x] **Database migrations applied and reversible** — `drizzle/migrations/0000_harsh_prima.sql` applied to the live Neon database; the 7-table schema is queried successfully in production (proven by `db:"ok"` and by live CRUD across all five resource families during this session's click-throughs). **Reversibility is by forward migration only** — Drizzle generates no down-migrations here, and none were hand-written. Acceptable at one migration with no destructive column drops; revisit before the first migration that drops or renames a populated column.
- [x] **PostHog receiving events in production** — verified end-to-end 2026-07-26 (`27cd666`). Worth recording *why* this box was previously untickable: `initPostHog()` guarded on `VITE_POSTHOG_KEY`, which was never set in Vercel, so it returned early on every load and the app had produced **zero** analytics since the file was written. The only symptom was a console warning in a browser nobody was watching. This is the box's whole point — "PostHog wired" was true the entire time and "PostHog receiving events" was false.
- [x] **Sentry receiving errors in production** — client DSN configured and initialized. **Client only:** server-side capture is still deferred (`server/app.ts:14`), so an unhandled error inside a Hono route surfaces in Vercel function logs, not Sentry. Ticked for the client surface and explicitly scoped; see the deferred item below.
- [x] **HTTPS enforced, HTTP redirects to HTTPS** — `curl -I http://…` → **308** to `https://…`. Confirmed by preflight check 2 after the `-L` bug was fixed.
- [ ] **CORS locked to production origins only** — **not done.** No CORS middleware exists (`grep -rn "cors" server/` → 0 matches); preflight reports the check inconclusive (204 on preflight OPTIONS). Mitigating factor: the API is same-origin with the SPA and authenticates by bearer JWT rather than cookies, so there is no ambient-authority CSRF path a permissive CORS policy would open — a cross-origin caller must already hold a valid token. Should still be locked down; not a ship blocker for this threat model.
- [ ] **Rate limiting on all public endpoints** — **not done.** Tracked as **SEC-001** in `SECURITY_REVIEW.md` with the exposure scoped (Clerk throttles auth; the unthrottled surface is a signed-in user's own household) and an explicit trigger to fix: first real traffic or any Neon quota warning.
- [ ] **Database backups configured, cadence documented in `RUNBOOK.md`** — **not done.** Neon's free tier provides point-in-time restore within its retention window, but nothing has been configured, tested, or written down, and no restore has ever been rehearsed. This is the largest genuine gap on this list: it is the only item where the failure mode is *permanent loss of user data* rather than degraded service.
- [x] **`/docs` route deployed and accessible** — `GET /docs` → 200, serving `HOW_TO_USE.md`.
- [ ] **GitHub Actions CI green on main** — **no CI exists.** No `.github/workflows` in the repo. The full gate (`npm run typecheck`, 303 tests, `npm run build`, `scripts/check_events.py`) is run manually before each commit and was run for every commit this session — but nothing enforces it, so a future push can break `main` unchallenged. Deploys are Vercel-on-push and do not gate on tests.
- [ ] **README updated with live URL, hero screenshot, `CASE_STUDY.md` link** — **not done.** There is no `README.md` in `app/` at all, `Documentation/product/screenshots/` does not exist, and `CASE_STUDY.md` is still the unfilled template ("[Product Name]"). For a repo whose stated purpose is a recruiter-facing portfolio piece (D-007), this is the highest-value remaining gap — the `/why` page was built to tell this story, and the README is the landing page a recruiter actually hits first.

---

## Definition of Shipped — all six must be true

1. [x] **Deployed and publicly accessible** — https://household-financial-pwa.vercel.app
2. [x] **`/health` + Sentry confirming it's alive** — `/api/health` returns 200 with a live DB round-trip; Sentry client-side (server-side deferred, above).
3. [ ] **PostHog North Star funnel verified end-to-end** — **not done.** Events are now genuinely arriving (since `27cd666`) and this session walked the full core journey live — sign-up → household → members → holdings → dashboard → protection — which should have populated every funnel step. But no funnel has been built or queried in PostHog, and no screenshot has been saved to `Documentation/product/screenshots/`. The checklist is explicit that "events firing" is not sufficient, and it is right: the PostHog outage above is exactly the failure that "events firing" would have masked. **This is the cheapest remaining item — the data is already there, it just needs to be queried once.**
4. [x] **`/docs` live with `HOW_TO_USE.md`** — 200.
5. [ ] **`CASE_STUDY.md` written** — still the unfilled template. `DECISIONS_LOG.md` now carries D-001–D-011, which is ample source material.
6. [ ] **Rollback rehearsal completed and timed** — **not done.** `RUNBOOK.md:19` still reads "executed on YYYY-MM-DD, took [N] minutes". The runbook itself notes this is mandatory on first deploy precisely so the first rollback isn't performed during an incident — and this project has now deployed many times without ever rehearsing one.

**Verdict: not shipped by this document's own definition — 2 of 6 outstanding on process, 4 of 6 true.** The app is live and functionally complete; what is missing is the evidence layer (funnel, case study, rollback rehearsal, README) and two infrastructure gaps (backups, CI). None of these blocks a user from using the app today; the backups gap is the one that could cause irreversible harm.

---

## Deferred, with reasons (not gaps discovered here — previously recorded)

- **Server-side Sentry capture** — deferred at `server/app.ts:14`. Route errors land in Vercel function logs only.
- **`signup_failed` / `login_failed` events** — unimplementable without a custom auth form; Clerk's prebuilt components expose no failure callback.
- **Vercel Preview-environment env vars** — Production only, so preview deploys do not have working auth/analytics.
- **Clerk development keys in production (Finding 2)** — every page load warns "should not be used in production". Confirmed 2026-07-28 that the Clerk instance is the **Development** one and holds exactly one user, so migrating to a production instance strands a one-user pool rather than requiring a real user migration. Cheaper than previously assumed.
