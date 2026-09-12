# Data Model — Household Financial Planning PWA

**Phase:** Design Stage 0
**Status:** draft
**Date:** 2026-07-02

---

## DEFERRED Items Resolved Here

| Item | Decision |
|---|---|
| Multi-tenancy isolation | Application-layer scoping. Every Hono route: extract Clerk user ID → fetch `households` where `owner_user_id = clerkUserId` → filter all child queries by that `household_id`. No Postgres RLS in v1. |
| Data retention on account deletion | Hard delete cascade. Clerk `user.deleted` webhook → delete `households` row → cascade deletes all family_members, holdings, protection, analytics_events. No soft-delete or grace period in v1. |
| Concurrent-session behavior | Last-write-wins. No optimistic concurrency control. Single household editor, manual-entry app — collision probability negligible in v1. |
| Mobile breakpoint | 390px primary (iPhone 14 Pro). Tablet: 768px. Desktop: 1280px. |

---

## Entities

### users (Clerk-managed — no local Postgres table)

**Description:** Authenticated identity. Managed entirely by Clerk. Referenced in the DB only as a string `clerk_user_id` stored in `households.owner_user_id`.

**Owner:** Clerk (external)

**No local schema.** A Clerk webhook listener handles `user.deleted` to trigger cascade deletion.

---

### households

**Description:** A family unit — the top-level ownership container for all financial data. One Clerk user = one household in v1 (single editor, no shared access).

**Owner:** The Clerk user identified by `owner_user_id`. All child data is scoped to this household.

**Fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | yes | PK, generated |
| owner_user_id | text | yes | Clerk user ID string (e.g. `user_xxx`); unique constraint — one household per user |
| name | text | yes | e.g. "Gupta Family" — household display name |
| created_at | timestamptz | yes | auto |
| updated_at | timestamptz | yes | auto |

**States:**

| State | Condition | UI implication |
|---|---|---|
| loading | App boot — fetch in flight | Full-screen spinner; no routes rendered yet |
| new | No household row exists for this Clerk user | Redirect to `/onboarding/step-1`; create-household form |
| populated | Household row found | Proceed to dashboard (or resume onboarding if incomplete) |
| error | Fetch failed (API/network) | Full-screen error with retry button |

---

### family_members

**Description:** People in the household whose finances are tracked. Each holding is assigned to one member.

**Owner:** The parent household (household_id).

**Fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | yes | PK |
| household_id | uuid | yes | FK → households.id, ON DELETE CASCADE |
| name | text | yes | Display name |
| relationship | enum | yes | `self` / `spouse` / `child` / `parent` / `other` |
| date_of_birth | date | yes | Required — powers age-based nudges (e.g. SSY eligibility, retirement horizon) |
| risk_profile | enum | no | `conservative` / `moderate` / `aggressive`; optional in v1 |
| created_at | timestamptz | yes | auto |
| updated_at | timestamptz | yes | auto |

**States:**

| State | Condition | UI implication |
|---|---|---|
| empty | No members exist in this household | Onboarding Step 2: prompt to add first member; "Add member" form open by default |
| loading | Fetch in flight | Skeleton list (2–3 placeholder cards) |
| populated | 1+ members exist | Member cards shown; "Add another member" affordance visible |
| saving | Form submission in flight | Form fields disabled, submit button shows spinner |
| error | Fetch or save failed | Toast + retry; form stays open on save failure |

---

### instruments

**Description:** The 30 curated financial instruments in the library (6 sections × 5 each). Seeded into Neon at deploy time. Read-only — never user-modified.

**Owner:** System (no user ownership; all authenticated users can read; no one can write via the app).

**Fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | yes | PK |
| slug | text | yes | URL-safe identifier (e.g. `equity-large-cap-index`); unique |
| category | int | yes | 1=Equity 2=Debt 3=Gold 4=Hybrid/Guaranteed 5=Real Estate 6=Alternative |
| name | text | yes | Display name |
| summary | text | yes | One-line description |
| returns | text | yes | Typical returns description (qualitative — no live data) |
| tax | text | yes | Tax treatment summary |
| liquidity | text | yes | Liquidity description |
| risk | text | yes | Risk level description |
| eligibility | text | yes | Who can invest (e.g. "Indian residents; minors with guardian") |
| min_investment | text | yes | Minimum entry amount/unit |
| rate_value | numeric | no | Current rate where applicable (e.g. SSY 8.2%, GPF 7.1%); null for market-return instruments |
| rate_as_of | date | no | Date `rate_value` was last updated; null if rate_value is null |
| created_at | timestamptz | yes | auto |

**States:**

| State | Condition | UI implication |
|---|---|---|
| loading | First fetch (not yet cached) | Skeleton grid (6 section cards) |
| populated | Data available (DB or PWA cache) | Section cards and instrument detail cards rendered normally |
| cached | Served from PWA precache (offline or cache-hit) | Show subtle "Offline — showing saved content" banner; no stale-data warning on static instrument content |
| error | Fetch failed AND no cache available | Error state with retry; only reachable if user has never loaded the library before |

---

### holdings

**Description:** A single financial position held by one family member. Records both the original invested amount and the user's manually-entered current value.

**Owner:** The household (household_id). Every holding is also assigned to exactly one family member (member_id required in v1 — household-level positions use the household head, `relationship=self`).

**Fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | yes | PK |
| household_id | uuid | yes | FK → households.id, ON DELETE CASCADE |
| member_id | uuid | yes | FK → family_members.id; required — no unassigned holdings in v1 |
| instrument_id | uuid | yes | FK → instruments.id |
| asset_class | enum | yes | `equity` / `debt` / `gold` / `hybrid` / `real-estate` / `alternative`; denormalized from instrument for fast completeness-check queries |
| invested_amount | numeric | yes | Total amount invested (₹) |
| current_value | numeric | yes | User's manually-entered current value (₹); Completeness Check #5 requires this to be non-null — which it always is at creation, so the check is really about never-updated stale rows |
| units | numeric | no | Units held (MF units, gold grams, etc.); null for amount-only instruments |
| monthly_sip | numeric | no | Monthly SIP amount (₹) if applicable; null otherwise |
| start_date | date | no | Date the holding was initiated |
| maturity_date | date | no | For FD, SSY, bonds; null for open-ended instruments |
| nominee | text | no | Nominee name (free text) |
| price_source | text | yes | Default `'manual'` for all v1 holdings. Exists to support v2 auto-pricing without a migration. |
| is_emergency_fund | boolean | yes | Default `false`. User explicitly flags this holding as their emergency fund on the add/edit form. Powers Completeness Check #2. |
| notes | text | no | Free-text notes |
| created_at | timestamptz | yes | auto |
| updated_at | timestamptz | yes | auto |

**States:**

| State | Condition | UI implication |
|---|---|---|
| empty | No holdings exist for this household | Portfolio tab: full empty state with CTA to add first holding. Completeness Score = 0 or 1 (only member-coverage check can pass if members exist). |
| loading | Fetch in flight | Skeleton list (3–4 placeholder rows) |
| populated | 1+ holdings exist | Holdings list grouped by member or by asset class (TBD Stage 2); allocation donut computable |
| saving | Form submit in flight | Form disabled, submit shows spinner |
| form-error | Client-side or API validation failed | Inline field errors; form remains open |
| error | Fetch failed | Toast + retry; previously loaded data stays visible if cached |

---

### protection

**Description:** Insurance or protection coverage recorded for a household member. Powers Completeness Check #3 (both parents have protection logged).

**Owner:** The household (household_id), assigned to a member.

**Fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | yes | PK |
| household_id | uuid | yes | FK → households.id, ON DELETE CASCADE |
| member_id | uuid | yes | FK → family_members.id |
| type | enum | yes | `term-life` / `health` / `disability` / `other` |
| cover_amount | numeric | yes | Coverage amount (₹) |
| premium | numeric | no | Annual premium (₹) |
| provider | text | no | Insurer/provider name |
| status | enum | yes | `active` / `lapsed` / `pending` |
| created_at | timestamptz | yes | auto |
| updated_at | timestamptz | yes | auto |

**States:**

| State | Condition | UI implication |
|---|---|---|
| empty | No protection records for this household | Profile or dedicated protection section (Phase 2 decision): nudge + CTA |
| loading | Skeleton |  |
| populated | 1+ records | Summary cards per member |
| error | Fetch/save failed | Toast + retry |

---

### goals (v1.5 — schema exists, no UI in v1)

**Description:** Savings goals tied to a household. Schema created now to avoid a migration when the feature ships.

**Owner:** The household.

**Fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | yes | PK |
| household_id | uuid | yes | FK → households.id, ON DELETE CASCADE |
| name | text | yes | Goal name (e.g. "Siya's education") |
| target_amount | numeric | yes | Target corpus (₹) |
| horizon_years | int | yes | Years to goal |
| created_at | timestamptz | yes | auto |

**States:** N/A — no UI rendered in v1. Table exists only.

---

### analytics_events

**Description:** Internal event log. Written server-side via the shared `track()` wrapper alongside PostHog. Never read by application UI — queried only via Postgres tooling or the Hono analytics endpoint (internal only).

**Owner:** System (no user-facing ownership; `user_id` is the Clerk user ID of the actor).

**Fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | yes | PK |
| user_id | text | yes | Clerk user ID |
| event | text | yes | Event name (e.g. `onboarding_completed`) |
| properties | jsonb | yes | Event properties |
| created_at | timestamptz | yes | auto — index this column |

**States:** System table — no UI state. No ON DELETE CASCADE — analytics data is retained even if a user deletes their account (anonymized by `user_id` becoming orphaned).

---

## Relationships

```
users (Clerk)  1 ──── 1  households          (one Clerk user owns one household)
households     1 ──── N  family_members      (household has many members)
households     1 ──── N  holdings            (household has many holdings)
households     1 ──── N  protection          (household has many protection records)
households     1 ──── N  goals               (household has many goals — v1.5)
family_members 1 ──── N  holdings            (each holding is assigned to one member)
family_members 1 ──── N  protection          (each protection record covers one member)
instruments    1 ──── N  holdings            (each holding references one instrument)
```

**Ownership rules:**
- All user data (family_members, holdings, protection, goals) is owned by a household and only readable/writable by the Clerk user who owns that household.
- Isolation enforcement: application layer only. Every Hono route resolves `household_id` from `households.owner_user_id = clerkUserId` before any data query. Queries never accept a raw `household_id` from the client — it is always resolved server-side.
- `instruments` are read-only for all authenticated users. No write routes exposed for them.
- `analytics_events` was specified as write-only from the application layer, with no user-facing read route. **Corrected 2026-08-01 (D-012): the write path was never built.** The table exists in the schema and is empty. It is retained only because the cascade-delete code and its tests reference it.
- On `user.deleted` (Clerk webhook): hard delete `households` row → cascade deletes family_members, holdings, protection, goals. `analytics_events` rows are retained (orphaned `user_id`).

---

## Completeness Score — Query Spec

The Household Portfolio Completeness Score is computed server-side. Five binary checks, equal weight:

| # | Check | Passing condition |
|---|---|---|
| 1 | Member coverage | Every `family_members` row for this household has ≥1 holding in `holdings` |
| 2 | Emergency fund | ≥1 holding exists where `is_emergency_fund = true` |
| 3 | Both parents protected | `family_members` rows with `relationship IN ('self','spouse')` each have ≥1 `protection` row with `status = 'active'` |
| 4 | Asset-class diversity | COUNT(DISTINCT `asset_class`) across all household holdings ≥ 3 |
| 5 | No stale current values | All `holdings` rows have `current_value IS NOT NULL` — always true at creation; flag is set in a future update flow |

**Design note for Check #2:** The "emergency fund" detection needs a mechanism beyond free-text matching. Recommendation: add a boolean `is_emergency_fund` column to `holdings`. This is a schema decision — flagging here for gate review rather than silently choosing.

---

## State Matrix

Every screen with dynamic data. Design must produce layouts for every non-dash cell.

| Screen | Loading | Empty | Populated | Error | Auth-blocked |
|---|---|---|---|---|---|
| App boot / shell | Full-screen spinner (no routes yet) | — | Route to onboarding or dashboard | Full-screen error + retry | Redirect to Clerk /sign-in |
| Onboarding Step 1 — Create household | Form submitting: fields disabled + spinner | Blank form (default state) | — | API error toast; form stays open | Redirect to /sign-in |
| Onboarding Step 2 — Add members | Members list loading skeleton | No members yet: empty prompt + "Add first member" button | Member cards + "Add another" | Toast + retry; form stays open on save fail | Redirect to /sign-in |
| Onboarding Step 3 — Add first holding | Instrument list loading skeleton; form submitting: disabled | Blank form (default state) | — | Inline validation + API error toast | Redirect to /sign-in |
| Home / Dashboard | 3-card skeleton + donut ring placeholder | Score=0, all checks unmet, donut empty with placeholder message, single nudge "Add your first holding" | Donut + Health tier card + 1 nudge | Toast with retry; stale data visible if cached | Redirect to /sign-in |
| Explore — Library sections | 6 skeleton cards | — | 6 section cards (Equity, Debt, Gold, Hybrid, Real Estate, Alternative) | Toast + retry | Redirect to /sign-in |
| Library section — Instrument list | 5 skeleton rows | — | 5 instrument summary cards | Toast + retry | Redirect to /sign-in |
| Instrument detail | Skeleton (all fields) | — | Full instrument card (all fields populated) | Toast; back button stays functional | Redirect to /sign-in |
| Portfolio tab | Holdings list skeleton | No holdings: illustration + CTA "Track your first holding" | Holdings list (grouped view) + allocation summary bar | Toast + retry; cached data visible | Redirect to /sign-in |
| Add holding — Form | Instrument picker loading | Blank form | — | Inline validation errors + API toast | Redirect to /sign-in |
| Edit holding — Form | Existing data loading as skeleton | — | Form pre-populated | Load error: toast + back; save error: toast + form stays | Redirect to /sign-in |
| Profile | Household/member info skeleton | — | Household name + member list + account section | Toast + retry | Redirect to /sign-in |
| "Why these choices?" page | Near-instant (static MDX) | — | Static page content | — | Not auth-gated — public page |

---

## Schema Decision Log (Stage 0)

| Decision | Choice | Rationale |
|---|---|---|
| Emergency fund detection (Check #2) | `is_emergency_fund boolean DEFAULT false` on `holdings` | Explicit user flag — unambiguous, no fragile text matching. Checkbox on add/edit holding form: "Mark as emergency fund." Decided 2026-07-02. |

---

## Notes for Design

1. **The Score=0 empty dashboard is the most critical empty state.** It is the first screen new users see after completing onboarding Step 3 (first holding added → score becomes ≥1 almost immediately). However, users who add zero protection or span <3 asset classes will still see lower-score states on return visits — these must feel motivating, not broken.
2. **`current_value` is always set at creation** — the user enters it manually on the holding form. The Completeness Check #5 is therefore about detecting staleness on return visits, not missing data at creation. The check always passes for fresh users. Design should not show "stale value" warning UI in v1 — this is a v2 concern.
3. **Instrument content is precached.** Library sections and instrument detail pages should work fully offline. Portfolio and dashboard require network (they show live holding data). This split must be visually communicated — suggest an offline banner only on network-dependent screens.
4. **member_id is always required.** Household-level assets (joint gold, joint property) get assigned to the `relationship=self` member in v1. No "household-level holding" concept at the UI layer.
5. **The FAB ("+") adds a holding**, not anything else. All other creation flows (add member, update household name) live inside Profile. This keeps the primary action always visible and unambiguous.
6. **Pagination:** not needed in v1. A household is unlikely to have >50 holdings manually. If they do, server returns all and UI renders all — no infinite scroll.
7. **`rate_value` / `rate_as_of`** are shown on instrument detail cards for fixed-rate instruments (SSY, GPF, etc.). The UI should show a "Rate as of [date]" label and a note to verify current rates — these are manually maintained in the seed data and may be 1–3 months stale.

---

## D-016 Bundle Additions — Strategy Ledgers, Projections, AI Cap (Design Stage 0, 2026-08-17)

**Phase:** Design Stage 0 for the D-016/D-017/D-018 feature bundle. Scoped to what the approved brief locks: ledgers build first (D-017 §8); AI counsel, goal planner, and bulk import follow once ledgers exist and the Anthropic key is provisioned. Modeled here together since they touch the same tables, built in that order.

### ledgers (new)

**Description:** A strategy plan layered on top of a household's holdings. Every household has exactly one baseline ledger ("Current," `is_baseline = true`), created by migration for existing households and at household-creation time for new ones. Up to four additional ledgers per household (D-018 §2 cap, a fixed constant enforced at the API layer, not the DB).

**Owner:** The household (`household_id`).

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | yes | PK |
| household_id | uuid | yes | FK → households.id, ON DELETE CASCADE |
| name | text | no | Plaintext only for the baseline row ("Current," written server-side by `ensureBaselineLedger` before the vault may be unlocked). Every other row stores `name = null` — the real value lives client-side-encrypted in `ciphertext`/`iv`/`alg`/`version` below. Reversed from "ledger name stays plaintext" by D-020 (migration `0005_luxuriant_aqueduct`) |
| ciphertext | text | no | Encrypted `{ name }` envelope, D-020. Null for the baseline row, set for every other ledger |
| iv | text | no | AES-GCM IV for `ciphertext`. Null for the baseline row |
| alg | text | no | Cipher identifier for `ciphertext`. Null for the baseline row |
| version | int | yes | Envelope schema version, default `1`. Present on the baseline row too even though it carries no ciphertext |
| is_baseline | boolean | yes | Default `false`. Exactly one `true` row per household, enforced at the API layer (a partial unique index on `(household_id) WHERE is_baseline` is the DB-level backstop) |
| origin | enum | yes | `manual` / `ai_suggestion`. Only `ai_suggestion` ledgers count against the 2-plans-per-household AI cap (D-017 §2) |
| ai_edits_used | int | yes | Default `0`. Counts AI-driven edits only (D-017 §2); capped at 2 in application logic |
| snapshot_of | uuid | no | FK → ledgers.id, self-reference. Set at creation to the ledger it was copied from (usually Current); null for the baseline row itself. Powers the "created from Current on [date]" copy (D-018 §4) |
| projection_horizon_years | int | no | User-chosen; null until the user opens the projection view for this ledger |
| created_at | timestamptz | yes | auto — this is the "snapshot date" shown in ledger tab copy |
| updated_at | timestamptz | yes | auto |

**States:**

| State | Condition | UI implication |
|---|---|---|
| loading | Ledger list fetch in flight | Tab strip shows skeleton pills |
| empty | Household has only the baseline ledger | Tab strip shows `Current | + New` only, no compare strip |
| populated | 1+ non-baseline ledgers exist | Tab strip shows `Current | <ledger names> | + New`; compare strip visible on non-baseline tabs |
| creating | Name-and-copy modal submitting | Modal fields disabled, submit shows spinner |
| at-cap | 4 non-baseline ledgers already exist | `+ New` disabled/hidden, tooltip explains the 4-ledger cap |
| error | Create/fetch failed | Toast + retry; modal stays open on create failure |

### holdings — amended

**`ledger_id` added:** `uuid`, required, FK → `ledgers.id`, ON DELETE CASCADE. Every holding now belongs to exactly one ledger, not directly to a household (household is reached via `ledger.household_id`). **Migration:** for every existing household, insert one `ledgers` row (`name = 'Current'`, `is_baseline = true`, `origin = 'manual'`), then backfill every existing `holdings.ledger_id` to that row's id, then add the `NOT NULL` constraint. Full snapshot on ledger creation (D-018 §4): creating a non-baseline ledger copies every Current holding row with a new `ledger_id`, re-encrypted under the same household data key — **editing Current after the copy does not propagate**, confirmed explicitly by Gaurav.

**Compare strip (D-018 §2):** computed, not stored — three numbers per non-baseline ledger, each diffed against Current: `SUM(current_value)`, `SUM(current_value WHERE asset_class='equity') / SUM(current_value)`, `SUM(monthly_sip)`. Query scoped by `ledger_id`, no new columns.

### instruments — amended — WITHDRAWN, NEVER BUILT

> **Corrected 2026-09-12. This section described a schema change that does not exist and never did.** It is kept rather than deleted so a future reader who finds drift detection referenced elsewhere learns why it is absent, instead of assuming it regressed.
>
> **Ground truth:** `instruments` has **no `is_active` column and no `updated_at` column** — neither appears in `drizzle/schema.ts` (the `instruments` table is lines 54-79) nor in **any** migration SQL, including the held `0008`. Instrument drift detection is therefore **not implemented in any form**.
>
> **Why:** the work was drafted and then withdrawn at the erd-gate review on 2026-08-24 — see `Documentation/plan/IMPLEMENTATION_PLAN.md` lines 277 and 308: "Chunk 4 (Instrument drift detection) drafted then withdrawn from this plan... its `instruments.updated_at` seed-upsert semantics were a load-bearing `[H]` with no resolution... Becomes its own chunk once that hypothesis is resolved." The doc was never updated to match, so it asserted the change as done for roughly three weeks.
>
> **Soft-delete is likewise not in force.** Instruments are not soft-deleted today, so D-017 §6's "a ledger's historical holding reference never dangles" guarantee is **not** currently provided by the schema. Anything relying on it needs to re-establish it when this chunk is rebuilt.

The withdrawn design, for whoever resumes it: add **`is_active`** (`boolean`, default `true`) and **`updated_at`** (`timestamptz`, auto). Instruments would be soft-deleted, never hard-deleted. **Drift detection:** on ledger view, for each holding, compare `instrument.is_active = false` OR `instrument.updated_at > holding.created_at`. If either is true, render the bold red-toned warning banner naming what changed — the holding row itself stays untouched, per D-017 §6's "never delete or silently reconcile" rule.

### ledger_projection_settings (new)

**Description:** Per-ledger, per-asset-class user-overridable annual return rate for the deterministic compound-growth projection line (D-018 §3). No AI involved, no historical snapshots needed — projects forward from present `holdings.current_value`.

**Owner:** The parent ledger.

| Field | Type | Required | Notes |
|---|---|---|---|
| ledger_id | uuid | yes | FK → ledgers.id, ON DELETE CASCADE. Composite PK with asset_class |
| asset_class | enum | yes | Same enum as `holdings.asset_class` |
| annual_rate_pct | numeric | yes | User-overridable; seeded with a sane default per class (e.g. equity 12%, debt 7%) on first view, not stored until the user opens/edits it |

**States:** loading (skeleton rate rows) / populated (rates shown, editable inline) / saving (field disabled, inline spinner) / error (toast, value reverts).

### households — amended

**`ai_plans_created`** (`int`, default `0`) added. Counts `ledgers` rows with `origin = 'ai_suggestion'` created by this household; capped at 2 (D-018 §5, D-017 §2). Denormalized counter rather than a `COUNT()` query so the cap-exhausted UI state is a single-row read, not a join, on every dashboard load.

### AI suggestion cards — not persisted

Per D-017 §1, the thin proxy writes nothing to Neon and nothing to logs. AI suggestion cards (Apply/Dismiss, targeting Current or any ledger — D-018 §3) exist only in browser state for the duration of the response; Apply commits as a normal holdings write, Dismiss discards with no trace. No new table.

### Relationships — amended

```
households     1 ──── N  ledgers             (household has many ledgers, exactly one is_baseline)
ledgers        1 ──── N  holdings            (holdings now belong to a ledger, not directly to a household)
ledgers        1 ──── N  ledger_projection_settings
ledgers        N ──── 1  ledgers             (snapshot_of self-reference, nullable)
```

`households 1──N holdings` is removed as a direct relationship; reached transitively via `ledgers`.

### State Matrix — additions

| Screen | Loading | Empty | Populated | Error | Auth-blocked |
|---|---|---|---|---|---|
| Ledger tab strip | Skeleton pills | `Current | + New` only | Tab strip + compare strip on non-baseline tabs | Toast + retry | Redirect to /sign-in |
| New-ledger modal | Submitting: fields disabled + spinner | Blank name field, blank-or-copy toggle defaulted to copy | — | Inline validation + API toast; modal stays open | Redirect to /sign-in |
| Ledger dashboard (non-baseline) | 3-card skeleton + donut placeholder | N/A — always created from a copy, never empty | Donut + compare strip + editable holdings | Toast + retry; stale data visible if cached | Redirect to /sign-in |
| Instrument-drift banner | N/A | Not rendered (no drift) | Bold red-toned banner listing changed/removed instruments | N/A | N/A |
| Projection view | Rate rows skeleton | Rates unset: defaults shown, editable | Compound-growth line rendered for chosen horizon | Toast; last valid line stays visible | Redirect to /sign-in |
| AI suggestion card | Spinner while proxy call in flight | N/A | Apply/Dismiss card with proposed diff | Toast naming the failure; card removed | Redirect to /sign-in |
| AI cap-exhausted state | N/A | N/A | Soft message: "AI limitations reached, paid tier coming soon"; manual editing stays fully available | N/A | Redirect to /sign-in |
| Bulk-import template download | Generating: button spinner | N/A | Prefilled `.xlsx`, every applicable instrument name + field | Toast + retry | Redirect to /sign-in |
| Bulk-import upload | Parsing: progress indicator | N/A | Row-by-row validation summary, confirm-to-commit | Per-row error list; valid rows still committable | Redirect to /sign-in |

### Notes for Design (D-016 bundle)

8. **Ledgers build first, alone.** AI suggestion cards, projections, and bulk import all reference ledger/holding shapes that don't exist until the `ledgers` table and `holdings.ledger_id` migration ship. Design and slice this bundle in that order, matching D-017 §8.
9. **The compare strip has exactly three numbers in slice 1** (total value, equity share, monthly SIP) — no side-by-side view, deferred behind the `ledger_switched` adoption signal (D-018, Revisit-if clause).
10. **The instrument-drift banner is the one new UI surface with no existing precedent in this app** — v1 never showed a warning banner anywhere. Design should treat its visual weight (bold, red-toned per D-017 §6) as a first-class state, not a small inline note.
11. **AI cap-exhausted is a soft, permanent-feeling state, not an error.** It should read as a product limitation with a future ("paid tier coming soon"), never as a failure — copy needs a different visual register than the toast-based error states elsewhere in this doc.

---

## Stage 0 — D-016 Slice 5 (Full-Platform Mint/Treasury Redesign, 2026-08-25)

**No new entities, fields, relationships, or states.** Slice 5 is a visual restyle of screens against entities and states already fully specified above (households, family_members, holdings, protection, instruments, plus the ledger amendments). Every screen in scope — landing, dashboard, explore, `/why`, onboarding, Profile, instrument detail — already has its data shape and State Matrix row defined either in the original tables above or (for ledgers) in the amendments section. This slice changes how those states render, never what they are.

**Gate: Stage 0 passes by inspection, not by new content.** No table to fill — confirming absence of a data-model delta is itself the Stage 0 output for a pure visual slice.

---

## Stage 0: D-024 (AI Goal Planner, Counsel Cards, Deterministic Projection Engine, 2026-09-07)

**Phase:** Design Stage 0 for D-024, run after Gaurav's 2026-09-07 resolutions on the shared Anthropic key (reuse, accepted risk) and prompt caching (none). Scoped to the build order D-024 decision 7 sets: (a) deterministic engine alone, (b) goal draft, (c) counsel cards. Everything the D-016 bundle already added (`ledgers`, `holdings.ledger_id`, `ledger_projection_settings`, `households.ai_plans_created`) is live in production at `1fa570c` and is not restated here, only amended.

### Encryption boundary, stated once for this whole section

Three categories, and every field below belongs to exactly one:

| Category | Rule | Fields in this section |
|---|---|---|
| **Household data** | Client-side encrypted via `sealRow` into `{ ciphertext, iv, alg, version }`, AAD bound to `{ table, householdId, rowId, version }`. The server has no schema that can accept the plaintext (`server/lib/envelope.ts` is `.strict()`). | The goal payload, carried inside the existing `ledgers` envelope |
| **Catalog data** | Plaintext. Public, identical for every household, already served unencrypted by `GET /api/instruments`. | `instruments.assumed_annual_rate_pct`, `instruments.rate_source`, `instruments.rate_as_of` |
| **Counters and structure** | Plaintext integers, ids, and timestamps. They describe how many times something happened, never what a household owns. Same category as the existing `ai_plans_created`, `is_baseline`, `ledger_id`. | Everything in `ai_call_reservations` and `ai_global_usage`, plus `ledgers.ai_edits_used` |

There is no fourth category. A field that does not obviously fall into catalog or counters is household data and gets sealed.

### ledgers: amended (goal payload rides the existing envelope)

**No new columns.** The goal a ledger was planned toward is added to the plaintext payload that is already sealed into `ledgers.ciphertext`, widening it from `{ name }` to `{ name, goal? }`:

```
{
  name: string,                       // existing, max 60 chars, checked client-side
  goal?: {
    label: string,                    // max 80 chars, e.g. a college fund
    targetAmountInr: number,          // integer rupees
    targetYear: number,               // four-digit year
    monthlyCapacityInr: number | null // what the household says it can add per month
  }
}
```

**Why the envelope and not a table.** D-024 open question 3 named the existing `goals` table as unshippable: it is plaintext, which D-014 forbids for household data. Two options existed, encrypt `goals` as its own table, or fold the goal into the ledger. Folding wins because a goal has exactly one ledger and a ledger has at most one goal, so a separate table buys a join and a second AAD binding for nothing. `sealRow` and `decryptWireRow` in `src/lib/ledgers-api.ts` already handle this row under `LEDGERS_TABLE`; widening the sealed object needs no schema change, no migration, and no new server code, because the server never sees the payload shape at all.

**The `goals` table stays in the schema, unused,** exactly as `analytics_events` does (D-012). It is not dropped in this pass, and nothing reads or writes it. A future pass may drop it; doing so here would mix an unrelated migration into this feature.

**Version bump.** Widening the sealed payload does not change `version`, because a reader that gets `{ name }` with no `goal` key is a valid, expected state (a manually created ledger). `decryptWireRow` returns the parsed object as-is and the caller treats `goal` as optional.

**`origin` enum unchanged.** `manual` and `ai_suggestion` already exist (D-019). A ledger created through the goal planner is `ai_suggestion` and counts against `households.ai_plans_created`. A ledger a user creates by hand and later attaches a goal to stays `manual` and does not count, consistent with D-017 §2's rule that the caps bound Anthropic calls and never bound how a household uses its own data.

### instruments: amended (seeded return assumptions)

Catalog data, plaintext, served by the existing `GET /api/instruments`.

| Field | Type | Required | Notes |
|---|---|---|---|
| assumed_annual_rate_pct | numeric(5,2) | no | The long-run nominal annual return this instrument is projected at. Populated for the 6 instruments that have a defensible published rate (D-024 decision 1); null for the other 24, which fall back to their asset class default in `ledger_projection_settings` |
| rate_source | text | no | Where the number came from, in plain words, rendered verbatim in the "See the maths" panel. Null wherever `assumed_annual_rate_pct` is null |
| assumed_rate_as_of | date | no | The date the rate was last checked. Drives a staleness note in the maths panel rather than any automatic behaviour. Null wherever the rate is null |

> **Column name corrected 2026-09-12.** This row previously read `rate_as_of`, which is **a different, pre-existing column** on the same table (documented separately at the `instruments` entry above, populated for 5 rows, used for library display). The live column added by D-024 is **`assumed_rate_as_of`** — confirmed in `drizzle/migrations/0006_outstanding_gorgon.sql` ("`ALTER TABLE "instruments" ADD COLUMN "assumed_rate_as_of" date;`", applied to production) and in `drizzle/schema.ts:75` (`assumedRateAsOf: date('assumed_rate_as_of')`), whose inline comment records the naming as deliberate "rather than reusing `rate_as_of`, since that name is already taken". As written, the doc named two semantically different columns identically.

**These three are display-and-audit fields, not a pricing feed.** D-002's "no live price feeds in v1" is untouched: nothing fetches these, they are seeded in the same migration that adds them and change only when a human edits the seed.

### ledger_projection_settings: unchanged, now actually used

Specced in the D-016 additions above, never built. The deterministic engine (D-024 decision 1) is its first consumer. No shape change. The resolution order the engine applies is new and belongs here rather than in code comments:

1. `instruments.assumed_annual_rate_pct` if the user has not overridden this asset class
2. `ledger_projection_settings.annual_rate_pct` for the holding's asset class if the user has overridden it, which overrides the instrument rate for every holding in that class
3. the seeded per-class default if neither exists, unstored until edited

An override is per asset class, never per instrument. A per-instrument override is not in scope and is not deferred with a plan, it is simply not offered.

### ai_call_reservations (new)

**Description:** The atomic pre-call reservation D-024 item (b) makes a hard requirement. One row per attempted AI call, written **before** the outbound Anthropic request, never after. `neon-http` has no transactions, so the guarantee has to come from a unique constraint plus a single conditional statement, not from a transaction.

**Owner:** The household. Plaintext throughout, counters only.

| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | yes | PK |
| household_id | uuid | yes | FK to households.id, ON DELETE CASCADE |
| ledger_id | uuid | no | FK to ledgers.id, ON DELETE CASCADE. Null for a goal-plan call, which creates its ledger only after the response arrives. Set for a counsel call, which targets an existing ledger |
| idempotency_key | text | yes | Client-supplied v4 UUID, one per user gesture. **UNIQUE on `(household_id, idempotency_key)`** |
| kind | enum | yes | `goal_plan` or `counsel`. Determines which cap the reservation was taken against |
| cap_type | enum | yes | `plans` or `edits`. Which counter this reservation consumed |
| status | enum | yes | `reserved`, `completed`, or `failed`. Default `reserved` |
| created_at | timestamptz | yes | auto |

**States:** reserved (call in flight) / completed (response relayed to the client) / failed (proxy or provider error).

**A failed call does not release its reservation.** D-024 item (b) explicitly left this open as a Phase 2 question. It is answered here in the strict direction: `status` moves to `failed` and the counter stays consumed. Releasing on failure reintroduces the exact hole the reservation exists to close, because "failure" is client-reported and a client that reports every call as failed gets unlimited calls. The counter is the cost control (D-016 says so in as many words) and it must be un-gameable, not fair. The cost of this is real and is a copy problem, not a schema problem: a user whose call fails loses one of two plans. The copy in `COPY_DECK.md` says so at the moment of the call, before the call, not after it fails.

### ai_global_usage (new)

**Description:** The global monthly circuit breaker of D-024 decision 6. The only cost layer that survives a cold start, unlike the in-process `server/lib/rate-limit.ts`. One row per calendar month, shared by every household.

| Field | Type | Required | Notes |
|---|---|---|---|
| period | text | yes | PK. `YYYY-MM` in UTC. A row is created lazily by the first call of the month |
| calls_used | int | yes | Default `0`. Incremented by the same single conditional statement that takes the reservation |
| cap_calls | int | yes | The month's ceiling. Seeded from a server constant on row creation, stored per row so raising the cap does not retroactively change a past month's record |
| updated_at | timestamptz | yes | auto |

**Both counters move in one statement each, and both are conditional.** The required shape, expressible without transactions:

```
-- per household, plans cap (goal_plan)
UPDATE households SET ai_plans_created = ai_plans_created + 1
  WHERE id = $1 AND ai_plans_created < 2 RETURNING ai_plans_created;

-- per ledger, edits cap (counsel)
UPDATE ledgers SET ai_edits_used = ai_edits_used + 1
  WHERE id = $1 AND ai_edits_used < 2 RETURNING ai_edits_used;

-- global, every kind
UPDATE ai_global_usage SET calls_used = calls_used + 1
  WHERE period = $1 AND calls_used < cap_calls RETURNING calls_used;
```

Zero rows affected means the cap is reached. The `ai_call_reservations` insert runs first and its unique constraint absorbs the double-tap and client-retry cases; the conditional UPDATEs absorb the concurrent-tab case. Neither alone is sufficient, which is why both are specced.

### AI suggestion cards: still not persisted

Unchanged from the D-016 additions. Cards live in browser state only. Apply commits as a normal holdings or ledger write; Dismiss discards with no trace. `ai_call_reservations` records that a call happened, never what it said.

### Relationships: amended

```
households  1 ---- N  ai_call_reservations
ledgers     1 ---- N  ai_call_reservations   (nullable edge, null for goal_plan calls)
ai_global_usage                              (no edges, one row per month, global)
instruments                                  (three new plaintext catalog columns, no new edges)
```

### State Matrix: additions

| Screen | Loading | Empty | Populated | Error | Auth-blocked |
|---|---|---|---|---|---|
| Projection panel (any ledger) | Skeleton line plus skeleton rate rows | Ledger has no holdings: panel hidden entirely, not shown empty | Compound-growth line for the chosen horizon, rate rows editable inline | Inline message, last valid line stays visible | Redirect to /sign-in |
| "See the maths" panel | N/A, opens over already-loaded data | N/A | Per-class rate, source, as-of date, and the formula in words | N/A | N/A |
| Goal step in "+ New" modal | Submitting: fields disabled, spinner on CTA | Blank goal fields, horizon prefilled to the target year minus the current year | Filled goal, Continue enabled | Inline validation per field, modal stays open | Redirect to /sign-in |
| AI consent step | N/A | N/A | Per-transmission disclosure plus what is and is not sent, single Continue | N/A | Redirect to /sign-in |
| AI call in flight | Spinner on the card slot, cancel not offered | N/A | N/A | Card slot shows the failure and states the attempt was counted | Redirect to /sign-in |
| AI suggestion card | N/A | Model returned no allocation: card shows the no-suggestion state, Dismiss only | Proposed slugs and weights, every number from the deterministic engine, Apply and Dismiss | Card replaced by failure copy | Redirect to /sign-in |
| AI cap-exhausted (household plans) | N/A | N/A | Soft message, manual creation stays fully available | N/A | Redirect to /sign-in |
| AI cap-exhausted (per-ledger edits) | N/A | N/A | "Review this ledger" disabled with the same soft register | N/A | Redirect to /sign-in |
| Global circuit-breaker tripped | N/A | N/A | Distinct soft message naming a monthly limit, not the household's own cap | N/A | Redirect to /sign-in |

### Notes for Design (D-024)

12. **The deterministic engine ships and stands alone.** Every state above from "Projection panel" through "See the maths" must be complete and shippable with no AI code present at all. This is D-024 decision 1 expressed as a design constraint, not a build-order preference.
13. **Cap-exhausted has three distinct copies, not one.** Household plans exhausted, this ledger's edits exhausted, and the global monthly breaker tripped are three different facts with three different implications for the user, and collapsing them into one message tells a user their own limit is reached when it is not.
14. **"See the maths" is the regulatory surface, not a nicety.** D-018 §8 named the regulatory reading of projections as the bundle's largest risk and explicitly did not soften it. The panel is what makes a projection an illustration the user can audit rather than a number the product asserts.
15. **No screen may render a number that came from the model.** The card shows slugs and weights; every rupee figure beside them is computed locally by the engine from those weights. This is mechanical, not editorial.

**Gate: Stage 0 for D-024 is drafted, not approved.** Gaurav has not reviewed it.

---

## Stage 0: D-025 (Bulk Holdings Import from Excel, 2026-09-07)

**Phase:** Design Stage 0 for D-025, run after Gaurav's 2026-09-07 resolutions on the batch endpoint (build it) and dropdowns (none, so SheetJS Community Edition and the prefilled per-member template shape both lock).

### No new tables, no new columns, no migration

Import writes ordinary `holdings` rows through the existing sealed-envelope path. Everything it needs already exists: `holdings.ledger_id` (live since migration `0005`), `holdings.member_id`, the `memberScopedCreateSchema` body shape, `MAX_LEDGER_HOLDINGS = 200`, and the ledger-ownership and member-tenancy checks in `server/routes/holdings.ts`. **Confirming the absence of a data-model delta is the Stage 0 output here**, the same way it was for D-016 Slice 5 above.

### Encryption boundary, the part that is genuinely new

The import flow creates a plaintext lifetime that no other flow in this app has, and it is bounded deliberately at each end.

| Stage | Where the data is | Encrypted? | Bound |
|---|---|---|---|
| Template generation | Browser memory, then an `.xlsx` the browser hands to the OS | **No.** Member names are written into the file in the clear | Accepted and disclosed per D-016 item 3 and D-017 item 9. The moment the file lands on a device it is outside Vittam's boundary, and so is any browser extension with file access |
| The filled file on the user's machine | The user's filesystem | **No** | Outside the boundary entirely. Vittam makes no claim about it and does not try to |
| Parse and review | Browser memory only, React state | **No, and this is the sharp edge** | No parsed row may reach IndexedDB, localStorage, sessionStorage, the service worker cache, a Sentry breadcrumb, a session replay, or the console. D-025 decision 5 and its hard-requirements list. This is the only place in the app where unsealed household data exists outside a form field |
| Commit | `sealRow` per row, then one `POST /api/holdings-batch` | **Yes**, identical to a hand-entered holding | AAD bound to `{ holdings, householdId, rowId, version }` per row, exactly as `src/lib/holdings-api.ts` already does |
| At rest | Neon | **Yes**, ciphertext only | Unchanged. The server never had a schema that could accept a plaintext amount and still does not |

**The batch endpoint does not weaken the boundary,** because the client seals every row before the request is built. The server receives an array of envelopes it cannot open, which is the same thing `POST /api/ledgers` already receives.

### Row buckets are computed, never stored

D-025 decision 6's four buckets (Ready, Needs attention, Possible duplicate, Skipped) are derived in the browser at parse time and live only in component state. No table, no column, no persisted draft. Leaving the import screen discards them, and the copy says so before it happens.

**Duplicate detection is local and conservative.** A parsed row is flagged Possible duplicate when the target ledger already holds a decrypted holding with the same instrument slug and the same `member_id`. This comparison happens after the vault is unlocked and holdings are decrypted in the browser, which is the only place both sides of the comparison exist in plaintext. The server cannot and does not participate.

### State Matrix: additions

| Screen | Loading | Empty | Populated | Error | Auth-blocked |
|---|---|---|---|---|---|
| Import entry point | N/A | Household has no members: entry point hidden, a template would have no tabs | Button on the ledger's holdings view, naming the active ledger | N/A | Redirect to /sign-in |
| PII disclosure, pre-download | N/A | N/A | What the file will contain, in plain words, single Download CTA | N/A | N/A |
| Template generation | Button spinner while SheetJS builds the workbook | N/A | Browser download handed off | Inline failure plus retry, nothing partially written | Redirect to /sign-in |
| File picker and parse | Parse progress, file name shown | No rows filled in: an empty-file message plus a link back to the guide | Review screen | Unreadable or wrong-shape file: named reason, no row list | Redirect to /sign-in |
| Review screen | N/A | Every row landed in Skipped: no commit CTA, only the rejects download | Four buckets, per-row plain-language reasons, primary CTA commits Ready only | Per-row reasons name the column and the reason, never the value | Redirect to /sign-in |
| Commit in flight | Primary CTA disabled with spinner, buckets frozen | N/A | N/A | One failure message for the batch, nothing partially applied | Redirect to /sign-in |
| Commit result | N/A | N/A | Count added, count still needing attention, link to the ledger | Batch rejected: nothing was written, the review screen is still intact | Redirect to /sign-in |
| Ledger row-cap reached | N/A | N/A | Commit blocked before the request, naming the 200-holding ledger cap and how many rows over | N/A | Redirect to /sign-in |

### Notes for Design (D-025)

16. **The review screen is the feature.** Parsing is table stakes; the four buckets with plain-language reasons are what makes a bad spreadsheet fixable rather than rejected. Design weight belongs here, not on the upload control.
17. **Per-row messages name the column, never the value.** "Current value is not a number I can read" is allowed. Echoing the offending cell contents is not, because those messages are the most likely thing to end up in a Sentry breadcrumb or a screenshot.
18. **The two India-specific parsing traps are design-visible, not just test cases.** Lakh grouping parses silently. Shorthand such as "1.5L" is rejected with a message that says what to type instead. A user who sees one rejection needs to understand the rule from that one message.
19. **Nothing about this flow may become offline-capable by accident.** The parser chunk must be precached so the screen works offline; the row data must never be cached. Those two requirements pull opposite directions through the same config file and have to be designed as one decision, not two.

**Gate: Stage 0 for D-025 is drafted, not approved.** Gaurav has not reviewed it.
