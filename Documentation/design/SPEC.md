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
| Nudge card render / nudge CTA click | `nudge_shown` / `learn_card_clicked` | `check_id`, `learn_card_slug`, `target_type` | (5) Single ordered nudge |
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

---

# D-016 Slice 5 — Full-Platform Mint/Treasury Redesign (2026-08-25)

**Status:** approved (Gaurav, 2026-08-25 — "go" on Stage 4, confirming both the asset-color fix and deferring the Title-role decision)
**Scope:** pure visual restyle. No schema delta (`DATA_MODEL.md` Stage 0), no new copy (Stage 2 item 8 — Track B visual-only), no new analytics events. Covers 5 flagship screens (Landing, Dashboard, Explore, Portfolio, Goal planner) at full fidelity via the concept folio; onboarding/Profile/instrument-detail are explicitly out of scope, per Gaurav's direction to use this system as their reference when they are wireframed in their own future slices.

## S1. Context

D-016 Slice 5 of 5 in the strategy-ledgers bundle (`Documentation/solution/DECISIONS_LOG.md` D-016, feature #11). Public-showcase backlog item 1 (2026-08-17/2026-08-25): the approved mint/treasury visual concept had never been implemented beyond the D-016 ledger-tab-strip UI language. This spec covers the design work that changes that — the visual system extraction (Stage 4) and the flagship-screen coverage already fully specified by the concept folio (Stage 3). It hands off to Phase 3 (Plan) at the gate below.

## S2. Brand Guide Reference

`Documentation/brand/brand-guide.md` — tokens confirmed final for this session: **yes**, as of the 2026-08-25 asset-color follow-up commit. The v1 (2026-08-12) mint-free teal/DM-Serif system is superseded; its inevitability-test results are kept in brand-guide §7 for history, not deleted.

## S3. Component Additions / Overrides

New motif primitives, all documented in `Documentation/design/COMPONENT_SHOWCASE.md`'s "D-016 Slice 5" section: VaultFrame, GuillocheMotif, ReededDivider, CoinFAB, Mintmark, LedgerTable, ReserveHatchSlice, ThemeToggle (pill). These wrap or retint the existing custom components (HealthTierCard, AllocationDonut, NudgeCard, HoldingRow, SectionCard, BottomTabBar) — none of those components' data contracts or states change, only their rendered frame/tokens.

## S4. Per-Panel Decisions

| Screen | Fidelity source | Real headline/copy | Primary action | Notes |
|---|---|---|---|---|
| Landing | Folio plate, full fidelity | `landing-content.ts` verbatim, unchanged (Stage 2 item 8) | Create your plan / Sign in | Vault-frame hero (weighty border, deliberate inset), guilloche rosette motif, trust-strip copy sits outside the frame like a plaque, per the folio |
| Dashboard | Folio plate, full fidelity, incl. working ledger-tab scenario switcher | Existing copy, retokened only | View plan state; ledger switch; nudge CTA | Ledger tab strip's interaction pattern is unchanged (already correct), retokened only; each major card (health, donut, nudge) gets the VaultFrame treatment; donut's emergency-fund slice gains the hatched ReserveHatchSlice fill |
| Explore | Folio plate, full fidelity, incl. working "+ Add" entry point | Existing library copy, retokened only | Open a section; tap "+ Add" to open the existing holding form, prefilled | Section/instrument cards retokened; the "+ Add" entry point (opens the existing form, per the folio's own copy — not an instant form-less toggle) is new scope not previously speced in v1 SPEC.md §4 — resolved 2026-08-25 with its own analytics event (§S5, §S10) |
| Portfolio | Folio plate, full fidelity, incl. bulk-import zone + ledger table | Existing holdings copy, retokened only | Add/edit holding; bulk import (dashed brass import-zone motif) | LedgerTable component (double-rule total row) replaces the plain HoldingRow list group for ledger-scoped views; HoldingRow itself is unchanged for the baseline/Current view |
| Goal planner | Folio plate, full fidelity, incl. projection SVG + proposed-ledger cards | New screen, not in v1 SPEC.md — this is the D-016 bundle's goal-planner feature (slice 2-4 territory), shown here only as a retokened mock, not yet built | N/A — not yet implemented | The folio mocks this screen ahead of its own feature build (D-016 slices 2-4, still unbuilt per `app/CLAUDE.md`'s public-showcase backlog item 2). Do not treat this plate as authorizing the goal-planner feature itself — it authorizes the visual system that feature will use once built |

## S5. Analytics Surface

**One new event, everything else unchanged.** This is a visual-only pass (Stage 2 item 8); every existing interaction keeps the event it fired in v1. The Explore screen's "+ Add" entry point, shown live in the folio, is not in v1 `SPEC.md` §4/§5 as an Explore-screen interaction (v1 only has "Record this in my plan" from the *detail* page, §4 row "Instrument detail") — **confirmed 2026-08-25 as real new scope**, a second entry point into the existing add-holding form, not the detail-page flow re-skinned. **Corrected during the Phase 3 plan's gate review, same day:** the folio's own copy states plainly that tapping opens the existing form prefilled, not an instant form-less add/remove — so the event is `explore_holding_added` (`instrument_slug`, `section`, no `action` property — there is no remove action from this entry point), added to `METRICS_PLAN.md`'s New Events table following the existing `ledger_created`/`ledger_switched` naming pattern (object_verb-past-tense, key properties column, feature reference, fire condition), firing on successful save, not on tap.

## S6. Constraints Contract (testable assertions — Phase 5 verifies these)

- Every major card/surface on the 5 flagship screens traces to the vault/currency metaphor (VaultFrame, guilloche, reed, coin, ledger, or hatch) — no bare `rounded-xl` card with only a gray border and no motif (Stage 2 negative constraint)
- `--brass` tokens used only in: mono eyebrows/section labels, guilloche motif, coin-mark rims, dashed import-zone borders, ledger-table accents — never as a second primary button color or generic UI chrome
- `AllocationDonut`'s emergency-fund segment renders with a hatched fill pattern whenever `holdings` includes an emergency-fund-flagged item — this is new in this pass and must be its own assertion, not folded into the existing "never renders % at 0 holdings" rule from v1 §6
- No gradients, no glassmorphism/blur on any card or content surface (the folio-header's sticky nav blur is chrome, not content, and is exempt — brand-guide §2 Animation)
- `sm:` breakpoint remains 390px, not the Tailwind default 640px — re-verify at implementation; this exact class of bug (a `sm:`-scoped rule silently firing at the wrong width) already shipped once and was caught only by live rehearsal, not the test suite (`app/CLAUDE.md`, 2026-08-25 ledgers entry)
- Mint/brass contrast: re-verify WCAG AA (4.5:1 body / 3:1 large text) for `--brass` on `--card` in both themes at implementation — brass was not contrast-checked during token extraction, only visually matched to the folio
- Playfair Display / Jost / JetBrains Mono load correctly via the Google Fonts stylesheet (§S7 — RESOLVED 2026-08-25) and render as the guaranteed fallback whenever Bodoni MT / Gill Sans Nova / Cascadia Mono are unavailable on the visitor's device
- The Explore `explore_holding_added` event (§S5, `METRICS_PLAN.md`) fires with the correct `instrument_slug`/`section` properties on successful save, not on tap
- The 390px real-browser verification on a throwaway Neon branch (§S6, §S7) is run and passes before this slice merges — a Phase 4 build-time requirement, not closable at Design time; see `IMPLEMENTATION_PLAN.md`'s D-016 Slice 5 section once written (Phase 3)

## S7. Implementation Cost Flags

| Element | Why non-trivial | Simpler fallback |
|---|---|---|
| **Font availability — RESOLVED 2026-08-25** — none of the 3 new typefaces are open/web-safe | Bodoni MT and Cascadia Mono are Microsoft-licensed, not bundled on macOS/Linux/mobile; Gill Sans Nova is a commercial Monotype face. Most visitors would have rendered an OS-dependent fallback, not the named font, with quality varying a lot across OS | **Resolved, not deferred.** Gaurav picked free Google Fonts matches — Playfair Display (serif), Jost (sans, weights 400/500/600), JetBrains Mono (mono, weights 400/500) — loaded via the Google Fonts stylesheet, appended after the original named fonts in each fallback stack so a device that does have Bodoni MT/Gill Sans Nova/Cascadia Mono still uses them, and every other device gets the close free match instead of a generic system font. Exact `<link>` tags documented in `tailwind.config.ts`'s Fonts comment for Phase 4 to copy into `index.html` verbatim |
| Guilloche rosette (code-drawn SVG, generated via the folio's script block) | Not a static asset — it's algorithmically generated at runtime in the folio; porting it means porting the generation logic, not just copying markup | Ship it as a precomputed static SVG (accept it as a fixed asset, not runtime-generated) if the generation logic proves nontrivial to port |
| Hatched ReserveHatchSlice donut fill | Recharts (this project's donut library) has no built-in hatch/pattern fill for a pie segment — needs an SVG `<pattern>` def and a per-segment `fill="url(#...)"` override, more involved than a solid-color segment | Use a distinct solid color + a small pattern-icon in the legend instead of an in-chart hatch, if the SVG pattern proves awkward inside Recharts' rendering |
| Regression risk against 1156 passing tests | A wholesale token/typography swap touches every screen's rendered class list; the test suite asserts behavior and copy, not visual tokens, so it will stay green through changes that are visually wrong (exactly the class of bug the `sm:`-390px trap already demonstrated) | None acceptable as a substitute for real-browser verification at 390px on a throwaway Neon branch (this project has no safe local dev path, `.env.local` points at production). Not resolved at Design time by decision — this is a Phase 4 build-time step, recorded as a required task in `IMPLEMENTATION_PLAN.md`'s D-016 Slice 5 section (Phase 3, next) so it cannot be silently dropped |
| Explore "+ Add" entry point (§S5) — **RESOLVED 2026-08-25** | It is new scope: a second entry point into the existing add-holding form, not present in v1. Corrected mid-plan from an assumed instant form-less toggle to what the folio's own text actually specifies | Given its own event, `explore_holding_added` (`METRICS_PLAN.md`, new events table) — no new backend endpoint (reuses the existing form/API), no Phase 1 re-pass needed since it is a small, contained addition to an already-approved screen, not a new feature area |

## S8. Design Risk Resolution (the 3 risks named in Stage 1)

| Risk | Resolved (how) / Escalated (decision needed) |
|---|---|
| 1 — No code anywhere embodies "mint" as a color | Resolved. The concept folio, now committed at `Documentation/design/concept/vittam-mint-folio.html`, is that code — tokens extracted directly from its CSS (Stage 4). |
| 2 — Scope size against solo-builder capacity (this is slice 5 of 5; slices 2-4 remain unbuilt) | Partially resolved for *this* slice — flagship-screen coverage via the folio avoids a from-scratch design pass, and remaining screens are explicitly deferred rather than designed speculatively now. Not resolved for the *bundle* — slices 2-4 (projections, bulk import, AI counsel) are still fully unbuilt and this spec does not change that. |
| 3 — Regression risk against 1156 passing tests | Escalated, not resolved. §S6/§S7 name the exact gap (tests assert behavior, not visual tokens) and the exact mitigation (real-browser verification at 390px on a throwaway Neon branch) — this is a Phase 4/5 execution requirement, not something a design-stage document can close on its own. |

## S9. Visual Changelog

| Area | v1 (2026-08-12) | Now (2026-08-25) |
|---|---|---|
| Primary color | Deep teal `#1B6B6B` / `#3D9B9B` dark | Mint `#186A4F` / `#54C795` dark |
| Second accent | None | Brass `#8F7326` / `#CDAD62` dark, both themes |
| Serif typeface | DM Serif Display | Bodoni MT, guaranteed fallback Playfair Display (Google Fonts, loaded — §S7) |
| Sans typeface | Inter | Gill Sans Nova, guaranteed fallback Jost (Google Fonts, loaded — §S7) |
| Mono typeface | None (no mono role existed) | Cascadia Mono, guaranteed fallback JetBrains Mono (Google Fonts, loaded — §S7) — new role: eyebrows, tabular figures |
| Card radius | 8px | 10-16px stepped scale (folio's own steps) |
| Shadow levels | 1 (`shadow-card`) | 2 (`shadow-card`, `shadow-lift`) + text-only `.emboss` |
| Section label style | Sans, muted-foreground, semibold | Mono, brass, `.22em` tracking |
| Asset-class donut colors | Fixed hex, same in both themes | Native per-theme CSS vars, retinted |
| Emergency-fund donut segment | Solid color, same visual treatment as any other segment | Hatched fill, visually distinct — solves public-showcase backlog item 1 |
| New motifs | None | Guilloche rosette, reeded dividers, coin-shaped FAB, vault-frame cards |

## S10. Open Questions

1. ~~Font-loading strategy~~ — **RESOLVED 2026-08-25.** Gaurav picked Playfair Display / Jost / JetBrains Mono, loaded via the Google Fonts stylesheet, appended after the folio's named fonts in each fallback stack. See §S7.
2. ~~Explore add-to-holdings toggle~~ — **RESOLVED 2026-08-25.** Confirmed new scope, corrected to what the folio actually specifies (opens the existing form, not an instant toggle); given its own event (`explore_holding_added`, `METRICS_PLAN.md`). See §S5.
3. **"Title" typography role** (app-bar name vs. card titles, serif vs. sans) — explicitly left unresolved by Gaurav's decision, 2026-08-25. Not a blocker; resolve when that screen is actually built.
4. Onboarding, Profile, and instrument-detail visual treatment — explicitly deferred to their own future Phase 2 passes, using this system as reference (Gaurav's direction, 2026-08-25). Not an open question so much as a confirmed non-scope for this pass.
5. **390px real-browser verification on a throwaway Neon branch** — not an open design question, a confirmed Phase 4 requirement (§S6/§S7). Recorded here only so it is traceable; the binding record is the task itself in `IMPLEMENTATION_PLAN.md`'s D-016 Slice 5 section (Phase 3, next), matching how the D-016 ledger slice recorded and ran the same check before its own merge.

---

**Self-review before user review (D-016 Slice 5 addendum):**

- Placeholder scan: no bracketed TBDs remain.
- Consistency check: every flagship screen in WIREFRAMES.md's Stage 3 resolution has a row in §S4; every new token referenced exists in `globals.css`/`tailwind.config.ts` as of the 2026-08-25 commits; every new component referenced exists in `COMPONENT_SHOWCASE.md`.
- Scope check: no feature introduced here beyond what the folio itself shows and what D-016's approved feature list already includes; the Goal planner plate is explicitly flagged (§S4) as visual-system-only, not a feature authorization.
- Cost flags: 5 non-trivial elements flagged in §S7, each with a named simpler fallback.
- All 3 Stage 1 design risks addressed in §S8 — risk 3 (regression) is honestly left escalated, not force-resolved.

### Gate: Stage 5 (Spec Doc) — ready for Gaurav's review before Stage 6 (Handoff) and Phase 3 (Plan).

---

# D-024: AI Goal Planner, Counsel Cards, Deterministic Projection Engine (2026-09-07)

Appended as its own spec section, same convention as the D-016 Slice 5 section above. Prefix `G`. Written after Gaurav's 2026-09-07 resolutions in `DECISIONS_LOG.md` D-024 (shared Anthropic key reused as an accepted risk; no prompt caching, no Files API, no queues, no retries at the Anthropic layer).

## G1. Context

Three shippable things in one decision, built strictly in this order (D-024 decision 7):

1. **The deterministic projection engine**, client-side, no network call, no AI. Standalone value.
2. **The goal planner**, a third choice inside the existing "+ New" ledger modal, one proxy call.
3. **Counsel cards**, on-demand only, on the same proxy with a second output schema.

The engine is a prerequisite, not a sibling. If 2 and 3 are never built, 1 still ships.

## G2. Brand Guide Reference

No new tokens. Mint/treasury system as shipped in D-016 Slice 5 (`Documentation/brand/brand-guide.md`, `Documentation/design/tokens/tailwind.config.ts`). The projection line reuses the Recharts styling already established on the allocation donut's palette. The AI card uses the existing card surface, not a new one, so an AI suggestion does not read as a different product.

## G3. API surface

**Vercel routing constraint applies to every route here.** This project's zero-config Vite build routes only single-path-segment `/api/*` requests to the catch-all function; a second path segment 404s at the platform before Hono sees it (`app/CLAUDE.md`, 2026-07-11). Every route below is one segment. Anything further is a query parameter, never a path segment.

### `POST /api/ai-suggestions`: the thin proxy (D-017 §1)

One route, two request schemas and two response schemas, switched on `kind`. This is D-024 decision 7's "counsel cards on the same proxy with a second schema", taken literally.

Request, `kind: "goal_plan"`:

```
{
  kind: "goal_plan",
  idempotencyKey: string,        // client v4 uuid, one per user gesture
  horizonYears: number,          // 1..40
  targetAmountBandInr: number,   // rounded to the nearest 100000, never exact
  monthlyCapacityBandInr: number | null,  // rounded to the nearest 1000
  currentMix: [                  // percentages only, never rupees
    { assetClass: string, weightPct: number }
  ]
}
```

Request, `kind: "counsel"`:

```
{
  kind: "counsel",
  idempotencyKey: string,
  ledgerId: string,              // uuid, ownership checked server-side
  currentMix: [ { assetClass: string, weightPct: number } ],
  holdingSlugs: string[]         // library slugs only, no amounts, no names
}
```

Response, both kinds, on success:

```
{
  status: "ok",
  kind: "goal_plan" | "counsel",
  suggestion: {
    allocations: [ { slug: string, weightPct: number } ],   // slugs from the library enum only
    reasoning: string,                                       // prose, no numbers the engine did not produce
    caveat: string                                           // fixed education-not-advice line
  },
  usage: { plansUsed, plansCap, editsUsed, editsCap }
}
```

Response on a cap, `409`:

```
{ status: "cap_reached", capType: "plans" | "edits" | "global" }
```

Response on a provider or proxy failure, `502`:

```
{ status: "failed", reason: "provider_error" | "invalid_output" | "timeout", attemptCounted: true }
```

`attemptCounted` is always `true` and is in the shape deliberately, because a failed call does not release its reservation (`DATA_MODEL.md`, `ai_call_reservations`) and the UI has to say so.

**Route behaviour, in order, none of it optional:**

1. Auth first. Session resolved via `server/lib/auth.ts` before the body is read at all.
2. Body size and shape limits before parse. Strict Zod, unknown keys rejected, same discipline as `server/lib/envelope.ts`.
3. Insert the `ai_call_reservations` row. Unique `(household_id, idempotency_key)` absorbs double-taps and client retries; a conflict returns the original outcome, not a second call.
4. Run the three conditional counter UPDATEs. Zero rows affected on any of them returns `409` and the reservation is marked `failed`.
5. Only then call Anthropic. `claude-sonnet-5` (D-018 §5), structured output, no prompt caching, no retries, no queue.
6. Validate the model's output against the allowlist schema. A slug outside the library enum invalidates the whole response (`invalid_output`), it is not filtered out silently.
7. Relay. Write nothing to Neon beyond the reservation status, log no request or response body, no Sentry body capture, `Cache-Control: no-store`.

**The browser CSP is not touched.** The browser never calls Anthropic; the proxy does. Adding the Anthropic host to the browser CSP would be a mistake of exactly the class D-024's ship-traps list names.

### `GET /api/ai-suggestions`: usage only

Returns `{ plansUsed, plansCap, editsUsed, editsCap, globalOpen }` for the household, so the cap-exhausted states render without a speculative POST. No body, no household data, cheap enough to fetch with the dashboard.

### `GET /api/projection-settings` and `PUT /api/projection-settings`

Per-ledger asset-class rate overrides. Ledger selected by query parameter, never a path segment: `GET /api/projection-settings?ledgerId=<uuid>`.

```
GET  -> { ledgerId, horizonYears: number | null, rates: [ { assetClass, annualRatePct } ] }
PUT  -> body { ledgerId, horizonYears?, rates: [ { assetClass, annualRatePct } ] }
     -> { status: "ok" }
```

Plaintext by category: an asset-class return rate is an assumption, not a holding. It says nothing about what the household owns.

### `GET /api/instruments`: extended, not replaced

Adds `assumedAnnualRatePct`, `rateSource`, `assumedRateAsOf` to each instrument in the existing response. Catalog data, already public.

**Corrected at build time (E2):** this line originally read `rateAsOf`, which was a drafting slip. `instruments.rate_as_of` already exists as an unrelated library-display field (paired with `rate_value`) and keeps that name, so the new column is `assumed_rate_as_of` and the new response field is `assumedRateAsOf`. Both pairs coexist. The response is also now an explicit column projection rather than the row returned straight through, so a future column added to `instruments` is not published until it is added to the projection deliberately.

### No new route for the goal itself

The goal is sealed into the ledger envelope, so it travels on the existing `POST /api/ledgers` body with no server change at all.

## G4. Per-panel decisions

| Panel | Decision |
|---|---|
| Projection panel | Lives inside the ledger view, below the allocation donut, collapsed by default on phone and expanded on desktop. One line chart, one horizon control, one rate list |
| Horizon control | Preset chips (5 / 10 / 15 / 20 years) plus a free numeric field. D-018 left preset-against-free-field open; both is the answer, because presets carry the common case and the field carries a real goal year |
| Rate rows | One row per asset class present in this ledger, not all six. A class with no holdings has no rate to override |
| "See the maths" | A disclosure panel, not a modal. It must be readable while the chart is visible, because its job is to let a user check the chart |
| Goal step | A third option in the existing "+ New" modal, added beside blank and copy. Selecting it swaps the modal body, it does not open a second surface |
| Consent step | A separate step inside the same modal, always shown, never remembered. Per-transmission means per transmission |
| Suggestion card | Rendered inline in the ledger view, in the position the compare strip occupies, never as a toast or a modal. Apply and Dismiss are the only actions |
| Cap-exhausted | Replaces the action's own affordance in place, styled as informational, never as an error toast |

## G5. Analytics surface

Events are specified in `METRICS_PLAN.md` under the D-024 section. Existing names reused unchanged: `projection_viewed`, `projection_rate_overridden`, `ai_suggestion_shown`, `ai_suggestion_applied`, `ai_suggestion_dismissed`, `ai_cap_reached`. New names follow the same convention.

**The proxy route itself emits no analytics.** Carried forward verbatim from the D-016 property-discipline note: anything the proxy could usefully report is derived from plaintext holdings. Every event here fires from the browser.

## G6. Constraints contract (testable assertions, Phase 5 verifies these)

1. **`sm:` is 390px in this project and must not be used for any layout that should stay full width on a phone.** Confirmed twice by real bugs: the D-016 compare strip's `sm:grid-cols-3` and the D-021 button's `w-full sm:w-auto`. Every new full-width control in this feature uses `md:` for its breakpoint. Specifically: the goal-step form fields, the consent step's Continue button, the suggestion card's Apply and Dismiss pair, the horizon preset chips, and the rate-row grid. **Assertion: no new class string in this feature matches `sm:(grid-cols|w-auto|flex-row|inline-flex)`.** Pin it with a test in the style of `csp-policy.test.ts`.
2. The rate-row grid is one column below `md:`, two at `md:` and up. At 390px, six rows stacked is correct and is not a bug.
3. Apply and Dismiss stack vertically below `md:`, each full width, each at least 44px tall.
4. The projection chart's container carries `min-w-0` and its own `overflow-x` context, so a long axis label cannot push the page into horizontal scroll at 390px.
5. No response field from the proxy is rendered as a currency amount. Assertion: the card component receives weights and slugs only, and has no access to a formatter that takes a model-supplied number.
6. The proxy writes no request or response body to logs, Sentry, or Neon. Assertion by test against the route with a spy on the logger and the Sentry client.
7. `Cache-Control: no-store` on every `/api/ai-suggestions` response, success and failure.
8. A second POST with the same `idempotencyKey` returns the first outcome and makes no second Anthropic call.
9. Concurrent POSTs from two sessions with different keys, with one plan remaining, result in exactly one success and one `409`.
10. The Anthropic host appears in no browser CSP directive.

## G7. Implementation cost flags

- The reservation-plus-conditional-UPDATE shape is the single most delicate thing in this feature and has no precedent in this repo. It needs its own tests before any UI exists.
- The deterministic engine's compounding maths needs a fixture-based test suite that is readable by a human who wants to check the numbers, because "See the maths" promises the user exactly that.
- Structured-output schema handling against `claude-sonnet-5` cannot be verified locally against production behaviour; it needs a live deploy check, same class as the 2026-08-05 Turnstile lesson.

## G8. Open questions

1. **The `goals` table's future.** This spec leaves it in the schema, unused. Dropping it is a separate migration and a separate decision.
2. **The global monthly cap's actual number.** `ai_global_usage.cap_calls` is specced; the value is not chosen here. It is a cost judgment Gaurav owns.
3. **Whether the horizon control keeps both presets and a free field** after first use, or collapses to one. Specced as both; cheap to reduce later.

**Gate: not run.** This section is drafted for Gaurav's review. No stage is marked passed.

---

# D-025: Bulk Holdings Import from Excel (2026-09-07)

Prefix `I`. Written after Gaurav's 2026-09-07 resolutions in `DECISIONS_LOG.md` D-025: build the atomic batch endpoint, no spreadsheet dropdowns, SheetJS Community Edition, per-member tabs with all 30 instruments prefilled.

## I1. Context

Import only, no export. A downloaded template carries one tab per household member with all 30 library instruments prefilled and grouped by asset class. The user fills in amounts, uploads, reviews four buckets of rows, and commits the clean ones into whichever ledger is active in the app.

## I2. Brand Guide Reference

No new tokens. The review screen's four buckets reuse the existing status treatments; the Needs attention and Skipped buckets use the same red-toned register already established for the instrument-drift banner, so the app has one warning language rather than two.

## I3. API surface

### `POST /api/holdings-batch`: new, single segment by necessity

`/api/holdings/batch` is impossible on this project's Vercel config. This is a new top-level Hono mount in `server/app.ts`, not a sub-path of the holdings router.

Request:

```
{
  ledgerId: string,              // uuid, ownership checked server-side against the session household
  holdings: [                    // 1..MAX_LEDGER_HOLDINGS, each already sealed by the browser
    { id, memberId, ciphertext, iv, alg }
  ]
}
```

The array element is exactly `memberScopedCreateSchema` from `server/lib/envelope.ts`, reused unchanged. The body shape is deliberately the same one `createLedgerSchema` already carries (`holdings: z.array(memberScopedCreateSchema).max(MAX_LEDGER_HOLDINGS)`), so this endpoint extends a proven shape rather than inventing one.

Response, success:

```
{ status: "ok", inserted: number }
```

Response, `409`, when the ledger would exceed its row cap:

```
{ status: "ledger_full", currentCount: number, cap: number, attempted: number }
```

Response, `403`, when the ledger or any `memberId` does not belong to the session household. Ownership is checked for every member id in the array, not just the first.

**All or nothing within the one insert.** A single multi-row INSERT succeeds or fails as one statement, which is the only atomicity available over `neon-http`. Partial commit is a client-side concept here: the client sends only the Ready bucket, and that set either lands entirely or not at all.

### No API for template generation

The workbook is built entirely in the browser by SheetJS from the decrypted member list and the existing `GET /api/instruments` response. Nothing about the template touches the server, which is what keeps member names out of any server surface even though they are in the file.

### No API for parsing

Parsing is browser-only, by decision. Any hosted parsing API was rejected in D-025.

## I4. Per-panel decisions

| Panel | Decision |
|---|---|
| Entry point | A secondary action on the ledger's holdings view, next to the existing add affordance, naming the active ledger. Not in the FAB, not in the nav |
| PII disclosure | A step before the download, not a checkbox beside it. It states what the file will contain and that the file is outside the app's protection once saved |
| Template download | A single button. The file name carries the household's ledger name and the date, so a stale download is identifiable by its name |
| Upload | A drop zone with a file button, one file at a time, `.xlsx` only |
| Review screen | Four collapsible bucket sections in fixed order: Ready, Needs attention, Possible duplicate, Skipped. Ready is expanded by default, the rest collapsed with counts visible |
| Row rows | Member, instrument, amount, and the reason if any. No inline editing in v1: the fix loop is download the rejects, fix in Excel, re-upload |
| Primary CTA | Commits the Ready bucket only, and its label carries the count and the ledger name |
| Rejects download | A secondary action, always present when any row is outside Ready |
| Leaving the screen | A confirm step, because parsed rows are memory-only and leaving discards them |

## I5. Analytics surface

Existing names reused unchanged: `bulk_import_template_downloaded`, `bulk_import_completed` with `rows_clean` and `rows_rejected`, `pii_disclosure_shown` with `surface`. New names in `METRICS_PLAN.md` under the D-025 section, all row counts, never row contents.

## I6. Constraints contract (testable assertions, Phase 5 verifies these)

1. **`sm:` fires at 390px here.** Every full-width control in this feature uses `md:`, never `sm:`. Named specifically: the template download button, the upload drop zone, the primary commit CTA, the rejects download button, and the bucket header rows. **Assertion: no new class string in this feature matches `sm:(grid-cols|w-auto|flex-row|inline-flex)`**, same pin as G6.1.
2. The review screen's row list is one column below `md:`. A four-column row table at 390px is the failure mode to avoid; below `md:` each row is a stacked block with its reason beneath it.
3. Bucket sections and every row block carry `min-w-0`. A long instrument name must wrap, never widen the page.
4. Every touch target on the review screen is at least 44px.
5. **No parsed row reaches persistent storage.** Assertion by test: after a parse, `localStorage`, `sessionStorage`, and IndexedDB contain no value matching any fixture amount.
6. **The service worker caches no `/api/*` request or response body**, pinned in the style of `sw-cache-policy.test.ts` and `pwa-registration.config.test.ts`.
7. **The parser chunk is in the precache list**, pinned in the same test file, so the screen works offline.
8. Per-cell validation messages name the column and the reason and contain no cell value. Assertion by test over the message builder with a fixture value that would be recognisable if echoed.
9. Excel date serials are formatted from local date parts. Assertion: a serial for 1 January under an IST offset produces 1 January, not 31 December. `toISOString()` appears nowhere in the parser.
10. Lakh grouping parses. Shorthand is rejected with a message, never guessed.
11. `POST /api/holdings-batch` rejects a body carrying any plaintext field. The array element schema is `memberScopedCreateSchema` and it is `.strict()`.
12. A batch that would exceed the ledger row cap inserts zero rows.

## I7. Implementation cost flags

- SheetJS must be pinned to the vendor tarball URL, not the frozen npm registry copy, and loaded by dynamic import so the main bundle and the 2s load target are untouched. This is a build-config change, not just a dependency add.
- Requirements 6 and 7 above pull opposite directions through the same vite-plugin-pwa config and must be done in one pass with one test file covering both.
- The cross-tool manual pass (real Excel, Google Sheets, LibreOffice) that D-025 calls out is not automatable and belongs in the Phase 3 plan as its own gate.

## I8. Open questions

1. **Whether the rejects file is a filtered copy of the original template or a flat list.** Specced as a filtered copy so the fix-and-re-upload loop uses the same file shape; a flat list is smaller but breaks the loop.
2. **Whether a second upload replaces the review state or merges into it.** Specced as replace, because merge invents a reconciliation problem the user did not ask for.

**Gate: not run.** This section is drafted for Gaurav's review. No stage is marked passed.
