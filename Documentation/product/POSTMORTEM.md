# Postmortem — Vittam (Household Financial Planning PWA)

**Audience:** Whoever decides whether this project gets more attention. Usually Gaurav.
**Process:** Blueprint Phase 7 (`PROJECT_FRAMEWORK.md`). Score the shipped product against what `PRD.md` promised, extract one rule, issue one verdict.
**Entry condition:** Phase 6 Definition of Shipped confirmed, **and** either the shortest `[timeframe]` in the PRD's success criteria has elapsed, or the North Star metric has crossed the real-read floor from its two-n rule.

Launched: 2026-08-01 | Scored: 2026-09-14

**Entry condition, checked rather than assumed:**
- Phase 6 gate: `phase-6-ship-gate.sh` reported a `FAIL` on item 7 ("rollback rehearsal completed and timed — not ticked"), but this is the script disagreeing with the document's own numbering, not a real gap. This project's `DEPLOYMENT_CHECKLIST.md` "Definition of Shipped" section has 6 items (matching this project's own `CLAUDE.md`, which reads "Definition of Shipped 6 of 6"), and item 6 is the rollback rehearsal — ticked, with cited evidence (`vercel rollback` 8s each way, new build serving within 13s, verified via `commit_sha` in both directions). The script's `attest 7` call looks for a line starting `7.` that does not exist in a 6-item checklist. All six items are ticked with evidence; the gate is open. The script/doc mismatch is worth a separate fix, out of scope here.
- Timeframe: shipped 2026-08-01, scored 2026-09-14 — 44 days elapsed. The shortest window in any v1 success criterion (14-day return rate) is more than three times over.

---

## Criteria Scorecard

Every v1 success criterion, verbatim from `Documentation/solution/SOLUTION_BRIEF.md`'s falsifiable rewrite (the PRD's own success criteria section defers to this rewrite by name).

| Success criterion (verbatim) | Target | Actual | Verdict | Evidence |
|---|---|---|---|---|
| 60% of users who start onboarding will complete all 3 steps within their first session | 60% | 75% (3 of 4) | **Not measurable** | PostHog funnel, `onboarding_started` → `onboarding_completed`, `project = 'financial-planning'`, 2026-08-01 to 2026-09-14: 4 people started, 3 completed. The number clears the bar, but n = 4 over 44 days on a public URL is not evidence of real users converting — every prior session's memory records zero confirmed non-Gaurav signups, and the original North Star verification (`METRICS_PLAN.md`, 2026-07-28) explicitly logged its own single completion as "this session's own test account, not a real user." Nothing distinguishes these 4 from the same pattern. [Insight](https://us.posthog.com/project/486719/insights/new) |
| 25% of users who complete onboarding will return at least once within 14 days | 25% | 0 of 2 tracked returns fall inside a 14-day window | **Missed** | PostHog retention query, target = `onboarding_completed`, returning = `dashboard_viewed`, `project = 'financial-planning'`, weekly buckets from 2026-08-01. The earliest cohort (2 completions) shows 0 returns in week 1 (the 0–14-day window); the only two returns recorded across the whole period land at week 3 and week 4 (21–28 days out). Caveat: n = 2–3 total is too small to generalize, but the data as it stands does not show the target hit. |
| 50% of households will increase their Completeness Score by ≥1 tier within 30 days of signup | 50% | Cannot be computed | **Not measurable** | `METRICS_PLAN.md`'s own 2026-08-01 entry (D-012) records that `before_tier`/`after_tier` were stripped from `completeness_score_changed` events the same day this target was supposed to start being tracked, because sending them to a shared PostHog project would have leaked what a household's own privacy architecture is built to hide. No replacement measurement path (a person/group property snapshot) was ever built. This was flagged as accepted debt at the time, not discovered now — but it means the criterion has never once been measurable, for its entire life. |
| Demo-household button lets a recruiter/visitor experience full value with zero data entry | — | Cut | **Cut, not scored** | Removed from v1 scope in the Phase 1 interview (2026-06-23), before launch. Not a live criterion. |

---

## Guardrail Scorecard

This project's `METRICS_PLAN.md` has no section literally named "Guardrail Metrics" — the nearest equivalent is its **Health Metrics** table, scored here on the same terms (a North Star hit while one of these quietly burns is a miss wearing a costume).

| Guardrail | Breach threshold | Held / breached | Breach owner acted? |
|---|---|---|---|
| Error rate | > 2% alert | **Not measurable at this volume** | n/a — Sentry shows exactly 2 unresolved issues in the last 90 days (`HOUSEHOLD-FINANCIAL-PWA-3`, `HOUSEHOLD-FINANCIAL-PWA-2`), 1 event and 1 user each. Both read as browser-extension noise, not app bugs (`UnhandledRejection: ... Object Not Found Matching Id ... MethodName:update` is a known pattern from a third-party extension probing the DOM; the `SyntaxError: Unexpected token '('` carries no app stack trace). With traffic this low, a percentage is not a meaningful statistic either way. |
| p95 latency | > 1s alert | **Not measurable** | n/a — no latency/APM instrumentation was ever wired up beyond Vercel's own function logs. This was never ticked as done anywhere in the project's docs; it is a real, standing gap, not a false negative. |
| Uptime | < 99% alert | **Not measurable** | n/a — no uptime monitor exists. `/api/health` has been checked manually, once per session, dozens of times across the project's history, and has never once returned anything but `"status":"ok"` — but a manual spot-check across sessions is not an uptime measurement, and no incident would have been caught between checks. |
| SEC-001 (rate limiting) | First real traffic or any Neon quota warning | **Held, but the trigger has not fired because there has been no real traffic to trigger it** | n/a — an honest, deliberately deferred gap since `DEPLOYMENT_CHECKLIST.md` was first written (2026-07-28), re-affirmed at every session since. Still open. |

---

## The One Lesson (as a rule)

**When a project's actual goal is a portfolio/skills-showcase artifact rather than a distributed product, write its PRD success criteria to measure that goal directly (build depth, decision-log quality, one real walkthrough with a non-author user) — never borrow acquisition-style metrics (funnel completion, N-day return, tier-growth percentages) that structurally cannot be measured without real user distribution the project was never going to pursue.**

Anecdote this is drawn from: three of this project's four v1 success criteria are still unscoreable or negative 44 days after launch, not because the product failed, but because they were written as if a marketing/acquisition motion would follow launch — and Gaurav corrected the premise himself on 2026-09-12: Vittam was always a closed-circle build with no infra or compliance budget to serve real households, never a market bid. That correction came from a council review, not from this postmortem or from the Phase 0 intake nine weeks earlier, where a SaaS-shaped success-criteria template was filled in by default. The rule is to catch that mismatch at intake, not at postmortem.

Copied verbatim into `memory/past-mistakes.md`.

---

## Verdict: Iterate

- **Scale** does not apply — Gaurav has explicitly ruled out a distribution/acquisition push (no infra or compliance budget for real households, 2026-09-12).
- **Retire** does not apply — the project is actively invested in as a portfolio piece; the D-024/D-025 AI counsel and bulk-import cycle shipped two days before this postmortem was scored.
- **Iterate**, with the target of iteration corrected by the 2026-09-12 reframing: the problem being solved is no longer "acquire and retain households," it is "produce the strongest possible skills-showcase artifact." What changes:
  1. The next real signal is the one thing every review of this product (the 2026-09-12 council, this postmortem) keeps landing on: get **one real non-Gaurav user** through onboarding cold, no hand-holding, and watch where they actually stop. That is cheaper than any of the four v1 criteria and answers a question none of them can.
  2. Any future PRD or Solution Stage pass on this project should stop writing SaaS-shaped success criteria (this postmortem's One Lesson) and instead score against recruiter-facing outcomes this artifact can actually produce: decision-log depth, one real cold-user walkthrough, code/architecture craft.
  3. The three open technical questions from the 2026-09-12 council (dashboard staleness signal, and the ledger compare-strip mislabeling — the latter fixed same-session as this postmortem, 2026-09-14) are now one item lighter; the dashboard staleness question remains open and is a reasonable next slice if a real user's feedback doesn't reprioritize it first.

Next action: log this verdict and its evidence in `memory/decisions.md`, and route "get one real non-Gaurav user through onboarding" as the next investment slice's Phase 1 input, superseding the four v1 acquisition-style criteria rather than re-measuring them.

---

## Postmortem Gate — all three must be true

- [x] Every success criterion and every guardrail carries a scored verdict with cited evidence. Zero rows blank, zero rows hand-waved.
- [x] Exactly one lesson, stated as a rule, is written into `memory/past-mistakes.md`.
- [x] Exactly one of Iterate / Scale / Retire is chosen: **Iterate**.

**Feedback gate:** Awaiting "Postmortem approved" from Gaurav. On approval: verdict's next action logs to `DECISIONS_LOG.md`; verdict plus evidence to `memory/decisions.md`; `CASE_STUDY.md`'s Metrics section gets the post-launch numbers above.
