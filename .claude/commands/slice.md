# /slice — Execute one development slice (Blueprint Phase 4)

Execute the next slice from `IMPLEMENTATION_PLAN.md` using the per-slice protocol. In order, no skipping:

1. **Red** — failing tests first (`superpowers:test-driven-development` if available)
2. **Green** — minimum code to pass
3. **Refactor** — Correct → Simple → Maintainable → Fast → Elegant
4. **Instrument** — this slice's analytics events from `METRICS_PLAN.md`, via the typed `track()` wrapper only; run `scripts/check_events.py`
5. **Document** — add the capability section to `HOW_TO_USE.md` + its `ACCEPTANCE_CRITERIA.md` script, same commit
6. **Review** — `superpowers:simplify` or code review: CRITICAL pass (auth bypass, injection, XSS, data loss) then INFORMATIONAL
7. **Smoke-run** — run the live app and exercise the slice in the browser. Green tests routinely coexist with a visibly broken UI. No commit until it works live.
8. **Commit** — one slice = one logical commit

**After committing — context reset (mandatory):**
- Prepend a 5-line entry to `Documentation/plan/PROGRESS.md` (slices done / current state / next slice / open decisions / kill-criterion check)
- Run `/compact`
- Re-anchor on `DECISIONS_LOG.md` before starting the next slice

**Tripwires:** scope expands mid-slice → stop, route to Solution Stage. Kill criterion triggered → stop, run reclassification (FRAMEWORK.md), ship what exists.
