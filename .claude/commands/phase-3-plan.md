# /phase-3-plan — Implementation Plan (Blueprint Phase 3)

Build `Documentation/plan/IMPLEMENTATION_PLAN.md` from the template. Inputs: signed-off `SPEC.md` + design handoff packet. Use `superpowers:writing-plans` if available.

**Rules:**
- **Slice 0 — Walking Skeleton, mandatory first:** frontend shell (applies design tokens + installs the handoff's shadcn list as first act) + `/health` with version+commit_sha + DB connection + PostHog + Sentry + `/docs` stub + typed event registry with CI check. No feature code.
- **Slices 1–N ordered hardest-unknown-first.** The riskiest integration goes to Slice 1; easy slices last. Write one paragraph naming the project-killer candidate and why it's first. Discovering it on day 2 is recoverable; on day 12 it is not.
- **Every slice is a vertical:** capability + tests + analytics events (from METRICS_PLAN) + HOW_TO_USE section + riskiest assumption named with its prove/kill outcome + dependency list + clean-revert assertion. One commit.
- Anything that smells like new scope → route to Solution Stage, log in DECISIONS_LOG. Never absorb.

**Gate:** Stop. Present the slice sequence. Wait for "Plan approved" before any code.
