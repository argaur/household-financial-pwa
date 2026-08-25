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
| Explore | Folio plate, full fidelity, incl. working add-to-holdings toggle | Existing library copy, retokened only | Open a section; add instrument to holdings | Section/instrument cards retokened; new add-to-holdings toggle interaction shown live in the folio, not previously speced in v1 SPEC.md §4 — needs its own analytics event if it ships as a genuinely new interaction, not just a visual retreat (flagged in §S8 below) |
| Portfolio | Folio plate, full fidelity, incl. bulk-import zone + ledger table | Existing holdings copy, retokened only | Add/edit holding; bulk import (dashed brass import-zone motif) | LedgerTable component (double-rule total row) replaces the plain HoldingRow list group for ledger-scoped views; HoldingRow itself is unchanged for the baseline/Current view |
| Goal planner | Folio plate, full fidelity, incl. projection SVG + proposed-ledger cards | New screen, not in v1 SPEC.md — this is the D-016 bundle's goal-planner feature (slice 2-4 territory), shown here only as a retokened mock, not yet built | N/A — not yet implemented | The folio mocks this screen ahead of its own feature build (D-016 slices 2-4, still unbuilt per `app/CLAUDE.md`'s public-showcase backlog item 2). Do not treat this plate as authorizing the goal-planner feature itself — it authorizes the visual system that feature will use once built |

## S5. Analytics Surface

**No new events.** This is a visual-only pass (Stage 2 item 8); every interaction already fires the event it fired in v1. One flag: the Explore screen's "working add-to-holdings toggle," shown live in the folio, is not in v1 `SPEC.md` §4/§5 as an Explore-screen interaction (v1 only has "Record this in my plan" from the *detail* page, §4 row "Instrument detail"). If this toggle ships as a new list-level interaction (not just the existing detail-page flow re-skinned), it needs a `feature_used` event (`feature_name: "explore_add_to_holdings"`) before it ships — escalated to Phase 3 (Plan), not resolved here, since it may be an artifact of the folio's own demo interactivity rather than an intended new interaction pattern.

## S6. Constraints Contract (testable assertions — Phase 5 verifies these)

- Every major card/surface on the 5 flagship screens traces to the vault/currency metaphor (VaultFrame, guilloche, reed, coin, ledger, or hatch) — no bare `rounded-xl` card with only a gray border and no motif (Stage 2 negative constraint)
- `--brass` tokens used only in: mono eyebrows/section labels, guilloche motif, coin-mark rims, dashed import-zone borders, ledger-table accents — never as a second primary button color or generic UI chrome
- `AllocationDonut`'s emergency-fund segment renders with a hatched fill pattern whenever `holdings` includes an emergency-fund-flagged item — this is new in this pass and must be its own assertion, not folded into the existing "never renders % at 0 holdings" rule from v1 §6
- No gradients, no glassmorphism/blur on any card or content surface (the folio-header's sticky nav blur is chrome, not content, and is exempt — brand-guide §2 Animation)
- `sm:` breakpoint remains 390px, not the Tailwind default 640px — re-verify at implementation; this exact class of bug (a `sm:`-scoped rule silently firing at the wrong width) already shipped once and was caught only by live rehearsal, not the test suite (`app/CLAUDE.md`, 2026-08-25 ledgers entry)
- Mint/brass contrast: re-verify WCAG AA (4.5:1 body / 3:1 large text) for `--brass` on `--card` in both themes at implementation — brass was not contrast-checked during token extraction, only visually matched to the folio
- Font fallback chains actually render acceptably when Bodoni MT / Gill Sans Nova / Cascadia Mono are unavailable — see §S7, this is a real risk, not a formality

## S7. Implementation Cost Flags

| Element | Why non-trivial | Simpler fallback |
|---|---|---|
| **Font availability — none of the 3 new typefaces are open/web-safe** | Bodoni MT and Cascadia Mono are Microsoft-licensed, not bundled on macOS/Linux/mobile; Gill Sans Nova is a commercial Monotype face. The fallback chains (`Didot, "Playfair Display", "Times New Roman"` / `"Gill Sans", "Trebuchet MS", "Segoe UI", Candara` / `Consolas, "SF Mono", Menlo`) are not guaranteed on a public PWA's actual device mix — most visitors will render the *fallback*, not the named font, and the fallback quality varies a lot across OS. This was true in the folio (a demo artifact meant for Gaurav's own review) and is a real gap for a shipped public product | Load `Playfair Display` (serif) and a Google-hosted geometric sans as explicit `@font-face`/Google Fonts declarations so the *intended* look is guaranteed rather than hoped-for via OS-dependent fallback — decide in Phase 3 whether this is worth the added font-load weight against the PWA's offline/performance goals, or whether the fallback-chain gamble is accepted deliberately |
| Guilloche rosette (code-drawn SVG, generated via the folio's script block) | Not a static asset — it's algorithmically generated at runtime in the folio; porting it means porting the generation logic, not just copying markup | Ship it as a precomputed static SVG (accept it as a fixed asset, not runtime-generated) if the generation logic proves nontrivial to port |
| Hatched ReserveHatchSlice donut fill | Recharts (this project's donut library) has no built-in hatch/pattern fill for a pie segment — needs an SVG `<pattern>` def and a per-segment `fill="url(#...)"` override, more involved than a solid-color segment | Use a distinct solid color + a small pattern-icon in the legend instead of an in-chart hatch, if the SVG pattern proves awkward inside Recharts' rendering |
| Regression risk against 1156 passing tests | A wholesale token/typography swap touches every screen's rendered class list; the test suite asserts behavior and copy, not visual tokens, so it will stay green through changes that are visually wrong (exactly the class of bug the `sm:`-390px trap already demonstrated) | None acceptable as a substitute for real-browser verification at 390px on a throwaway Neon branch (this project has no safe local dev path, `.env.local` points at production) — flagged again in §S6, not simplified away |
| Explore add-to-holdings toggle (§S5) | May be a new interaction pattern, not just a retokened existing one — needs a Phase 3 decision, not a Phase 2 one | Treat it as visual-only and route any real new interaction back through Phase 1 if Phase 3 determines it's new scope |

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
| Serif typeface | DM Serif Display | Bodoni MT (fallback chain, see §S7) |
| Sans typeface | Inter | Gill Sans Nova (fallback chain, see §S7) |
| Mono typeface | None (no mono role existed) | Cascadia Mono (fallback chain, see §S7) — new role: eyebrows, tabular figures |
| Card radius | 8px | 10-16px stepped scale (folio's own steps) |
| Shadow levels | 1 (`shadow-card`) | 2 (`shadow-card`, `shadow-lift`) + text-only `.emboss` |
| Section label style | Sans, muted-foreground, semibold | Mono, brass, `.22em` tracking |
| Asset-class donut colors | Fixed hex, same in both themes | Native per-theme CSS vars, retinted |
| Emergency-fund donut segment | Solid color, same visual treatment as any other segment | Hatched fill, visually distinct — solves public-showcase backlog item 1 |
| New motifs | None | Guilloche rosette, reeded dividers, coin-shaped FAB, vault-frame cards |

## S10. Open Questions

1. **Font-loading strategy** (§S7) — escalated to Phase 3: rely on OS fallback chains as designed in the folio, or explicitly load Google-Fonts-hosted approximations (Playfair Display is available; a comparable geometric sans and mono would need selection) to guarantee the intended look. Not a blocker for Stage 5/6 — it's an implementation decision, not a design one.
2. **Explore add-to-holdings toggle** (§S5) — is it new scope needing its own analytics event and possibly a Phase 1 pass, or a retokened existing flow? Escalated to Phase 3.
3. **"Title" typography role** (app-bar name vs. card titles, serif vs. sans) — explicitly left unresolved by Gaurav's decision, 2026-08-25. Not a blocker; resolve when that screen is actually built.
4. Onboarding, Profile, and instrument-detail visual treatment — explicitly deferred to their own future Phase 2 passes, using this system as reference (Gaurav's direction, 2026-08-25). Not an open question so much as a confirmed non-scope for this pass.

---

**Self-review before user review (D-016 Slice 5 addendum):**

- Placeholder scan: no bracketed TBDs remain.
- Consistency check: every flagship screen in WIREFRAMES.md's Stage 3 resolution has a row in §S4; every new token referenced exists in `globals.css`/`tailwind.config.ts` as of the 2026-08-25 commits; every new component referenced exists in `COMPONENT_SHOWCASE.md`.
- Scope check: no feature introduced here beyond what the folio itself shows and what D-016's approved feature list already includes; the Goal planner plate is explicitly flagged (§S4) as visual-system-only, not a feature authorization.
- Cost flags: 5 non-trivial elements flagged in §S7, each with a named simpler fallback.
- All 3 Stage 1 design risks addressed in §S8 — risk 3 (regression) is honestly left escalated, not force-resolved.

### Gate: Stage 5 (Spec Doc) — ready for Gaurav's review before Stage 6 (Handoff) and Phase 3 (Plan).
