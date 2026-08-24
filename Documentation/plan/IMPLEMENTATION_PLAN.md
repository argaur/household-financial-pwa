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
