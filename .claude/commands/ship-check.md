# /ship-check — Deployment gate (Blueprint Phase 6)

Run the full deployment sequence. Nothing here is tickable without evidence.

1. **Automated preflight:** `bash scripts/predeploy-check.sh <PRODUCTION_URL>` — must exit 0. Paste the summary line into `DEPLOYMENT_CHECKLIST.md`.
2. **Checklist:** walk `Documentation/deployment/DEPLOYMENT_CHECKLIST.md` — every box with evidence, not hope.
3. **Rollback rehearsal (first deploy only):** execute one real rollback to the prior version and back. Time it. Record the timed procedure in `RUNBOOK.md`.
4. **Definition of Shipped — verify all six:**
   1. Deployed and publicly accessible
   2. `/health` + Sentry confirming it's alive
   3. PostHog North Star funnel verified end-to-end — walk the core journey, confirm every step is queryable, screenshot the funnel into `Documentation/product/screenshots/`. "Events firing" is not sufficient.
   4. `/docs` live with HOW_TO_USE
   5. CASE_STUDY.md drafted from DECISIONS_LOG.md, approved by Gaurav
   6. Rollback rehearsal completed and timed
5. **Close out:** update root README (live URL, hero shot, CASE_STUDY link per PORTFOLIO_ANGLE.md placement check) → memory update + Obsidian session journal.

**Gate:** All six confirmed. Anything destructive (redeploy, migration) → confirm with Gaurav first.
