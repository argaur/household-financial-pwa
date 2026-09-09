# Metrics Plan — Household Financial Planning PWA

**Date:** 2026-06-23
**Analytics service:** PostHog (cloud), sole sink. **Corrected 2026-08-01 (D-012):** this previously read "kept alongside an internal `analytics_events` Postgres table (Phase 1 Q5 — both, intentionally not deduplicated to one source)". That dual sink was decided in D-005 and never built. Every metric below is measured in PostHog only.
**Error tracking:** Sentry free tier

**2026-08-01 — portfolio-shape properties stripped from six events.** `holding_created`/`holding_updated`
lost `asset_class`/`instrument_id`; `dashboard_viewed` lost `allocation_summary`; `completeness_score_changed`
lost `before_tier`/`after_tier`; `nudge_shown`/`learn_card_clicked` lost `check_id`. The app encrypts household
data client-side so the server cannot read it — sending that same shape to PostHog as event properties made
that claim false. The events still fire and still count; only the properties describing *what a household
owns or which check failed* are gone. **This is accepted measurement debt, not a bug to be quietly worked
around:**
- The North Star funnel verified 2026-07-28 (PostHog insight `bMF690Mf`) leaned on `holding_created.asset_class`
  to show *which* asset classes were being added, not just that a holding was added. That breakdown is gone.
  The funnel's step-to-step conversion (the thing `bMF690Mf` actually measures) is unaffected.
- The "50% of households that completed onboarding will have raised their tier by ≥1 in 30 days" North Star
  target (`SOLUTION_BRIEF.md`) leaned on `completeness_score_changed.before_tier`/`after_tier` to compute the
  before/after comparison directly from event properties. Without those properties this target cannot be
  computed from a single event's payload — it now needs a person/group property holding current tier
  (e.g. set via `posthog.identify`/`group`) queried at two points in time, which does not exist yet.
- The nudge click-through funnel can no longer be segmented by `check_id` (which of the 5 checks a household
  was nudged on), only by `target_type` (learn_card vs route) — see Dashboard Spec below.

**Reworking either target's measurement path is agreed as a separate task, not solved here.** Do not read the
absence of a rework in this change as an oversight.

---

## North Star Metric

**Metric:** Household Portfolio Completeness Score (tier)
**Definition:** Count of 5 binary checks passed per household — (1) ≥1 holding per member, (2) emergency-fund-equivalent holding present, (3) both parents have protection logged, (4) holdings span ≥3 of 6 asset classes, (5) all holdings have `current_value` set — mapped to a tier: 0–1 Getting Started / 2–3 On Track / 4–5 Strong.
**Target at 30 days:** 50% of households that completed onboarding will have raised their tier by ≥1 since signup (Phase 1 Q6).

---

## Input Metrics

| Metric | Definition | Target |
|---|---|---|
| Onboarding completion rate | % of users who start onboarding and complete all 3 steps (household → members → holdings) in their first session | 60% |
| 14-day return rate | % of users who complete onboarding and return at least once within 14 days | 25% |
| Nudge click-through rate | % of `nudge_shown` events followed by a `learn_card_clicked` event in the same session | Research question — no target set yet, tracked from launch |

---

## Health Metrics

| Metric | Target | Alert threshold |
|---|---|---|
| Error rate | < 1% | > 2% |
| p95 latency | < 500ms | > 1s |
| Uptime | > 99.5% | < 99% |

---

## Universal Event Baseline

These fire on every project. Do not remove.

| Event | Key properties | Fires when |
|---|---|---|
| `page_viewed` | path, referrer | Any page load |
| `session_started` | utm_source, utm_medium, device_type | New session begins |
| `signup_completed` | method (email/social), source | User completes signup |
| `signup_failed` | method, error_reason | Signup form error |
| `login_completed` | method | Successful login |
| `login_failed` | method, error_reason | Failed login attempt |
| `feature_used` | feature_name, properties | User triggers a feature |
| `error_shown` | error_type, surface, message | Any error displayed to user |
| `cta_clicked` | cta_name, surface, destination | Any CTA or button click |

---

## Project-Specific Events

One row per v1 feature from `SOLUTION_BRIEF.md` (feature # in parentheses). Every feature has at least one event — exit check passed.

| Event | Key properties | Feature it maps to | Fires when |
|---|---|---|---|
| `onboarding_started` / `onboarding_step_completed` / `onboarding_completed` | step (household/members/holdings), duration_ms | (1) Guided onboarding | User starts/advances/finishes the 3-step flow |
| `holding_created` / `holding_updated` | member_id | (2) Manual holdings entry | User saves a holding form |
| `dashboard_viewed` | household_id | (3) Portfolio dashboard | User lands on the post-onboarding or returning dashboard |
| `completeness_score_changed` | household_id | (4) Household Health panel | Any of the 5 checks flips state |
| `nudge_shown` / `learn_card_clicked` | learn_card_slug, target_type | (5) Single ordered nudge | Dashboard renders the first unmet check; user clicks its learn-card link |
| `library_section_viewed` / `instrument_viewed` | section, instrument_slug | (6) Instrument library | User opens a section or an instrument detail card |
| `nav_tab_clicked` / `fab_clicked` | tab_name | (7) Bottom tab nav + FAB | User navigates via the bottom bar or the "+" action |
| `pwa_shell_loaded` | cache_status (hit/miss) | (8) PWA shell | App boots from precached assets |
| `pwa_install_prompted` / `pwa_installed` | surface | (9) Custom install prompt | Custom install button shown/clicked through to install |
| `why_page_viewed` | — | (10) "Why these choices?" page | User opens the in-app decision-log page |
| `key_setup_started` / `key_setup_step_completed` / `key_setup_completed` | — / step / — | (14) Client-side encryption | User reaches the passphrase screen / finishes the passphrase step (recovery code shown) / acknowledges the recovery code and continues. No secret is ever a property. |
| `vault_unlocked` | method (passphrase/recovery_code) | (14) Client-side encryption | User opens an existing household on a new device or after clearing storage |
| `consent_accepted` | disclaimer_version | (11) Disclaimer + consent modal | User accepts the education-not-advice consent modal |
| *(infra, no dedicated event)* | — | (12) Analytics infra, (13) Sentry | Implementation layer — covered by every other event firing correctly / `error_shown` baseline |

---

## Dashboard Spec

| Chart | Type | Metric | Segment by |
|---|---|---|---|
| Onboarding funnel | Funnel | `onboarding_started` → `onboarding_step_completed` (x3) → `onboarding_completed` | — |
| 14-day return | Retention | `onboarding_completed` → `session_started` within 14 days | — |
| Completeness tier distribution | Bar | Households by current tier (0–1 / 2–3 / 4–5) | — |
| Nudge click-through | Funnel | `nudge_shown` → `learn_card_clicked` | ~~check_id~~ — removed 2026-08-01, see Measurement debt below. Segment by `target_type` instead (coarser: learn_card vs route, not which of the 5 checks). |
| Library engagement | Bar | `instrument_viewed` count by `section` | — |
| Error rate | Trend | `error_shown` / `page_viewed` | surface |

---

## Analytics Implementation Notes

- SDK: PostHog JS (frontend), via the single `track()` wrapper in `src/lib/analytics.ts`. **No server-side write path exists** — the `analytics_events` table described here was never wired up (D-012). Scope every PostHog query with `project = 'financial-planning'`: this is the shared "Web Fleet" project.
- Public surface: one `track(event_name: string, properties: object)` wrapper only — no raw PostHog SDK calls in feature code; the wrapper fans out to both PostHog and the internal table in one call
- Initialised in: Slice 0 (Walking Skeleton)
- Each feature's events added in the same commit as the feature code

---

## Verification log

### 2026-07-28 — North Star funnel verified end-to-end (first time)

Funnel saved as PostHog insight `bMF690Mf`; screenshot in `Documentation/product/screenshots/`.
Scoped with `project = 'financial-planning'` — mandatory, since this app reports into the shared
"Web Fleet" PostHog project (id 486719) and that registered property is the only thing separating it
from the other sites in the fleet.

| Step | Event | Persons | Conversion |
|---|---|---|---|
| 1 | `onboarding_started` | 1 | — |
| 2 | `onboarding_step_completed` | 1 | 100% (2m 3s) |
| 3 | `onboarding_completed` | 1 | 100% (1ms) |
| 4 | `dashboard_viewed` | 1 | 100% (925ms) |

**n = 1, and that 1 is our own test account.** This verifies the *pipeline* — events fire, arrive,
carry their documented properties, and assemble into the funnel this document specifies — and
nothing about real user behaviour. The 60% onboarding-completion target is still entirely
unmeasured. Do not cite this funnel as evidence for any Input Metric target.

**Why this took until now:** `initPostHog()` guarded on `VITE_POSTHOG_KEY`, which was never set in
Vercel, so it returned early on every load and the app recorded **zero** analytics from the day the
file was written until `27cd666` (2026-07-26). The failure was silent by construction — the guard
logged a console warning in a browser nobody was watching. Every event listed in this plan was
"implemented" and none were arriving.

**Lesson for this plan:** an event registry proves an event is *declared*, not that it is *ingested*.
The two questions need separate evidence. `scripts/check_events.py` answers the first; only a query
against PostHog answers the second, and nothing in the pipeline forced anyone to ask it.

**Known-absent events, by design, not defects:**
- `signup_failed` / `login_failed` — Clerk's prebuilt components expose no failure callback; needs a
  custom auth form.
- `learn_card_clicked` — the nudge CTA was simply never clicked during the verification pass.

---

## D-016 Feature Bundle — Metrics (Phase 1, 2026-08-17)

Added by the Phase 1 Solution Stage interview for the D-016 bundle. Everything above is unchanged. Scope and feature numbering: `SOLUTION_BRIEF.md` §"Phase 1 Solution Stage — D-016 Feature Bundle".

**Status: approved 2026-08-17** with the Phase 1 gate.

### Falsifiable success criteria

Seven criteria, all approved at Q6. Percentages are conservative first reads with no prior usage data, same reasoning as D-006, and are movable.

| # | Criterion | Measured by |
|---|---|---|
| 1 | 30% of households with 2+ holdings create at least one alternate ledger within 60 days of launch | `ledger_created` per household |
| 1b | Of households that create a ledger, **40% switch back to it at least once after the session in which they made it** | `ledger_switched` with a session boundary between it and the matching `ledger_created` |
| 2 | 20% of households at Completeness tier 2+ view at least one AI counsel suggestion within 30 days | `ai_suggestion_shown` |
| 3 | Fewer than 5% of households exhaust both caps within 90 days | `ai_cap_reached` |
| 4 | 15% of households with 5+ manually entered holdings use bulk import for a subsequent addition within 60 days | `bulk_import_completed` after 5 or more prior `holding_created` |
| 5 | Onboarding completion does not drop more than 5 percentage points against the pre-redesign baseline, at 30 days | Existing onboarding funnel, compared across the redesign ship date |
| 6 | 25% of households with at least one ledger open a projection within 60 days, **and 10% override at least one default asset-class return rate** | `projection_viewed`, `projection_rate_overridden` |
| 7 | At least 30% of AI suggestions shown against Current are Applied rather than Dismissed | `ai_suggestion_applied` / `ai_suggestion_shown`, both filtered `target = current` |

**Criterion 1b is the one that decides future scope.** Creating a ledger is curiosity; returning to it is use. The side-by-side compare view was cut as a non-goal precisely so this number could decide whether it is ever worth building.

**Criterion 3 is a capacity and cost check, not a value metric.** Hitting it is not failure. It is the signal that a paid tier might be worth designing.

**Criterion 5 is a design QA gate, not a growth metric.** Visual quality is judged by Gaurav directly.

**Criterion 6's second clause carries the weight.** Viewing a projection could be idle curiosity; overriding a rate means the user is actually modelling something.

**Criterion 7 has the sharpest consequence.** Below 30%, AI suggestions are noise being shown against the user's protected baseline record, which is the single most expensive place in the product to be noisy. That would be grounds to revert feature 8's widening back to ledgers only.

### New events

Every bundle feature has at least one event. Exit check passed; see the coverage table below.

| Event | Key properties | Feature | Fires when |
|---|---|---|---|
| `ledger_created` | `source` (blank / copy) | (1) | User confirms the new-ledger modal |
| `ledger_switched` | — | (1) | User taps a non-active tab in the ledger strip |
| `ledger_deleted` | — | (1) | User deletes a ledger |
| `ledger_edited` | — | (2) | A holding is added, changed, or removed inside a non-baseline ledger |
| `compare_strip_viewed` | — | (3) | A non-Current ledger dashboard renders its delta strip |
| `ledger_cap_reached` | — | (4) | User attempts a fifth ledger and is blocked |
| `instrument_drift_warning_shown` | — | (5) | A ledger renders the red-toned drift warning |
| `projection_viewed` | `horizon_years` | (6) | User opens a projection on any ledger, Current included |
| `projection_rate_overridden` | (none) | (6) | User changes a default annual return rate |
| `bulk_import_template_downloaded` | — | (7) | User downloads the generated template |
| `bulk_import_completed` | `rows_clean`, `rows_rejected` | (7) | User commits a reviewed import |
| `ai_suggestion_shown` | `target` (current / ledger), `kind` (counsel / goal_plan) | (8)(9) | A suggestion card renders |
| `ai_suggestion_applied` | `target`, `kind` | (8)(9) | User taps Apply |
| `ai_suggestion_dismissed` | `target`, `kind` | (8)(9) | User taps Dismiss |
| `ai_cap_reached` | `cap_type` (plans / edits) | (10) | The soft cap-hit message renders |
| `why_page_viewed` (existing) / `privacy_page_viewed` | `section` | (12) | User opens the page; `section` distinguishes the encryption-exception anchor |
| `pii_disclosure_shown` | `surface` (bulk_import / privacy) | (13) | The plaintext-download warning renders |
| *(no dedicated event)* | — | (11) redesign | Measured as non-regression on the existing onboarding funnel, not as its own event |
| `explore_holding_added` | `instrument_slug`, `section` | (11) redesign, D-016 Slice 5 | User saves a holding created via the Explore screen's "+ Add" entry point (list-level, distinct from the existing detail-page "Record this in my plan" flow, but both paths open the same prefilled form and produce the same holding record). Fires on successful save, not on tap. Added 2026-08-25 — the concept folio surfaced this as a real new interaction, not present in v1; confirmed in scope, not deferred. **Renamed from `explore_holding_toggled` during the Phase 3 plan's gate review, 2026-08-25:** the folio's own text ("Tapping opens the holding form prefilled with the instrument") rules out an instant no-form toggle, and the Explore card offers no remove action, only add — so the event name and property set were corrected to match what is actually built, not a symmetric add/remove toggle. Properties follow the same discipline as `instrument_viewed`: catalog metadata only, nothing describing what a household holds |

**Property discipline, carried from the 2026-08-01 correction above.** No event may carry anything describing what a household owns. That rule is why `ledger_edited` has no instrument or amount properties, why `ai_suggestion_shown` records `kind` and not the suggestion text, and why `bulk_import_completed` records row *counts* and not row contents. The AI proxy is a further case: **it must not emit analytics at all**, since anything it could usefully report is derived from plaintext holdings. Cap accounting happens server-side against a counter, not by inspecting payloads.

**Correction, 2026-09-09 (D-024 build, step E8).** `projection_rate_overridden` was specced in the table above with an `asset_class` property. That contradicted the rule in this very paragraph, and `asset_class` is the first entry in `FORBIDDEN_ANALYTICS_PROPERTIES` in `src/test/analytics-guard.ts`, so the guard test failed the moment the event was registered as specced. The leak is real and specific to this panel: **a rate row is only rendered for an asset class the household actually holds**, so reporting the class a user overrode reports which classes they own. The property was dropped rather than the guard exempted. Criterion 6 asks only whether a household overrode at least one default rate, which a bare event count answers completely. The row still shows its asset class on screen; only the telemetry stops carrying it.

### Dashboard additions

| Chart | Type | Metric | Segment by |
|---|---|---|---|
| Ledger adoption | Funnel | `dashboard_viewed` → `ledger_created` → `ledger_switched` (post-session) | `source` |
| Ledger depth | Bar | Ledgers per household (0 / 1 / 2 / 3 / 4) | — |
| Projection engagement | Funnel | `projection_viewed` → `projection_rate_overridden` | — |
| AI suggestion outcome | Bar | Applied vs Dismissed | `target`, `kind` |
| Cap pressure | Trend | `ai_cap_reached` per household per week | `cap_type` |
| Bulk import quality | Trend | `rows_rejected` / (`rows_clean` + `rows_rejected`) | — |
| Redesign non-regression | Trend | Onboarding completion rate, annotated at the redesign ship date | — |

### Exit check: feature-to-metric coverage

| Feature | Metric |
|---|---|
| 1 Tab strip and create modal | Criteria 1, 1b |
| 2 Editable per-ledger dashboard | `ledger_edited` |
| 3 Compare strip | `compare_strip_viewed` |
| 4 Four-ledger cap | `ledger_cap_reached` |
| 5 Drift warning | `instrument_drift_warning_shown` |
| 6 Projections | Criterion 6 |
| 7 Bulk import | Criterion 4 |
| 8 AI counsel | Criteria 2, 7 |
| 9 Goal planner | Criterion 2 (`kind = goal_plan`) |
| 10 Soft cap message | Criterion 3 |
| 11 Redesign | Criterion 5 |
| 12 Encryption disclosure | `privacy_page_viewed` with `section` |
| 13 PII disclosure | `pii_disclosure_shown` |

No feature is without a metric. Nothing cut at the exit check.

---

## D-024: AI Goal Planner, Counsel Cards, Deterministic Engine (Phase 2 Design, 2026-09-07)

Added by the Phase 2 design pass for D-024. **No event above is renamed or removed.** The D-016 bundle's event table already covers most of this feature; the rows below are the gaps that design surfaced.

**Status: drafted 2026-09-07, not approved.**

### Reused unchanged from the D-016 bundle table

`projection_viewed` (`horizon_years`), `projection_rate_overridden` (`asset_class`), `ai_suggestion_shown` (`target`, `kind`), `ai_suggestion_applied` (`target`, `kind`), `ai_suggestion_dismissed` (`target`, `kind`), `ai_cap_reached` (`cap_type`). Criteria 2, 3, 6, and 7 in the D-016 section are measured from these and do not change.

**`ai_cap_reached.cap_type` gains a third value: `global`.** The existing values `plans` and `edits` stay. The global monthly circuit breaker (D-024 decision 6) is a distinct fact from a household exhausting its own cap and must be separable in the data, or criterion 3 counts one as the other.

### New events

| Event | Key properties | Fires when |
|---|---|---|
| `projection_maths_opened` | `surface` (ledger / goal_card) | User opens the "See the maths" disclosure. The audit panel is the regulatory answer to D-018 §8's largest named risk, so whether anyone opens it is worth knowing |
| `projection_horizon_changed` | `horizon_years`, `method` (preset / custom) | User changes the projection horizon. `method` decides whether the free-text field earns its place |
| `goal_planner_started` | (none) | User picks "Plan toward a goal" in the "+ New" modal |
| `goal_planner_abandoned` | `step` (goal / consent) | User closes the modal before the request is sent. The consent step is the most likely drop point and the one worth measuring |
| `ai_consent_shown` | `kind` (goal_plan / counsel) | The per-transmission disclosure step renders |
| `ai_consent_accepted` | `kind` | User confirms and the request is sent |
| `ai_request_failed` | `kind`, `reason` (provider_error / invalid_output / timeout) | The proxy returns a failure. Fires from the browser, never from the route. `reason` carries the proxy's own classification and nothing derived from the payload |
| `counsel_requested` | (none) | User taps "Review this ledger" |

### Property discipline, unchanged and restated

No event here carries an instrument, an amount, a member, a goal name, or any part of a suggestion's text. `projection_horizon_changed` carries a number of years, which is a setting, not a holding. `ai_request_failed` carries a fixed enum, never a provider message. **The proxy route emits no analytics at all**, per the D-016 bundle's note: everything it could usefully report is derived from plaintext holdings.

### Dashboard additions

| Chart | Type | Metric | Segment by |
|---|---|---|---|
| Engine adoption | Funnel | `dashboard_viewed` to `projection_viewed` to `projection_rate_overridden` | (none) |
| Maths panel engagement | Trend | `projection_maths_opened` per `projection_viewed` | `surface` |
| Goal planner funnel | Funnel | `goal_planner_started` to `ai_consent_shown` to `ai_consent_accepted` to `ai_suggestion_shown` | (none) |
| Consent drop | Bar | `goal_planner_abandoned` | `step` |
| Proxy reliability | Trend | `ai_request_failed` per `ai_consent_accepted` | `reason` |
| Cap pressure, extended | Trend | `ai_cap_reached` per week | `cap_type` including `global` |

### Exit check: feature-to-metric coverage

| Feature | Metric |
|---|---|
| Deterministic projection engine | Criterion 6, plus `projection_maths_opened` and `projection_horizon_changed` |
| Goal planner entry and consent | `goal_planner_started`, `goal_planner_abandoned`, `ai_consent_shown`, `ai_consent_accepted` |
| Goal draft suggestion | `ai_suggestion_shown` with `kind = goal_plan`, criterion 7 |
| Counsel cards | `counsel_requested`, `ai_suggestion_shown` with `kind = counsel` |
| Per-household and per-ledger caps | `ai_cap_reached` with `cap_type` of plans or edits, criterion 3 |
| Global circuit breaker | `ai_cap_reached` with `cap_type = global` |
| Proxy failure handling | `ai_request_failed` |

---

## D-025: Bulk Holdings Import (Phase 2 Design, 2026-09-07)

**Status: drafted 2026-09-07, not approved.**

### Reused unchanged from the D-016 bundle table

`bulk_import_template_downloaded`, `bulk_import_completed` (`rows_clean`, `rows_rejected`), `pii_disclosure_shown` (`surface`). Criterion 4 in the D-016 section is measured from `bulk_import_completed` and does not change.

### New events

| Event | Key properties | Fires when |
|---|---|---|
| `bulk_import_started` | (none) | User opens the import entry point |
| `bulk_import_file_rejected` | `reason` (wrong_type / unreadable / wrong_shape / empty / too_many_rows) | The file fails before any row is parsed. Fixed enum, never a file name |
| `bulk_import_review_shown` | `rows_ready`, `rows_attention`, `rows_duplicate`, `rows_skipped` | The review screen renders. Counts only |
| `bulk_import_rejects_downloaded` | `rows_rejected` | User downloads the fix-and-retry file. This is the event that says whether the loop closes |
| `bulk_import_abandoned` | `stage` (disclosure / upload / review) | User leaves without committing |
| `bulk_import_duplicate_overridden` | (none) | User taps "Add anyway" on a Possible duplicate row |
| `bulk_import_failed` | `reason` (batch_error / ledger_full / forbidden) | The commit request fails. Fixed enum |

### Property discipline

Counts and fixed enums only. No file name, no sheet name, no member name, no instrument slug, no amount. `bulk_import_review_shown` is the widest event here and it carries four integers.

### Dashboard additions

| Chart | Type | Metric | Segment by |
|---|---|---|---|
| Import funnel | Funnel | `bulk_import_started` to `bulk_import_template_downloaded` to `bulk_import_review_shown` to `bulk_import_completed` | (none) |
| Where imports die | Bar | `bulk_import_abandoned` | `stage` |
| File rejection reasons | Bar | `bulk_import_file_rejected` | `reason` |
| Fix loop closure | Trend | `bulk_import_rejects_downloaded` followed by a later `bulk_import_completed` in the same household | (none) |
| Import quality, existing | Trend | `rows_rejected` over `rows_clean` plus `rows_rejected` | (none) |

### Exit check: feature-to-metric coverage

| Feature | Metric |
|---|---|
| Entry point and PII disclosure | `bulk_import_started`, `pii_disclosure_shown` |
| Template generation | `bulk_import_template_downloaded` |
| Parse and validation | `bulk_import_file_rejected`, `bulk_import_review_shown` |
| Four-bucket review | `bulk_import_review_shown` row counts |
| Duplicate handling | `bulk_import_duplicate_overridden` |
| Fix-and-retry loop | `bulk_import_rejects_downloaded` |
| Batch commit | `bulk_import_completed`, `bulk_import_failed`, criterion 4 |
