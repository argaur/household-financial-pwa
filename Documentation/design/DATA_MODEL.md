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
- `analytics_events` is write-only from the application layer. No user-facing read route.
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
