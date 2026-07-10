# Design Spec — Household Financial Planning PWA — 2026-07-02

**Status:** approved (Gaurav, 2026-07-02 — "Spec approved" gate passed)
**Principle:** Brand guide = stable reference. This spec = what changed this session and why.
**Rule:** No TBDs. Open questions are flagged explicitly in §10.

---

## 1. Context

This is the Phase 2 Design spec for Slice 0+ of the Household Financial Planning PWA (see `app/CLAUDE.md`, `Documentation/solution/SOLUTION_BRIEF.md`). The problem: Indian households have no single, plain-language place to see what they hold across family members and instrument types, or how complete their plan is. This spec covers the full v1 surface — onboarding (3 steps), dashboard (Health card + allocation donut + nudge), instrument library (6 sections × 5 instruments), portfolio (holdings by member), profile, and the "Why these choices?" recruiter/curious-user page — built to the CFP-one-pager design language locked in Stage 2. It hands off directly to Phase 3 (Plan) at the "Spec approved" gate.

## 2. Brand Guide Reference

`Documentation/brand/brand-guide.md` — tokens confirmed final for this session: **yes**. No token changes this session; this spec consumes the brand guide as-is.

## 3. Component Additions / Overrides

None — see brand guide §4 (Component Inventory). All screens in this spec use only the components already listed there (shadcn baseline + 6 custom components: HealthTierCard, AllocationDonut, NudgeCard, HoldingRow, SectionCard, BottomTabBar).

## 4. Per-Panel Decisions

| Panel/Screen | Real headline | Real CTA label | Above the fold | Primary action | Data source |
|---|---|---|---|---|---|
| Consent modal | "Before we begin" | I understand — continue | Entire modal (bottom sheet) | Accept consent | Static copy; writes `consent_accepted` |
| Onboarding Step 1 (Create household) | "Let's start with your family." | Continue | Headline + household name field | Create household | User input → `households` |
| Onboarding Step 2 (Add members) | "Who are we planning for?" | Add a family member / Continue | Headline + empty prompt or first member card | Add ≥1 member | User input → `family_members` |
| Onboarding Step 2 — Add member sheet | "Add a family member" | Add to plan | Entire sheet | Save member | User input → `family_members` |
| Onboarding Step 3 (First holding) | "What do you currently hold?" | See my plan | Headline through Current value field | Save first holding | User input → `holdings` |
| Home / Dashboard — populated | "Your plan" | Learn about term insurance → (varies by unmet check) | Household name, page title, full Health card | View plan state; click nudge | `households`, computed Completeness Score, `holdings` aggregate |
| Home / Dashboard — empty | "Your plan" | Record a holding | Health card (Getting Started tier) | Add first holding | Same as above, zero-state |
| Home / Dashboard — error | (no headline, icon-led) | Retry | Error message + Retry button | Retry fetch | N/A (fetch failure) |
| Explore — Library sections | "What can you invest in?" | [Section name] → (per card) | Sub-title + first 3 section cards | Open a section | `instruments` grouped by category (seeded, read-only) |
| Library section — Instrument list | "[Section name]" e.g. Equity | (card tap, no button) | Sub-title + first 2 instrument cards | Open instrument detail | `instruments` filtered by category |
| Instrument detail | "[Instrument name]" | Record this in my plan | Badge + headline + summary + typical returns | Start holding form pre-filled with instrument | `instruments` single row |
| Portfolio — empty | "Your holdings" | Record your first holding | Illustration + empty copy | Add first holding | `holdings` empty for household |
| Portfolio — populated | "Your holdings" | Update / Remove (per row) | Summary line + first member group | Tap a holding to edit | `holdings` grouped by `member_id` |
| Add / Edit Holding form | "Record a holding" / "Update holding" | Add to plan / Save changes | For, Instrument, Amount invested, Current value | Save holding | Writes `holdings` |
| Profile | "Your account" | Sign out / Delete account | Household name + Edit link | Edit household or members | `households`, `family_members` |
| "Why These Choices?" | "How this was built" | View full decision log on GitHub → | Headline + intro paragraph | Read (no write action) | Static content, references `DECISIONS_LOG.md` |
| PWA install prompt | "Add to your home screen" | Install | Entire prompt | Trigger native install | Browser `beforeinstallprompt` event |

## 5. Analytics Surface

Cross-referenced to `Documentation/solution/METRICS_PLAN.md` (Project-Specific Events table + Universal Event Baseline).

| UI element | Event name | Properties | Metrics plan row |
|---|---|---|---|
| Consent modal CTA | `consent_accepted` | `disclaimer_version` | (11) Disclaimer + consent modal |
| Onboarding step transitions | `onboarding_started` / `onboarding_step_completed` / `onboarding_completed` | `step`, `duration_ms` | (1) Guided onboarding |
| Add member sheet save | `feature_used` | `feature_name: "add_family_member"` | Universal baseline |
| Add/Edit holding form save | `holding_created` / `holding_updated` | `instrument_id`, `asset_class`, `member_id` | (2) Manual holdings entry |
| Dashboard render (any state) | `dashboard_viewed` | `household_id`, `allocation_summary` | (3) Portfolio dashboard |
| Any of the 5 completeness checks flips | `completeness_score_changed` | `household_id`, `before_tier`, `after_tier` | (4) Household Health panel |
| Nudge card render / nudge CTA click | `nudge_shown` / `learn_card_clicked` | `check_id`, `learn_card_slug` | (5) Single ordered nudge |
| Explore section card tap | `library_section_viewed` | `section` | (6) Instrument library |
| Instrument card / detail tap | `instrument_viewed` | `section`, `instrument_slug` | (6) Instrument library |
| Bottom tab bar tap | `nav_tab_clicked` | `tab_name` | (7) Bottom tab nav |
| FAB tap | `fab_clicked` | `tab_name` (current screen) | (7) Bottom tab nav + FAB |
| App boot from cache | `pwa_shell_loaded` | `cache_status` | (8) PWA shell |
| Install prompt shown / accepted | `pwa_install_prompted` / `pwa_installed` | `surface` | (9) Custom install prompt |
| "Why These Choices?" page open | `why_page_viewed` | — | (10) "Why these choices?" page |
| Dashboard/Portfolio/Library error states | `error_shown` | `error_type`, `surface`, `message` | Universal baseline |
| Any primary CTA across all screens | `cta_clicked` | `cta_name`, `surface`, `destination` | Universal baseline |

## 6. Constraints Contract (testable assertions — Phase 5 verifies these)

- Breakpoints: mobile 390px / tablet 768px / desktop 1280px (confirmed Stage 0, encoded in `tailwind.config.ts`)
- Contrast: WCAG AA minimum on all text (4.5:1 body, 3:1 large text) — section labels on card surfaces must be re-verified at implementation per brand-guide §6 note
- Focus states: visible ring (`ring-2 ring-ring ring-offset-2`) on every interactive element
- Touch targets: ≥44px on all buttons, icons, and tap targets (including FAB and tab bar items)
- `prefers-reduced-motion` disables all shimmer/transition animation
- Exactly one `NudgeCard` rendered at any time — never zero (once onboarded) and never more than one
- `AllocationDonut` never renders percentage segments when `holdings` count is 0 for the household — must render the ghost/outline state instead
- Bottom tab bar never hidden on scroll, in any screen state (populated/empty/error/loading)
- No live price feed calls anywhere in v1 — `current_value` is always a manually-entered field, never fetched
- No buy/sell/recommendation CTA anywhere in nudge copy or instrument detail pages (education-not-advice regulatory constraint)
- Offline: library screens and last-fetched dashboard must render from PWA precache with no network; write actions (holding/member forms) are disabled offline, not silently queued (no write-queue in v1 — per `app/CLAUDE.md`)

## 7. Implementation Cost Flags

| Element | Why non-trivial | Simpler fallback |
|---|---|---|
| Completeness Score (5-check computation) | Requires a cross-table query (members, holdings, protection) recomputed on every relevant write, not just at read time, to keep `completeness_score_changed` accurate | Compute at read-time only (on dashboard load) instead of on every write; accept a slight lag between action and score update |
| AllocationDonut ghost/empty state | Recharts has no built-in "outline ring, no data" mode — requires a custom SVG ring component that swaps in when `holdings.length === 0` | Render the same donut library with a single neutral-gray 100% segment instead of a true ghost ring |
| Progressive disclosure on instrument cards & holding form | List view and detail view need separate field-subset renders from the same data source; optional fields in the holding form need a working expand/collapse with correct initial state per add-vs-edit | Show all fields flat everywhere in v1, defer progressive disclosure to a fast-follow |
| PWA precache of "last dashboard" | Requires a service-worker strategy that caches the last successful dashboard API response (not just static assets), and a defined staleness indicator when served from cache | Precache library only (static, easy); dashboard requires network with a plain error state if offline |
| App-layer multi-tenancy scoping | Every Hono route must resolve `household_id` from the Clerk session and filter every query — no DB-level RLS safety net, so a missed filter is a silent cross-household data leak | None acceptable — this is a correctness requirement, not a nice-to-have; flagged for extra test coverage in Phase 5, not simplified |

## 8. Design Risk Resolution (the 3 risks named in Stage 1)

| Risk | Resolved (how) / Escalated (decision needed) |
|---|---|
| 1 — Empty dashboard reads as broken rather than motivating | Resolved. Ghost donut outline ring + "Getting Started" tier copy + always-present nudge (screen 2b) replace a blank card; empty state was wireframed explicitly rather than left as a fallback of the populated layout. |
| 2 — Education-not-advice constraint makes nudges passive without intentional copy | Resolved. Copy deck's nudge pattern is fixed as observation → why it matters → learn-card link (never a buy action) for all 5 checks, written out in full per-check copy rather than left generic. |
| 3 — Instrument cards data-dense at 390px without a progressive disclosure pattern | Resolved. List cards show Name + Returns + Risk only; all other fields (tax, liquidity, eligibility, minimum investment, rate) appear only on the detail page (wireframes 3b/3c). Flagged again in §7 as a real implementation cost, not a free decision. |

## 9. Visual Changelog

First version of this spec — no prior version to diff against. All artifacts (DATA_MODEL.md, WIREFRAMES.md, COPY_DECK.md, brand-guide.md, tokens/) were produced fresh in Stages 0–4 of this same session (2026-07-02).

## 10. Open Questions

None. All 4 items DEFERRED from Phase 1 were resolved in Stage 0 (multi-tenancy mechanism, data retention, concurrent sessions, breakpoints). Product name remains a placeholder ("FamilyPlan," brand-guide §1) — naming is intentionally deferred past Phase 2 and does not block implementation; it is not a design open question.

---

**Self-review before user review:** placeholder scan · consistency check · scope check · cost flags complete · all 3 design risks addressed.

- Placeholder scan: no bracketed TBDs remain in this document outside of table header conventions.
- Consistency check: every screen in WIREFRAMES.md has a row in §4; every copy element with a CTA maps to a `cta_clicked` or dedicated event in §5; every token referenced exists in brand-guide.md / tailwind.config.ts.
- Scope check: no feature introduced here beyond the 13 v1 features in `SOLUTION_BRIEF.md`.
- Cost flags: 5 non-trivial elements flagged in §7, each with a named simpler fallback (multi-tenancy scoping excepted — correctness-required, not simplifiable).
- All 3 Stage 1 design risks addressed in §8, cross-referenced to specific wireframe/copy decisions.
