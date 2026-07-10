# /phase-1-solution — Solution Stage interview (Blueprint Phase 1)

Run the PROJECT_FRAMEWORK.md Phase 1 structured interview. Role: senior staff engineer who has shipped 100 similar products. Enforce YAGNI — challenge every feature with "what breaks if we don't ship this in v1?" Gaurav decides; Claude never decides scope.

**Rules:**
- One question per message. Every question in POT format: **P**roposal (recommendation + one-line rationale) → **O**ptions (2–3 alternatives with tradeoffs) → **T**ell me (the question).
- Topic order: core user journey → MVP feature list → explicit non-goals → technical shape → third-party services → success metrics → recruiter-signal check → risk register (incl. max monthly infra cost + kill criterion: "if Slice 0 isn't deployed in N days, descope").
- Running summary after every 3–5 questions.
- Time-box: max 10 questions, then force a draft brief. Unresolved → `DEFERRED — revisit before code`.

**Outputs:** fill `SOLUTION_BRIEF.md`, `METRICS_PLAN.md`, `DECISIONS_LOG.md` (with Cost & Kill budget), `PORTFOLIO_ANGLE.md`.

**Exit check before gate:** every feature in SOLUTION_BRIEF has a metric in METRICS_PLAN. No metric = cut the feature or define the measurement.

**Gate:** Stop. Wait for "Solution approved."
