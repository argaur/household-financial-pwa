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
