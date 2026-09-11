# Implementation Plan — Household Financial Planning PWA

**Status:** approved ("Plan approved" gate passed 2026-07-10 — Gaurav authorized autonomous decision-making for this session; no ambiguity required escalation)
**Codex lane, P6 addendum only:** `codex-lane: yes`, opted in 2026-09-10 per Gaurav's instruction and a `/council` run (`collab-runs/2026-09-10-ai-layer-plan/exchange.json`). Applies only to steps in P6 tagged `codex/<tier>/<effort>`; every other tag in this document predates the opt-in and stands as written.
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
- [x] Typed event registry installed (`analytics.ts`), CI event check wired — one shared `track()` wrapper. **The fan-out to `analytics_events` was never built** and this box stayed unticked for the whole project as a result. Closed 2026-08-01 by D-012, which drops the second sink rather than adding it: the registry and the CI check (`scripts/check_events.py`) do exist and work; only the table write was missing.
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

---
---

# D-016 Bundle — Ledger Slice 1 (Phase 3 Plan, 2026-08-24)

**Status:** draft — pending "Plan approved"
**Build arc:** `extends-existing`. **Pattern source:** the v1 holdings CRUD stack above (Slice 4 — Hono routes in `server/`, Drizzle schema in `server/db/schema.ts`, household-scoping middleware from Slice 1, React holdings forms/list in `src/`). Slice 0's skeleton (health check, PostHog, Sentry, event registry, CI) is already live — verified, not rebuilt.
**Inputs:** `SOLUTION_BRIEF.md` (D-016 amendment), `DECISIONS_LOG.md` D-016/D-017/D-018/D-019, `DATA_MODEL.md` "D-016 Bundle Additions", `METRICS_PLAN.md` "D-016 Feature Bundle" section.
**Scope of this plan:** the ledger feature only (D-018 §2's "thin slice 1"). AI counsel, goal planner, bulk import, and the full-platform redesign are named in D-016/D-017/D-018 but are **out of scope for this plan** — see Out of Plan below. This matches D-017 §8's build order ("ledgers land first") and avoids planning around the still-unprovisioned Anthropic key.

## 1. Summary & Guiding Principle

Household financial plans stop being a single static record. A household can create up to 4 additional "strategy ledgers" alongside the untouched "Current" baseline, each a full copy of Current's holdings that can then be edited independently, with a three-number delta strip comparing it back to Current. **Guiding principle: Current never changes because a ledger exists.** Every schema and API decision below optimizes for that one invariant over convenience elsewhere (e.g., no delta-overlay storage, full snapshots only, per D-018 §4).

**Confirmed scope decisions:**

| In scope | Out of scope (this plan) |
|---|---|
| `ledgers` table, `holdings.ledger_id` migration | AI counsel / goal planner (blocked on Anthropic key — D-018 Open Items) |
| Tab strip (`Current \| ledgers \| + New`) | Bulk-import Excel template/upload |
| Name-and-copy create modal, 4-ledger cap | Full-platform mint/treasury redesign (D-016 item 4) |
| Editable per-ledger dashboard (reuses Slice-4 holdings CRUD, scoped by `ledger_id`) | Projections (compound-growth line) — separate chunk, see Chunk 5 below, sequenced after slice 1 ships since D-018 §2 doesn't list it in the thin slice |
| Compare strip: total value / equity share / monthly SIP vs. Current | Side-by-side multi-ledger view (deferred behind `ledger_switched` usage data per D-018 Revisit-if) |
| `ledger_created` / `ledger_switched` telemetry (D-018 §1) | Instrument drift detection — moved to Out of Plan below after the gate review found its own load-bearing `[H]` unresolved (Open Decision #1); not part of this plan's approved chunk sequence |

Any scope creep during build routes back to Solution Stage and gets logged in `DECISIONS_LOG.md`, never absorbed silently.

## 3. The ONE structural decision

**Holdings move from a direct `household_id` FK to being reached through a new `ledgers` table (household → ledgers → holdings), on a live table with real user data.** `[P]` — confirmed by reading `server/db/schema.ts`: `holdings.household_id` is a live, populated NOT NULL FK today (verified 2026-08-24, current schema file).

**Resolution — additive, no drop:** `holdings.household_id` is **kept, not dropped**. `holdings.ledger_id` is added as a new nullable FK, backfilled (one `ledgers` row per existing household, `is_baseline=true`, `name='Current'`, then every existing holding's `ledger_id` set to that row), verified row-count-equal to the pre-migration count, then set `NOT NULL`. This revises the "removed as a direct relationship" line in `DATA_MODEL.md`'s D-016 Additions section — that line assumed a drop; keeping `household_id` avoids the destructive step entirely (a redundant column costs nothing at this data volume and gives every query a cheap integrity check: `holding.household_id` must equal `holding.ledger.household_id`). **Evidence this resolves it, not reasoning:** additive-only migrations on a live table with zero drops are the one migration shape that has a clean, tested rollback (drop the new column, done) — matching the plan-template's mandatory additive → backfill → cutover rule, and skipping "drop" entirely because there is nothing destructive to drop.

This is also the Chunk 1 project-killer candidate (see Chunk Ordering Rationale) — same risk from the structural and the build-sequencing angle, which is why it is first in both.

## 4. Data Model & Schema

Full field-level detail already in `DATA_MODEL.md` → "D-016 Bundle Additions" (Stage 0, approved). This section states only what changed from that draft per the Section 3 resolution above, plus API shapes.

**Schema delta from the Stage 0 draft:** `holdings.household_id` is retained (not removed) alongside the new `holdings.ledger_id`. Everything else in the Stage 0 draft (`ledgers`, `ledger_projection_settings`, `instruments.is_active`/`updated_at`, `households.ai_plans_created`) stands as written. `[P]` for `ledgers`/`ledger_id` (this plan), `[H]` for `ledger_projection_settings`/`instruments` soft-delete columns/`ai_plans_created` — those belong to Chunks 4–6, out of this plan's Slice-1 scope, not yet implemented or schema-verified against real query shapes.

**Indexes (write-frequent queries first):**
- `ledgers(household_id)` — every dashboard load lists a household's ledgers. Not unique (multiple ledgers per household).
- Partial unique index `ledgers(household_id) WHERE is_baseline` — DB-level backstop for "exactly one Current per household," per the Stage 0 draft's own note that this needs a backstop beyond app-layer logic.
- `holdings(ledger_id)` — every ledger-dashboard load and the compare-strip aggregate query filter by this. Composite `(ledger_id, asset_class)` covers the compare-strip's equity-share GROUP BY without a second index.
- `holdings(household_id)` index from v1 is retained as-is `[P]` — confirmed present in `server/db/schema.ts` (still used by any household-wide query, e.g. a future cross-ledger view).

**Schema-to-source mapping (extends-existing coverage):** the ledger CRUD routes and the editable dashboard/compare-strip UI (Chunks 2–3) mirror the Slice-4 holdings-CRUD pattern source named above. The tab strip, name-and-copy modal, and compare-strip visualization are **net-new frontend artifacts with no v1 precedent** (per `DATA_MODEL.md` note 10 — no existing UI needs mirroring for these) — called out explicitly here since this plan skips the optional §7 section. `mirrors src/features/holdings/` is `[H]` until the exact path is confirmed against the live tree at Chunk 3 kickoff — non-blocking for this gate since it is a same-day build-time confirmation of a path this project's own docs already reference, not an unverified architectural bet.

**API shapes** (Hono routes, `{ data, error }` envelope per the existing pattern in `server/`):

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /api/ledgers` | Session-scoped household (Slice-1 middleware) | Returns all ledgers for the caller's household, `is_baseline` first |
| `POST /api/ledgers` | Session-scoped household | Body: `{ name, copyFrom: 'current' }`. Server-side 4-ledger cap check (409 if at cap) and snapshot-copy transaction (all Current holdings re-encrypted under the same household data key, per D-018 §4) |
| `GET /api/ledgers/:id/holdings` | Session-scoped household + `ledger_id` ownership check | 404 if the ledger doesn't belong to the caller's household — never a 403 that confirms existence |
| `PATCH/POST/DELETE /api/ledgers/:id/holdings/:holdingId` | Same | Reuses Slice-4 holdings validation logic, scoped by `ledger_id` instead of bare `household_id` |
| `GET /api/ledgers/:id/compare` | Same | Server-computed three-number delta vs. the household's baseline ledger |
| `DELETE /api/ledgers/:id` | Same | Rejects with 400 if `is_baseline=true` — Current can never be deleted via this route |

## 8. Chunk Map & Boundary Contracts

**Chunk ordering rationale — project-killer first.** Chunk 1 (the migration in Section 3) is the project-killer: every other chunk's routes and UI assume `holdings.ledger_id` exists and is correctly backfilled. A wrong backfill silently corrupts which holdings belong to which ledger — on real data (Gaurav's own household is the only live one, but the correctness bar is the same as if it weren't). Discovering a backfill bug after Chunk 3 ships (once the UI lets users create and edit ledgers) means untangling live user edits from a bad migration; discovering it in Chunk 1, before any ledger-aware UI exists, means re-running one script. Chunks 2–3 are additive CRUD/UI on a stack (Hono + Drizzle + Clerk-scoped middleware) already proven in v1 Slice 1 — well-trodden, not novel. **Instrument drift detection was drafted as a Chunk 4 and removed from this plan's approved sequence during the gate review** (see Out of Plan) — its `instruments.updated_at` semantics carried a load-bearing, unresolved `[H]` (Open Decision #1), and the gate does not let an unresolved load-bearing hypothesis onto the approved critical path. It becomes its own follow-on chunk once that hypothesis is resolved.

### Chunk 1 — Ledger schema migration
- **Owns:** `ledgers` table (new), `holdings.ledger_id` column (new)
- **Reads but does not own:** `households` (via `household_id` FK, owned by the pre-existing households chunk)
- **Endpoints:** none — schema/migration only
- **Acceptance criteria:** migration runs against a Neon branch first (never directly against production, per the project's own `RUNBOOK.md` convention); post-migration row count of `holdings` unchanged; every existing holding has a non-null `ledger_id` pointing at an `is_baseline=true` ledger for its household; `npm run db:probe` (the project's own ground-truth check, not `_journal.json`) confirms applied state in both the branch and, after promotion, production.
- **Dispatch steps:**
  - [ ] Write the Drizzle migration adding `ledgers` (with `is_baseline`, `origin`, `ai_edits_used`, `snapshot_of`, `projection_horizon_years`) and nullable `holdings.ledger_id`, plus the partial unique index on `ledgers(household_id) WHERE is_baseline` and the `holdings(ledger_id)` / composite `(ledger_id, asset_class)` indexes `[model: sonnet]`
  - [ ] Run the migration against a Neon branch (never production directly) `[model: sonnet]`
  - [ ] Write and run the backfill script (one `Current` ledger per household, backfill `holdings.ledger_id`) and verify row-count-equal + no-null before setting `NOT NULL` — this is the project-killer step named in the Chunk Ordering Rationale, real household data, wrong output is expensive to unwind `[model: opus]`
  - [ ] Verify via `npm run db:probe` on the branch, then again after promotion to production `[model: sonnet]`

### Chunk 2 — Ledger CRUD API + tab strip UI
- **Owns:** none new (API surface only, over Chunk 1's tables)
- **Reads but does not own:** `ledgers`, `holdings` (owned by Chunk 1)
- **Endpoints:** `GET/POST /api/ledgers`, `DELETE /api/ledgers/:id`
- **Acceptance criteria:** two-user isolation test (User B's token cannot list/create/delete against User A's household — mirrors the Slice-1 v1 pattern-source test); 4-ledger cap returns 409 on the 5th attempt; `is_baseline` ledger rejects delete; `ledger_created` event fires with the correct properties (per `METRICS_PLAN.md`)
- **Dispatch steps:**
  - [ ] Write `GET /api/ledgers`, `DELETE /api/ledgers/:id` (with the `is_baseline` delete guard) and the 4-ledger cap check on `POST` `[model: sonnet]`
  - [ ] Write the `POST /api/ledgers` snapshot-copy transaction — copies every Current holding to the new ledger, re-encrypted under the household's existing data key (D-018 §4); this touches the D-014 client-side-encryption boundary directly, security-sensitive `[model: opus]`
  - [ ] Write the two-user isolation test mirroring the Slice-1 v1 pattern-source test `[model: sonnet]`
  - [ ] Build the tab strip UI (`Current | ledgers | + New`, at-cap disabled state) `[model: sonnet]`
  - [ ] Build the name-and-copy create modal `[model: sonnet]`
  - [ ] Wire `ledger_created` telemetry per `METRICS_PLAN.md` `[model: sonnet]`

### Chunk 3 — Ledger dashboard (editable) + compare strip
- **Owns:** none new
- **Reads but does not own:** `ledgers`, `holdings` (Chunk 1); reuses the Slice-4 holdings-CRUD component and validation logic as its documented contract (`mirrors src/features/holdings/` — exact path confirmed against the live tree before code, not assumed)
- **Endpoints:** `GET/PATCH/POST/DELETE /api/ledgers/:id/holdings*`, `GET /api/ledgers/:id/compare`
- **Acceptance criteria:** editing a non-baseline ledger never writes to Current's rows (isolation test: edit ledger A, assert Current's holdings table unchanged); compare-strip numbers match a hand-computed fixture; `ledger_switched` fires on tab change
- **Dispatch steps:**
  - [ ] Confirm the `src/features/holdings/` mirror path against the live tree (resolves the `[H]` tag in §4) `[model: sonnet]`
  - [ ] Write `GET/PATCH/POST/DELETE /api/ledgers/:id/holdings*` scoped by `ledger_id`, reusing Slice-4 validation logic `[model: sonnet]`
  - [ ] Write `GET /api/ledgers/:id/compare` (total value / equity share / monthly SIP delta vs. Current) `[model: sonnet]`
  - [ ] Write the isolation test proving an edit to ledger A never writes Current's rows `[model: sonnet]`
  - [ ] Adapt the Slice-4 holdings UI to render inside a ledger-scoped dashboard, and build the compare-strip UI `[model: sonnet]`
  - [ ] Wire `ledger_switched` telemetry on tab change `[model: sonnet]`

**Chunk 4 (Instrument drift detection) drafted then withdrawn from this plan** — see Open Decision #1 and Out of Plan below.

## 8b. Build-time corrections (appended during execution, 2026-08-24)

Recorded here rather than edited into the sections above, so the approved plan and what execution actually found stay tellable apart. Four items; the first two are decided, the third is applied, the fourth is open.

1. **The compare strip cannot be server-computed, and the snapshot copy cannot be server-performed.** §4 specifies `GET /api/ledgers/:id/compare` as a "server-computed three-number delta" and `DATA_MODEL.md` line 358 specifies it as `SUM(current_value)` / equity share / `SUM(monthly_sip)` grouped by `asset_class`. Every one of those columns is `NULL` on every encrypted row — migration `0002` relaxed them to nullable precisely so ciphertext could be written instead (`scripts/schema-probe.mjs` lines 42-54). Likewise, `POST /api/ledgers` cannot copy holdings "re-encrypted under the household's existing data key": the server has no data key, and row ciphertext is bound by AAD to `{ tableName, householdId, rowId, version }`, so even a verbatim byte-copy into a new row id would be permanently undecryptable. **Both moved client-side.** The browser holds the key, decrypts, re-encrypts under the new row's AAD, and posts the finished rows; the server enforces only tenancy, the cap, and persistence.
2. **The `(ledger_id, asset_class)` composite index was dropped** from Chunk 1, for the same reason: it indexed a permanently-NULL column to serve a GROUP BY that can no longer run.
3. **No endpoint in this plan may use a second path segment.** §4's `DELETE /api/ledgers/:id`, `GET /api/ledgers/:id/holdings`, `PATCH/POST/DELETE /api/ledgers/:id/holdings/:holdingId` and `GET /api/ledgers/:id/compare` would all 404 at the Vercel platform level before reaching Hono — the documented routing limitation in `app/CLAUDE.md` (found 2026-07-11). Chunk 2 shipped `DELETE /api/ledgers?id=<uuid>`, following the existing `?id=` convention in `server/routes/family-members.ts`. **Chunk 3's four routes need the same treatment.**
4. **§4's `mirrors src/features/holdings/` `[H]` is resolved: that directory does not exist.** Confirmed against the live tree at Chunk 3 kickoff, as §4 required. This project uses `components/` + `pages/` + `lib/`, not feature folders. The actual mirror sources are `src/components/holding-form.tsx`, `src/lib/holdings-api.ts` and `src/pages/Portfolio.tsx`.

**Still open, raised during Chunk 2 and not yet decided:** `ledgers.name` is specified as a plaintext `text NOT NULL` column, while every other user-entered name in this schema (`households.name`, `family_members.name`) sits encrypted inside a `ciphertext` envelope with the plaintext column left empty. Ledger names are user-authored free text and the realistic ones are not neutral ("Plan if I quit", "After the layoff"). Chunk 2 was built to the approved Stage 0 design (plaintext), deliberately, rather than changing an encryption boundary during execution. Flagged for Gaurav.

## 9. Open Decisions

1. **`[H]` Seed-script upsert semantics for `instruments.updated_at`, blocking a follow-on chunk, not this one.** Not yet resolved: does the seed script diff field-by-field to decide whether to bump `updated_at`, or bump on every re-run regardless of change? A naive "always bump" would make every ledger show a drift warning after any seed re-run, even a no-op one — false positives would erode the warning's credibility. **Not load-bearing for Chunks 1–3 (Slice 1 ships without this).** This is why Instrument drift detection was withdrawn as this plan's Chunk 4 during the gate review rather than kept on the approved sequence with an unresolved `[H]` under it — it becomes its own plan/chunk once this is resolved, not before.
2. **`[H]` Whether `holding.household_id` and `holding.ledger.household_id` are ever allowed to diverge.** Assumed no (Section 3) but no DB-level CHECK constraint is planned for Slice 1 — enforcement is app-layer only (every write path sets both from the same session-resolved household). Acceptable for Slice 1 given the existing app-layer-only precedent (v1 has no Postgres RLS either), but flagged so a future chunk can add the constraint if a real bug ever surfaces here.
3. Resolved, not open: AI counsel/bulk-import/redesign timing — explicitly out of this plan (see Out of Plan below), not an open decision on this plan's critical path.

## Chunk Ordering / Build Sequence (extends-existing arc — no Slice 0)

Skipping Slice 0: `/health`, PostHog, Sentry, `/docs`, and the typed event registry are confirmed live from v1 (verified via `app/CLAUDE.md`'s Gate status and `/api/health` — not re-verified in this planning pass, `[S]`, cheap to spot-check at Chunk 1 kickoff).

1. **Chunk 1 — Ledger schema migration** (project-killer, first)
2. **Chunk 2 — Ledger CRUD API + tab strip UI**
3. **Chunk 3 — Ledger dashboard + compare strip** (closes D-018 §2's thin slice 1 — last chunk in this plan)

Each chunk is one commit, vertical (capability + tests + analytics events + `HOW_TO_USE.md` update), matching the v1 slice contract above.

## Out of Plan (D-016 bundle)

- **Instrument drift detection** — drafted as this plan's Chunk 4, **withdrawn during the erd-gate review** (2026-08-24): its `instruments.updated_at` seed-upsert semantics were a load-bearing `[H]` with no resolution (Open Decision #1), and the gate does not pass an unresolved load-bearing hypothesis onto the approved critical path. Becomes its own chunk once that hypothesis is resolved — schema (`instruments.is_active`/`updated_at`) already Stage-0-drafted in `DATA_MODEL.md`.
- **Projections** (D-018 §3) — in scope per the brief, but not part of this thin slice; needs its own chunk (schema already Stage-0-drafted as `ledger_projection_settings`) sequenced after Slice 1 ships and adoption data exists.
- **AI counsel / goal planner / AI-on-Current suggestion cards** — blocked on the Anthropic key not yet wired into Vercel (D-018 Open Items). No chunk written until the key is provisioned; do not plan around an unconfirmed dependency.
- **Bulk-import Excel template** — no schema dependency on ledgers, could be sequenced independently, but not planned here to keep this plan's gate scoped to one reviewable structural decision (Section 3) rather than several unrelated ones.
- **Full-platform mint/treasury redesign** (D-016 item 4, D-017 §7 reopening the landing page) — a visual-language pass across every screen, orthogonal to the ledger schema work; deliberately not bundled into a plan whose Section 3 is a live-table migration, so a redesign PR never has to wait on a schema PR's review cycle or vice versa.

None of the above is scope creep into this plan — each is a named, already-decided (D-016/D-017/D-018) piece of scope, or a piece withdrawn by the gate itself, deliberately sequenced into a later plan rather than silently dropped.

---

# D-016 Slice 5 — Full-Platform Mint/Treasury Redesign (Phase 3 Plan, 2026-08-25)

**Status:** draft — pending "Plan approved"
**Build arc:** `extends-existing` — a token/typography/motif retint of already-shipped screens, not a new feature (one chunk, Chunk 4, is a genuine exception — see its own scope flag).
**Pattern source:** the live `tailwind.config.ts` (repo root) and `src/styles/globals.css` (the v1 teal/DM-Serif system being replaced); the already-approved token files at `Documentation/design/tokens/tailwind.config.ts` / `globals.css` (Phase 2 Stage 4 output, this plan's real source of truth for values); the concept folio at `Documentation/design/concept/vittam-mint-folio.html`.
**Inputs:** `Documentation/design/SPEC.md`'s "D-016 Slice 5" section (§S1–S10), `Documentation/design/WIREFRAMES.md`'s "D-016 Slice 5" section (all 6 Design stages, gated), `Documentation/brand/brand-guide.md` (rewritten 2026-08-25), `Documentation/design/COMPONENT_SHOWCASE.md`'s motif-component section, `Documentation/solution/METRICS_PLAN.md`'s `explore_holding_added` event.
**Scope of this plan:** retint the 4 already-shipped flagship screens that exist in live code today — Landing, Dashboard, Explore, Portfolio — using the tokens already drafted and gated in `Documentation/design/tokens/`. **Goal planner is explicitly out of this plan**, even though the folio mocks it: that screen does not exist yet, blocked on D-016 slices 2–4 (still unbuilt per `app/CLAUDE.md`'s public-showcase backlog item 2). Onboarding, Profile, and instrument detail are out of this plan by Gaurav's own direction (2026-08-25) — they inherit this system when wireframed in their own future slices, not retrofitted here.

## T1. Summary & Guiding Principle

**Guiding principle: copy never changes, only its frame.** Every screen in scope keeps its exact existing text content (Stage 2 item 8, visual-only) — this plan changes CSS custom properties, Tailwind config, component class lists, and adds a small number of new motif components (VaultFrame, ReededDivider, CoinFAB, hatched donut fill). It does not touch API routes, the schema, or any data contract. The one deliberate exception is Chunk 4's Explore toggle, flagged as new interactive scope below rather than folded silently into "just a retint."

**Confirmed scope decisions:**

| In scope | Out of scope (this plan) |
|---|---|
| Cut over `tailwind.config.ts` / `src/styles/globals.css` / `index.html` font `<link>` to the mint/brass/Playfair-Jost-JetBrains system | Goal planner screen (feature doesn't exist yet — D-016 slices 2–4) |
| Retint Landing (vault-frame hero, guilloche motif) | Onboarding, Profile, instrument detail (Gaurav's direction — future slices) |
| Retint Dashboard (vault-frame cards, hatched emergency-fund donut segment; ledger tab strip retokened only, not restructured) | Instrument drift / bulk import / AI counsel / projections (already Out of Plan in the D-016 ledger plan above, unchanged) |
| Retint Explore (section/instrument cards) **+ build the "+ Add" entry point** (Chunk 4 — new interaction, not just visual; opens the existing add-holding form, no new backend) | Side-by-side multi-ledger view (unrelated, already deferred) |
| Retint Portfolio (LedgerTable component for ledger-scoped views; HoldingRow unchanged for the baseline/Current view) | — |
| 390px real-browser verification on a throwaway Neon branch before merge (mandatory gate, Chunk 5) | — |

Any scope creep during build routes back to Solution Stage and gets logged in `DECISIONS_LOG.md`, never absorbed silently — same standing rule as the ledger plan above.

## T2. The one structural decision

**None load-bearing at the data/schema level — this plan's real risk is a wholesale, all-screens-at-once token cutover landing in one chunk (Chunk 1) that every other chunk then depends on.** `[P]` — confirmed by reading the live `tailwind.config.ts`/`src/styles/globals.css`: today's file is the single source every component's Tailwind classes resolve against, so there is no way to retint one screen at a time without either (a) cutting the whole token file over first and accepting every unretouched screen looks subtly wrong until its own chunk lands, or (b) running two token systems side by side, which this project's Tailwind setup does not support without a second config (rejected — real added complexity for a design-only slice). **Resolution: (a), same shape as the ledger plan's Chunk-1-first ordering — cut the tokens over first, in Chunk 1, then retint each screen in its own chunk.** Between Chunk 1 and the last content chunk (4), the app is visually inconsistent (some screens still render the old class names against new token values, which may look wrong but will not break functionally — Tailwind classes reference CSS custom properties, not literal colors, so nothing errors, it just looks unfinished). This window should be a single working session, not spread across days, to keep that inconsistency from being seen live.

This is also the project-killer candidate for this plan (see Chunk Ordering Rationale) — same risk from the structural and the build-sequencing angle, matching the ledger plan's own pattern.

## T3. Data Model & Schema

None. `Documentation/design/DATA_MODEL.md`'s Stage 0 section for this slice already confirms no schema delta — this plan does not revisit that.

## T4. Chunk Map & Boundary Contracts

**Chunk ordering rationale — token cutover first, verification last, everything else in between is independently orderable.** Chunk 1 (token cutover, T2) is the project-killer: every other chunk assumes the new CSS vars and Tailwind classes exist. Chunks 2–5 (Landing/Dashboard/Explore/Portfolio retints) are independent of each other — no chunk reads or writes another's component files — so they can run in any order or in parallel once Chunk 1 lands. Chunk 4 carries the one genuinely new piece of interactive scope (the Explore toggle) and is separable: if Gaurav wants a smaller first merge, Chunk 4's toggle-build half can be cut to its own follow-on PR without blocking Chunks 1/2/3/5. Chunk 6 (390px real-browser verification) is last and mandatory, not optional — per SPEC.md §S6/§S7 and the standing lesson from the ledger plan's own rehearsal (three real bugs found only by looking at the live app, not by the test suite).

### Chunk 1 — Token system cutover
- **Owns:** `tailwind.config.ts` (repo root), `src/styles/globals.css`, `index.html`'s Google Fonts `<link>`
- **Reads but does not own:** `Documentation/design/tokens/tailwind.config.ts` / `globals.css` (the approved Phase 2 Stage 4 source of truth — this chunk copies from there, reconciling anything the live file has that the doc copy doesn't, e.g. any project-specific Tailwind plugin config not present in the doc copy)
- **Endpoints:** none — config/CSS only
- **Acceptance criteria:** `npm run typecheck` clean; full suite green with zero net-new failures; any test that hardcodes an old token/class name (e.g. `font-display`, a literal teal hex, `rounded-lg`/`rounded-xl` where the scale shifted) is updated to the new name, not skipped or deleted; Google Fonts `<link>` matches the exact snippet documented in `Documentation/design/tokens/tailwind.config.ts`'s Fonts comment
- **Dispatch steps:**
  - [ ] Diff the live `tailwind.config.ts`/`globals.css` against the `Documentation/design/tokens/` copies; reconcile any live-only config (plugins, content globs) that the doc copies don't carry `[model: sonnet]`
  - [ ] Cut the live files over to the reconciled, doc-sourced content `[model: sonnet]`
  - [ ] Update `index.html`'s font `<link>` to the documented snippet (Yatra One + Playfair Display + Jost + JetBrains Mono; DM Serif Display and Inter removed) `[model: sonnet]`
  - [ ] Run `npm run typecheck` and the full suite; fix every test that breaks on a renamed token/class, without weakening the assertion `[model: opus]` — project-killer chunk; a wrong fix here (quietly weakening an assertion to make it pass) silently reduces coverage across every screen at once, expensive to unwind

### Chunk 2 — Landing retint
- **Owns:** Landing page component(s), `SiteHeader`'s non-wordmark chrome (wordmark/Yatra One unchanged)
- **Reads but does not own:** `src/lib/landing-content.ts` (copy — read, never edited, per T1's guiding principle)
- **Endpoints:** none
- **Acceptance criteria:** `Landing.test.tsx`'s existing claim-equality assertion still passes unmodified (proves copy wasn't touched); vault-frame hero (weighty border, deliberate inset) and guilloche motif render per the folio's Landing plate; trust-strip copy sits outside the frame
- **Dispatch steps:**
  - [ ] Build the VaultFrame wrapper component (or a shared utility class, per `COMPONENT_SHOWCASE.md`'s D-016 Slice 5 section) `[model: sonnet]`
  - [ ] Apply VaultFrame to the Landing hero; add the GuillocheMotif (code-drawn SVG, per the folio's script block — port the generation logic, see SPEC.md §S7 cost flag; fall back to a precomputed static SVG if porting proves nontrivial) `[model: opus]`
  - [ ] Retint remaining Landing chrome (buttons, trust-strip, section dividers) to the new tokens `[model: sonnet]`

### Chunk 3 — Dashboard retint
- **Owns:** Dashboard page component (`src/pages/Dashboard.tsx`), `HealthTierCard`, `AllocationDonut`, `NudgeCard` frame styling
- **Reads but does not own:** nothing ledger-related. **Correction found during this plan's gate review (2026-08-25):** the folio's Dashboard plate shows a ledger-tab scenario switcher, and an earlier draft of this chunk assumed the live `LedgerTabStrip` component (`src/components/ledger-tab-strip.tsx`) rendered on this page. `[P]` — read directly: it renders only in `src/pages/Portfolio.tsx` (confirmed via grep — `Dashboard.tsx` has zero ledger references). The folio's screen labels do not map one-to-one onto this app's actual page split; its "Dashboard" plate shows ledger-switching content that in the live app belongs to Portfolio. **The ledger-tab-strip retint moves to Chunk 5 (Portfolio), where the component actually lives.** Anyone reading the folio's Dashboard plate against this plan should not expect a ledger tab strip on the real Dashboard page.
- **Endpoints:** none
- **Acceptance criteria:** every major card gets the VaultFrame treatment; `AllocationDonut`'s emergency-fund segment renders with a hatched fill pattern whenever `holdings` includes an emergency-fund-flagged item (SPEC.md §S6 — its own assertion, not folded into the existing 0-holdings ghost-state rule)
- **Dispatch steps:**
  - [ ] Apply VaultFrame to HealthTierCard, AllocationDonut's card, NudgeCard `[model: sonnet]`
  - [ ] Add the SVG `<pattern>` def and per-segment `fill="url(#...)"` override for the emergency-fund donut slice (Recharts has no built-in hatch fill — SPEC.md §S7 cost flag); write the new assertion covering it `[model: opus]`

### Chunk 4 — Explore retint + one-tap "+ Add" (contains new interactive scope)
- **Owns:** Explore/LibrarySection components, a new "+ Add" affordance on instrument cards, `explore_holding_added` telemetry wiring
- **Reads but does not own:** the existing instrument-detail "Record this in my plan" flow and the existing add/edit-holding form + `holdings-api.ts` (Chunk owner: pre-existing v1 Slice 4 code, unchanged) — this chunk is a second entry point into that same form, not a replacement
- **Endpoints:** none new. **Corrected during this plan's gate review (2026-08-25):** the folio's own copy resolves what "toggle" means — its rail text states plainly, "Tapping opens the holding form prefilled with the instrument. Card flips to Added" (`vittam-mint-folio.html`, Plate III). `[P]` — read directly from the folio and cross-checked against `src/lib/holdings-api.ts`'s `holdingPayloadSchema`, which requires `investedAmount`/`currentValue` as non-nullable fields — an instant, form-less create/delete on tap was never the real design and would have violated the existing data contract (no amount ever entered). The card's "In ledger ✓" state is a **client-side derived check**, not a new query: Explore already needs the household's holdings list to compute this, and `listHoldings()` (`src/lib/holdings-api.ts:147`) already returns each holding's `instrumentId` — `[P]`, read directly — so membership is a client-side `.some()` check against data already fetched elsewhere in the app, not a new backend endpoint.
- **Acceptance criteria:** tapping "+ Add" on an Explore instrument card opens the existing add-holding form, prefilled with that instrument (same prefill behavior the detail page's "Record this in my plan" CTA already has); on successful save, the card re-renders as "In ledger ✓" without a page navigation; `explore_holding_added` fires with `instrument_slug`/`section` on that successful save (not on tap — tapping only opens a form, nothing is added yet); the existing detail-page flow's own test file passes unmodified
- **Dispatch steps:**
  - [ ] Retint section/instrument cards to the new tokens `[model: sonnet]`
  - [ ] Confirm the existing add-holding form's prefill mechanism (used by instrument-detail today) and reuse it verbatim from the Explore card's "+ Add" button — no new form, no new endpoint `[model: sonnet]`
  - [ ] Add the client-side "already held" derivation (`listHoldings()` result, matched by `instrumentId`) and the "In ledger ✓" card state `[model: sonnet]`
  - [ ] Wire `explore_holding_added` telemetry to fire on successful save, not on tap `[model: sonnet]`
  - [ ] Write a test proving the existing detail-page "Record this in my plan" flow is unaffected, and a new test proving the Explore entry point produces an identical holding record to the detail-page path for the same instrument `[model: sonnet]`
- **Scope flag for Gaurav:** this chunk is the one place in this plan that adds new interactive behavior (a second entry point into the existing add-holding form), not just a retint — though it needs no new backend surface, per the correction above. If a smaller first merge is preferred, split this chunk — ship the visual retint of Explore's cards now, defer the "+ Add" entry point (and its telemetry) to its own follow-on PR.

### Chunk 5 — Portfolio retint
- **Owns:** Portfolio page component (`src/pages/Portfolio.tsx`), new `LedgerTable` component (double-rule total row), the retint of `LedgerTabStrip` and `NewLedgerModal` (moved here from Chunk 3 — see that chunk's correction note; these components actually live in `src/components/ledger-tab-strip.tsx` / `new-ledger-modal.tsx`, both rendered from Portfolio, not Dashboard)
- **Reads but does not own:** `HoldingRow` (unchanged for the baseline/Current view, per COMPONENT_SHOWCASE.md)
- **Endpoints:** none
- **Acceptance criteria:** ledger-scoped views (non-baseline ledgers) render via the new LedgerTable; the baseline/Current view keeps rendering via the existing HoldingRow list, unchanged; existing Portfolio test file's assertions on HoldingRow and `LedgerTabStrip` still pass — retokened only, no structural/interaction change to either
- **Dispatch steps:**
  - [ ] Retint `LedgerTabStrip` and `NewLedgerModal` classes only — no structural/interaction changes; run their existing test files unmodified to confirm `[model: sonnet]`
  - [ ] Build the LedgerTable component per the folio's Portfolio plate (double-rule total row, mono tabular figures) `[model: sonnet]`
  - [ ] Wire LedgerTable into non-baseline ledger views only; leave the Current/baseline path on HoldingRow `[model: sonnet]`
  - [ ] Retint the bulk-import dashed-border zone chrome (visual only — the bulk-import feature itself remains Out of Plan, D-016 item 3) `[model: sonnet]`

### Chunk 6 — 390px real-browser verification (mandatory gate, last)
- **Owns:** nothing new — verification only
- **Reads:** every screen touched in Chunks 1–5
- **Endpoints:** none
- **Acceptance criteria:** run against an isolated throwaway Neon branch (this project has no safe local write path — `.env.local` points at production, per `app/CLAUDE.md`), a fresh test account walks Landing, Dashboard, Explore, and Portfolio at exactly 390px in both light and dark mode via the Chrome extension; specific attention to the `sm:`-390px breakpoint trap (this exact bug class already shipped once on the ledger slice, caught only by this same rehearsal, not the test suite); any bug found is fixed before merge, not deferred
- **Dispatch steps:**
  - [ ] Create a throwaway Neon branch, matching the ledger plan's own rehearsal pattern `[model: sonnet]`
  - [ ] Walk all 4 retinted screens at 390px, both themes, via the Chrome extension; screenshot each `[model: sonnet]` — browser automation for visual verification is sonnet's default lane
  - [ ] Fix any found visual/breakpoint bugs; re-verify the fixed screen before moving on `[model: sonnet]` — well-specified once a bug is reproduced (a documented CSS/breakpoint fix), matching how the ledger plan's own same-day bugs were fixed by regular execution, not an architecture call
  - [ ] Confirm `explore_holding_added` fires correctly live (not just in the unit test) during the same rehearsal `[model: sonnet]`

## T5. Open Decisions

1. **Chunk ordering within 2–5 is not fixed.** Unlike the ledger plan (where Chunk 1→2→3 had a hard dependency chain), Chunks 2–5 here are mutually independent once Chunk 1 lands. Sequenced 2→3→4→5 above for a single-session narrative, but a parallel dispatch (per `superpowers:dispatching-parallel-agents` or `dev-manager`'s own worktree isolation) is equally valid and may be faster. Not a blocker for approval — noted so `dev-manager` doesn't need to ask.
2. **Font-loading performance cost is not measured yet.** Loading 3 additional Google Font families (vs. the current 2) adds request/render weight to a PWA that also promises offline capability for the library/`/why` routes. Not resolved here — flagged for a quick Lighthouse/bundle-size spot-check during Chunk 1, not a redesign of the loading strategy itself.
3. Resolved, not open: font risk (SPEC.md §S7/§S10), Explore-toggle scope (SPEC.md §S5), Title typography role (deferred by Gaurav's explicit decision, not this plan's to resolve) — none reopened here.

## T6. Chunk Ordering / Build Sequence

1. **Chunk 1 — Token system cutover** (project-killer, first, mandatory)
2. Chunks 2–5 — Landing / Dashboard / Explore+"+ Add" / Portfolio retints (mutually independent, see Open Decision #1 — sequential order below is a default, not a requirement)
3. **Chunk 6 — 390px real-browser verification** (mandatory gate, last, before merge — not optional, not deferrable to post-merge)

Each chunk is one commit, vertical (visual change + tests + analytics events where applicable), matching the v1 slice contract and the ledger plan's own chunk contract above.

## Gate Review (erd-gate discipline applied directly to this plan, no separate erd-template.md — this project has none; same precedent as the D-016 ledger plan above, "gated via erd-gate" per `app/CLAUDE.md`)

Run 2026-08-25 against T1–T6 above.

| Check | Result | Location | Note |
|---|---|---|---|
| 1. STAR structural decision (T2) | PASS | T2 | Present, resolved (not `[H]`), tagged `[P]` |
| 2. No load-bearing `[H]` on the critical path | PASS, after one correction | Chunk 4 | An earlier draft assumed the Explore interaction was an instant, form-less add/remove toggle calling the existing API directly — untested against `holdings-api.ts`'s schema (which requires non-nullable `investedAmount`/`currentValue`) and against the folio's own text. **Withdrawn and corrected in place**, not shipped as an unresolved hypothesis: re-read the folio (Plate III rail copy: "Tapping opens the holding form prefilled with the instrument") and the live schema directly, confirmed the real interaction is a second entry point into the existing form, tagged `[P]`, and rewrote Chunk 4 plus the `explore_holding_added` event to match |
| 3. Confidence-tag coverage | PASS | Chunks 3–4 | `[P]` tags added for the two claims verified by reading live code this session: `LedgerTabStrip`'s actual location (`src/components/ledger-tab-strip.tsx`, rendered only in `Portfolio.tsx`) and `listHoldings()`'s existing `instrumentId` field |
| 4. Chunk boundary contracts complete | PASS, after one correction | Chunk 3 → Chunk 5 | An earlier draft assigned the ledger-tab-strip retint to Chunk 3 (Dashboard), following the folio's own screen labels. `[P]` — read `Dashboard.tsx` directly: zero ledger references. The component only renders from `Portfolio.tsx`. **Moved to Chunk 5** with an explicit correction note in Chunk 3 so a future reader isn't misled by the folio's screen labels, which don't map one-to-one onto this app's actual page split |
| 5. Schema to source coverage (extends-existing) | PASS | T3, all chunks | No schema delta (T3). Every new frontend artifact (VaultFrame, GuillocheMotif, LedgerTable, hatched donut pattern, the "+ Add" entry point) is either a net-new component named in `COMPONENT_SHOWCASE.md`'s D-016 Slice 5 section or an explicit reuse of an existing, named component/API path — none invented without a stated source |
| 6. Migration safety | N/A | — | No schema/migration in this plan |
| 7. Out-of-scope stated | PASS | T1 scope table, Out of Plan | Goal planner, onboarding/Profile/instrument-detail, and the pre-existing D-016 bundle exclusions are all named explicitly |
| 8. Auth/authz per endpoint | N/A | — | No new endpoints in this plan (Chunk 4 confirmed to reuse the existing, already-authorized holdings-write path, not add one) |
| 9. Access-pattern / index hygiene | Advisory, no flag | — | No new queries; Chunk 4's "already held" check reuses an existing `listHoldings()` call already made elsewhere in the app, not a new one |

**READY.** All hard checks pass; two real gaps (Chunk 4's interaction shape, Chunk 3/5's component ownership) were found and corrected in place during this review, not carried forward as unresolved `[H]`s — matching how the D-016 ledger plan's own gate review withdrew its Chunk 4 rather than shipping an unresolved hypothesis on the approved critical path.

## Out of Plan (D-016 Slice 5)

- **Goal planner screen** — mocked in the folio but the feature itself doesn't exist yet (D-016 slices 2–4, still unbuilt). Not planned here; will inherit this token system when its own Phase 0–3 pass happens.
- **Onboarding, Profile, instrument detail** — explicitly deferred to their own future Phase 2 → Phase 3 passes, using this slice's tokens/motifs as reference, per Gaurav's direction 2026-08-25.
- **Instrument drift detection / bulk-import Excel upload / AI counsel / projections** — already Out of Plan in the D-016 ledger plan above, unchanged by this slice.
- **Chunk 4's toggle-build half** — separable on request (see Chunk 4's scope flag) if Gaurav wants a smaller first merge; not withdrawn by default, since SPEC.md already confirmed it as in-scope new interaction, not speculative.

None of the above is scope creep into this plan — each is either already-decided elsewhere, blocked on an unbuilt dependency, or explicitly deferred by Gaurav, not silently dropped.

---

# D-021 Follow-on — Add-from-library (Explore "+ Add" + instrument-detail CTA)

**Written 2026-08-26.** The follow-on PR D-021 deferred. Ruling recorded in `Documentation/solution/DECISIONS_LOG.md` D-023.

**Branch:** `explore-add-holding`, fresh off `origin/main` @ `5217b99`. `d016-slice5-mint` and `d016-slice5-chunk4-quarantine` are untouched. The quarantined commit `cc32697` is a **reference implementation only** — hunks are lifted from it by hand where they still apply; this is not a rebase of that branch.

**Drift check against `origin/main`, read directly `[P]`:** comparing the quarantine's parent (`24817d1`) to `origin/main`, `src/components/holding-form.tsx` and `src/lib/analytics.ts` are unchanged, `src/lib/asset-classes.ts` gained `ASSET_ACCENT_CLASS` (which the quarantine also added), and `src/pages/LibrarySection.tsx` received exactly the shipped retint hunk and nothing else. The quarantine's code is therefore near-current in shape but wrong in two substantive ways, both stated below.

## Chunk A — Add-from-library

- **Owns:** `src/components/add-holding-sheet.tsx` (new, shared by both entry points), the `initialInstrumentId` prop on `HoldingForm`, the `InstrumentDetail` "Record this in my plan" CTA, the `LibrarySection` card "+ Add" affordance, `explore_holding_added` telemetry.
- **Reads but does not own:** `src/lib/holdings-api.ts`, `src/lib/family-members-api.ts`, `src/lib/key-setup.ts`, `src/lib/crypto/key-store.ts`, `src/pages/Unlock.tsx`, `src/pages/HouseholdGate.tsx`.
- **Endpoints:** none new. No schema change, no migration.
- **Copy and telemetry are already specced, not invented here:** CTA text `COPY_DECK.md:247`, layout `WIREFRAMES.md:44`, event `METRICS_PLAN.md:214`. Neither file needs an edit.

### The design problem this chunk actually solves

`/explore/*` is routed deliberately outside `HouseholdGate` (that component's own docstring says so), and both `listHoldings` and `createHolding` call `openVault()` which calls `requireVault()`, which throws `VaultLockedError` when the vault is locked. `[P]` — read directly from `src/lib/holdings-api.ts:147,163` and `src/lib/crypto/key-store.ts:148`.

So `<SignedIn>` — a Clerk session — is **not** the gate. Vault readiness is. The quarantined code used `<SignedIn>`, which is the first of its two substantive errors: a signed-in user with a locked vault got a live "+ Add" button, a full form, and a generic error on submit. The sheet resolves its own state on open instead, mirroring `HouseholdGate`'s two layers but rendering inline and never navigating away:

| `resolveVaultState` result | Sheet renders |
|---|---|
| signed out | sign-in prompt + link to `/sign-in` |
| `ready`, 1 or more family members | the prefilled `HoldingForm` |
| `ready`, 0 family members | "finish setting up your household" + link to `/dashboard` |
| `unlock` | inline passphrase / recovery-code unlock, then falls through to the form in place |
| `key-setup` | "you haven't created a household yet" + link to `/dashboard` |
| `completing-setup` | `completeKeySetup()` then re-resolve, silently — same as the gate |
| `unrecoverable` / `predates-encryption` | one short line + link to `/dashboard`, not the gate's long copy duplicated |

Two deliberate constraints:

1. **`resolveVaultState` runs on sheet open only, never on page load.** `/explore` stays a fast public page that makes zero authenticated network calls for a browsing stranger.
2. **`LibrarySection`'s "In ledger" derivation gates on `getVault()`** (IndexedDB only, no network, returns `null` when locked), not on `isSignedIn`. The quarantine fired `listHoldings` for any signed-in user and swallowed the lock error, so nothing ever rendered as held for a locked vault.

**Ledger (second substantive correction).** `HoldingForm` gained `ledgerId` / `ledgerName` props in D-016, after the quarantine branched. Both entry points here call `createHolding(token, input, undefined)` and `listHoldings(token, undefined)` — no `ledgerId` — so writes land in the baseline **Current** ledger and the "In ledger" state is Current-scoped. This is a decision (D-023), not an omission: `ledgerId` is left unpassed with an explicit comment saying why.

**Telemetry split.** `explore_holding_added` fires **only** from the `LibrarySection` card path. `METRICS_PLAN.md:214` defines it as the list-level entry point, "distinct from the existing detail-page 'Record this in my plan' flow". The detail-page CTA fires only `holding_created`, which `HoldingForm` already emits. No new event for the detail page.

### Acceptance criteria

- The detail page renders "Record this in my plan"; tapping it opens the sheet prefilled with that instrument.
- Tapping "+ Add" on a library card opens the same sheet, same prefill, without navigation.
- On a successful save from a card, that card re-renders as "In ledger" with no page navigation and no refetch.
- A holding created from Explore is field-for-field identical to one created from Portfolio for the same instrument and inputs.
- A signed-in user with a locked vault gets an unlock prompt inside the sheet and, after unlocking, the form — never a generic error, never a redirect off `/explore`.
- A signed-out visitor sees the "+ Add" button and gets an inline sign-in prompt on tap, and triggers no authenticated network call until that tap.
- `explore_holding_added` fires on save from the card path only, with `instrument_slug` / `section`; never on tap; never from the detail page.
- Every existing test file under `src/pages/` and `src/components/` passes unmodified, except the three this chunk extends.
- Zero em-dashes in every new user-facing string.

### Dispatch steps — TDD, failing test first at every step

- [x] **A1. `initialInstrumentId` on `HoldingForm`** `[model: sonnet]` — Failing test in `holding-form.test.tsx`: the instrument select is pre-selected when `initialInstrumentId` is passed, and `initialHolding` still wins when both are present. Then the prop, lifted verbatim from `cc32697` (it merges clean against current `main`).
- [x] **A2. Vault-readiness resolution for an ungated route** `[model: opus]` — Failing tests first, one per row of the state table above, in `add-holding-sheet.test.tsx`. Then the resolver. This step decides how much of `HouseholdGate`'s logic is shared versus restated: the quality bar extracts at 3+ duplicates and this is the second caller, so the default is a local resolver that *calls* `resolveVaultState`, not a refactor of the gate.
- [x] **A3. Inline unlock inside the sheet** `[model: opus]` — Failing test: locked vault, passphrase entry, the form appears in place, no navigation. `Unlock.tsx` renders a full-page `min-h-screen` shell and cannot be dropped into a sheet as-is. Decide between an `embedded` variant on `Unlock` and a thin inline form calling `unlockWithPassphrase` / `unlockWithRecoveryCode` directly. Recovery-code entry must stay reachable, and no failure path may leak whether a passphrase was wrong versus a household missing.
- [x] **A4. `AddHoldingSheet` shell** `[model: sonnet]` — Failing tests: opening loads family members once and not again on reopen; and the Radix reset trap the ledger slice already paid for (dialogs stay mounted between opens, they do not remount) is covered by open, type, close, reopen, assert a clean form. Then the component, using `cc32697`'s shape as the reference.
- [x] **A5. Detail-page CTA** `[model: sonnet]` — Failing test in `InstrumentDetail.test.tsx`: the CTA renders with the `COPY_DECK.md:247` string and opens the sheet for that instrument. Then wire it. Existing assertions in that file stay untouched.
- [x] **A6. Library card "+ Add" and the held-set** `[model: sonnet]` — Failing tests in `LibrarySection.test.tsx`: the button renders per card; `getVault()` returning `null` means no `listHoldings` call and no "In ledger" state; a held instrument renders the inert "In ledger" state and no button. Then the card restructure — `Link` to `div` with the `Link` and the button as siblings, because a button cannot nest inside an anchor — lifted from `cc32697` and applied **on top of** main's already-shipped retint, not replacing it.
- [x] **A7. Telemetry** `[model: sonnet]` — Failing test: `explore_holding_added` fires exactly once on a successful save from a card with the right two properties, does not fire on tap, and does not fire on save from the detail page. Then the `EventMap` entry and the call site.
- [x] **A8. Cross-path parity test** `[model: sonnet]` — Failing test asserting the `createHolding` payload from the Explore card, from the detail CTA, and from Portfolio's existing sheet is identical for the same instrument and inputs, and that all three carry no `ledgerId`. This is the assertion the D-016 Slice 5 plan's Chunk 4 asked for and never got.
- [ ] **A9. 390px verification** `[model: sonnet]` — Both new surfaces at a genuine 390px, light and dark, signed out and signed in, plus the locked-vault sheet. This chunk restructures a card into a flex row containing a button, which is the exact failure class D-022 is still open on. **Blocked on a real device or Chrome DevTools' device toolbar; this session's tooling floors at ~630px, so this step does not close by re-running it here. Still blocked on tooling as of 2026-08-26.**
- [x] **A10. Docs** `[model: sonnet]` — D-023 in `DECISIONS_LOG.md` and this chunk in `IMPLEMENTATION_PLAN.md` (both landed ahead of code, on `explore-add-holding`). `COPY_DECK.md` and `METRICS_PLAN.md` need no edit — both already carry what this builds.

**Model tally: 8 sonnet, 2 opus, 0 fable.** The two opus steps are the ungated-route vault state machine (A2) and the inline unlock (A3). Both touch encryption state outside the gate that normally owns it, which is where a wrong call is expensive to unwind.

### Out of Plan (Chunk A)

- Bulk holdings Excel import; the AI counsel / goal-planner layer — both still their own backlog items needing their own Phase 0 to 3 pass.
- Ledger *selection* from Explore — Current only, by D-023.
- A remove / un-add action from either entry point — none exists by design; the card offers add only.
- Any further mint retint, any change to `HouseholdGate`, to `Unlock`'s own route, or to `holdings-api.ts`'s surface.
- Any schema or migration work.

### Chunk A status, 2026-08-26

**Built 2026-08-26 on branch `explore-add-holding`, commits `d58a22e` through `1f3f21c`.** Suite went 1187 to 1221 across 95 files, typecheck clean, `scripts/check_events.py` passes at 38 registered events.

The chunk is **not promotable**: step A9's 390px browser pass has not run, and D-022's identical gate is also still open against the live site. `Documentation/plan/A9-390PX-CHECKLIST.md` holds the 12-row matrix owed.

One real defect was found and fixed during the build: the instrument-detail CTA was written `w-full sm:w-auto`, and since this project redefines `sm` to 390px that would have dropped the full-width button at exactly the primary phone width. It is now `w-full md:w-auto`, pinned by a regression test asserting no `sm:` modifier on that element. This is the same failure class as the ledger slice's `sm:grid-cols-3`, caught this time by reading the Tailwind config rather than by a browser.

The cross-path parity assertion (A8) that D-016 Slice 5 Chunk 4 asked for and never got now exists, and the three call sites matched on the first run.

---

# D-024 + D-025 Combined (Phase 3 Plan, 2026-09-07)

**Status:** draft, pending "Plan approved". **No Blueprint gate is marked passed by this document.** Gaurav has not reviewed it.
**Build arc:** `extends-existing`. Every screen this touches already exists, every write path this uses already exists, and both features hang off the ledger surface shipped at `1fa570c`.
**Why one plan for two features:** they share exactly three things, and nothing else. The ledger holdings view (both add an entry point to it), the service-worker config (D-025 changes it, and D-024's lazy chunks must not regress it), and the `sm:`-is-390px pin test (one test file, two features' class strings). Everything else is disjoint, which is why the chunk map keeps them in separate chunks rather than interleaving them. Same file convention as the D-016 bundle and D-016 Slice 5 sections above.
**Inputs:** `DECISIONS_LOG.md` D-024 and D-025 including the 2026-09-07 resolutions (all open questions in both are now closed); `SPEC.md` §G1 to §G8 and §I1 to §I8; `DATA_MODEL.md` Stage 0 sections for D-024 and D-025; `COPY_DECK.md` and `METRICS_PLAN.md` D-024/D-025 sections.
**Not in this document:** any application code, any dev-manager dispatch, any gate marked passed.

## P1. Summary and guiding principle

**Guiding principle: the deterministic engine is a prerequisite, not a sibling, and it ships alone.** D-024 decision 1 and `DATA_MODEL.md` note 13 both say this in as many words. Chunk E below is complete, shippable, and portfolio-worthy with zero AI code present in the repository. If Gaurav sees the engine and decides the AI layer is not worth building, that is a legitimate outcome of this ordering and costs nothing already spent.

**The second principle, inherited: the caps are the cost control, so the cap logic is the riskiest code here.** Chunk R exists as its own chunk, before any Anthropic call is ever made, precisely so the reservation shape can be proven against concurrent and repeated callers with no provider in the loop.

| In scope | Out of scope (this plan) |
|---|---|
| Deterministic client-side projection engine, rate resolution, "See the maths" panel (Chunk E) | Dropping the unused plaintext `goals` table (its own migration, its own decision) |
| Goal capture into the existing sealed ledger envelope (Chunk G) | Export to Excel (D-025 decision 1, import only in v1) |
| Cap reservation and global circuit breaker, server-side, no provider call (Chunk R) | Prompt caching, Files API, queues, retries at the Anthropic layer (all rejected 2026-09-07) |
| `POST /api/ai-suggestions` proxy, `kind: "goal_plan"` (Chunk A) | Tune/edit flow, multiple goals per ledger, step-up SIP, tax-adjusted returns, Monte Carlo, streaming, per-user caps (D-024 decision 8) |
| Counsel cards on the same proxy, `kind: "counsel"` (Chunk C) | Clipboard import, foreign CSVs, bank statements, any hosted parsing API |
| Bulk Excel import end to end including `POST /api/holdings-batch` (Chunk I) | Inline row editing on the review screen (D-025, fix loop is download-fix-reupload) |
| The "never at rest" copy correction across four files (Step A1) | Closing the standing 390px gap from D-022 and D-023 (see Step V3) |
| Manual verification gates that automated tests cannot substitute for (Chunk V) | Per-instrument rate overrides (per asset class only, not offered) |

Any scope creep during build routes back to Solution Stage and is logged in `DECISIONS_LOG.md`, never absorbed silently. Standing rule from both prior plans.

## P2. The structural decisions

Two, both already resolved by Gaurav on 2026-09-07 and restated here because every chunk downstream depends on them.

**1. The goal rides the existing encrypted envelope. `[P]`** Read directly from `DATA_MODEL.md`'s D-024 Stage 0 section and cross-checked against `src/lib/ledgers-api.ts`: `sealRow` and `decryptWireRow` already handle the `ledgers` row under `LEDGERS_TABLE`, so widening the sealed object from `{ name }` to `{ name, goal? }` needs no schema change, no migration, and no server change at all. The server has never had a schema that could accept the payload shape and still does not. A reader that gets `{ name }` with no `goal` key is a valid expected state, so `version` does not bump. The plaintext `goals` table stays in the schema unused, the same way `analytics_events` does under D-012.

**2. A failed AI call does not refund its reservation.** Resolved 2026-09-07. `ai_call_reservations.status` moves to `failed` and the counter stays consumed. This is not fairness, it is un-gameability: "the call failed" is a claim the client makes, and refunding on it hands an attacker unlimited calls. The consequence is a copy problem, not a schema problem, and Step A2 owns it: the consent step says a failed attempt still counts, before the call, not after it fails.

**The project-killer candidate for this plan is Chunk R, not Chunk E.** The reservation-plus-conditional-UPDATE shape has no precedent anywhere in this repository (`SPEC.md` §G7 says so), `neon-http` has no transactions so it cannot be reached for, and a wrong shape here fails silently under exactly the conditions nobody tests by hand: two tabs, a double tap, a client retry. It is sequenced after Chunk E and before any provider call for that reason.

## P3. Data model and schema

Two migrations, both additive, neither destructive.

- **Migration A (Chunk E):** three plaintext catalog columns on `instruments`, `assumed_annual_rate_pct numeric(5,2)`, `rate_source text`, `rate_as_of date`, all nullable, plus the seed populating the 6 instruments that have a defensible published rate. The other 24 stay null and fall back to their asset class default.
- **Migration B (Chunk R):** `ai_call_reservations` and `ai_global_usage`, both new, both plaintext counters only, per `DATA_MODEL.md`. `ai_global_usage.cap_calls` seeds from a server constant of **50** (resolved 2026-09-07).
- **No migration for D-025 at all.** Confirming that absence is the Stage 0 output, same as it was for D-016 Slice 5. Import writes ordinary `holdings` rows through the sealed path that already exists.

**Verify both migrations against the configured Neon database with `npm run db:probe`, never against `drizzle/migrations/meta/_journal.json`.** The 2026-08-04 lesson: the journal records what was generated, the database records what was applied, and they disagreed for three days while production sat at `0000`.

## P4. Chunk map, boundary contracts, and dispatch steps

Every step is test-first. A failing test lands before the implementation it describes, per this project's TDD convention and the root CLAUDE.md rule that non-trivial feature work starts with a failing test. Where a step is verification or configuration and has no meaningful failing-test-first shape, that is stated on the step rather than skipped quietly.

**Chunk ordering rationale.** E is first and unconditional: it is the prerequisite D-024 decision 1 names, and it is the only chunk that ships user value with no AI in the repository. G follows because goal capture is meaningless without a projection to draw against, and it is still AI-free. R follows because the cap must be provably atomic before any provider call exists to spend money. A then C, in D-024 decision 7's order (a, b, c). **I (Excel import) shares no source file with E, G, R, A or C except the ledger holdings view's entry-point row and the one `sm:` pin test, so it is genuinely independent and could run in parallel with any of them once E lands.** It is sequenced last by default for a single-session narrative and because it is the larger of the two features by step count, not because anything in it depends on the AI work. V is last and mandatory.

### Chunk E: deterministic projection engine (first, ships alone)

- **Owns:** the new engine module and its fixtures, the projection panel, the horizon control, the "See the maths" panel, `GET`/`PUT /api/projection-settings`, Migration A and the instrument rate seed.
- **Reads but does not own:** `ledger_projection_settings` (specced in the D-016 additions, never built, this is its first consumer, no shape change), `GET /api/instruments` (extended with three fields, not replaced), the allocation donut's Recharts palette.
- **Endpoints:** `GET /api/projection-settings?ledgerId=<uuid>` and `PUT /api/projection-settings`. Single path segment, ledger by query parameter, never a path segment. The 2026-07-11 Vercel routing limitation applies.
- **Acceptance criteria:** the panel renders a compound-growth line for the chosen horizon with every number produced locally; rate rows appear only for asset classes actually present in this ledger; "See the maths" is a disclosure panel readable while the chart is visible, never a modal; the whole chunk is shippable with zero AI code in the repository.

- [ ] **E1. Migration A plus the instrument rate seed** `[model: sonnet]`. Failing test first: a schema-shape test asserting `instruments` carries the three new nullable columns, and a seed test asserting exactly 6 instruments have a non-null `assumed_annual_rate_pct` with a non-null `rate_source` and `rate_as_of`, and that the other 24 are null on all three. Then generate the migration and the seed. Apply and confirm with `npm run db:probe`, never from the journal file.
- [ ] **E2. Extend `GET /api/instruments` with the three catalog fields** `[model: sonnet]`. Failing test against the real Hono app: the response carries `assumedAnnualRatePct`, `rateSource`, `rateAsOf` per instrument, and every existing assertion in that route's test file passes unmodified. Catalog data, already public, no auth change.
- [ ] **E3. The rate resolution order, as its own pure function** `[model: opus]`. Failing tests one per branch of `DATA_MODEL.md`'s three-step order: instrument rate when unoverridden, the asset-class override winning for every holding in that class when set, the seeded per-class default when neither exists. This is opus because the precedence is the thing a user audits in "See the maths" and a silently wrong precedence produces plausible numbers that are wrong, which is the most expensive failure mode this feature has.
- [ ] **E4. Compound-growth engine core** `[model: opus]`. Failing fixture-based test suite first, written so a human who wants to check the numbers can read the fixture and do the arithmetic by hand. `SPEC.md` §G7 makes this an explicit cost flag: "See the maths" promises the user auditability, so the test suite is the artifact that proves the promise, not an afterthought. Opus for the maths itself and the fixture design; the numbers are the regulatory surface per `DATA_MODEL.md` note 14.
- [ ] **E5. `GET` and `PUT /api/projection-settings`** `[model: sonnet]`. Failing tests first: ownership checked against the session household, ledger by query parameter, a `PUT` for a ledger the session does not own returns 403, rates are plaintext by category (an assumption, not a holding, so nothing is sealed here). Mirrors the existing ledger routes' auth shape.
- [ ] **E6. Projection panel shell inside the ledger view** `[model: sonnet]`. Failing tests first: sits below the allocation donut, collapsed by default below `md:` and expanded above it, hidden entirely when the ledger has no holdings (hidden, not shown empty, per the state matrix), container carries `min-w-0` and its own `overflow-x` context so a long axis label cannot push the page into horizontal scroll at 390px.
- [ ] **E7. Horizon control, presets plus free entry** `[model: sonnet]`. Failing tests first: preset chips at 5, 10, 15 and 20 years and a free numeric field accepting 1 to 40, both driving the same state, the field winning when edited after a chip. Resolved 2026-09-07: both, not one. Chips must not use `sm:` for their layout.
- [ ] **E8. Rate rows, editable inline** `[model: sonnet]`. Failing tests first: one row per asset class present in this ledger and no others, one column below `md:` and two at `md:` and up, six stacked rows at 390px is correct and is not a bug, edits persist through `PUT /api/projection-settings`, `projection_rate_overridden` fires on a committed edit.
- [ ] **E9. "See the maths" disclosure panel** `[model: sonnet]`. Failing tests first: renders per-class rate, `rate_source` verbatim, `rate_as_of` with a staleness note, and the formula in words; it is a disclosure panel and not a modal, so the chart stays visible while it is open. `rate_as_of` drives a note only, never any automatic behaviour.
- [ ] **E10. Engine telemetry** `[model: sonnet]`. Failing test: `projection_viewed` and `projection_rate_overridden` fire from the browser with the properties `METRICS_PLAN.md` defines, and carry no rupee amounts. Run `scripts/check_events.py` as part of the step.
- [ ] **E11. The `sm:`-is-390px pin test, created here and extended by later chunks** `[model: opus]`. Failing test first, in the style of `csp-policy.test.ts`: **no new class string in this feature matches `sm:(grid-cols|w-auto|flex-row|inline-flex)`.** This project redefines `sm` to 390px and this exact bug class has now shipped twice, the D-016 compare strip's `sm:grid-cols-3` and the D-021 button's `w-full sm:w-auto`. Opus because the test has to be written so it genuinely covers new code without either passing vacuously or firing on the entire pre-existing codebase, and getting that boundary wrong makes the pin worthless in a way that looks green.

### Chunk G: goal capture in the ledger envelope (still no AI)

- **Owns:** the widened sealed payload type, the goal step inside the existing "+ New" ledger modal.
- **Reads but does not own:** `src/lib/ledgers-api.ts`'s `sealRow` and `decryptWireRow`, the existing modal's blank and copy options.
- **Endpoints:** none new. The goal travels on the existing `POST /api/ledgers` body with no server change.
- **Acceptance criteria:** a ledger with no `goal` key still reads correctly (a manually created ledger is a valid expected state); `version` does not bump; a hand-created ledger that later gains a goal stays `origin: manual` and does not count against `ai_plans_created`.

- [ ] **G1. Widen the sealed ledger payload to `{ name, goal? }`** `[model: opus]`. Failing tests first: a sealed-then-decrypted round trip preserving the goal, a legacy `{ name }`-only payload decrypting cleanly with `goal` undefined, AAD still bound to `{ table, householdId, rowId, version }`, and the server rejecting any attempt to send the goal as a plaintext field. Opus: this is the encryption boundary, and a mistake here is the class of thing that is expensive to unwind after rows exist.
- [ ] **G2. Goal step as a third option in the existing "+ New" modal** `[model: sonnet]`. Failing tests first: it swaps the modal body rather than opening a second surface; the horizon prefills to target year minus current year; fields validate inline with the modal staying open; and the Radix reset trap the ledger slice already paid for is covered by open, type, close, reopen, assert clean (dialogs stay mounted between opens, they do not remount).

### Chunk R: cap reservation and circuit breaker (server only, no provider call)

**This chunk builds and proves the entire cost-control mechanism before a single Anthropic call exists in the codebase.** That sequencing is deliberate: the failure modes here are concurrency-shaped, and they are far cheaper to reproduce against a route that returns a stub than against one that spends money.

- **Owns:** Migration B, `ai_call_reservations`, `ai_global_usage`, the reservation module, `GET /api/ai-suggestions`.
- **Reads but does not own:** `households.ai_plans_created` and `ledgers.ai_edits_used` (both live since the D-016 bundle), `server/lib/auth.ts`, `server/lib/rate-limit.ts` (which stays as the burst limiter and is explicitly not the monthly enforcement).
- **Acceptance criteria:** every one of `SPEC.md` §G6's cap assertions passes against the real Hono app with no provider in the loop.

- [ ] **R1. Migration B, both tables** `[model: sonnet]`. Failing schema-shape tests first, including the UNIQUE constraint on `(household_id, idempotency_key)` and the two ON DELETE CASCADE edges. Then generate, apply, and confirm with `npm run db:probe`. `ai_global_usage.cap_calls` seeds from a server constant of 50, stored per row so raising it later does not rewrite a past month.
- [ ] **R2. Reservation insert with idempotency absorption** `[model: opus]`. Failing tests first: a second POST with the same `idempotencyKey` returns the first outcome and makes no second downstream call (`SPEC.md` §G6.8); a conflict on the unique constraint is a normal expected path, not an error surface. Opus: this is security-sensitive concurrency logic with no precedent in the repo.
- [ ] **R3. The three conditional counter UPDATEs, atomic, one statement each** `[model: opus]`. Failing tests first and this is the hard requirement `DECISIONS_LOG.md` D-024 item (b) states in as many words: **conditional `UPDATE ... SET counter = counter + 1 WHERE counter < cap RETURNING counter`, never read-check-increment.** Test that two concurrent callers with different idempotency keys and one plan remaining produce exactly one success and one 409 (`SPEC.md` §G6.9). Test each of the three caps independently: household plans, per-ledger edits, global monthly. Zero rows affected means the cap is reached and the reservation is marked `failed`. `neon-http` has no transactions, so each guarantee must be expressible as one statement. Opus, and this is the project-killer step of the whole plan.
- [ ] **R4. Failure does not release the reservation** `[model: opus]`. Failing test first: a reservation whose downstream call fails moves to `failed` and the counter stays consumed, and a client that reports every call as failed still exhausts its cap. Resolved 2026-09-07. Opus because this is the gameability boundary and the temptation to "be fair" here is exactly what reopens the hole.
- [ ] **R5. `GET /api/ai-suggestions`, usage only** `[model: sonnet]`. Failing test first: returns `{ plansUsed, plansCap, editsUsed, editsCap, globalOpen }` for the session household, carries no household data, and is cheap enough to fetch alongside the dashboard so cap-exhausted states render without a speculative POST.

### Chunk A: the AI proxy, `kind: "goal_plan"`

- **Owns:** `POST /api/ai-suggestions`, the consent step, the suggestion card, the three cap-exhausted copies, and the "never at rest" copy correction.
- **Reads but does not own:** Chunk R's reservation module, Chunk E's engine (every number on the card comes from it), `server/lib/envelope.ts`'s `.strict()` discipline.
- **Endpoints:** `POST /api/ai-suggestions`. Single segment. **The browser CSP is not touched and the Anthropic host appears in no browser CSP directive**: the browser never calls Anthropic, the proxy does. Adding it would be exactly the mistake D-024's ship-traps list names.

- [ ] **A1. The "never at rest" copy correction, four files, its own step** `[model: sonnet]`. Failing test first, asserting the corrected claim is present and the absolute phrasing is absent in every location. **The exact wording is already on record in D-024 and is not rewritten here: "Vittam's database does not store AI-request plaintext; the AI provider may retain it under its own API policy."** The four files:
  1. the `/privacy` page's AI-exception section (added per D-018 Q7),
  2. the `/why` page's matching section (same D-018 Q7 ruling, same wording so the two cannot drift),
  3. `src/lib/privacy-note.ts` (which is also on the standing list of pre-2026-08-05 copy carrying em-dashes and needs a copy pass regardless),
  4. `Documentation/design/COPY_DECK.md`, corrected in the same commit so the deck and the rendered pages cannot disagree.

  This is a standalone step and a shipping blocker for the rest of Chunk A: the current claim is false end to end as worded, and it becomes materially false the moment a real request leaves for Anthropic.

  **`[P]` Read directly from the repository on 2026-09-07, and it changes the shape of this step for three of the four files.** `grep` for "at rest" and "Anthropic" across `src/` returns only `src/lib/crypto/keys.ts` and `src/lib/export.ts`, neither of which carries this claim. So: (1) the `/privacy` page's AI-exception section **does not exist yet**, because D-018 Q7 specced it alongside an AI feature that was never built, so this is a write, not a correction; (2) the `/why` page's matching section likewise **does not exist yet**; (3) `src/lib/privacy-note.ts` exists but **does not carry the claim at all**, so its only work here is the standing em-dash copy pass, not a correction; (4) `COPY_DECK.md` **already carries the corrected wording** in its new D-024 section (line 368, "The request goes to Anthropic, which processes it under its own API policy and may retain it for a period under that policy. Vittam's database does not store any of it."), so the deck is the source and the two pages are written from it rather than reconciled against it. The step still touches all four files and is still a shipping blocker; what it does to each is not what D-024's table assumed, because that table was written against a `/privacy` section that was specced and never shipped.
- [ ] **A2. Per-transmission consent step** `[model: sonnet]`. Failing tests first: a separate step inside the same modal, always shown, never remembered (per transmission means per transmission); it states what is and is not sent; **and it states before the call that a failed attempt still counts against the cap**, which is where P2 decision 2's cost is paid in copy. Zero em-dashes in every new user-facing string.
- [ ] **A3. Proxy route, hardened, in the exact order `SPEC.md` §G3 sets** `[model: opus]`. Failing tests first, one per ordered behaviour: auth resolved via `server/lib/auth.ts` before the body is read at all; body size and shape limits before parse with strict Zod rejecting unknown keys; the reservation insert; the conditional UPDATEs; and only then the Anthropic call. `claude-sonnet-5`, structured output, no prompt caching, no retries, no queue, no Files API (all four settled 2026-09-07). Payload minimisation is enforced by the schema itself: percentages and banded totals only, never member names, nominees, or exact rupee amounts. Opus: security-sensitive ordering where doing step 5 before step 3 silently removes the entire cost control.
- [ ] **A4. Output allowlist validation** `[model: opus]`. Failing tests first: the model may emit only library slugs, and **a slug outside the library enum invalidates the whole response as `invalid_output`, it is not filtered out silently**. This enum is the enforcement mechanism for two standing constraints at once (D-024 decision 5): no product names, therefore mechanically no embedded-insurance product, and the education-not-advice line held by construction. Opus because silent filtering is the intuitive implementation and it is the wrong one.
- [ ] **A5. No request or response body reaches any log, Sentry, or Neon** `[model: opus]`. Failing test first, by spy on the logger and the Sentry client, plus an assertion that `Cache-Control: no-store` is set on every response, success and failure (`SPEC.md` §G6.6 and §G6.7). Nothing is written to Neon beyond the reservation status. Opus: this is the retention-surface promise the corrected copy in A1 is making on the product's behalf.
- [ ] **A6. Suggestion card, rendered inline** `[model: sonnet]`. Failing tests first: renders in the compare strip's position, never as a toast or modal; Apply and Dismiss are the only actions, stacked vertically below `md:`, each full width and at least 44px tall; **the card component receives weights and slugs only and has no access to a formatter that takes a model-supplied number** (`SPEC.md` §G6.5). Every rupee figure beside a weight is computed locally by Chunk E's engine.
- [ ] **A7. Three distinct cap-exhausted states** `[model: sonnet]`. Failing tests first: household plans exhausted, this ledger's edits exhausted, and the global monthly breaker tripped are three different facts with three different implications, and each gets its own copy (`DATA_MODEL.md` note 13). Each replaces the action's own affordance in place, styled informational, never an error toast. Manual ledger creation stays fully available in all three.
- [ ] **A8. CSP assertion** `[model: sonnet]`. Failing test first, in `csp-policy.test.ts`: the Anthropic host appears in no browser CSP directive, in either policy. This is a pin against a future well-meant addition, not a fix for anything currently broken.
- [ ] **A9. Goal-plan telemetry** `[model: sonnet]`. Failing test: `ai_suggestion_shown`, `ai_suggestion_applied`, `ai_suggestion_dismissed`, `ai_cap_reached` fire from the browser with the `METRICS_PLAN.md` properties. **The proxy route itself emits no analytics**, carried forward verbatim from the D-016 property-discipline note: anything the proxy could usefully report is derived from plaintext holdings. Run `scripts/check_events.py`.
- [ ] **A10. Extend the E11 pin test to Chunk A's class strings** `[model: sonnet]`. Failing test first over the goal-step form fields, the consent step's Continue button, the Apply and Dismiss pair, the horizon preset chips, and the rate-row grid, all named explicitly in `SPEC.md` §G6.1.

### Chunk C: counsel cards, same proxy, second schema

- **Owns:** the `kind: "counsel"` request and response path, the "Review this ledger" action.
- **Reads but does not own:** everything Chunk A built. This chunk adds a second schema to one route, it does not add a route.
- **Acceptance criteria:** on demand only, never proactive, never a background call (D-024 decision 4). Apply or Dismiss, per D-017 item 5 and D-018 item 3. Cards are never persisted: `ai_call_reservations` records that a call happened, never what it said.

- [ ] **C1. `kind: "counsel"` request schema and ledger ownership** `[model: sonnet]`. Failing tests first: `ledgerId` ownership checked server-side against the session household; the payload carries `currentMix` percentages and `holdingSlugs` only, no amounts and no names; a ledger the session does not own returns 403 before any provider call.
- [ ] **C2. Counsel reservation takes the `edits` cap** `[model: opus]`. Failing tests first: a counsel call consumes `ledgers.ai_edits_used` and not `households.ai_plans_created`, the reservation row records `cap_type: "edits"` and `ledger_id` set (unlike a goal-plan call, whose `ledger_id` is null because its ledger does not exist yet), and the global breaker applies to both kinds. Opus: routing the wrong reservation to the wrong counter is a cost-control defect that looks correct in every single-call test.
- [ ] **C3. "Review this ledger" action** `[model: sonnet]`. Failing tests first: on-demand button on any ledger, never proactive; when the ledger's edits cap is exhausted the button carries the disabled soft register from A7; the same consent step from A2 is shown, unremembered.
- [ ] **C4. Counsel card reuse and telemetry** `[model: sonnet]`. Failing tests first: the card renders through A6's component, not a second one, so an AI suggestion cannot come to read as a different product; the same events fire with the counsel kind distinguished per `METRICS_PLAN.md`.

### Chunk I: bulk holdings import from Excel (independent of E, G, R, A, C after Chunk E)

- **Owns:** the SheetJS dependency and its build config, the template generator, the parser, the validation message builder, the bucketing logic, the review screen, the rejects download, `POST /api/holdings-batch`, and the service-worker config change.
- **Reads but does not own:** `server/lib/envelope.ts`'s `memberScopedCreateSchema` (reused unchanged), `MAX_LEDGER_HOLDINGS` (200), `src/lib/holdings-api.ts`'s sealing path, `GET /api/instruments`, the decrypted member list.
- **Endpoints:** `POST /api/holdings-batch`. **`/api/holdings/batch` is impossible on this project's Vercel config** (single path segment only, 2026-07-11), so this is a new top-level Hono mount in `server/app.ts`, not a sub-path of the holdings router.

- [ ] **I1. SheetJS pinned to the vendor tarball, dynamic import, and precache registration in one pass** `[model: opus]`. Failing test first, in the style of `pwa-registration.config.test.ts`, asserting **the parser chunk is present in the precache list** and that the dependency resolves to the vendor's own tarball URL rather than the frozen npm registry copy. Then the dependency and the dynamic import so the main bundle and the 2s load target are untouched. Opus and paired with I2 deliberately: `SPEC.md` §I7 states these two requirements pull opposite directions through the same vite-plugin-pwa config and must be done in one pass with one test file covering both, and this project has already shipped one PWA offline-scope defect (D-013/B-005) and one silent registration gap (`virtual:pwa-register`, closed 2026-08-06).
- [ ] **I2. Service worker excludes every `/api/*` body and all import-screen row data** `[model: opus]`. Failing test first, same file as I1, in the style of `sw-cache-policy.test.ts`: the runtime caching config carries an explicit exclusion, no `/api/*` request or response body is cacheable, and the import screen's row data is not cached by any route rule. Opus for the same reason as I1: this is the exact defect class this project has already paid for twice, and `injectRegister: false` in `vite.config.ts` is a known trap that looks like a fix and silently makes it worse.
- [x] **I-spec-1. `SPEC.md` §I6.6 contradicted a shipped guard — RESOLVED** `[model: sonnet]`. **Found 2026-09-11 during I1/I2.**

  **RESOLVED 2026-09-11 — Gaurav's ruling, relayed via the session coordinator. §I6.6 is scoped to the Excel-import feature only.** No imported holdings data and no import-screen API traffic may be cached. **The existing `/api/instruments` `runtimeCaching` rule stays untouched**: that offline-library behaviour is a shipped feature §I6.6 was never written to remove.

  This confirms the interim reading already in force from I1/I2, so **no code change is required** — the pin written during I1/I2 already encodes exactly this. `SPEC.md` §I6.6's wording should be amended to match the ruling when that document is next edited, so the literal-versus-intended reading does not have to be rediscovered.

  Provenance note: this arrived relayed rather than as a marker file. That is appropriate here — it authorizes nothing destructive and ratifies existing shipped behaviour rather than changing it.

  **The contradiction, both sides verified against the tree:**
  - `SPEC.md` §I6.6 (line 486) states absolutely: "**The service worker caches no `/api/*` request or response body.**"
  - `src/lib/sw-cache-policy.test.ts:61` asserts the opposite for one route: the instrument library **must still be cached**, failing with "no rule matches the instrument library — offline support for public content has been dropped."

  Honouring §I6.6 literally means deleting the shipped `/api/instruments` CacheFirst rule, which breaks that guard. It would also undercut §I6.7's own goal, since the import screen needs the instrument library offline to validate instrument references.

  **Interim reading in force (I1/I2):** §I6.6 forbids any *new* `/api` caching and any route carrying household data. Pinned as `ALLOWED_API_CACHE_RULES = 1`, plus an assertion that the single permitted rule *is* the instrument library, so a substitution or addition fails. The conflict and the reading are documented in a comment above that test.

  **Assessment, for the ruling:** the interim reading is very probably the intended one. `/api/instruments` is the **public** instrument library, not household data — caching it leaks nothing private, so the literal reading would drop a shipped offline capability (D-013's scope) for no privacy gain. §I6.6's evident intent is row and household data, which the interim reading forbids absolutely.

  **The decision is whether to amend §I6.6's wording to match that intent, or to drop offline instrument browsing.** It is a product call about a shipped feature, so it was not resolved unilaterally during execution.
- [ ] **I3. Template generation, one tab per member, 30 instruments prefilled** `[model: sonnet]`. Failing tests first: one tab per household member, all 30 library instruments prefilled and grouped by asset class, a hidden slug column, cell comments carrying kind-awareness (shading plus comments, never a hard block), and the twelve columns D-025 decision 2 names. Built entirely in the browser from the decrypted member list and the existing `GET /api/instruments` response. **No API for template generation**, which is what keeps member names off every server surface even though they are in the file.
- [ ] **I-spec-2. "Shading" is not deliverable with SheetJS Community Edition** `[model: sonnet]`. **Found 2026-09-11 during I3. Needs Gaurav's ruling. Not blocking Track I.**

  **Verified against the installed package, not inferred.** `node_modules/xlsx/types/index.d.ts` types cell comments as a first-class documented field — `c?: Comments`, "Comments associated with the cell" — while styles are only `s?: any`, "The style/theme of the cell (if applicable)". Writing cell fill/background styles to `.xlsx` is a SheetJS **Pro** feature; the pinned Community Edition build has no write-side style support.

  **What that breaks.** `SPEC.md` §I3 and this plan's I3 step both describe kind-awareness as "**shading plus comments**, never a hard block". Comments work. Shading does not. The template therefore ships with one of its two stated guidance channels.

  **What it does NOT break: the library choice stands.** D-025 chose SheetJS over ExcelJS and `read-excel-file` on the strength of hidden sheets and cell comments, both of which work. Shading was never the deciding constraint, so this is a documentation-versus-capability gap, not a reason to revisit the library.

  **The second-order risk, which is the real one.** Cell comments are now the *sole* guidance channel. Comment fidelity across real Excel, Google Sheets and LibreOffice cannot be proven by a generator-written fixture — it is exactly the closed loop **V1** exists to break. V1 consequently carries more weight than when it was written: **if comments do not survive a Google Sheets round-trip, the template has no kind-awareness at all.** V1 should check comment survival explicitly, not only dates and lakh grouping.

  **Decision (b) RESOLVED 2026-09-11 — Gaurav's call, relayed by an in-session agent: keep the `cell.s = { fill: ... }` line, commented, as a placeholder in case SheetJS's paid tier is ever added.** No code change results; this ratifies what I3 already shipped. The existing comment above it already states it is a probable no-op under the Community Edition build, which is what stops it being mistaken for working shading.

  **Decision (a) still open:** amend `SPEC.md` §I3 and D-025 decision 3 to drop "shading", or accept in the documents that the template is comment-only. Until that is done, two design documents describe a capability the build cannot deliver.

  **Provenance note:** (b) arrived relayed by an in-session agent rather than from Gaurav directly. Acceptable here because it preserves existing code and authorizes nothing destructive. It is **not** a precedent for anything that writes to production or touches the sealed data path.

- [ ] **I-spec-3. The per-instrument kind-relevance rule is unspecified** `[model: sonnet]`. **Found 2026-09-11 during I3. Needs confirmation against real content. Not blocking Track I.**

  D-025 decision 3 settles that guidance **never blocks** entry, and that it must "match how the in-app form already behaves" (all fields accepted on all instruments). It does **not** specify which cells get flagged as "less common for this instrument".

  I3 stands in a documented, testable heuristic derived from each instrument's existing `summary` / `liquidity` / `minInvestment` text already returned by `GET /api/instruments` — no new per-slug table, no new data. **This is an implementation choice, not a resolved product decision.**

  **Why it needs checking rather than accepting:** a heuristic that mis-flags a commonly-used field actively misleads, which is worse than no guidance on a template whose whole job is guidance. It should be reviewed against the real 30-instrument content during I4 or the Phase 5 review.

- [ ] **I4. PII disclosure as a step before the download** `[model: sonnet]`. Failing tests first: a step, not a checkbox beside the button; it states what the file will contain and that the file is outside the app's protection once saved; **it discloses that a browser extension with file access is outside Vittam's trust boundary** (disclose, do not engineer around it); `pii_disclosure_shown` fires with `surface`. The file name carries the ledger name and the date so a stale download is identifiable by its name.
- [ ] **I-bug-1. `exportFilename` stamps a UTC date, so an IST export can be named with yesterday's date** `[model: sonnet]`. **Pre-existing defect found 2026-09-11 during I4. Not a Track I regression. Not blocking.**

  **The defect, narrowly.** `src/lib/export.ts:116`:

  ```ts
  const date = exportedAt.toISOString().slice(0, 10)
  ```

  `toISOString()` reports UTC. Under IST (+05:30), any export taken between 00:00 and 05:30 local time renders the **previous** day, so a file exported at 02:00 on 12 September is named `household-financial-plan-2026-09-11.json`.

  **Scope it precisely — most of this file is correct.** `export.ts:84` (`exportedAt: input.exportedAt.toISOString()`) is a *timestamp field* and is right: ISO timestamps should be UTC. **Only the file-name date stamp is wrong.** Do not "fix" line 84.

  **Why it is recorded here rather than fixed in place.** It is outside Chunk I's scope and predates this branch. But it is the *same defect class* that D-025 decision 8 and step I5 exist to defend against, and I4's own `src/lib/import-filename.ts` deliberately takes the other approach (local `getFullYear`/`getMonth`/`getDate`). Two filename builders in one repo now disagree about how to stamp a date, and only one of them is right. Left unrecorded, that inconsistency invites someone to "align" them toward the wrong one.

  **Fix:** reuse `localDateStamp` from `src/lib/import-filename.ts`. Verify with a test that pins a fixed instant in the 00:00-05:30 IST window and asserts the local date, which is the only window where the bug is observable.

- [ ] **I5. Parser: the two India-specific traps** `[model: opus]`. Failing tests first, both named now so neither is rediscovered late. **Excel date serials are formatted from local date parts and `toISOString()` appears nowhere in the parser**: a serial for 1 January under an IST offset must produce 1 January, not 31 December. **Lakh grouping parses**: "1,50,000" is 150000. **Shorthand is rejected with a clear message, never guessed**: "1.5L" produces a rejection, because a wrong guess about money is worse than a clear refusal. Opus: these are correctness traps where the wrong implementation passes casual testing and silently corrupts amounts.
- [ ] **I-spec-4. D-025 decision 8 describes the date trap inaccurately** `[model: sonnet]`. **Found 2026-09-11 during I5, by probing the pinned build rather than reasoning from the document. Documentation fix only; the code is already correct.**

  **What D-025 decision 8 says:** the trap is a `Date` at **local** midnight which `toISOString()` then pushes back a day.

  **What xlsx 0.20.3 actually does**, verified by writing a workbook holding 1 Jan 2026 and reading it back under two process timezones:

  | read option | result |
  |---|---|
  | `cellDates: false` (default) | `{ t: 'n', v: 46023 }` — a raw 1900-system serial. No `Date`, no timezone anywhere |
  | `cellDates: true` | `{ t: 'd', v: Date }` at **UTC midnight** — identical under `TZ=UTC` and `TZ=EST5EDT` |

  **Why the difference matters rather than being pedantry.** If the cell arrives at *UTC* midnight, then under IST `toISOString()` returns the **correct** day and reading *local* parts is what breaks — under a negative (western) offset. That is the exact opposite of the failure D-025 describes. Both are real day-shifts, but they sit on **opposite sides of UTC**, so a fix written to the document's framing could be wrong in the other direction.

  **How I5 resolved it:** by removing the ambiguity instead of choosing a side. The parser consumes **serials** and converts them with integer arithmetic, constructing no `Date` at all, which is correct under every offset including UTC and satisfies §I6.9 structurally. `PARSER_READ_OPTIONS.cellDates === false` is pinned by test so the defensive `Date` branch is never live.

  **Action:** amend D-025 decision 8 to describe the real mechanism, so a future reader does not "fix" a correct parser toward the wrong framing. **No code change.**

- [ ] **I6. Validation message builder names the column and the reason, never the value** `[model: sonnet]`. Failing test first over the message builder with a fixture value chosen to be unmistakable if echoed. "Current value is not a number I can read" is allowed; echoing the cell contents is not, because these messages are the most likely thing to end up in a Sentry breadcrumb or a screenshot.
- [ ] **I7. Bucketing, including conservative duplicate detection** `[model: sonnet]`. Failing tests first: rows land in Ready, Needs attention, Possible duplicate, or Skipped, derived at parse time and living only in component state, no table and no persisted draft. A row is Possible duplicate when the target ledger already holds a decrypted holding with the same instrument slug and the same `member_id`, compared after the vault is unlocked, which is the only place both sides exist in plaintext. **Fuzzy instrument matching may only ever suggest a candidate for explicit confirmation, never auto-resolve.** Both agents said this independently.
- [ ] **I8. Review screen** `[model: sonnet]`. Failing tests first: four collapsible sections in fixed order with Ready expanded and the rest collapsed with counts visible; one column below `md:` with each row a stacked block and its reason beneath it (a four-column row table at 390px is the failure mode to avoid); `min-w-0` on every bucket section and row block so a long instrument name wraps rather than widening the page; every touch target at least 44px; the primary CTA carries the count and the ledger name and commits the Ready bucket only. `SPEC.md` §I4 and `DATA_MODEL.md` note 16: the review screen is the feature, the upload control is not.
- [ ] **I9. Rejects download and the leave-screen confirm** `[model: sonnet]`. Failing tests first: a rejects file is produced as a filtered copy of the original template so the fix-and-reupload loop uses the same shape (`SPEC.md` §I8.1); a second upload replaces the review state rather than merging into it (§I8.2); leaving the screen prompts a confirm, because parsed rows are memory-only and leaving discards them, and the copy says so before it happens.
- [ ] **I10. `POST /api/holdings-batch`** `[model: opus]`. Failing tests first: the array element is `memberScopedCreateSchema` reused unchanged and `.strict()`, so **a body carrying any plaintext field is rejected**; ledger ownership is checked against the session household; **every `memberId` in the array is checked for tenancy, not just the first**; a batch that would exceed `MAX_LEDGER_HOLDINGS` inserts zero rows and returns 409 with `currentCount`, `cap` and `attempted`; a ledger or member outside the household returns 403. All or nothing within one multi-row INSERT, which is the only atomicity available over `neon-http`. Opus: this is a new authenticated write endpoint accepting an array, and per-element authorization is the classic place an array endpoint is weaker than the single-row one it was modelled on.
- [ ] **I11. Commit path, seal every row in the browser** `[model: sonnet]`. Failing tests first: each row is sealed by `sealRow` with AAD bound to `{ holdings, householdId, rowId, version }`, exactly as `src/lib/holdings-api.ts` already does, and a holding created through import is field-for-field identical to a hand-entered one for the same inputs. The same cross-path parity assertion shape D-021's A8 established.
- [ ] **I12. No parsed row reaches persistent storage** `[model: opus]`. Failing test first: after a parse, `localStorage`, `sessionStorage`, and IndexedDB contain no value matching any fixture amount (`SPEC.md` §I6.5). This is the sharpest edge in the feature: the import flow creates the only plaintext lifetime in the app that exists outside a form field. Opus, because the test has to actually prove absence rather than assert a policy.
- [ ] **I13. Sentry and PostHog scrubbing audit** `[model: opus]`. Failing tests first: **Sentry breadcrumbs, session replay, and console output carry no row-level or holding-level data**, and no PostHog event property carries a row value or an amount. D-025's hard-requirements list names breadcrumbs, replay, and console specifically. Opus: this is an audit of what leaks by default rather than a feature to build, and default-on instrumentation is precisely the thing that captures what nobody chose to send.
- [ ] **I14. Import telemetry** `[model: sonnet]`. Failing test: `bulk_import_template_downloaded`, `bulk_import_completed` with `rows_clean` and `rows_rejected`, and `pii_disclosure_shown` with `surface` all fire with **row counts only, never row contents**. All three are already defined in `METRICS_PLAN.md`. Run `scripts/check_events.py`.
- [ ] **I15. Extend the E11 pin test to Chunk I's class strings** `[model: sonnet]`. Failing test first over the template download button, the upload drop zone, the primary commit CTA, the rejects download button, and the bucket header rows, all named explicitly in `SPEC.md` §I6.1. Same assertion, same file.

### Chunk V: manual verification (mandatory, last, and not substitutable by the suite)

**This project has an established pattern of naming what green tests structurally cannot prove, rather than letting a green suite stand in for it.** Chunk V is that pattern applied here. It is written as its own gate because D-025 itself asked for exactly that, "given this project's history of gates being overridden at merge time (D-022, D-023)".

- [ ] **V1. Excel cross-tool manual pass** `[model: sonnet]`. **What the suite structurally cannot prove:** Vitest exercises the parser against fixture files the generator itself wrote, which is a closed loop. It cannot catch a difference between what this code writes and what real Excel, Google Sheets, or LibreOffice writes on save. **Required:** at least one template downloaded from the running app, opened and filled and saved in each of real Excel, Google Sheets, and LibreOffice, then uploaded and imported. Date cells and lakh-grouped amounts get specific attention, since those are the two traps I5 pins and the two most likely to differ per writer. A generator-written fixture does not satisfy this step.
- [ ] **V2. Live AI call against the real Anthropic key** `[model: sonnet]`. **What the suite structurally cannot prove:** structured-output behaviour against `claude-sonnet-5` in production cannot be verified locally, the same class as the 2026-08-05 Turnstile lesson where a CSP gap would have broken every new sign-up while existing users signed in normally. **Required, on a live Vercel deploy against a throwaway Neon branch:** one real goal-plan call and one real counsel call, confirming the response validates against the allowlist schema and that a slug outside the enum would invalidate the whole response; then **exhaust the cap and confirm a third call is genuinely blocked with a 409 rather than merely reported as blocked in the UI**; then confirm the reservation row for a deliberately failed call stays consumed. The key is the reused `group-travel-pwa/backend/ANTHROPIC_API_KEY` from gopass, per Gaurav's 2026-09-07 accepted-risk resolution; **wiring it into Vercel is a prerequisite for this step and is currently listed as the blocker on backlog item 2 in `app/CLAUDE.md`.**
- [ ] **V3. Add the new AI and import screens to the existing 390px backlog check** `[model: sonnet]`. **This step does not close the 390px gap and must not be recorded as closing it.** D-022 and D-023 are both still open on exactly this against the live site, stacked on the same deploy, blocked on tooling: the Chrome extension available to these sessions floors `window.innerWidth` near 630px, an iframe workaround is blocked by the site's own CSP (correctly), and CSS `zoom` moves neither `window.innerWidth` nor `matchMedia`. **What this step does:** add the projection panel, the horizon control, the rate-row grid, the goal step, the consent step, the suggestion card, the cap-exhausted states, the PII disclosure step, the upload zone, and the review screen to `Documentation/plan/A9-390PX-CHECKLIST.md`, so that whenever that check eventually runs on a real device or through Chrome DevTools' device toolbar, these screens are in its matrix. The static `sm:` pins from E11, A10 and I15 reduce the risk of the specific bug class that has shipped twice; they do not substitute for looking at the screen.

## P5. Build sequence

1. **Chunk E**, deterministic projection engine. First, unconditional, ships alone with no AI code in the repository.
2. **Chunk G**, goal capture into the sealed envelope. Still no AI.
3. **Chunk R**, cap reservation and circuit breaker. Proven with no provider in the loop. Project-killer chunk.
4. **Chunk A**, the proxy, `kind: "goal_plan"`. Step A1's copy correction is a shipping blocker for the rest of the chunk.
5. **Chunk C**, counsel cards on the same proxy.
6. **Chunk I**, Excel import. Independent of 2 through 5; sequenced here by default, safely parallelisable after Chunk E.
7. **Chunk V**, manual verification. Last, mandatory, and explicitly not satisfiable by the test suite.

## P6. Addendum — mounting the AI layer, scoped migration application, and a codex-lane pilot (2026-09-10)

**Status:** approved 2026-09-10, in-session. Written after `/council` (`collab-runs/2026-09-10-ai-layer-plan/exchange.json`, one blind round plus one rebuttal round, all four contested claims resolved, no items left open).

**Why this addendum exists.** Chunks R, A, and C are complete and committed (`4943486`, `b803b7c`, `7580f5c`, `3d6c698`). `SPEC.md` §G3, line 329, records a real gap in this plan, not a skipped step: the consent step, suggestion card, cap-exhausted states, and "Review this ledger" button are all built and tested, but nothing mounts them on any screen, and Chunk G's goal step is never wired to `POST /api/ai-suggestions`. This blocks Chunk V's V2, which the plan itself calls mandatory and not substitutable by the test suite.

**Sequencing, per the council decision.** Two independent tracks run in parallel: Track M mounts the AI layer, Track I is the existing, unchanged Chunk I (bulk Excel import). They do not block each other; Chunk I has no dependency on the AI layer per this plan's own P5. Track G, a short gated migration step, runs ahead of Track M's live check only, not ahead of Track M's code, since Track M's own tests run against the in-memory model regardless of migration state. Chunk V's V2 (the live Anthropic call) moves up: it runs as soon as Track M is verified locally and Track G's migrations are live, rather than sitting last. This reflects the council's converged view that Gaurav's own attended time for a live production check is the scarcer resource, not coding capacity, so that window should be scheduled early rather than deferred.

### Track G: scoped migration application

Migrations `0006` and `0007` do not need to travel bundled with `0008`. They add schema that no *deployed* code reads. `0008` (`households.ai_plans_created`) is the one that matters once mounted code starts reading it, so it stays held separately.

**Correction, 2026-09-10 (dev-manager execution):** an earlier version of this paragraph described both migrations as "Chunk R's two tables". That is wrong. `0007` alone is Chunk R (`ai_call_reservations`, `ai_global_usage`). **`0006` is Chunk E's** migration: the `ledger_projection_settings` table plus three `instruments` rate columns (`assumed_annual_rate_pct`, `rate_source`, `assumed_rate_as_of`). G-a's grep pattern below covers only `0007`'s objects and never tests `0006` at all; `0006` was verified separately during execution and is also clean on `main`.

- [x] **G-a. Verify by direct grep that no shipped code path reads any column added by migrations 0006 or 0007, before touching the database** `[model: sonnet]`. This check is the evidence the risk-scoping above rests on, not an assumption. Verify: `grep -rln "ai_call_reservations\|ai_global_usage" src server --include=*.ts --include=*.tsx`

  **Correction, 2026-09-10 (dev-manager execution): the `Verify:` line above only passes when run against `main`, not against the branch it executes from.** "Shipped" here means *deployed*, and production runs `main`. Run from `d024-d025-ai-import`, the grep returns 8 files, because Chunk R's own committed-but-unmerged code is what it catches. The check as intended must be run against the deployed tree, e.g. `git grep -l "ai_call_reservations\|ai_global_usage" origin/main -- 'src/*.ts' 'src/*.tsx' 'server/*.ts'`, which returns empty. Verified this way on 2026-09-10: neither migration's objects appear on `origin/main`, and `server/routes/ai-suggestions.ts` and `server/routes/projection-settings.ts` do not exist there at all.
- [x] **G-b. Apply migrations 0006 and 0007 to production, verify with `npm run db:probe`** `[model: sonnet]`. Requires Gaurav's own direct go-ahead in the session this runs, not an instruction relayed by a prior checkpoint — this project's standing rule, held correctly twice already this session. Verify: `npm run db:probe`

  **Correction, 2026-09-11 (dev-manager execution, run `20260910-1137`): this step was half-done before it started, and the command it names would have over-applied.** Two findings, both from asking the database rather than the repository:

  1. **`0006` was already applied to production on 2026-09-09.** The live ledger held 7 rows (`0000`–`0006`), and `ledger_projection_settings` plus all three `instruments` rate columns were already present. Only `0007` was actually pending. This is the `_journal.json`-vs-`__drizzle_migrations` distinction this project already learned once on 2026-08-04, hitting again: the repository cannot answer "did it land".
  2. **`npm run db:migrate` applies *every* pending migration, so running it here would have applied `0008` as well** — the migration G-c explicitly holds and which no consent marker covers. The plan's own `Verify:` line points at `db:probe`, but its `Apply` verb implies `db:migrate`, and that command cannot be scoped to a target revision.

  **What was actually run:** drizzle's own migrator (`drizzle-orm/neon-http/migrator`) against a scratch *copy* of `drizzle/migrations` with `0008` removed from the copy's journal. The repository's migration tree was never modified, and the hash algorithm was proven first by reproducing all 7 already-applied hashes exactly (`sha256` of raw file content, 7/7 matched, 0 unmatched ledger rows). Result: ledger at 8 rows, `ai_call_reservations` and `ai_global_usage` present with all 3 expected indexes, row counts unchanged (households 2, family_members 4, holdings 6, protection 1, household_keys 2) so zero data loss.

  **Standing note for whoever applies `0008`:** do not use a bare `npm run db:migrate` unless every pending migration is intended. There is no `--to <tag>` flag.
- [x] **G-c. Migration 0008 stays held**, applied only immediately before Chunk A's provider call is unblocked (i.e. right before the Anthropic key is wired into the code). Not a step; a checkpoint gating Track M's later steps.

  **Confirmed held, 2026-09-11:** verified positively rather than by omission — `0008`'s hash is absent from `drizzle.__drizzle_migrations`, and `households.ai_plans_created` does not exist as a column. The `db:probe` "mismatch" line (8 applied vs 9 in journal) is now exactly this one held migration and is the expected state, not a defect.

### Track M: mount the AI layer (new scope; not in the original P1–P5 plan)

**The codex-lane pilot ran and failed, 2026-09-11 (run `20260910-1137`). Result: the lane cannot execute on this machine, and the `codex/*` tags below were not honoured.**

Two dispatches, both through `dev-manager-codex-step.sh` into a script-created worktree under `.worktrees/codex/`, both returning **exit 32 `NO_CHANGES` with zero files touched**:

| Step | Model | Effort | Result |
|---|---|---|---|
| M1 | `gpt-5.6-terra` | medium | wrote nothing; reported a read-only sandbox |
| M2 | `gpt-5.6-sol` | high | wrote nothing; reported all shell execution rejected |

**The diagnosis is environmental, not configuration, model or quota.** No auth, 401, 429 or quota language appeared in either run. `--permission edit` was passed correctly and the wrapper did invoke `codex exec -s workspace-write -C <worktree>`; the target was a genuine secondary worktree, never the main tree. The decisive symptom is from the Sol run: Codex reported that **even a read-only shell command (`Get-Location`) was rejected before execution**. That is stronger than "the sandbox blocks writes" — the shell/subprocess layer itself fails to launch. This matches the known Windows defect `codex-delegate.sh`'s own header documents (`CreateProcessAsUserW failed`, spawning subprocesses under the sandboxed token on this OS), which that header already warns should be met by restructuring the call rather than retrying.

**Consequences, decided in-session:**

- **M1 and M2 were built on `sonnet` instead, and independently verified.** Both are committed.
- **M4 is downgraded from `codex/terra/medium` to `sonnet` for this run**, since terra is the exact configuration that already failed at M1.
- **The spike question M1 was created to answer — whether the codex lane honours `SPEC.md` §G6.1's `md:` rule unbidden — remains unanswered.** No Codex process ever read a file, so the pilot produced no evidence about output quality in either direction. Anyone re-running this pilot starts from zero, not from a negative result.
- **Do not re-attempt the edit lane on this machine until the sandbox invocation is fixed.** A third model would burn quota to reconfirm the same environment defect.

The `codex/*` tags are left in place below as the record of what was planned and consented to, rather than rewritten to match what happened.

- [ ] **M1. Failing test: mount the cap-exhausted states on the ledger view** `[model: codex/terra/medium]`. The lowest-stakes of the four unmounted pieces: no live provider dependency, no consent copy. This is the council's proposed validation spike — after it lands, check whether `SPEC.md` §G6.1's `md:` breakpoint rule was followed without being told a second time. That result decides whether M2 and M4 stay on the codex lane unsupervised or move to closer review. Files: the ledger view page, `ai-cap-notice.tsx`. Verify: `npm test -- ai-cap-notice-mount`
- [ ] **M2. Wire Chunk G's goal step to `POST /api/ai-suggestions`** `[model: codex/sol/high]`. Crosses two already-built chunks and carries real request/loading/error-state content, so the higher codex tier despite being otherwise eligible. Verify: `npm test -- goal-step-ai-wiring`
- [ ] **M3. Mount the suggestion card and consent step in the ledger view's compare-strip position** `[model: sonnet]`. Held off the codex lane pending M1's spike result. This is the highest-visibility piece and the one most likely to carry the `sm:`/390px trap into a real screen (two prior shipped bugs from exactly this class); kept at sonnet with an explicit pointer to `SPEC.md` §G6.1 until M1 proves the pattern holds. Verify: `npm test -- suggestion-card-mount`
- [ ] **M3c. Wire Apply to create a new ledger seeded with the suggested allocation** `[model: opus]`. **Added 2026-09-11 during M3's execution. Required before this branch merges.**

  **RESOLVED 2026-09-11 — Gaurav's call, relayed via the session coordinator, not a marker-backed decision.** **Apply creates a new ledger pre-filled with the suggested allocation. "Current" is never touched.**

  **Why this resolution is the cheap one:** it reuses D-016's multi-ledger mechanism, already built, shipped and live since 2026-08-25, rather than inventing a write path. The 4-ledger cap, ledger-name encryption and the existing sealed-write path all apply for free. Crucially **it mutates no existing holding**, which removes the encrypted-boundary risk that made improvising this unacceptable in the first place.

  **Required behaviour:** Apply routes through the existing ledger-creation path, seeded with the suggested allocation instead of blank. **If the household is already at 4 ledgers, Apply surfaces the cap exactly as the manual "+ New ledger" flow does — it must not fail silently.**

  **Provenance caution, to be honoured when this is built:** this decision arrived relayed rather than as a marker file Gaurav wrote himself. That is fine for a design choice that authorizes nothing destructive, but the implementation touches the sealed holdings/ledger write path, so **confirm it directly with Gaurav before building, the same standard applied to the migration and SheetJS markers.** Do not treat this paragraph as that confirmation.

  **Prior state, for context.** Before this call, `onApply` and `onDismiss` were byte-identical (both `setActiveSuggestion(null)`), so the card offered two actions with one consequence. That contradicted `DECISIONS_LOG.md` D-024 decision 3 ("the AI proposes an edit to Current as a card and nothing changes until Apply is tapped"), which is only coherent if Apply changes something, while `SPEC.md` §G4 constrained the surface but never the effect. No apply/commit endpoint existed, and M2's goal-plan result screen dead-ended the same way in a "Done" button.

  **Note the interaction with M4b below:** once Apply creates a ledger, a user denied the chance to tap Apply loses both the review they spent and the ledger it would have produced.

- [ ] **M4b. Stop the cap notice from swallowing the result the user just paid for** `[model: sonnet]`. **Added 2026-09-11 during M4's execution. Required before this branch merges.**

  **The defect:** when a successful review is itself the one that exhausts that ledger's edits cap, folding the response's fresh `usage` back into the host's state re-renders `ReviewLedgerAction` with `counselCapState` now tripped. That component's early return renders `AiCapNotice` **instead of** its `Dialog`, with no exception for a dialog currently showing a result. The just-fetched suggestion is swapped out from under the user before they can read, Apply or Dismiss it.

  **Why it matters more than a cosmetic glitch:** the edits cap is 2 per ledger. This fires precisely on the *second and final* review, so the user spends a scarce, capped, paid-for call and receives nothing. It is the worst instance of the bug rather than an edge of it.

  **Why it was not fixed in M4:** `ReviewLedgerAction`'s early-return contract is already built and pinned by `review-ledger-action.test.tsx`'s "cap-exhausted soft register" block, and was out of M4's stated scope. Working around it host-side in `Portfolio.tsx` is not currently possible either: there is no host-visible "dialog closed" signal to defer the usage update on — `onApply` is the only close-adjacent callback and Dismiss has none at all. **The real behaviour is pinned** by the last test in `src/pages/review-ledger-mount.test.tsx`, which asserts what actually happens rather than something prettier.

  **The likely fix:** give `ReviewLedgerAction` a host-visible close callback, and/or let it hold an open result dialog until the user dismisses it before honouring a newly-tripped cap. Verify: `npm test -- review-ledger-mount review-ledger-action`

  **The state after M3:** `onApply` and `onDismiss` are byte-identical — both call `setActiveSuggestion(null)`. The card offers two actions with one consequence. A user taps Apply, the card disappears, and their ledger is unchanged.

  **Why this is a contradiction rather than a missing detail.** `DECISIONS_LOG.md` D-024 decision 3 reads: "the AI proposes an edit to Current as a card and nothing changes until Apply is tapped." That sentence is only coherent if Apply changes something. `SPEC.md` §G4 constrains the *surface* ("Apply and Dismiss are the only actions") but never the *effect*, so the two artifacts together imply a write that is specified nowhere.

  **Corroboration that this is a real gap and not an M3 oversight:** there is no apply/commit endpoint anywhere — `src/lib/ai-suggestions-api.ts` carries only `getAiSuggestionsUsage` and `postGoalPlanSuggestion`. And M2's already-shipped goal-plan result screen in `new-ledger-modal.tsx` ends the same way, in a "Done" button that writes nothing. Both AI paths dead-end identically.

  **The decision needed, before code:** does Apply rewrite the target ledger's allocations in place, create a new ledger seeded from the suggestion, or open a confirm step first? And what server route backs it, given a write derived from model output touches the encrypted holdings boundary and therefore needs the same sealing path as every other holdings write. **No implementation was invented at M3 deliberately** — improvising how AI output rewrites real household holdings is exactly the class of decision this project does not let an agent make.

  **Interim honesty option, if the decision is deferred past merge:** render Apply disabled, or do not render it at all, rather than shipping a live control that silently does nothing.
- [ ] **M3b. Thread real usage counters into `AiConsentStep`** `[model: sonnet]`. **Added 2026-09-11 during M2's execution; required before this branch merges, not blocking Track M or Track I from continuing.**

  **The defect:** `AiConsentStep` requires a live `remaining` count, but the only source of one is `GET /api/ai-suggestions`, which needs an existing ledger id — and a goal ledger does not exist yet at the moment the goal step asks for consent. M2 resolved this with an **optional** `usage` prop on `NewLedgerModal`. No real caller passes it today, so in production the consent step renders **"0 remaining" while the feature still works**.

  **Why it matters more than it looks:** this is user-facing copy stating something false on a privacy-consent screen, which is the one surface in this feature where an inaccurate number undermines the point of the screen. It is contained — the server's own `cap_reached` response is still honoured, so nothing can over-spend, and the wrongness is cosmetic rather than a cap bypass — but it must not ship.

  **The work:** pass real usage down from `ledger-tab-strip.tsx` / `Portfolio.tsx` into `NewLedgerModal`, and decide what the goal path should display before any ledger exists (the household's plans counter is the right source; `editsUsed`/`editsCap` are per-ledger and do not apply). Verify: `npm test -- goal-step-ai-wiring`
- [ ] **M4. Mount "Review this ledger" and wire it to the counsel path** `[model: codex/terra/medium]` — **downgraded to `sonnet` for run `20260910-1137`**, see the codex-lane result above. Same shape and stakes as M1; dispatch once M1's spike result is read. Verify: `npm test -- review-ledger-mount`

  **M4 also closes M1's deliberate gap.** `SPEC.md` §G4 requires the cap notice to replace the action's own affordance **in place**. M1 mounted the notice while the "Review this ledger" button did not yet exist, so on commit `b9216eb` the notice renders standing in for nothing. M4 must make the button and the notice mutually exclusive in the same slot. **This branch must not merge with both, or neither, rendering together.**
- [ ] **M5. Re-run the full G3 pipeline suite plus an E11-style class-string pin against every newly mounted class** `[model: sonnet]`. Re-verification step, not trusted from worker self-report, matching this project's standing practice. Verify: `npm run typecheck && npm test`

### Track V, reordered

- **V2 moves up**, runs as soon as Track M is locally verified and Track G's migrations are live, not last. Still needs the Anthropic key switched from unwired to wired in code, which stays Gaurav's own direct action, same as the migration gate.
- **V1 and V3 are unchanged** from P4 and have no dependency on Track M; V1 can run whenever Track I is ready for a cross-tool pass.

### Chunk I, unchanged, two re-tag candidates flagged for Gaurav's call

Every I-step keeps its original tag from P4 except the two flagged here. Neither has been changed; both are flagged for a decision.

- **I1, I2 stay `opus`.** Both touch `vite.config.ts` and precache configuration and add a new dependency (SheetJS) — a new dependency is one of model-router's six codex-ineligibility conditions on its own, so these are not codex candidates regardless of how well-specified they are.
- **I5 (the two India-specific parsing traps) is flagged as a candidate for `codex/sol/high` instead of `opus`.** It is unusually well-specified for a correctness-critical step: the plan already names the exact test cases (date serial under IST, lakh-grouping, shorthand rejection), touches no auth/secrets/deps/config, and has a single-command verify. It is also exactly the kind of step where a wrong implementation looks right in casual testing, which is why it was opus-tagged originally. Left as `opus` here; re-tag only on Gaurav's explicit call.
- **I10, I12, I13 stay `opus`.** A new authenticated array endpoint, an absence-of-persistence proof, and a telemetry-scrubbing audit are judgment-heavy, not mechanical, and none is a good fit for the codex lane's "no design decision left" eligibility bar.

Each chunk is one commit, vertical: behaviour plus tests plus analytics events where applicable. Same chunk contract as both plans above.

### Standing repository items found during P6 execution (NOT scoped to `d024-d025-ai-import`, and not on its pre-merge list)

These predate this branch and must not gate its merge. They are recorded here only because this is where they were found; **their proper home is `app/CLAUDE.md`'s "Known gaps" list**, which this execution did not edit by design.

- **`npm run lint` has never run since the ESLint 9 upgrade. Nothing in this repository is linted.** Reproduced 2026-09-11: ESLint **9.39.4** is installed, the script is a bare `eslint .`, and **no `eslint.config.(js|mjs|cjs)` exists in `app/`**. ESLint 9 dropped `.eslintrc.*` support, so the command exits with "couldn't find an eslint.config.js file".

  **Blast radius, checked rather than assumed — and smaller than it first appeared.** `scripts/predeploy-check.sh` does **not** invoke lint, typecheck, or the test suite (its only `lint`/`test` matches are a comment and a `test.invalid` payload string). So no deploy gate was silently swallowing a failure: lint was never wired into the deploy path at all. This is a **dormant** quality gate, not a **bypassed** one. The distinction matters, because "a gate has been failing unnoticed across an encryption cycle, a redesign and three promotions" would be a far more serious claim, and it is not the true one.

  **Fix:** add a flat `eslint.config.js`. Expect a backlog of findings on first run, since no file in this repository has ever been linted under the current toolchain.

- **One unidentified intermittent test failure, observed once at commit `785dac7` (I6).** The first full-suite run at that tree reported **1 failed / 1845 passed**; **six** subsequent runs were clean at **1846**. The worker's own run had also reported 1846/0, so the discrepancy is real and was caught only by re-running independently.

  **The failing test's identity is unrecoverable.** That run used `--reporter=dot | tail -8`, which preserves the counts and discards the failure block. That was a dev-manager error, not a worker one; later steps capture full output to a file and tail the summary from it, so a future failure leaves a name.

  **Not attributable to I6.** That step swapped three string literals for a function call and added a pure-function test file, introducing no async, timing or shared state. The likelier mechanism is **cumulative suite load** — the tree grew 113 → 122 files this session, several of them `@testing-library` files using `findBy*` against a 5s default timeout, and the failing run happened while builds and `npm install` were running alongside the suite.

  **Do not read the six clean runs as a clearance.** They establish only that the failure is not deterministic. They do not establish a rate, and every one was on a single idle machine with a warm cache — conditions plausibly *incapable* of reproducing a load-sensitive timeout. **Not reproduced is not verified stable**, and CI is slower and more contended than the dev box.

  **If it recurs:** capture full reporter output, and suspect timeout-bound `findBy*` assertions in the Track M/I component tests before suspecting logic.

## P6. Model tally

Applied with the `model-router` skill against the finished plan.

**50 steps: 33 sonnet, 17 opus, 0 fable.** No fallback tags; every step fits a bucket cleanly. No fable steps, because both features' strategy and design artifacts (`DECISIONS_LOG.md`, `SPEC.md`, `DATA_MODEL.md`, `COPY_DECK.md`, `METRICS_PLAN.md`) were finished before this plan was written, and no step here produces another strategy artifact.

Per chunk: E 8 sonnet / 3 opus, G 1 / 1, R 2 / 3, A 7 / 3, C 3 / 1, I 9 / 6, V 3 / 0.

The 17 opus steps cluster in exactly three places, which is the useful signal in this tally:

| Cluster | Steps | Why |
|---|---|---|
| Cap and cost control | R2, R3, R4, C2 | Concurrency-shaped security logic with no precedent in this repo, over a driver with no transactions. The failure modes are invisible to single-call tests |
| Encryption and leak boundary | G1, A5, I1, I2, I12, I13 | Every one of these either widens the sealed payload, or proves the absence of a leak. This project has already shipped one PWA offline-scope defect and corrected one overstated privacy claim |
| Correctness the user audits or the schema enforces | E3, E4, A3, A4, I5, I10, E11 | Rate precedence, compounding maths, route ordering, the output allowlist, the date and lakh traps, per-element authorization, and the pin test's own coverage boundary. Each has a wrong implementation that produces plausible output |

## P7. Gate review (erd-gate discipline applied directly to this plan, no separate erd-template.md, same precedent as both plans above)

Run 2026-09-07 against P1 to P6.

| Check | Result | Location | Note |
|---|---|---|---|
| 1. Structural decisions stated and resolved | PASS | P2 | Two, both resolved by Gaurav 2026-09-07, both tagged and neither left as an open hypothesis |
| 2. No load-bearing unresolved hypothesis on the critical path | PASS | P2, Chunk R | The project-killer is named explicitly as Chunk R rather than assumed to be the largest chunk |
| 3. Confidence tags where a claim was read from live code | PASS | P2.1 | `[P]` on the envelope claim, read from `DATA_MODEL.md` Stage 0 and `src/lib/ledgers-api.ts` |
| 4. Chunk boundary contracts complete | PASS | All chunks | Owns / reads-but-does-not-own / endpoints stated per chunk; the E-to-I independence is stated with its two shared files named |
| 5. Schema to source coverage | PASS | P3 | Two additive migrations, both traced to a `DATA_MODEL.md` Stage 0 table; D-025's absence of a delta is stated as an output, not an omission |
| 6. Migration safety | PASS | P3, E1, R1 | Both additive, both verified by `npm run db:probe`, never from the journal file |
| 7. Out of scope stated | PASS | P1 table, Out of Plan | Nine items named, each either already decided elsewhere or explicitly deferred |
| 8. Auth and authz per endpoint | PASS | E5, R5, A3, C1, I10 | Every new route states its auth position and its ownership check; I10 states per-element tenancy specifically |
| 9. Access pattern and index hygiene | Advisory | R1 | The UNIQUE on `(household_id, idempotency_key)` is the only new index and it is load-bearing, not incidental |
| 10. Verification gaps named rather than papered over | PASS | Chunk V | Three, each stating what the suite structurally cannot prove; V3 explicitly does not claim to close the standing 390px gap |

**Gate not marked passed. This review is the plan's own self-check, and it is not a Blueprint gate. Gaurav has not reviewed this plan.**

## Out of Plan (D-024 + D-025)

- **Dropping the plaintext `goals` table.** It stays in the schema unused, exactly as `analytics_events` does. Dropping it is its own migration and its own decision, and folding one into this feature would mix unrelated work.
- **Excel export.** D-025 decision 1: import only in v1, and export is a separate encryption-boundary decision, not a side effect of import. The template shape is designed so a future export needs two hidden columns added, not a redesign.
- **Prompt caching, the Files API, queues, and retries at the Anthropic layer.** All four settled 2026-09-07 in the same direction and for the same reason. A failed call fails to the user, who may ask again.
- **A dedicated Anthropic API key.** Gaurav resolved to reuse the group-travel-pwa key as an accepted risk. The revisit trigger is on record in D-024 and is not this plan's to pull.
- **Tune and edit flow, multiple goals per ledger, step-up SIP, tax-adjusted returns, Monte Carlo, streaming responses, per-user caps.** D-024 decision 8.
- **Per-instrument rate overrides.** Per asset class only. Not deferred with a plan, simply not offered.
- **Inline row editing on the import review screen.** The fix loop is download the rejects, fix in Excel, reupload.
- **Clipboard import, foreign CSVs, bank statements, any hosted parsing API.** All rejected in D-025.
- **Closing the standing 390px verification gap.** V3 adds these screens to the existing checklist and explicitly does not close D-022 or D-023.

None of the above is scope creep into this plan. Each is either already decided elsewhere, explicitly deferred by Gaurav, or blocked on tooling that no step here can reach.
