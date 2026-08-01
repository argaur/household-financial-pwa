# Metrics Plan — Household Financial Planning PWA

**Date:** 2026-06-23
**Analytics service:** PostHog (cloud), sole sink. **Corrected 2026-08-01 (D-012):** this previously read "kept alongside an internal `analytics_events` Postgres table (Phase 1 Q5 — both, intentionally not deduplicated to one source)". That dual sink was decided in D-005 and never built. Every metric below is measured in PostHog only.
**Error tracking:** Sentry free tier

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
| `holding_created` / `holding_updated` | instrument_id, asset_class, member_id | (2) Manual holdings entry | User saves a holding form |
| `dashboard_viewed` | household_id, allocation_summary | (3) Portfolio dashboard | User lands on the post-onboarding or returning dashboard |
| `completeness_score_changed` | household_id, before_tier, after_tier | (4) Household Health panel | Any of the 5 checks flips state |
| `nudge_shown` / `learn_card_clicked` | check_id, learn_card_slug, target_type | (5) Single ordered nudge | Dashboard renders the first unmet check; user clicks its learn-card link |
| `library_section_viewed` / `instrument_viewed` | section, instrument_slug | (6) Instrument library | User opens a section or an instrument detail card |
| `nav_tab_clicked` / `fab_clicked` | tab_name | (7) Bottom tab nav + FAB | User navigates via the bottom bar or the "+" action |
| `pwa_shell_loaded` | cache_status (hit/miss) | (8) PWA shell | App boots from precached assets |
| `pwa_install_prompted` / `pwa_installed` | surface | (9) Custom install prompt | Custom install button shown/clicked through to install |
| `why_page_viewed` | — | (10) "Why these choices?" page | User opens the in-app decision-log page |
| `key_setup_started` / `key_setup_completed` | — | (14) Client-side encryption | User reaches / finishes the passphrase + recovery-code setup screen. No secret is ever a property. |
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
| Nudge click-through | Funnel | `nudge_shown` → `learn_card_clicked` | check_id |
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
