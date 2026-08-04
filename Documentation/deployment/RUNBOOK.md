# Runbook — Household Financial Planning PWA

**Audience:** You, during an incident, possibly at 2am. Exact commands only — no "hopeful paragraphs."

**The system, in one line:** Vite/React SPA + Hono API on Vercel Functions → Drizzle → Neon Postgres,
auth by Clerk. Live at <https://finance.gauravg.dev>.

| Thing | Identifier |
|---|---|
| Vercel project | `household-financial-pwa`, scope `argaurs-projects` (`prj_oxXer9gsia37CTH29I018gz8yNUs`) |
| GitHub | `argaur/household-financial-pwa` (public), deploys from `main` |
| Database | Neon Postgres, auto-provisioned via the **Vercel Marketplace** integration |
| Errors | Sentry org `personal-lab-0p`, project `household-financial-pwa` |
| Analytics | PostHog project **486719** — the *shared* "Web Fleet" project |
| Health | `GET /api/health` — **not** `/health`, see the playbook |

All CLI commands below assume you are in the `app/` directory, which holds the linked `.vercel/`.
Verified against **Vercel CLI 56.5.0** on 2026-07-29; re-check `--help` if the CLI has been upgraded.

---

## Deploy

**Deploys are Git-driven. Pushing to `main` is the deploy.** There is no manual deploy step in the
normal path, and no deploy step in CI — `.github/workflows/ci.yml` runs typecheck/test/build only,
Vercel owns deploys.

```bash
# 1. Gate first. Must exit 0 — this is the honest reviewer, the checklist is not.
bash scripts/predeploy-check.sh https://finance.gauravg.dev

# 2. Deploy.
git push origin main            # Vercel builds automatically

# 3. Confirm the new deployment is live and talking to the database.
curl -s https://finance.gauravg.dev/api/health
# expect: {"status":"ok","version":"...","commit_sha":"...","db":"ok"}
# `db:"ok"` is the real signal — it round-trips to Neon. `status:"ok"` alone only proves boot.

# 4. Confirm the commit_sha above matches what you just pushed.
git rev-parse --short HEAD
```

Build config lives in `vercel.json`: `buildCommand: npm run build`, `outputDirectory: dist`,
`framework: vite`. Do not duplicate it in the Vercel dashboard.

**Escape hatch — manual deploy** (only if the Git integration is down):

```bash
vercel --prod
```

## Rollback (proven, timed)

**Read this first: a rollback reverts code, not the database.** `drizzle-kit` generates no
down-migrations for this project and none were hand-written (see `DEPLOYMENT_CHECKLIST.md`,
"Database migrations applied and reversible"). If the deployment you are rolling *back across*
included a migration, you will land old code on new schema. In that case the code rollback is only
half the job — see "Backups & Point-in-Time Restore" below and restore Neon to a timestamp before
the migration. Check before you roll back:

```bash
git log --oneline <last-good-sha>..HEAD -- drizzle/migrations/
# any output = a migration is in scope, code rollback alone is NOT sufficient
```

**The rollback itself:**

```bash
# 1. Identify the last-good deployment. Newest first; you want the Production row above the bad one.
vercel ls household-financial-pwa

# 2. Roll back to it. Takes a deployment URL or ID.
vercel rollback https://household-financial-<id>-argaurs-projects.vercel.app

# 3. Watch it land (rollback waits up to 3m by default).
vercel rollback status household-financial-pwa

# 4. Verify — do not trust the CLI's word for it.
curl -s https://finance.gauravg.dev/api/health
# commit_sha must now be the last-good SHA, and db must still read "ok"
```

**You get one step back, not a menu.** `vercel ls` prints every past Production deployment, which
makes it look like you may roll back to any of them. You may not. Vercel marks only the current
production deployment and the one immediately before it as rollback candidates; every older row is
ineligible, and selecting one fails. Verified 2026-08-01 against this project's deployment list
(`isRollbackCandidate` was `true` on exactly two of twenty). So if the bad code has already survived
two deploys, Instant Rollback cannot reach the last-good build and the route back is
`git revert` plus a normal deploy. (Added 2026-08-01: the step above previously implied a free choice
of any Production row.)

Dashboard equivalent: Vercel → project → Deployments → the target deployment → **Instant Rollback**.
Same effect; use whichever is reachable at 2am.

**Then close the loop in Git**, or the next push re-deploys the bad code:

```bash
git revert <bad-sha> && git push origin main
```

**Rollback rehearsal: executed 2026-08-01.** Rolled production from `93bbe5f` back to `06b2534`, then forward
again. Each direction: `vercel rollback` returned success in **8 seconds**, and the new build was serving within
**13 seconds** (measured on the roll-forward, where `/api/health` was probed immediately). Verified by
`commit_sha` at `/api/health` in both directions, with `db` still reading `"ok"`. Migration scope was checked
first and was empty, so a code-only rollback was sufficient.

> **The rehearsal found something, and it is the most important line in this section.** After an Instant
> Rollback, **Vercel stops auto-promoting new deployments.** The alias stays pinned to the rolled-back build.
> The next `git push` builds green, reports Ready, shows `target: production` — and does not go live. Its
> `Aliases` list is empty. `vercel rollback status` says "No deployment rollback in progress", so nothing warns
> you. During a real incident this is the trap: you roll back, push the fix, watch it succeed, and production
> never changes.
>
> **So after any rollback, the recovery deploy must be promoted explicitly:**
>
> ```bash
> vercel promote <new-deployment-url>   # restores normal auto-promotion too
> curl -s https://finance.gauravg.dev/api/health   # confirm commit_sha actually moved
> ```
>
> Observed on 2026-08-01: a push sat un-aliased for 20 minutes after the rehearsal before this was noticed.

## Logs

| What | Where | Command/URL |
|---|---|---|
| App / API logs | Vercel Functions | `vercel logs --environment production -x` (add `-f` to stream, `-j` for JSON Lines) |
| Error tracking | Sentry | <https://personal-lab-0p.sentry.io/projects/household-financial-pwa/> |
| Analytics | PostHog | <https://us.posthog.com/project/486719> |

**Two traps in this table, both of which have already cost time on this project:**

- **Sentry only sees the client.** Server-side capture is deferred at `server/app.ts:14`
  (`@sentry/node` is not Edge-compatible), so an unhandled error inside a Hono route appears in
  **Vercel function logs and nowhere else**. A quiet Sentry does not mean a healthy API. When
  triaging anything API-shaped, read Vercel logs *first*, not Sentry.
- **PostHog project 486719 is the shared "Web Fleet" project.** Every event this app sends carries
  a registered `project` property. **Any query without `project = 'financial-planning'` is wrong** —
  it returns the whole fleet, and on 2026-07-28 that led to concluding there was no data when the
  data was sitting right there. Scope every query, every insight, every funnel.

> **Secrets warning — applies to every command in this section.** Vercel function logs can contain
> the Neon connection string and Clerk tokens inside third-party tracebacks. Never pipe raw log
> output anywhere it will be pasted, shared, or handed to an agent. Filter at the source
> (`vercel logs ... | grep -c 'pattern'`), never dump and skim.

## Database

Neon Postgres. `DATABASE_URL` is injected by the Vercel Marketplace integration in Production; use
your local `.env.local` for anything run from this machine.

```bash
# Interactive access (reads DATABASE_URL from the local env — never paste the URL on the command line)
psql "$DATABASE_URL"

# Browsable UI over the same schema
npm run db:studio
```

**Migrations** — drizzle-kit, config at `drizzle.config.ts`, schema at `drizzle/schema.ts`,
SQL output in `drizzle/migrations/`:

```bash
npm run db:generate     # author a migration from the schema diff
npm run db:migrate      # apply pending migrations
npm run db:seed         # re-seed the 30 read-only instruments (scripts/seed-instruments.ts)
npm run db:probe        # read-only: what state is the database ACTUALLY in?
```

> **`db:migrate` had never once worked, and nothing said so. Fixed 2026-08-04.**
> `drizzle.config.ts` read `process.env.DATABASE_URL` but never loaded `.env.local` —
> drizzle-kit runs the config in its own process and does not read it for you. Every invocation of
> the command documented directly above this box failed with `url: undefined`.
>
> The damage was not the broken command, it was what the repository looked like afterwards.
> Migrations `0001` and `0002` were generated on 2026-08-02 and written into
> `drizzle/migrations/meta/_journal.json`, which is the file everyone reads to answer "did that
> migration land?" **It answers a different question.** `_journal.json` records what was
> *generated*; `drizzle.__drizzle_migrations` records what was *applied*. Production sat at `0000`
> for three days while the tree said otherwise.
>
> **So verify against the database, never against the tree:** `npm run db:probe` prints the tables,
> the 16 encryption columns, the 11 relaxed constraints, the applied-migration count and row counts,
> and ends in a verdict. It is read-only (SELECTs on `information_schema` plus `COUNT(*)`), loads
> `.env.local` itself so no shell command has to name a secret file, prints the Neon hostname so you
> can tell *which* database you probed, and never prints a connection string or a household value.
>
> **Confirmed applied to production 2026-08-04:** ledger 1 row → 3, `household_keys` present, all 16
> crypto columns present, all 11 constraints relaxed, and row counts unchanged at 2 households /
> 3 members / 1 holding / 0 protection. The unchanged counts are the proof the migrations were
> non-destructive. `/api/health` read `db: "ok"` afterwards on the unchanged `719d022`.

**Revert: there is no down-migration.** drizzle-kit generates none here and none were written by
hand. The only ways back are (a) a forward migration that undoes the change, or (b) a Neon
point-in-time restore, below. Acceptable today at one migration with no destructive column drops —
**revisit before the first migration that drops or renames a populated column**, because at that
point a code rollback stops being recoverable on its own.

### Backups & Point-in-Time Restore

**Status as of 2026-08-01: confirmed in-console, and the restore is rehearsed and proven.** See
"Restore rehearsal" at the end of this section for the evidence. What follows below was written
before that and is kept because the procedure is still correct; only the "not verified" hedges are
now resolved.

**Confirmed in the Neon console 2026-08-01, not inferred from docs:** plan **Free**, **history
retention 6 hours**, Postgres 17, region AWS us-east-1. The project is `neon-cerulean-coin`
(`autumn-queen-58900480`). That closes the "plausible, not verified" flag this section used to carry
about which plan a Vercel-Marketplace-provisioned database lands on.

**The 6-hour window is the real limit, and it is small.** A data-loss incident on Friday evening,
noticed Monday, is **not recoverable**. Accepted deliberately with a written trigger rather than
paid around: **the first real user who is not Gaurav or a test account signs up, upgrade to Launch
(7-day window) before that session ends.** Today the database holds only synthetic test households.

See
`Documentation/deployment/DEPLOYMENT_CHECKLIST.md` line "Database backups configured" (kept
unticked deliberately — documenting a backup is not having one).

The DB is Neon Postgres, auto-provisioned via the **Vercel Marketplace** integration (see
project CLAUDE.md, "Live infra"), not a Neon account Gaurav created directly. That matters:
which Neon plan/tier applies, and therefore how much restore history exists, is **not
independently confirmed for this project** — verified below.

#### (a) What retention actually exists today — researched, not assumed

Verified from Neon's own docs on 2026-07-28:

- Neon **Free plan**: point-in-time restore ("history window") of **6 hours**, capped at
  **1 GB** of accumulated WAL changes, at no charge.
  Source: [Neon plans](https://neon.com/docs/introduction/plans) (checked 2026-07-28).
- Neon **Launch plan**: history window extendable to **up to 7 days**, billed at
  $0.20/GB-month for the additional restore storage.
  Source: [Neon plans](https://neon.com/docs/introduction/plans) (checked 2026-07-28).
- Neon **Scale plan**: history window extendable to **up to 30 days**, same $0.20/GB-month
  billing for restore storage.
  Source: [Neon plans](https://neon.com/docs/introduction/plans) (checked 2026-07-28).
- Mechanism: restore is via **branching**, not a traditional "backup file." Neon continuously
  retains WAL within the history window; you restore a *root branch* to any point within that
  window (down to the millisecond, or by LSN), and child/preview branches don't count against
  the window's storage.
  Source: [Instant restore](https://neon.com/docs/introduction/branch-restore),
  [History window](https://neon.com/docs/introduction/history-window) (checked 2026-07-28).

**Unconfirmed for this specific project — Neon docs on the Vercel-managed integration
([vercel-managed-integration](https://neon.com/docs/guides/vercel-managed-integration),
checked 2026-07-28) do not state which Neon plan applies by default when a database is
provisioned through the Vercel Marketplace, nor whether Vercel's Hobby tier maps 1:1 to
Neon's Free-plan history window.** Third-party sources describe "Vercel Hobby → Neon Free
plan limits, Vercel Pro → optional upgrade to paid Neon plans," but this was not found stated
as fact on a Neon or Vercel first-party docs page, so treat it as **plausible, not verified**.
Working assumption until Gaurav confirms in-console: **this project currently has at most a
6-hour, 1GB-capped restore window, and it may be less if the Vercel-provisioned project has
a different default** — do not assume more coverage exists than that.

#### (b) What Gaurav must configure or confirm — and where

1. Log into the **Neon console** (via the Vercel integration's "Open in Neon" link on the
   Vercel project's Storage tab, or directly at neon.tech if the account is discoverable)
   and open the project backing `household-financial-pwa`.
2. Go to **Project settings → General** (or the plan/billing page) and confirm which Neon
   plan tier is actually active. This determines the real history window — do not trust the
   6-hour default assumption above without checking.
3. Go to the project's **history window** setting (Project settings) and confirm it is set to
   the maximum your plan allows. On Free this is fixed at 6h/1GB with no user-facing
   override; on Launch/Scale it is configurable up to 7/30 days respectively.
4. Decide, and record in this file, whether the 6-hour (or whatever confirmed) window is
   acceptable for a household finance app, or whether the project should be upgraded to
   Launch for 7-day coverage. Given this is PII-bearing financial data for real people, a
   6-hour window means any data-loss incident not caught within 6 hours (e.g. discovered on
   a Monday after a Friday-evening bug) is **unrecoverable**.
5. Once confirmed, update this section with: exact plan tier, exact history window in
   force, and the date confirmed.

#### (c) How to perform a restore, step by step

1. Neon console → select the project → the affected **root branch** (production is a root
   branch; Vercel preview branches are children and are not directly restorable this way).
2. Open **Backup & Restore** on that branch.
3. Choose **Restore from history**, and specify either a timestamp or an LSN within the
   history window.
4. Confirm. Neon automatically preserves the branch's pre-restore state as a new backup
   branch first, so the restore itself is reversible — you are not destroying the pre-restore
   data by restoring.
5. After restore, verify application behavior against the restored data before considering
   the incident closed (query row counts / spot-check known records, then a live click-through
   of `/dashboard` and `/portfolio` for a known test household).
6. Check Sentry/PostHog for the incident window to confirm the trigger and rule out a repeat.

Source: [Instant restore](https://neon.com/docs/introduction/branch-restore) (checked
2026-07-28).

#### (d) How to rehearse a restore safely — without touching production

Never restore-in-place against production as a rehearsal. Use branch-based rehearsal instead:

1. In the Neon console, **create a new branch** from the production (root) branch, selecting
   a specific past timestamp as the branch's starting point (Neon supports creating a branch
   from any point within the history window, not just "now").
2. This produces an isolated, full copy-on-write copy of the database as of that timestamp —
   production is untouched throughout.
3. Get the new branch's connection string (Neon console → branch → Connection Details) and
   point a local `psql` session or a throwaway script at it — never the app's real env vars.
4. Verify the rehearsal branch has the expected historical data (row counts, spot-check a
   known record) to confirm the restore mechanism actually works and the retention window is
   what's documented above.
5. Delete the rehearsal branch when done (Neon console → branch → Delete) so it doesn't
   silently consume storage or restore-window budget.
6. Log the rehearsal here: date run, branch name/timestamp used, what was verified, who ran
   it — mirroring the "Rollback rehearsal" entry above. **Mandatory before this checklist item
   can be ticked** — an untested restore path is not a working backup.

Source: [Reset from parent](https://neon.com/docs/guides/reset-from-parent), [Branching
recovery workflows](https://neon.com/branching/recovery-workflows) (checked 2026-07-28) —
these describe creating a branch from a parent/point-in-time as the supported pattern for
safe, non-production testing against real data shape.

**Restore rehearsal: PERFORMED AND PROVEN 2026-08-01.** Run by Claude in the Neon console, driven
through Chrome. Production was never touched.

*What made it a real test.* Minutes earlier, Slice 9 step 12 had permanently deleted the "Sharma
Family" household via Clerk's `user.deleted` webhook — a household, 2 members, 3 holdings and 1
protection record, gone from production. The rehearsal then recovered exactly that data from history.

*Method.* Branches → New Branch → **"Branch data and schema from a past point in time"** → 2026-08-01
**11:30 IST** (after the household was populated, before it was deleted). Branch `restore-rehearsal-3`,
forked in **0.60 seconds**, auto-expiring after 1 day.

*Result, queried on both branches with the same statement:*

| | `main` (production, post-delete) | `restore-rehearsal-3` (11:30) |
|---|---|---|
| households | 2 | **3** |
| household names | Gaurav's Family, Renamed Household | Gaurav's Family, Renamed Household, **Sharma Family** |
| family_members | 3 | **5** |
| holdings | 1 | **4** |
| protection | 0 | **1** |
| instruments | 30 | 30 |

Permanently deleted data was recovered. Point-in-time restore works on this project, on this plan.

> **The trap that made the first two attempts worthless, so it does not happen again at 2am.** The
> Create-branch dialog defaults to **"Branch data and schema"**, which means *up to this moment* —
> a copy of production, not a rewind. You must explicitly pick **"from a past point in time"** and set
> the timestamp. Two earlier attempts on 2026-08-01 came back byte-identical to production and were
> rejected as vacuous rather than recorded as passes.
>
> **A second, subtler trap:** a rewind only proves anything if something actually *changed* in the
> window. The first attempt branched from two hours earlier on a database that had not been written to
> in four days, so the branch was necessarily identical and proved nothing. **Choose a timestamp that
> straddles a known write or delete**, then assert on the difference.

## Rotate a Secret

**Where secrets live:** Vercel project → Settings → Environment Variables, **Production** target.
Nothing sensitive is in the repo. Every variable the source reads is documented (names only) in
`.env.example`, and `scripts/predeploy-check.sh` check 6 enforces that by comparing
`import.meta.env.*` / `process.env.*` references in source against the template.

> **Preview is not configured.** Env vars are set on Production only, so preview deploys have no
> working auth or analytics. Known and deferred — do not treat a broken preview as an incident.

```bash
vercel env ls production                 # names + timestamps only
vercel env rm  <NAME> production
vercel env add <NAME> production         # prompts for the value; do not pass it as an argument
vercel redeploy <production-url>         # REQUIRED — see below
```

**Step 3 is not optional, and this is the part that burns you.** A Vercel environment variable is
read at build/boot time. Changing it in the dashboard changes nothing about the running deployment,
and **an unset variable is indistinguishable from a set one until you probe the behaviour.** Two
recorded instances on this project:

- `VITE_POSTHOG_KEY` was never set, so `initPostHog()` returned early on every load and the app
  produced **zero** analytics for weeks. The only symptom was a console warning nobody was watching.
- `CLERK_WEBHOOK_SECRET` "looked" set in the dashboard. An unsigned `POST /api/clerk-webhook`
  returned **500** (`webhook_not_configured`) and kept returning 500 until the redeploy, after which
  it returned **401**. The 500 → 401 transition is what proved it, not the dashboard.

**So: verify by probe, not by dashboard.** After any rotation, exercise the thing the secret gates
and assert the response changed. Per-secret probes:

| Secret | Provider console | Probe that proves it took effect |
|---|---|---|
| `DATABASE_URL` | Neon (via Vercel Storage tab) | `curl -s .../api/health` → `db:"ok"` |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk → API Keys | sign in on the live app; an authed `GET /api/dashboard` returns 200, not 401 |
| `CLERK_SECRET_KEY` | Clerk → API Keys | **No probe exists, because no code reads it.** Auth is hand-rolled JWT verification against Clerk's JWKS (`server/lib/auth.ts`), which derives its endpoint from the *publishable* key alone; `@clerk/backend`, the package that would need the secret key, is deliberately not used (Vercel Edge bundler failure). The variable is documented in `.env.example` and currently inert. Do not verify it by signing in: signing in exercises the publishable key and would report a false pass. (Corrected 2026-08-01: this row previously shared a line with the publishable key and claimed the sign-in probe covered both.) |
| `CLERK_WEBHOOK_SECRET` | Clerk → Webhooks → signing secret | unsigned `POST /api/clerk-webhook` → **401** (500 means unset) |
| `VITE_POSTHOG_KEY` | PostHog → project 486719 | load the app, then confirm a `page_viewed` event arrives **scoped to `project = 'financial-planning'`** |
| `VITE_SENTRY_DSN` / `SENTRY_DSN` | Sentry → project settings → Client Keys | trigger a client error, confirm it lands in Sentry |

## Common Failure Playbook

| Symptom | Likely cause | First action |
|---|---|---|
| `/health` down | **Probably the wrong path.** Health is at `/api/health`. The SPA rewrite in `vercel.json` returns `index.html` with a **200** for unknown paths, so `/health` looks reachable but malformed — a wrong-path bug wearing a broken-response costume. | `curl -s .../api/health`. If that 200s with `db:"ok"`, there is no incident. If `db` is not `"ok"`, the function booted but Neon is unreachable → check Neon status and `DATABASE_URL`. If it 404s or 500s, check `vercel ls` for a failed build, then roll back. |
| Error spike in Sentry | Client-side regression in the last deploy (Sentry sees the client only). | Compare the spike's start time against `vercel ls` deploy times. If they line up, roll back first and diagnose after. Read Vercel function logs in parallel — a server-side cause will be invisible in Sentry. |
| Events missing in PostHog | Ranked by observed likelihood: (1) querying without `project = 'financial-planning'` in the shared Web Fleet project — the events are there, you're not looking at them; (2) `VITE_POSTHOG_KEY` unset or lost in a redeploy, which fails silently; (3) an ad-blocker on the client. | Re-run the query **with the `project` filter** before believing anything is wrong. Then check `vercel env ls production` for the key, and the browser console for the `initPostHog` early-return warning. |
| API route 404s that "should" exist | **Vercel's zero-config routing only serves single-path-segment `/api/*`.** A second path segment (`/api/holdings/123`) 404s at the platform before Hono ever sees it — so the route exists in code, has passing tests, and is unreachable in production. | Use query params (`/api/holdings?id=123`), which is the standing workaround. Confirm with `vercel build` and read `.vercel/output/config.json` for the generated routes. |
| A nudge/card/value renders nowhere despite green tests | A route→response seam that no test asserts. This shipped once as **B-001**: `server/routes/dashboard.ts` dropped `result.nudge` from its response and 294 tests stayed green. | Curl the API directly and diff its JSON against what the component expects. Do not debug from the UI down. |
