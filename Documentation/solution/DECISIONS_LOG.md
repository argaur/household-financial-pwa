# Decisions Log — Household Financial Planning PWA

**Rule:** Append-only. Never edit or delete an entry — supersede it with a new one.
**Used for:** Re-anchoring between slices (Phase 4) and drafting `CASE_STUDY.md` (Phase 6).

Every entry records the decision AND the rejected alternative. A decision without a named alternative is a description, not a decision.

---

## Cost & Kill Budget (from Phase 1 — copy here, check at every slice boundary)

| Budget | Value |
|---|---|
| Max monthly infra cost | ₹0/month target (free tiers only — Neon, Vercel, Clerk, PostHog, Sentry). First to hit its ceiling if usage grows: Clerk (10k MAU free tier) |
| Kill criterion | If Slice 0 isn't deployed in 30 days → descope to Builder OS |

---

## Entries

### D-001 — Holdings-first core journey

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** v1's critical path is onboarding (household → members → holdings) → personal dashboard. The instrument library is secondary, reached via nudges/Explore.
- **Rejected alternative(s):** Library-first (browse instruments before adding holdings); demo-first (populated demo dashboard with no signup, convert later).
- **Why:** Fastest route to the "aha" moment (seeing your own household visualized) drives onboarding completion and retention; literacy content should support that moment, not gate it.
- **Revisit if:** Onboarding completion rate badly misses the 60% target and demo-first analysis suggests friction, not content, is the cause.

### D-002 — Manual value entry only, no auto-pricing in v1

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** All holdings (including MF, gold, crypto) use manual current-value entry in v1. No mfapi.in/CoinGecko/gold API integration.
- **Rejected alternative(s):** Auto-price for MF only; auto-price for all three as originally scoped in the 2026-06-14 brainstorm.
- **Why:** The dashboard's core value (allocation visualization, completeness score) doesn't require live prices. Avoids 3 external API integrations, rate-limit/CORS/failure handling, and `price_source` reconciliation for no v1-critical gain.
- **Revisit if:** User feedback shows stale values are a credibility problem, or v1.5 scope is being planned.

### D-003 — Cut demo-household button from v1

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** No demo-household / demo-mode feature in v1.
- **Rejected alternative(s):** Full switchable demo mode (originally scoped); minimal seeded-demo-household-via-real-path link.
- **Why:** Conflicts with the holdings-first journey (D-001) — would reintroduce a second, parallel critical path requiring a demo/real mode flag. Real onboarding is only 3 steps, so it serves the same recruiter-viewing purpose without dual-path complexity.
- **Revisit if:** Recruiter/portfolio feedback indicates the 3-step onboarding is too much friction for casual viewers.

### D-004 — Repo visibility: public

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** The app repo is public.
- **Rejected alternative(s):** Private with a sanitized public case-study mirror; private only.
- **Why:** This is an explicit PM portfolio piece — a private repo means the decision-log narrative can't be verified firsthand, only described. Also forces real secret/security hygiene now.
- **Constraint this creates:** No real household financial data (including Gaurav's own) may ever be committed or seeded — sample/demo data must be synthetic.
- **Revisit if:** Never, without a strong reason — this is foundational to the portfolio-piece goal.

### D-005 — Analytics: keep both PostHog and internal `analytics_events` table

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** Use both PostHog (funnels/retention dashboards) and the internal Postgres `analytics_events` table (North Star funnel), via one shared `track()` wrapper.
- **Rejected alternative(s):** Internal table only + Sentry; PostHog only (dropping the internal table from the data model).
- **Why:** Gaurav's explicit call, overriding the YAGNI-leaning recommendation (internal-only) — wanted both the dashboard convenience of PostHog and full ownership/queryability of the internal table for the Completeness Score calc.
- **Revisit if:** The duplicate event-logging maintenance becomes a real burden relative to v1's size.

### D-006 — Success metric numeric targets

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** Onboarding completion 60%, 14-day return 25%, Completeness Score +1 tier within 30 days for 50% of households. Demo-household metric dropped (feature cut, D-003).
- **Rejected alternative(s):** No numeric targets (research-question-only framing); aggressive targets (80%/40%/70%).
- **Why:** Conservative targets chosen deliberately — this is a brand-new, unmarketed v1 with zero prior data; a bar you clear or badly miss is informative, an aggressive arbitrary bar is not.
- **Revisit if:** After 30 days of real usage data, recalibrate against actuals.

### D-007 — Recruiter signal: craft + architecture, not transparency-narrative-led

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** The primary recruiter pitch is visual/UX craft (PWA polish, install flow, dark mode) plus backend architecture (Hono + Drizzle + Neon + Clerk, real multi-tenant schema). The decision-log/"Why these choices?" transparency angle still exists but is secondary.
- **Rejected alternative(s):** Judgment/transparency-led signal as the primary pitch (what got cut and why).
- **Why:** Gaurav's explicit choice — picked both craft and architecture options over the transparency-led option offered.
- **Revisit if:** —

### D-008 — Cost ceiling and kill criterion

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** ₹0/month target infra cost (free tiers only); Clerk's free tier (10k MAU) is the first limiter if usage grows. Kill criterion: if Slice 0 isn't deployed within 30 days, descope to Builder OS.
- **Rejected alternative(s):** Higher ceiling (₹3,000–5,000/mo) to allow paid tiers from day one; longer kill window (60–90 days).
- **Why:** Zero real users at launch means zero justified spend. 30 days is tight enough to force momentum given this project has already had two scope pivots (private viewer → public PWA → this scoped v1) — the past-mistakes pattern here is exactly stalled momentum across pivots.
- **Revisit if:** Real usage emerges and free-tier ceilings are actually hit.

### D-009 — Completeness Score and nudge mechanism

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** Fixed 5-check, equal-weight checklist (member coverage, emergency-fund-equivalent holding, both parents' protection logged, ≥3 of 6 asset classes, all holdings have `current_value`) → tier (0–1/2–3/4–5). Single inline nudge = first unmet check in this fixed order, linking to its learn-card.
- **Rejected alternative(s):** Weighted checklist (e.g., protection checks weighted double); deferring exact checklist items to Phase 2.
- **Why:** Mirrors the gating logic already proven in Gaurav's own household plan (`ACTIONS.md`'s protection-gates-block-scale-ups pattern), generalized to any household. Deterministic and needs no weight-tuning with zero usage data.
- **Revisit if:** Real usage shows the fixed order misprioritizes for some household shapes.

### D-010 — Instrument library scope: 30 instruments

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** 6 sections × 5 instruments = 30 total (Equity, Debt, Gold, Hybrid/Guaranteed, Real Estate, Alternative).
- **Rejected alternative(s):** 6×7=40 (high end of original brainstorm range); 4 sections × 5 = 20 (cutting Real Estate and Alternative to v1.5).
- **Why:** 30 covers every instrument already in Gaurav's own household plan (SSY, GPF, LIC, gold, ETH, land) — validated against a real household — while staying bounded enough to finish within the 30-day Slice 0 kill criterion (D-008).
- **Revisit if:** Content-writing for 30 instruments turns out to be the long pole anyway; reconsider for v1.5 expansion only, not a v1 cut.
