# PRD — Household Financial Planning PWA

**Date:** 2026-06-23
**Author:** Gaurav Gupta (PM), drafted with Claude from the 2026-06-14 Opus brainstorm (`memory/decisions.md`)
**Status:** Draft — input to Phase 0 intake

## Problem

Indian households have no single place to learn what financial instruments exist across all asset classes, record what they actually hold across family members, and see where their household-level plan has gaps — most tools are either single-account trackers (Groww, INDmoney) or generic robo-advisors, neither of which teach the instrument landscape or work at the household (multi-person) level.

## Target user

Indian retail investors and households (initially modeled on Gaurav's own family: self, spouse, child) who are financially literate enough to want to track real holdings but don't have a consolidated, education-first view of their household's complete financial picture.

## Why now / why this project

This is a PM portfolio piece — a fully built, narrated case study demonstrating product thinking (not just a private tool). It must ship with production-grade UX and code quality, and carry an in-app "Why these choices?" narrative tied to the real decision log in this repo.

## Goals (from brainstorm)

1. Bridge financial literacy and tracking: learn instruments → record holdings → see household map → get nudged on gaps.
2. Support all 6 instrument-class sections out of the gate (per the curated library), not a single-asset-class tool.
3. Make the household (multi-member) view the differentiator vs. single-account trackers.
4. Demonstrate PM/product craft for a recruiter audience without compromising real usability.

## Success criteria (draft — to be made falsifiable in Phase 0 read-back)

- Users complete onboarding (household → members → holdings) without abandoning.
- Users return to update holdings or check nudges after initial setup (retention signal).
- The "Household Portfolio Completeness Score" (North Star) increases as users add holdings/protection data.
- Demo-household button lets a recruiter/visitor experience full value with zero data entry.

## Hard constraints

- **Education, not advice.** All nudges and content must be observational/educational wording only — links to learn-cards, never "buy" actions. This is a regulatory line, not a style choice.
- **PII handling.** Stores real household financial data (holdings, family member DOB, protection cover) — requires real auth, not just host-level gating.
- Mobile-first (this is a PWA; majority usage expected on phone).
- Public product — must hold up to real (not just Gaurav's) household data shapes.
- Single editor per household in v1 (no concurrent multi-user writes to reconcile).

## Explicit non-goals (v1)

- AI chat / conversational interface — v2.
- Bank/broker statement import — v2.
- Net-worth-over-time charting — v2.
- Shared/multi-editor household access (spouse co-editing) — v2 (schema supports it, UI does not).
- Push notifications — v1 uses in-app SIP calendar instead.
- Admin CMS for instrument content — v1 content is curated JSON/MDX seeded into Neon, edited via repo only.
- Payments / billing of any kind — not a monetized product.
- Goal planning UI — `goals` table exists (v1.5) but no dedicated UI in v1.

## Core product decisions (locked 2026-06-14, see `memory/decisions.md`)

- **Positioning:** Literacy→tracking bridge. Not a tracker clone, not a robo-advisor.
- **MVP scope:** Curated instrument library (6 sections, ~30–40 instruments) + manual household tracking + rule-based nudges + PWA shell.
- **Onboarding:** Guided 3-step, fact-only (household → members → holdings → dashboard+nudge). Demo-household button seeded from anonymized family data.
- **Navigation:** Bottom tab bar (Home · Explore · Portfolio · Profile) + center "+" FAB. Six instrument sections nested inside Explore, cross-linked with Portfolio.
- **Portfolio tracking:** Manual entry, kind-aware forms. Auto-price for MF (mfapi.in) / gold / crypto (CoinGecko); manual current-value for everything else. Hero widget = asset-class allocation donut.
- **Nudges:** Rule-based, scored "Household Health" panel + 1 inline priority nudge per visit. Global disclaimer + consent modal.
- **Offline:** Read-only PWA (instrument library always precached; last-known dashboard cached). No offline write-queue in v1.
- **PWA install:** Custom install button shown post-activation, not the native browser auto-prompt. Distinct non-green brand color (deep teal/indigo), dark mode supported.
- **PM narrative layer:** In-app "Why these choices?" page sourced from this repo's real decision log. North Star metric = Household Portfolio Completeness Score. Analytics events table live from day 1.

## Data model (approved shape, see `memory/project.md`)

```
households       (id, owner_user_id, name)
family_members   (id, household_id, name, relationship, date_of_birth, risk_profile?)
instruments       (id, slug, category[1-6], name, summary, returns, tax, liquidity,
                   risk, eligibility, min_investment, rate_value, rate_as_of) — seeded, read-only
holdings          (id, household_id, member_id, instrument_id, asset_class,
                   invested_amount, current_value, units?, monthly_sip?,
                   start_date?, maturity_date?, nominee?, price_source, notes)
protection        (id, household_id, member_id, type, cover_amount, premium, provider, status)
goals             (id, household_id, name, target_amount, horizon_years) — v1.5
analytics_events  (id, user_id, event, properties, created_at) — North Star funnel
```

## Confirmed technical shape

| Layer | Choice | Locked |
|---|---|---|
| Frontend | Vite + React + TypeScript + Tailwind + shadcn/ui + Recharts | 2026-06-13 |
| PWA | vite-plugin-pwa (Workbox) — precache shell + library, NetworkFirst for holdings | 2026-06-14 |
| Database | Neon (serverless Postgres) | 2026-06-14 |
| Auth | Clerk | 2026-06-23 |
| API layer | Hono on Vercel Functions | 2026-06-23 |
| ORM | Drizzle | 2026-06-23 |
| Hosting | Frontend on Vercel; DB on Neon cloud | 2026-06-14 |

## Open questions / deferred (carry into Phase 0 ambiguity list)

- Exact wording/threshold logic for the rule-based nudges and Household Health score is not yet specified.
- Which ~30–40 instruments make the v1 curated library, and their content sourcing/review process, is not yet decided.
- No explicit budget ceiling or kill criterion has been set for this project yet (mandatory for `SOLUTION_BRIEF.md` Risk Register).
- Repo visibility (public vs private) for the recruiter-facing portfolio piece not yet decided.
