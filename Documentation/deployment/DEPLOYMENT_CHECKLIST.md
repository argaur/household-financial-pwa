# Deployment Checklist — [Project Name]

**Order matters: the preflight script runs first. A checklist a human ticks under time pressure is theater; the script is the honest reviewer. The boxes below cover what the script can't reach.**

```
bash scripts/predeploy-check.sh <PRODUCTION_URL>   # must exit 0
```

---

- [ ] Preflight script exits 0 (paste output date + summary line here)
- [ ] All env vars documented in `.env.example` (no real values committed)
- [ ] Secrets stored in platform env config (not in repo)
- [ ] `/health` returns 200 with version + commit SHA
- [ ] Database migrations applied and reversible
- [ ] PostHog receiving events in production (one test event verified)
- [ ] Sentry receiving errors in production (one test error verified)
- [ ] HTTPS enforced, HTTP redirects to HTTPS
- [ ] CORS locked to production origins only
- [ ] Rate limiting on all public endpoints
- [ ] Database backups configured, cadence documented in `RUNBOOK.md`
- [ ] `/docs` route deployed and accessible
- [ ] GitHub Actions CI green on main
- [ ] README updated with live URL, hero screenshot, `CASE_STUDY.md` link

---

## Definition of Shipped — all six must be true

1. [ ] Deployed and publicly accessible
2. [ ] `/health` + Sentry confirming it's alive
3. [ ] PostHog North Star funnel verified end-to-end — core journey walked once, every funnel step queryable, funnel screenshot saved to `Documentation/product/screenshots/`. "Events firing" is not sufficient.
4. [ ] `/docs` live with `HOW_TO_USE.md`
5. [ ] `CASE_STUDY.md` written (Claude drafts from `DECISIONS_LOG.md`, Gaurav approves)
6. [ ] Rollback rehearsal completed and timed, recorded in `RUNBOOK.md`
