# Autonomous batch — 2026-07-28

Everything here is executable without Gaurav. Explicitly **out of scope** (needs a human):
Slice 8's 12 offline steps (DevTools toggling + Chrome's native install dialog); Slice 9 steps 9–12
(step 9 signs out and we do not hold the test account's password, so the whole tail is gated);
rollback rehearsal (Vercel dashboard); Clerk production instance + `pk_live`/`sk_live`; Neon backup
*configuration*.

Repo: `C:\Users\Gaurav Gupta\Documents\Projects\Financial Planning\app`. Branch `main`, HEAD `e5905d1`,
clean, pushed. Live: https://household-financial-pwa.vercel.app

**Standing rules for every task**
- Gate before any commit: `npm run typecheck`, `npx vitest run` (303 baseline, must not drop),
  `npm run build`, `python scripts/check_events.py`.
- Non-trivial code changes are TDD — failing test first, per project CLAUDE.md.
- Commit per task. **Do not `git push`** — the human handles deploys.
- Never print secret values; reference variable names only.
- No emojis. Match surrounding file idiom.

---

## Task 1 — PostHog North Star funnel verification `[opus]`

**Why:** Definition-of-Shipped item 3, currently unmet. Events only started arriving 2026-07-26
(`27cd666` fixed a dead init that had produced zero analytics since the file was written), and this
session walked the full core journey live, so the data exists but has never been queried. The
checklist is explicit that "events firing" is not sufficient — that is exactly the failure the dead
init masked.

**Do:** Using the PostHog MCP tools (project "Web Fleet", id 486719 — note this is a shared fleet
project, so **filter on `project = 'financial-planning'`**, which `src/lib/posthog.ts` registers on
every event):
1. Read `Documentation/solution/METRICS_PLAN.md` for the North Star and its funnel definition.
2. Confirm each funnel step is actually queryable and carries the properties METRICS_PLAN claims.
3. Build the funnel and capture a screenshot to `Documentation/product/screenshots/`.
4. Record findings in `Documentation/solution/METRICS_PLAN.md` (or a short sibling note): which
   steps have data, which are empty, and **why** — several events (`signup_failed`, `login_failed`)
   are known-unimplemented, and preview/dev traffic is absent because Preview env vars were never set.
5. Tick the item in `Documentation/deployment/DEPLOYMENT_CHECKLIST.md` **only if** genuinely verified.

**Honesty requirement:** if the funnel is sparse or a step has zero events, say so plainly and leave
the box unticked. A ticked box with no data is worse than an untouched one.

---

## Task 2 — Draft `CASE_STUDY.md` `[opus]`

**Why:** Definition-of-Shipped item 5. Still the raw template ("[Product Name]").

**Do:** Fill `Documentation/product/CASE_STUDY.md` from `Documentation/solution/DECISIONS_LOG.md`
(D-001–D-011), `SOLUTION_BRIEF.md` and `PORTFOLIO_ANGLE.md`. Audience per the template's own header:
a recruiter with 3 minutes — lead with problem, judgment and outcomes, not a technology list.

Strongest material available, use it: D-002 (cutting auto-pricing to ship), D-010/D-011 (holding a
scope line under pressure, then rejecting the obvious fix because it would bend the domain model),
B-001 (294 green tests and the feature was invisible in production because the bug was in the seam
between two well-tested units). That last one is the most credible PM/eng-judgment story in the repo.

Mark it **DRAFT — awaiting Gaurav's approval** at the top. Do not tick the checklist box; it requires
his sign-off.

---

## Task 3 — Write `app/README.md` `[opus]`

**Why:** There is no README in `app/` at all. D-007 makes this a recruiter-facing portfolio piece, and
the README is the landing page that gets hit first.

**Do:** Live URL, one-paragraph what-and-why, the core journey, stack, architecture in a few lines,
links to `/why`, `CASE_STUDY.md`, `HOW_TO_USE.md`, and `DECISIONS_LOG.md`. Be accurate about state:
feature-complete, Phase 5 verification partially outstanding. **Do not claim a hero screenshot that
does not exist** — leave a clearly marked placeholder; the app currently has an empty test household
so no good screenshot can be taken yet.

Leave the checklist box unticked (it requires the screenshot).

---

## Task 4 — GitHub Actions CI `[sonnet]`

**Why:** No `.github/workflows` exists. The full gate is run manually and nothing enforces it, while
Vercel deploys on push without gating on tests.

**Do:** Add `.github/workflows/ci.yml` — on push and PR to `main`: Node 20, `npm ci`, then
`npm run typecheck`, `npx vitest run`, `npm run build`, `python scripts/check_events.py`.
No secrets, no deploy step (Vercel owns deploys). Note the Rollup Windows/WSL binding gotcha in
`app/CLAUDE.md` does not apply to CI (clean Linux runner, `npm ci`).

Update the CI line in `DEPLOYMENT_CHECKLIST.md` — but state honestly that it is **added, not yet
observed green on `main`**, since that requires a push.

---

## Task 5 — Fix B-002 (add-holding scroll offset) `[sonnet]`

**Why:** `Documentation/testing/BUG_LOG.md` B-002 (P2). After submitting the add-holding sheet the
page keeps the tall sheet's scroll offset, so the user lands on a blank viewport below a short
holdings list. Cosmetic on desktop; reads as "nothing happened" at the 390px target breakpoint.

**Do:** TDD. Reproduce first in a component test against `src/pages/Portfolio.tsx` and the shared
holding sheet, then fix. Likely shape: restore scroll position (or scroll to the new row) when the
sheet closes. Check whether the edit path shares the code — the live pass saw it only on add.
Update the BUG_LOG row with root cause, fix commit and regression test; set status closed.

---

## Task 6 — Lock down CORS `[sonnet]`

**Why:** Unticked on the deployment checklist; `grep -rn "cors" server/` returns nothing.

**Do:** Add Hono CORS middleware in `server/app.ts` restricted to the production origin
(plus localhost for dev). Low risk — the API is same-origin and bearer-token authenticated, so there
is no cookie/ambient-authority path — but **it can break the app if the origin is wrong**, so:
- add tests covering an allowed origin and a rejected one;
- keep `/api/clerk-webhook` reachable — it is server-to-server from Clerk and must not be
  origin-restricted;
- do not push. Flag clearly in the handoff that this one needs a live check after deploy.

Update `DEPLOYMENT_CHECKLIST.md` and `SECURITY_REVIEW.md`; do not claim live verification.

---

## Task 7 — Document backup posture in `RUNBOOK.md` `[sonnet]`

**Why:** The single largest genuine risk on the checklist — the only unticked item whose failure mode
is permanent user data loss. Configuration needs Gaurav, but the documentation does not.

**Do:** Research Neon's current free-tier point-in-time-restore retention (**verify via web search —
do not trust a remembered figure**, per project CLAUDE.md's rule on quarterly-changing facts). Write a
`RUNBOOK.md` section covering: what retention actually exists today, exactly what Gaurav must
configure or confirm, how to perform a restore, and how to rehearse one safely. Leave the checklist
box unticked — documenting a backup is not having one.

---

## Handoff report

Summarize per task: what changed, gate results, what was verified vs assumed, anything deliberately
left undone. Call out explicitly: unpushed commits awaiting deploy, and that Task 6 needs a live
post-deploy check.
