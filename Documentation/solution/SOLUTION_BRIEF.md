# Solution Brief — Household Financial Planning PWA

**Date:** 2026-06-23
**Status:** Solution Approved (2026-06-23) — Phase 1 complete. Next: Phase 2 (Design).

---

## PRD Read-Back

1. **Problem:** Indian households have no single place to learn what financial instruments exist across asset classes, record what they actually hold across family members, and see household-level plan gaps — existing tools are single-account trackers or generic robo-advisors, never both education-first and household-level.
2. **Target user:** Indian retail investors/households who are literate enough to want to track real holdings but lack a consolidated, education-first view of their household's complete financial picture (modeled initially on Gaurav's own family: self, spouse, child).
3. **Success criteria:** Onboarding completion, return-visit retention, Household Portfolio Completeness Score growth, and demo-household engagement — see falsifiable rewrite below; none currently has a numeric target set.
4. **Hard constraints:** Education-not-advice wording only (regulatory line, not style); real auth required (stores household PII); mobile-first PWA; public product (must handle real households, not just Gaurav's data shape); single editor per household in v1.
5. **Explicit non-goals (from PRD):** ~~AI chat~~, statement import, net-worth-over-time, shared/multi-editor access, push notifications, admin CMS, payments/billing, ~~dedicated goal-planning UI~~. **AMENDED 2026-08-17 (D-016):** AI chat and a dedicated goal-planning UI are no longer non-goals — both are now in scope, capped (2 plans per household, 2 edits per plan), backed by Gaurav's own Anthropic API key. See D-016 in `DECISIONS_LOG.md`.

**Falsifiable success criteria** (every criterion rewritten as `X% of [user] will [action] within [timeframe]`; anything that can't be made falsifiable is flagged as a non-goal or research question — never left vague):

| # | Original criterion (from PRD) | Falsifiable form | Measured by (event/metric) |
|---|---|---|---|
| 1 | Users complete onboarding without abandoning | **60%** of users who start onboarding will complete all 3 steps (household → members → holdings) within their first session | `onboarding_started` → `onboarding_completed` funnel in PostHog (corrected 2026-08-01, D-012: the `analytics_events` half was never built) |
| 2 | Users return to update holdings or check nudges | **25%** of users who complete onboarding will return at least once within 14 days | Distinct `session_started` events per `user_id` with a 14-day gap check |
| 3 | Completeness Score increases as users add data | **50%** of households will increase their Completeness Score by ≥1 tier within 30 days of signup | `completeness_score_changed` event, before/after tier |
| 4 | ~~Demo-household lets a visitor experience value with zero entry~~ | Cut — demo-household button removed from v1 (Phase 1, Q3) | n/a |

**Resolved in Phase 1 interview (2026-06-23):**

- Numeric targets set above (60% / 25% / 50%) — deliberately conservative; this is an unmarketed v1 with no prior data.
- Completeness Score = fixed 5-check, equal-weight checklist (household coverage, emergency-fund-equivalent holding, both parents' protection logged, ≥3 of 6 asset classes held, all holdings have `current_value` set) → tier (0–1 Getting Started / 2–3 On Track / 4–5 Strong).
- Nudge logic = single inline nudge showing the first unmet check in the fixed order above, linking to its learn-card. Deterministic, no weighting/tuning needed.
- Instrument library = 6 sections × 5 instruments = 30 total (Equity, Debt, Gold, Hybrid/Guaranteed, Real Estate, Alternative) — validated against Gaurav's own real holdings so no asset class in his actual plan is unrepresentable.
- Budget ceiling = ₹0/month target (free tiers only); kill criterion = 30 days to deploy Slice 0.
- Repo visibility = public.
- Auto-pricing (mfapi.in/CoinGecko/gold) and the price-freshness-SLA ambiguity are both moot — manual value entry only in v1, no live price feeds.
- Demo-household ephemeral-vs-persisted ambiguity is moot — feature cut entirely.

**Still open (carried to DEFERRED Items below):**

- Multi-tenancy/data-isolation is implied by Clerk + per-household schema but has no explicit enforcement spec (e.g., row-level security vs. application-layer scoping) — a Phase 2 design decision, not a product-scope one.
- Data retention/deletion policy on account deletion is undecided.
- Concurrent-session behavior (same user, two devices) defaults to last-write-wins by omission — not explicitly chosen.
- "Mobile-first" breakpoint target (assumed 390px per global default) not explicitly confirmed for this project.

---

## Prior Art & Steal List

| Product | What it solved | Mechanic to steal | Where it applies in v1 |
|---|---|---|---|
| INDmoney | Consolidated net-worth view across many Indian + global asset classes in one dashboard | Single hero "everything in one view" dashboard pulling disparate asset classes (MF, FD, stocks, etc.) into one allocation visualization | Asset-class allocation donut (hero widget) on the Portfolio tab |
| Monarch Money (and the late Mint) | Guided onboarding that gets a new user to their "aha" moment (seeing full net worth) fast, with minimal friction | Linear, fact-only guided onboarding (3 short steps, no decisions deferred) before showing any dashboard | The household → members → holdings → dashboard onboarding flow |
| Kuvera / Groww | SIP tracking and reminders for recurring Indian MF investments | In-app SIP calendar as a lightweight, ownable substitute for push notifications | v1's "in-app SIP calendar instead of push notifications" decision |
| Duolingo | Turns a literacy/learning journey into a habit via a single visible health/streak score | A single scored "health" metric users want to watch increase, driving return visits without nagging | Household Portfolio Completeness Score + Household Health panel |
| NerdWallet | Marries financial education content directly to specific user situations without selling product | Short, situational "learn-card" content tied 1:1 to a nudge, with zero embedded buy/sell CTAs | Nudge → learn-card linking, enforcing the education-not-advice constraint |

---

## Core User Journey

A new user completes a 3-step, fact-only onboarding (household → members → first holding) and lands on a personal dashboard showing their real asset-class allocation, a Household Health tier, and one prioritized nudge — the instrument library is reached secondarily, never gating this path.

---

## v1 Feature List

| # | Feature | Why it's in v1 |
|---|---|---|
| 1 | 3-step guided onboarding (household → members → holdings) | The entire critical path to first value; locked Phase 1 Q1 |
| 2 | Manual holdings entry, kind-aware forms, all instrument types | Delivers the dashboard's core data without any external price-API dependency (Q2) |
| 3 | Portfolio dashboard — asset-class allocation donut (hero) | The "aha" moment of the core journey; what onboarding leads to |
| 4 | Household Health panel — 5-check completeness score + tier | Gives users a reason to return and a measurable North Star input (Q9) |
| 5 | Single ordered inline nudge → learn-card link | Closes the loop from "what's missing" to "go learn about it," enforcing education-not-advice (Q9) |
| 6 | Instrument library — 6 sections × 5 instruments (30 total) | Expresses the literacy half of the positioning at a bounded, finishable content scope (Q10) |
| 7 | Bottom tab nav (Home·Explore·Portfolio·Profile) + "+" FAB | Locked product navigation shape from the 2026-06-14 brainstorm |
| 8 | PWA shell (vite-plugin-pwa) — precached library + `/why` | Locked offline/installability requirement; read-only, no write-queue. **Scope corrected 2026-08-01 (D-013):** this row previously included "last-known dashboard". The offline dashboard was never achievable as built — Clerk's library loads from a remote script, so offline there is no session. See B-005. |
| 9 | Custom PWA install prompt (post-activation) | Locked over native auto-prompt for UX control |
| 10 | "Why these choices?" in-app page | Recruiter/portfolio narrative surface (Q7 craft+architecture signal still benefits from this existing, even if not the primary pitch) |
| 11 | Global education-not-advice disclaimer + consent modal | Regulatory hard constraint, non-negotiable |
| 12 | Analytics: PostHog only | Q5 chose both (internal table + PostHog). Only PostHog was built; **superseded by D-012 on 2026-08-01.** PostHog carries funnels, retention and the North Star. |
| 13 | Sentry error tracking | Default per template, no DIY substitute (Q5) |

---

## Explicit Non-Goals (v1)

| # | Not building | Why cut |
|---|---|---|
| 1 | Auto-price fetching (mfapi.in / CoinGecko / gold API) | Core loop doesn't need live prices; manual entry is sufficient for v1 (Q2) |
| 2 | Demo-household button / demo mode | Conflicts with the chosen holdings-first journey; real onboarding is fast enough to serve the same purpose (Q3) |
| 3 | ~~AI chat / conversational interface~~ **PROMOTED IN-SCOPE 2026-08-17 (D-016)** | Was v2 — not needed for the literacy→tracking core loop. Now: AI "Counsel" suggestions + goal planner, capped 2 plans/household × 2 edits/plan, Anthropic API key required before Phase 1 |
| 4 | Bank/broker statement import | v2 — adds parsing/reconciliation complexity unneeded for manual-entry v1 |
| 5 | Net-worth-over-time charting | v2 — needs historical snapshots not captured in v1's schema |
| 6 | Shared/multi-editor household access | v2 — schema supports it, but v1 is single-editor only |
| 7 | Push notifications | v1 uses in-app SIP calendar instead |
| 8 | Admin CMS for instrument content | v1 content is curated JSON/MDX in-repo, edited via commits only |
| 9 | Payments / billing | Not a monetized product |
| 10 | ~~Dedicated goal-planning UI~~ **PROMOTED IN-SCOPE 2026-08-17 (D-016)** | Was: `goals` table exists (v1.5) but no UI in v1. Now: AI-assisted goal planner, same cap as row 3, folds into the strategy-ledger model |

**Superseded 2026-08-17:** rows 3 and 10 above are no longer generic "someday v2" — Gaurav named both as top-priority public-showcase gaps (see `memory/project.md`'s "Public-showcase priority backlog," items 2/6 for the AI layer and goal planner, plus items 1/3/4/5 for the emergency-fund chart gap, visual design pass, Excel bulk-import, and one-click add-from-library). None are scoped yet — items 2 and 6 of that list need the ₹0/month budget ceiling (Cost & Kill budget, above) resolved first, since an LLM-backed layer has no free tier at real usage. Route each through Phase 0 intake before building, not straight to code.

---

## Technical Shape

| Decision | Choice | Rationale |
|---|---|---|
| Frontend | Vite + React + TypeScript + Tailwind + shadcn/ui + Recharts | Locked 2026-06-13 |
| API layer | Hono on Vercel Functions | Locked 2026-06-23 — lightweight, edge-compatible, pairs well with Drizzle |
| Database | Neon (serverless Postgres) | Locked 2026-06-14 — overridden from Supabase by Gaurav |
| ORM | Drizzle | Locked 2026-06-23 — lighter, faster cold starts on Vercel Functions hitting Neon vs. Prisma |
| Auth | Clerk | Locked 2026-06-23 — hosted UI fits a Vite SPA without a Next.js-specific auth library |
| Hosting | Frontend on Vercel; DB on Neon cloud | Locked 2026-06-14 |
| Repo visibility | **Public** | Locked Phase 1 Q4 — strongest portfolio signal; forces real secret/security hygiene now |

---

## Third-Party Services

| Service | Purpose | Cost | Lock-in risk | Decision |
|---|---|---|---|---|
| PostHog | Analytics (funnels/retention dashboards) | Free tier | Low (open source) | Kept alongside internal table (Q5) |
| Sentry | Error tracking | Free tier | Low | Default, no substitute (Q5) |
| Clerk | Auth | Free tier (10k MAU) | Medium (auth migration is non-trivial if ever swapped) | Locked Q-tech-decisions session |
| Neon | Database | Free tier | Medium (Postgres-compatible, but serverless-specific features add some lock-in) | Locked 2026-06-14 |
| Vercel | Hosting (frontend + API functions) | Free tier (Hobby) | Low (standard static+functions hosting) | Locked 2026-06-14 |

---

## Risk Register

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | Project stalls again (this is the third scope iteration: private viewer → public PWA → now scoped v1) | Medium — past-mistakes pattern of momentum loss across pivots | 30-day Slice 0 kill criterion forces a concrete deployed checkpoint instead of open-ended planning |
| 2 | Solo-developer bandwidth (competes with day job + household-plan work) | Medium | v1 scope deliberately cut to bounded content (30 instruments) and manual-entry-only data, no external API integration risk |
| 3 | Regulatory/compliance drift — nudge wording slips from educational into advisory over time | Low if disciplined, High impact if it happens | Education-not-advice is a hard constraint with disclaimer + consent modal; any nudge copy change should be checked against this before merge |
| 4 | Free-tier ceilings (Clerk 10k MAU, Neon/Vercel compute) hit unexpectedly if the portfolio piece gets real traffic | Low at v1 (no marketing push planned) | Clerk's free tier is the explicit first limiter to monitor; revisit budget if traffic grows |

**Cost & Kill budget** (mandatory — both numbers, no TBDs; also appended to `DECISIONS_LOG.md`):

| Budget | Value | Notes |
|---|---|---|
| Max monthly infra cost | ₹0/month target, **plus a hard-capped Anthropic API exception (2026-08-17, D-016)** | Free tiers only across Neon, Vercel, Clerk, PostHog, Sentry. First service to hit its ceiling if usage grows: **Clerk** (10k MAU free tier). The AI counsel/goal-planner layer uses Gaurav's own Anthropic API key, capped at 2 plans per household × 2 edits per plan — a per-household ceiling on calls, not a free tier, and the only paid dependency in the stack |
| Kill criterion | If Slice 0 (onboarding → dashboard, deployed end-to-end) isn't deployed within **30 days** → descope to Builder OS | Checked at every slice boundary. Met 2026-07-10; unaffected by this amendment |

---

## Recruiter Signal

This project demonstrates **craft and architecture**, not primarily the meta-narrative of product judgment (Phase 1 Q7: options B+C chosen over A). A hiring manager scanning in 60 seconds should see: (1) a polished, installable PWA with dark mode and a deliberate non-generic visual identity — evidence of design execution, not just functional UI; (2) a real multi-tenant backend (Hono + Drizzle + Neon + Clerk) handling actual household financial data with proper auth — evidence of backend architecture competence, not a frontend-only demo. The decision log and "Why these choices?" page still exist and remain inspectable, but they support the pitch rather than lead it.

---

## DEFERRED Items

| Item | Why deferred | Revisit before |
|---|---|---|
| Multi-tenancy/data-isolation enforcement mechanism (RLS vs. application-layer scoping) | Implementation-level design choice, not a product-scope decision | Phase 2 (Design) — `DATA_MODEL.md` |
| Data retention/deletion policy on account deletion | Not load-bearing for MVP feature set; needs a decision but doesn't block design | Phase 2, before auth/account-deletion flow is built |
| Concurrent-session behavior (same user, multiple devices) | No product decision made; defaults to last-write-wins by omission | Phase 2 — confirm explicitly rather than leaving implicit |
| Mobile-first breakpoint target | Assumed 390px (global CLAUDE.md default), not explicitly confirmed for this project | Phase 2 — `SPEC.md` |

---

## Phase 0 Intake — D-016 Feature Bundle (2026-08-17)

This is a second Phase 0 pass, scoped to the feature bundle Gaurav approved on 2026-08-17 (see `DECISIONS_LOG.md` D-016), not a re-intake of the whole product. The v1 PRD read-back above still stands. This section reads back the four new items against the same bar: falsifiable, no vague success criteria, every ambiguity named.

### PRD Read-Back (this bundle)

- **Problem:** The shipped v1 tracks one static household plan and cannot answer "what if." A user cannot compare a SIP scale-up against their current path, gets no suggestions when their allocation drifts (gold overweight, emergency fund oversized), must enter every holding one at a time, and the app's own screens still look, in Gaurav's words, "unfinished and basic."
- **Target user:** The same household as v1 (Gaurav's own family shape, generalized), now specifically the subset who has already completed onboarding and wants to plan forward rather than just record the present.
- **Success criteria (draft, made falsifiable below):** Households create and compare alternate strategy ledgers; households with a drifted allocation see and act on an AI suggestion; households with several holdings use bulk import instead of one-by-one entry; the redesign does not cost the product any of its existing onboarding completion.
- **Hard constraints:** The ₹0/month ceiling still holds everywhere except the AI layer, which is capped at 2 plans per household x 2 edits per plan on Gaurav's own Anthropic key (D-016). Client-side encryption (D-014) is not renegotiated by this decision — the server still cannot decrypt household data at rest, which creates a real architectural question below, not just an ambiguity.
- **Explicit non-goals (this bundle):** No third strategy ledger or higher cap without a new decision. No AI layer beyond suggestions and goal-drafting (no chat, no autonomous execution — every AI action is Apply/Dismiss, never auto-committed, matching the design-concept mockup). No multi-editor household support added as a side effect of ledgers. No new instrument-price auto-fetching (D-002 still stands).

### Falsifiable success criteria

| # | Draft criterion | Falsifiable rewrite | Status |
|---|---|---|---|
| 1 | "Ledgers help users plan" | 30% of households with 2+ holdings will create at least one alternate strategy ledger within 60 days of launch | Falsifiable, numeric target set as a conservative first read (no prior usage data, same reasoning as D-006) |
| 2 | "AI counsel is useful" | 20% of households at Completeness tier 2+ will view at least one AI counsel suggestion within 30 days of launch | Falsifiable |
| 3 | "AI counsel stays within cap" | Fewer than 5% of households will exhaust both the 2-plan and 2-edit-per-plan caps within the first 90 days | Falsifiable, but this is a capacity/cost check, not a value metric — track it, do not treat hitting it as failure |
| 4 | "Bulk import is used" | 15% of households with 5+ manually-entered holdings will use bulk import for a subsequent addition within 60 days | Falsifiable |
| 5 | "The redesign looks more finished" | Not falsifiable as written — "looks finished" has no measurable action. Rewritten as a non-regression gate: onboarding completion rate does not drop more than 5 percentage points against the pre-redesign baseline, measured 30 days post-launch | Flagged as a **design QA gate**, not a growth metric — visual quality itself is judged by Gaurav's own review, not a funnel number |

### Ambiguities and unstated assumptions

1. **The architectural conflict, not just an ambiguity.** D-014 encrypts household data client-side specifically so the server can never read it. An AI suggestion needs to read holdings to reason about them. If the Anthropic call is made from the server (`server/` Hono routes, the pattern every other feature in this app uses), the server would need plaintext it structurally cannot have. The call must instead originate from the client, after decryption, sending plaintext holdings data directly to Anthropic's API (or through a thin server proxy that only forwards, never persists). This is a new item for the `/privacy` leak list and needs its own decision before Phase 1, not an assumption carried in silently.
2. Does "2 edits per plan" count only AI-assisted edits, or every edit (including a user manually changing an amount) to a plan the AI touched? The mockup's "Tune" button on the goal-planner plan is ambiguous on this point.
3. Is the cap per household or per user? Matters only if multi-editor households ever ship (currently a non-goal), but the schema decision should be made once, not revisited.
4. What happens when a household hits the cap: hard block with a message, a manual-only fallback (keep editing without AI), or something else? Not specified in D-016.
5. Are "plans" (the cap's unit) and "ledgers" (the dashboard's strategy tabs) the same object, or does the goal planner's draft become a ledger only on explicit adoption (as the mockup's "Adopt as a draft ledger" button implies)? If they are different objects, the cap needs to say which one it counts.
6. Where do alternate ledgers persist: server-side (encrypted per-row, extending D-014's model) or client-side only, echoing the superseded 2026-06-13 localStorage-scenario decision? Server-side is assumed as the default (consistent with everything else in the schema) but is not yet decided.
7. If an AI suggestion references an instrument that is later removed or changed in the 30-instrument library, what happens to ledgers that already adopted it?
8. Does "full-platform redesign" (D-016 item 4) include the landing page and `/why`, which were already redone 2026-08-12 in a different visual language? D-016's text names onboarding, Profile, and instrument detail specifically — it does not say whether the already-redesigned public pages get a second pass or stay as-is.
9. Build order and parallelism across the four items is not set. They have real dependencies: the redesign's dashboard mockup already assumes ledgers exist, so ledgers plausibly need to land before or alongside the dashboard's visual rebuild rather than after it.
10. The bulk-import template's household-member-name prefill (D-016 item 3) is a downloaded file with plaintext household PII, sitting outside the encrypted boundary the moment it is saved to a device. This is closely related to ambiguity 1 but is its own decision — a downloaded spreadsheet is a different exposure than an API call, since it can be re-shared or synced to cloud storage by the user.

### Prior Art & Steal List

1. **Boldin (formerly NewRetirement) — named, branchable plans compared side by side against a baseline.** This is the closest existing product to the strategy-ledger idea: a protected baseline plan, unlimited named variants, and a comparison view showing the delta on net worth and retirement age. Steal: the delta-against-baseline framing, which the mockup's `compare-strip` already gestures at — worth building out as a real side-by-side view, not just a one-line strip.
2. **Empower (formerly Personal Capital) Retirement Planner — instant recompute on scenario sliders.** Changing an assumption (spend rate, retirement age) recomputes the plan live with no save step, so exploring a what-if costs nothing. Steal: treat ledger switching and goal-planner rate edits as free to try, cheap to abandon — never gate a preview behind a save action.
3. **Airtable / Notion CSV import — column-mapping preview before commit.** Both show a preview screen mapping uploaded columns to real fields, flag mismatches, and let the user fix or skip a row before anything is written. Steal: this is exactly the "11 clean, 1 needs review" pattern already in the mockup's import zone — the row-level accept/reject, not just a pass/fail on the whole file, is the part worth keeping.
4. **A locked-header, dropdown-validated spreadsheet template (the pattern behind most bank/HR bulk-upload tools).** The header row and instrument-name column use Excel data validation (a dropdown of the real instrument list), so a filled-in cell can only be a name the app already knows, cutting fuzzy-matching failures at the source. Steal: generate the dropdown list from the same instrument table Explore already reads, so the template can never drift from the live library.
5. **Cleo / Copilot Money's suggestion cards — one-tap apply or dismiss, never auto-executes.** Both keep every AI suggestion as a proposal a user must explicitly accept, with the reasoning shown inline, never a silent background change. Steal: this is already the mockup's Counsel-card pattern (Apply to a draft ledger / Dismiss); worth stating explicitly as the standing rule for every future AI feature in this app, not just these two, given the "education not advice" hard constraint already in place for nudges.

### Gate: Read-Back approved 2026-08-17 — resolutions

Gaurav approved this Read-Back with answers to every ambiguity and the architectural conflict above. Full text in **D-017**, `DECISIONS_LOG.md`. Short form:

- The encryption conflict (ambiguity 1) is resolved by a thin server proxy: browser decrypts, sends plaintext to a new server route over TLS, that route forwards to Anthropic and relays the reply without writing to Neon or logs. The database still stores ciphertext only. This is a narrow, disclosed exception to "the server cannot read your data," not a break of D-014.
- The usage cap counts AI-driven actions only, never manual edits — this rule applies to every future AI usage restriction in this app.
- Cap is per household, not per user, for now.
- Hitting the cap disables only the AI action with a soft "limitations, paid tier coming soon" message. Manual editing is never blocked.
- Plans and ledgers are the same object, and every ledger gets the same donut/Reserve/summary view as Current.
- An instrument that changes or disappears from the library never silently alters or deletes a ledger's historical data — it triggers a bold, red-toned warning naming what changed.
- The full-platform redesign explicitly includes the landing page, reopening the 2026-08-12 redesign — Gaurav's own assessment is that it still reads as "too basic and too boring," and he has been the app's only user to date.
- Build order: strategy ledgers land first, since the AI layer, the goal planner, and the redesigned dashboard all assume ledgers exist.
- The bulk-import template's member-name prefill is an accepted, disclosed PII exposure (a downloaded file, plaintext by construction), documented alongside the AI-call exception rather than blocked.

~~**Phase 1 (Solution Stage interview) is queued, not started.**~~ **Run 2026-08-17** in a fresh session, as Gaurav asked. Results below.

---

## Phase 1 Solution Stage — D-016 Feature Bundle (2026-08-17)

Eight questions asked against the Phase 0 read-back above, scoped to this bundle only. The v1 sections earlier in this document are untouched and still stand. Full decision text in `DECISIONS_LOG.md` D-018.

**Status: Solution Approved 2026-08-17.** Phase 1 complete for this bundle. Next: Phase 2 (Design).

### Core User Journey (this bundle)

A user on the dashboard sees a tab strip reading `Current | <their ledgers> | + New`. `+ New` opens a light modal asking two things only, a name and whether to start blank or from a copy of Current, then drops them into an editable dashboard for that ledger. Every ledger renders the same view as Current (donut, Reserve treatment, summary, per D-017 §5), plus a compare strip showing its delta against Current.

Rejected: a separate "Strategy Lab" page (makes ledgers a place you visit rather than part of the daily view), and AI-only ledger creation (hard-couples ledgers to the one item blocked on an API key, and contradicts the locked build order).

### Feature List (this bundle)

| # | Feature | Slice | Why it's in |
|---|---|---|---|
| 1 | Ledger tab strip (`Current \| ledgers \| + New`) plus name-and-copy modal | 1 | The whole journey; locked Q1 |
| 2 | Editable per-ledger dashboard, same view as Current | 1 | D-017 §5, non-negotiable |
| 3 | Compare strip: delta vs Current on three numbers (total value, equity share, monthly SIP) | 1 | Minimum that makes a ledger mean something; locked Q2 |
| 4 | Four-ledger cap plus Current, fixed constant in schema and copy | 1 | Locked Q2 |
| 5 | Instrument-drift warning (bold, red-toned) on affected ledgers | 1 | D-017 §6 |
| 6 | Per-ledger compound-growth projection: one user-overridable annual return rate per asset class, user-chosen horizon, deterministic maths, no AI, works on Current too | 2 | Promoted from v1 non-goal at Q3; see the amendment note below |
| 7 | Instrument-aware Excel bulk-import template, generated client-side, with row-level accept/reject preview on return | 3 | D-016 item 3 |
| 8 | AI counsel cards: Sonnet 5 via the D-017 thin proxy, structured outputs, Apply or Dismiss only, may target Current as well as ledgers | 4 | D-016 item 2, widened at Q3b |
| 9 | AI goal planner, same proxy, same cap, output adoptable as a ledger | 4 | D-016 item 2 |
| 10 | Soft cap-hit message ("limitations, paid tier coming soon"), never a hard block | 4 | D-017 §4 |
| 11 | Mint treasury redesign across every screen, landing page included | 5 | D-016 item 4, D-017 §7 |
| 12 | Encryption-exception disclosure section on `/why` and `/privacy` | 4 | Q7; also the bundle's headline portfolio artifact |
| 13 | Bulk-import PII disclosure on the download UI and `/privacy` | 3 | D-017 §9 |

**Build order is locked by D-017 §8:** ledgers first. Slices 2 to 5 may reorder among themselves; slice 1 cannot move.

**Scope amendment, stated explicitly rather than absorbed silently:** projections and net-worth-over-time were an explicit v1 non-goal (row 5 of the v1 non-goals table above, "v2, needs historical snapshots not captured in v1's schema"). Feature 6 reopens it deliberately, at Gaurav's instruction on 2026-08-17. It does not need historical snapshots, because it projects forward from present values using user-set rates rather than reconstructing the past. The v1 non-goal on net-worth-*history* still stands unchanged.

### Explicit Non-Goals (this bundle)

Carried from D-017: no third-plus ledger beyond the cap, no AI chat, no autonomous AI execution, no multi-editor households, no instrument-price auto-fetching (D-002 stands).

Added at Q3:

| # | Not building | Why cut |
|---|---|---|
| 1 | Side-by-side ledger comparison view | Out entirely, not deferred. Revisit only if `ledger_switched` shows people actually live in more than one ledger |
| 2 | Arbitrary CSV or bank/broker statement import | Bulk import accepts the generated template only. No column mapping for foreign files |
| 3 | Ledger sharing or export (public link, PDF, send-to-anyone) | Export is an encryption-boundary decision and does not get made as a side effect of this bundle |

Two items proposed as non-goals were **rejected and promoted to goals** at Q3: projections (feature 6) and AI acting on Current (feature 8).

### Technical Shape (this bundle)

| Decision | Choice | Rationale |
|---|---|---|
| Ledger storage | **Full encrypted snapshot.** `ledger_id` on the holdings table, `is_baseline` flag marks Current. Creating a ledger copies every holding row, each encrypted with the same household data key | Every existing query works by adding one filter. The server cannot diff ciphertext anyway (D-014), so any overlay logic would run in the browser regardless. Makes ledger history genuinely immutable, which is exactly what the drift warning needs |
| Snapshot semantics | **Editing Current after a ledger exists does not change that ledger.** The ledger keeps the snapshot it was made from | Confirmed explicitly at Q4. Must be stated in the ledger tab copy, with the snapshot date |
| AI call path | Browser decrypts, POSTs plaintext over TLS to a thin server route, route forwards to Anthropic and relays the reply, writes nothing to Neon and nothing to logs | D-017 §1, not reopened |
| AI model | **`claude-sonnet-5`**, structured outputs via `output_config.format`, effort `medium` | Reasoning over a small well-shaped payload with a schema-clean output the UI renders as cards. Near-Opus quality at roughly half the price |
| Projection engine | Client-side, deterministic, no server call | No AI, no external data, reproducible numbers the user can audit |
| Excel template | Generated in the browser from the live instrument table | No upload of household data anywhere, and the template can never drift from the library |

Rejected: delta-overlay ledger storage (every read path would need a merge, and orphaned overlay entries under encryption are genuinely fiddly), client-only ledgers (they would vanish on device switch, contradicting the encrypted-sync model), Haiku 4.5 or Opus 5 for the proxy, and a split Haiku-plus-Sonnet routing (two prompts and two failure modes for a saving of a few rupees).

### Third-Party Services (delta only)

| Service | Purpose | Cost | Decision |
|---|---|---|---|
| Anthropic API | AI counsel and goal planner, through the thin proxy | `claude-sonnet-5` at $3/$15 per Mtok. A call is roughly 4k input, 1k output, so about $0.027 (roughly ₹2.40). Worst case per household at the cap (2 plans plus 4 edits) is about ₹14 | Locked Q5 |

No other new service. The Excel template needs a client-side spreadsheet library, not a service.

**Open, blocking implementation of features 8 to 10 only:** no Anthropic API key exists anywhere in this environment (project `.env*` files, the `~/.claude` tree, and other project memories were all searched on 2026-08-17). One must be minted at console.anthropic.com and set in Vercel Production env, never committed and never shipped to the browser. Ledgers, projections, bulk import, and the redesign are unaffected.

### Risk Register (this bundle)

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| 1 | **Projections read as advice.** "Education not advice" is a hard regulatory constraint. A growth line reaching a large number by 2041 is a projection, but a retail user reads it as a promise and a regulator may read it as a performance representation. The AI counsel cards sit right next to it | Low if handled, **high impact** | Visible assumption strip on every projection (your rate, your horizon, not a forecast) plus the standing disclaimer. Rates are user-set by design, so the assumption is the user's, not the product's. Copy for projections and AI cards is reviewed against the education-not-advice line before merge, same rule as nudges |
| 2 | Four items is a large bundle for a solo builder with a day job. Same pattern that stalled this project twice | Medium | Locked build order plus the 30-day checkpoint below |
| 3 | No Anthropic API key exists | Certain until resolved | Mint before the AI slice. Blocks nothing else |
| 4 | The encryption exception damages trust rather than demonstrating judgment | Low | Disclosed in plain language on `/why` and `/privacy`; the exception is genuinely narrow (no Neon writes, no logs) |
| 5 | The redesign touches every screen, and three screens already shipped unseen because Claude cannot sign in or set a passphrase | Medium, and known to recur | A human visual pass per screen before promotion. This is a hard constraint on the redesign item |
| 6 | ~~Stale-load defect worsens under a redesign~~ | **Closed 2026-08-06** | Root cause was a missing `virtual:pwa-register` import; pinned by `pwa-registration.config.test.ts`. Kept here because the risk was live when this register was drafted |
| 7 | Bulk-import template carries plaintext member names outside the encryption boundary | Accepted, disclosed (D-017 §9) | Warning on the download UI, documented beside the AI exception |
| 8 | Snapshot ledgers drift from Current and confuse users expecting updates to flow through | Medium, low impact | Ledger tab states the snapshot date; D-017 §6 drift warning covers instrument changes |

**Cost and Kill budget** (also in `DECISIONS_LOG.md` D-018):

| Budget | Value |
|---|---|
| Max monthly infra cost | ₹0 across Neon, Vercel, Clerk, PostHog, Sentry. Plus Anthropic on `claude-sonnet-5`, bounded by the 2 plans x 2 edits per household cap, not by a monthly figure. At 200 households the lifetime ceiling is roughly ₹2,800. First free tier to bite is still Clerk at 10k MAU |
| Kill criterion | **None. Replaced by a checkpoint, by Gaurav's decision at Q8a.** Review ledger slice 1 progress 30 days after the first commit. No automatic descope and no forced action. Recorded as a deliberate deviation from the Blueprint mandatory-field contract, not an omission. Reasoning and the counter-argument are in D-018 |

### Recruiter Signal (this bundle)

Leads with **the encryption exception decision**, with the Mint redesign as supporting craft evidence. Detail in `PORTFOLIO_ANGLE.md`.

### DEFERRED Items (this bundle)

| Item | Why deferred | Revisit before |
|---|---|---|
| Side-by-side compare view | Cut as a non-goal, but genuinely the strongest demo screenshot in the bundle | Only if `ledger_switched` shows real multi-ledger usage |
| Per-user (rather than per-household) AI cap | D-017 §3 deferred it pending real usage; no schema decision assumes user-level | Before any multi-editor work |
| Whether the AI proxy needs streaming | D-017 flagged that streaming could force persistence and break the "never at rest" claim | Phase 2 design of the proxy route |
| Projection horizon presets vs free entry | Gaurav said "the horizon they pick"; whether that is a free number field or a small set of presets is a UI decision | Phase 2, `SPEC.md` |
| Mobile width (390px) verification on redesigned screens | Existing open item, unchanged by this bundle, and the redesign enlarges it | Before promoting the redesign slice |
