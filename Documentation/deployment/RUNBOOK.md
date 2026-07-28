# Runbook — [Project Name]

**Audience:** You, during an incident, possibly at 2am. Exact commands only — no "hopeful paragraphs."

---

## Deploy

```
[exact commands / platform steps]
```

## Rollback (proven, timed)

```
[exact commands to roll back to prior version]
```

**Rollback rehearsal:** executed on YYYY-MM-DD, took [N] minutes, verified by [what you checked]. Mandatory on first deploy — the first rollback must not happen during an incident.

## Logs

| What | Where | Command/URL |
|---|---|---|
| App logs | | |
| Error tracking | Sentry | |
| Analytics | PostHog | |

## Database

- Access: `[exact command]`
- Migrations: apply `[cmd]` / revert `[cmd]`

### Backups & Point-in-Time Restore

**Status: not configured, not tested, restore never rehearsed.** This is the single largest
genuine risk on the deployment checklist — the only item whose failure mode is *permanent*
loss of household financial data, not degraded service. See
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

**Rehearsal record:** not yet performed. First entry due before the checklist backup item can
be ticked.

## Rotate a Secret

1. [Where secrets live]
2. [Rotation steps]
3. [Redeploy/restart needed?]

## Common Failure Playbook

| Symptom | Likely cause | First action |
|---|---|---|
| /health down | | |
| Error spike in Sentry | | |
| Events missing in PostHog | | |
| [Project-specific] | | |
