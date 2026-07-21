# Bug Log — Household Financial Planning PWA

**Rule:** Append-only. Every bug gets a root cause and a regression test — "fixed it" without either is not closed. Lessons that generalize go to Past Mistakes in memory.
**Gate condition:** Zero open P0/P1 before deployment.

Severity: **P0** data loss / security / payments broken · **P1** core journey broken · **P2** everything else.

---

| ID | Date | Severity | Summary | Reproduction steps | Root cause | Fix commit | Regression test | Status |
|---|---|---|---|---|---|---|---|---|
| B-001 | 2026-07-21 | P1 | Slice 7 nudge card never renders in production — SPEC.md §7 "exactly one nudge, never zero" violated live | Sign in with a household that has ≥1 unmet check, open `/dashboard` — no "Next step" card appears (donut → install card, nothing between) | `server/routes/dashboard.ts` hand-picked response fields and omitted `nudge`; `getDashboard()` computed it correctly but the route dropped it on serialization. Frontend degrades silently when `nudge` is absent (`Dashboard.tsx:169`), so no crash/console error masked it. All 294 tests passed because the route→response seam was never asserted (getDashboard tested to return nudge; NudgeCard tested fed one directly; the gap between them untested). | `6e8ff4e` | `server/dashboard.integration.test.ts` — "always forwards a nudge in the response — never zero" (0 members → member_coverage) + nudge assertion on the full-coverage fixture (→ complete); both RED before fix | closed |
