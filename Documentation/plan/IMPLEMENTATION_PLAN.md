# Implementation Plan — Household Financial Planning PWA

**Status:** approved ("Plan approved" gate passed 2026-07-10 — Gaurav authorized autonomous decision-making for this session; no ambiguity required escalation)
**Inputs:** `SOLUTION_BRIEF.md`, `SPEC.md`, `DATA_MODEL.md`, `COMPONENT_SHOWCASE.md`, `METRICS_PLAN.md`, `DECISIONS_LOG.md`, design tokens
**Rule:** Slices ordered hardest-unknown-first after Slice 0. Default feature-list ordering is a trap.

---

## Slice 0 — Walking Skeleton (mandatory first)

No feature code. Proves the deployment pipeline before complexity arrives.

- [ ] Frontend shell deployed (applies design tokens + installs the handoff's shadcn list as first act: `button input select checkbox dialog sheet toast skeleton badge separator progress label textarea`)
- [ ] Backend `/health` returns 200 with `version` + `commit_sha`
- [ ] Database connected (one real read/write — Neon, via Drizzle)
- [ ] PostHog initialised (one test event visible in dashboard)
- [ ] Sentry initialised (one test error visible)
- [ ] `/docs` route stub live
- [ ] Typed event registry installed (`analytics.ts`), CI event check wired — one shared `track()` wrapper fanning out to PostHog + `analytics_events` table (per METRICS_PLAN.md implementation notes)
- [ ] CI green on main

**Deployed URL:** [filled when live]
**Date deployed:** [check against kill criterion — 2026-07-23]

---

## Slice Ordering Rationale

**Project-killer candidate: Clerk + Hono + Drizzle + Neon multi-tenant auth resolution (Slice 1).** Per `DATA_MODEL.md` and `app/CLAUDE.md`, multi-tenancy is enforced entirely at the application layer — every Hono route must resolve `household_id` from the Clerk session (`households.owner_user_id = clerkUserId`) before any query runs, with **no Postgres RLS safety net**. `SPEC.md` §7 flags this as the one implementation cost with "no acceptable simpler fallback — a correctness requirement, not a nice-to-have." This is also a stack combination none of Gaurav's past sessions have proven end-to-end: Clerk session → Vercel Function (Hono) → Drizzle query scoping, on the free tiers. If this integration has a gap (a route that forgets to filter, a session-resolution edge case, a Vercel Functions cold-start/Clerk-token mismatch), it is a silent cross-household data leak, not a visible crash — the worst kind of bug to discover late. Every other slice writes queries that depend on this pattern being correct, so it must be proven — and its test coverage locked in — on day 1 of feature work, not discovered while building Slice 6's dashboard query. Everything else (forms, CRUD, charts, PWA caching) is well-trodden ground for this stack; this is the one novel, high-blast-radius unknown.

Second-order risk, deliberately placed mid-sequence rather than first: the **Completeness Score cross-table computation** (Slice 6) touches 3 tables (members, holdings, protection) and must stay accurate as a live recompute — flagged in `SPEC.md` §7 with a named simpler fallback (read-time-only computation), so it is real but not project-killing; it lands after the data it depends on (members, holdings, protection) already exists.

---

## Slices

### Slice 1 — Auth + household creation

| Field | Value |
|---|---|
| User-visible capability | User signs up/in via Clerk; a household row is created and scoped to their Clerk user ID; Onboarding Step 1 ("Let's start with your family.") works end-to-end. |
| Riskiest assumption | Every Hono route can reliably resolve `household_id` from the Clerk session server-side, with zero routes accepting a client-supplied `household_id`. |
| Proves / kills | A second test user cannot read or write the first user's household via any route (including malformed/missing-household edge cases) — proves the app-layer isolation model is sound before any other feature builds on it. If this can't be made airtight within the stack, it kills the "app-layer only, no RLS" architecture decision and forces a re-anchor (Postgres RLS or a middleware rewrite) before Slice 2. |
| Tests | Unit: household-resolution middleware (valid session / missing session / session with no household yet). Integration: two-user isolation test hitting every Slice-1 route with User B's token against User A's household ID. E2E: sign up → create household → land on Step 2. |
| Analytics events | `signup_completed` / `signup_failed`, `login_completed` / `login_failed` (Universal Baseline), `onboarding_started`, `onboarding_step_completed` (step=household) |
| `HOW_TO_USE.md` section | "Signing up and creating your household" |
| Dependencies | Slice 0 (DB connection, deployed shell, event registry) |
| Revert is clean | Single commit; auth/household routes are additive (no existing routes to break); feature-flaggable via disabling the Clerk middleware if needed |

### Slice 2 — Family members CRUD

| Field | Value |
|---|---|
| User-visible capability | Onboarding Step 2 ("Who are we planning for?") — add ≥1 family member (name, relationship, DOB required; risk_profile optional) via bottom sheet. |
| Riskiest assumption | The household-scoping middleware proven in Slice 1 composes cleanly onto a second resource (family_members) without route-specific isolation bugs. |
| Proves / kills | Confirms the Slice-1 auth pattern generalizes (not a one-off). If a second resource needs different scoping logic, that's a design smell worth catching now, on the simplest possible CRUD resource. |
| Tests | Unit: DOB validation, relationship enum validation. Integration: member CRUD scoped to household (cross-household read attempt blocked). E2E: add member → member card appears → "Continue" unlocked. |
| Analytics events | `onboarding_step_completed` (step=members), `feature_used` (feature_name="add_family_member") |
| `HOW_TO_USE.md` section | "Adding family members" |
| Dependencies | Slice 1 (household + auth scoping pattern) |
| Revert is clean | Single commit; family_members table/routes are additive; onboarding flow degrades to Step 1 only if reverted |

### Slice 3 — Instrument library (seed + browse)

| Field | Value |
|---|---|
| User-visible capability | Explore tab: 6 section cards → instrument list (Name/Returns/Risk) → instrument detail (all 7 fields). 30 instruments seeded and browsable, fully offline via PWA precache. |
| Riskiest assumption | The seed dataset (30 instruments) can be authored and loaded before Slice 4 needs `instrument_id` as a holdings FK; PWA precache of static library content works with vite-plugin-pwa out of the box. |
| Proves / kills | Confirms content-authoring (the actual long pole per D-010's own risk note) doesn't block engineering — if 30 instruments can't be drafted in this slice's timebox, ship with a smaller seed set and log the gap rather than blocking Slice 4. |
| Tests | Unit: seed script produces exactly 30 rows across 6 categories with all required fields non-null. Integration: instrument read routes (no auth required — public within app). E2E: browse all 6 sections → open one detail page → confirm offline (airplane mode) still renders precached content. |
| Analytics events | `library_section_viewed`, `instrument_viewed` |
| `HOW_TO_USE.md` section | "Browsing the instrument library" |
| Dependencies | Slice 0 (DB, deploy pipeline) — does not depend on Slice 1/2 auth (public read) |
| Revert is clean | Single commit; instruments table is read-only and additive; Explore tab hidden via nav config if reverted |

### Slice 4 — Holdings entry (Onboarding Step 3 + Portfolio tab)

| Field | Value |
|---|---|
| User-visible capability | Onboarding Step 3 ("What do you currently hold?") + Portfolio tab: add/edit/view holdings per member, kind-aware form (optional fields collapsed by default), instrument picker. This closes the full onboarding loop — the "aha moment" from D-001. |
| Riskiest assumption | The progressive-disclosure holding form (optional fields collapsed, correct initial state for add vs. edit) is buildable from one shared component without diverging add/edit code paths — flagged as a real cost in `SPEC.md` §7. |
| Proves / kills | Confirms the add/edit form pattern before Slice 5 (protection) reuses the same sheet pattern. If the collapse/expand state logic is fighting the form library, simplify now per the named fallback (flat fields, defer disclosure) rather than carrying the workaround into Slice 5. |
| Tests | Unit: form validation (amount fields numeric, required fields per instrument kind). Integration: holdings CRUD scoped to household + member; `asset_class` denormalization from instrument on save. E2E: complete onboarding Step 3 → land on dashboard for the first time → add a second holding via Portfolio tab FAB. |
| Analytics events | `onboarding_step_completed` (step=holdings), `onboarding_completed`, `holding_created`, `holding_updated` |
| `HOW_TO_USE.md` section | "Recording a holding" |
| Dependencies | Slice 1 (household/member scoping), Slice 2 (family_members must exist), Slice 3 (instruments must exist to reference) |
| Revert is clean | Single commit; holdings table/routes additive; onboarding Step 3 and Portfolio tab both gate on this slice — revert returns app to a 2-step onboarding preview state (acceptable only as an emergency rollback, not a target state) |

### Slice 5 — Protection tracking

| Field | Value |
|---|---|
| User-visible capability | Record insurance/protection coverage per member (type, cover amount, premium, provider, status) — needed for Completeness Check #3. Lives in Profile per `DATA_MODEL.md`'s open placement note, resolved here as: a "Protection" card inside Profile, not a separate tab (keeps the 4-tab nav locked in `WIREFRAMES.md` unchanged). |
| Riskiest assumption | None novel — same CRUD-on-scoped-resource pattern as Slice 2/4. Included as its own slice (not folded into Slice 4) because it's a distinct entity gating a distinct Completeness check, and keeping it isolated makes Slice 6's score query easier to test against known fixtures. |
| Proves / kills | Low risk; primarily a coverage-completeness slice for the Completeness Score inputs. |
| Tests | Unit: protection CRUD validation (cover_amount numeric, status enum). Integration: scoped to household + member. E2E: add protection for both parents → visible in Profile. |
| Analytics events | `feature_used` (feature_name="add_protection") — no dedicated event in METRICS_PLAN.md; routed under Universal Baseline, logged here rather than silently added as new scope |
| `HOW_TO_USE.md` section | "Recording insurance and protection" |
| Dependencies | Slice 1 (household/member scoping), Slice 2 (members must exist) |
| Revert is clean | Single commit; protection table/routes additive; Completeness Check #3 degrades to "always unmet" if reverted (acceptable, does not break other checks) |

### Slice 6 — Dashboard: Completeness Score + AllocationDonut

| Field | Value |
|---|---|
| User-visible capability | Home dashboard: Health tier card (Getting Started/On Track/Strong) + AllocationDonut (populated, ghost/empty, loading states) — the core return-visit hook. |
| Riskiest assumption | The 5-check cross-table Completeness Score can be computed correctly and performantly at read-time (per the named simpler fallback in `SPEC.md` §7 — deferring live-recompute-on-every-write to a fast-follow) without the dashboard feeling laggy. |
| Proves / kills | If read-time computation is fast enough (single dashboard load, 5 small aggregate queries against a household with ≤50 holdings per `DATA_MODEL.md` note 6), the simpler fallback is validated and live-recompute is correctly deferred, not silently forgotten. |
| Tests | Unit: each of the 5 checks against fixture households (0 members, 1 member no holdings, full coverage, etc.). Integration: dashboard endpoint returns correct tier for each fixture. E2E: fresh household → dashboard shows ghost donut + Getting Started tier; add a holding → tier updates on next load. |
| Analytics events | `dashboard_viewed`, `completeness_score_changed` |
| `HOW_TO_USE.md` section | "Understanding your Household Health score" |
| Dependencies | Slice 4 (holdings), Slice 5 (protection), Slice 2 (members) — needs all three entities populated to compute all 5 checks |
| Revert is clean | Single commit; dashboard read-only endpoint; revert falls back to a static "Coming soon" card, app remains usable via Portfolio/Explore tabs |

### Slice 7 — Nudge system

| Field | Value |
|---|---|
| User-visible capability | Single ordered nudge card on the dashboard — first unmet Completeness check, fixed copy from `COPY_DECK.md`, linking to its learn-card in Explore. |
| Riskiest assumption | None novel — pure derived-state UI on top of Slice 6's score data (first unmet check in fixed order). Kept as its own slice because `SPEC.md` §6 makes "exactly one nudge, never zero or more than one" a testable constraint worth its own test suite rather than bundling into Slice 6. |
| Proves / kills | Confirms the "never zero, never more than one" invariant holds across all 32 possible check-pass combinations (2^5). |
| Tests | Unit: nudge-selection logic against all 2^5 combinations of the 5 checks. E2E: dashboard always shows exactly one NudgeCard; clicking it navigates to the correct learn-card. |
| Analytics events | `nudge_shown`, `learn_card_clicked` |
| `HOW_TO_USE.md` section | "Following a nudge" |
| Dependencies | Slice 6 (Completeness Score must exist) |
| Revert is clean | Single commit; NudgeCard is a pure presentational addition to the dashboard; revert removes the card, dashboard remains functional |

### Slice 8 — PWA install + offline dashboard precache

| Field | Value |
|---|---|
| User-visible capability | Custom install prompt (post-activation); last-known dashboard renders read-only from cache when offline (with staleness indicator), in addition to the library precache already live since Slice 3. |
| Riskiest assumption | A service-worker strategy can cache the *last successful dashboard API response* (not just static assets) and distinguish "fresh" from "stale-cached" in the UI — flagged in `SPEC.md` §7 with a named fallback (network-only dashboard, plain error state offline). |
| Proves / kills | If the dynamic-response caching strategy fights vite-plugin-pwa's defaults, fall back to the named simpler option (dashboard requires network) rather than burning the slice on a custom service-worker layer — decide inside this slice, don't let it bleed into Slice 9. |
| Tests | Unit: staleness-indicator logic (cache timestamp vs. now). E2E: load dashboard online → go offline → reload → last dashboard renders with staleness banner; install prompt appears after first successful dashboard view and triggers native install. |
| Analytics events | `pwa_shell_loaded`, `pwa_install_prompted`, `pwa_installed` |
| `HOW_TO_USE.md` section | "Installing the app and using it offline" |
| Dependencies | Slice 3 (precache pattern already proven for library), Slice 6 (dashboard must exist to cache) |
| Revert is clean | Single commit; falls back cleanly to network-only dashboard (the named simpler fallback) with no loss of core functionality |

### Slice 9 — Profile + account deletion

| Field | Value |
|---|---|
| User-visible capability | Profile screen: household/member editing, sign-out, delete-account (hard-delete cascade per Clerk `user.deleted` webhook). |
| Riskiest assumption | The Clerk webhook → cascade-delete path fires reliably and deletes all child rows (family_members, holdings, protection, goals) while correctly orphaning (not deleting) `analytics_events`, per `DATA_MODEL.md`'s retention rule. |
| Proves / kills | A test account created, populated, and deleted must leave zero rows in every user-owned table and a retained (orphaned) row in `analytics_events` — proves the retention policy is actually implemented, not just documented. |
| Tests | Unit: webhook handler cascade logic against a fixture household. Integration: full create→populate→delete→verify-zero-rows cycle. E2E: delete account from Profile → confirmation sheet → signed out → data gone. |
| Analytics events | `feature_used` (feature_name="edit_household" / "delete_account") — Universal Baseline, no dedicated event in METRICS_PLAN.md |
| `HOW_TO_USE.md` section | "Managing your account" |
| Dependencies | Slice 1 (household), Slice 2 (members) |
| Revert is clean | Single commit; account-deletion route is additive and gated behind an explicit confirm sheet; safe to revert without affecting any other flow |

### Slice 10 — "Why these choices?" page + final polish

| Field | Value |
|---|---|
| User-visible capability | Static, non-auth-gated page explaining the product's design/architecture decisions (recruiter/curious-user surface per D-007); final accessibility pass (contrast, focus rings, `prefers-reduced-motion`, touch targets ≥44px per `SPEC.md` §6). |
| Riskiest assumption | None — lowest-risk slice by design, placed last intentionally. |
| Proves / kills | N/A — closes out the Constraints Contract checklist from `SPEC.md` §6 as a final verification pass, not a discovery slice. |
| Tests | E2E: page loads without auth; automated a11y scan (axe or equivalent) against all screens for the Constraints Contract assertions. |
| Analytics events | `why_page_viewed` |
| `HOW_TO_USE.md` section | "Why these choices? (design rationale)" |
| Dependencies | All prior slices (references `DECISIONS_LOG.md` entries and the completed feature set) |
| Revert is clean | Single commit; static content page, zero interaction with any data model |

---

## Out of Plan

None. No new scope surfaced during planning — this plan implements exactly the 13 v1 features in `SOLUTION_BRIEF.md`, the schema in `DATA_MODEL.md`, and the screens in `SPEC.md` §4. Two placement decisions were made *within* existing scope (not new scope) and are logged here for traceability rather than silently absorbed:
- **Protection UI placement** — `DATA_MODEL.md` left this as "Profile or dedicated section (Phase 2 decision)"; resolved as a card inside Profile (Slice 5) to avoid adding a 5th nav tab, consistent with the locked 4-tab + FAB nav.
- **Protection analytics event** — `METRICS_PLAN.md` has no dedicated event for protection CRUD; routed under the Universal Baseline `feature_used` event rather than inventing a new named event outside the metrics plan.
