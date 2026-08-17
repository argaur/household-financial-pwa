# Decisions Log — Household Financial Planning PWA

**Rule:** Append-only. Never edit or delete an entry — supersede it with a new one.
**Used for:** Re-anchoring between slices (Phase 4) and drafting `CASE_STUDY.md` (Phase 6).

Every entry records the decision AND the rejected alternative. A decision without a named alternative is a description, not a decision.

---

## Cost & Kill Budget (from Phase 1 — copy here, check at every slice boundary)

| Budget | Value |
|---|---|
| Max monthly infra cost | ₹0/month target (free tiers only — Neon, Vercel, Clerk, PostHog, Sentry). First to hit its ceiling if usage grows: Clerk (10k MAU free tier) |
| Kill criterion | If Slice 0 isn't deployed in 30 days → descope to Builder OS |

---

## Entries

### D-001 — Holdings-first core journey

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** v1's critical path is onboarding (household → members → holdings) → personal dashboard. The instrument library is secondary, reached via nudges/Explore.
- **Rejected alternative(s):** Library-first (browse instruments before adding holdings); demo-first (populated demo dashboard with no signup, convert later).
- **Why:** Fastest route to the "aha" moment (seeing your own household visualized) drives onboarding completion and retention; literacy content should support that moment, not gate it.
- **Revisit if:** Onboarding completion rate badly misses the 60% target and demo-first analysis suggests friction, not content, is the cause.

### D-002 — Manual value entry only, no auto-pricing in v1

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** All holdings (including MF, gold, crypto) use manual current-value entry in v1. No mfapi.in/CoinGecko/gold API integration.
- **Rejected alternative(s):** Auto-price for MF only; auto-price for all three as originally scoped in the 2026-06-14 brainstorm.
- **Why:** The dashboard's core value (allocation visualization, completeness score) doesn't require live prices. Avoids 3 external API integrations, rate-limit/CORS/failure handling, and `price_source` reconciliation for no v1-critical gain.
- **Revisit if:** User feedback shows stale values are a credibility problem, or v1.5 scope is being planned.

### D-003 — Cut demo-household button from v1

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** No demo-household / demo-mode feature in v1.
- **Rejected alternative(s):** Full switchable demo mode (originally scoped); minimal seeded-demo-household-via-real-path link.
- **Why:** Conflicts with the holdings-first journey (D-001) — would reintroduce a second, parallel critical path requiring a demo/real mode flag. Real onboarding is only 3 steps, so it serves the same recruiter-viewing purpose without dual-path complexity.
- **Revisit if:** Recruiter/portfolio feedback indicates the 3-step onboarding is too much friction for casual viewers.

### D-004 — Repo visibility: public

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** The app repo is public.
- **Rejected alternative(s):** Private with a sanitized public case-study mirror; private only.
- **Why:** This is an explicit PM portfolio piece — a private repo means the decision-log narrative can't be verified firsthand, only described. Also forces real secret/security hygiene now.
- **Constraint this creates:** No real household financial data (including Gaurav's own) may ever be committed or seeded — sample/demo data must be synthetic.
- **Revisit if:** Never, without a strong reason — this is foundational to the portfolio-piece goal.

### D-005 — Analytics: keep both PostHog and internal `analytics_events` table

> **SUPERSEDED 2026-08-01 by D-012.** This decision was never implemented. The internal table was defined in the schema but no code ever wrote to it. Read D-012 before relying on anything below.

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** Use both PostHog (funnels/retention dashboards) and the internal Postgres `analytics_events` table (North Star funnel), via one shared `track()` wrapper.
- **Rejected alternative(s):** Internal table only + Sentry; PostHog only (dropping the internal table from the data model).
- **Why:** Gaurav's explicit call, overriding the YAGNI-leaning recommendation (internal-only) — wanted both the dashboard convenience of PostHog and full ownership/queryability of the internal table for the Completeness Score calc.
- **Revisit if:** The duplicate event-logging maintenance becomes a real burden relative to v1's size.

### D-006 — Success metric numeric targets

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** Onboarding completion 60%, 14-day return 25%, Completeness Score +1 tier within 30 days for 50% of households. Demo-household metric dropped (feature cut, D-003).
- **Rejected alternative(s):** No numeric targets (research-question-only framing); aggressive targets (80%/40%/70%).
- **Why:** Conservative targets chosen deliberately — this is a brand-new, unmarketed v1 with zero prior data; a bar you clear or badly miss is informative, an aggressive arbitrary bar is not.
- **Revisit if:** After 30 days of real usage data, recalibrate against actuals.

### D-007 — Recruiter signal: craft + architecture, not transparency-narrative-led

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** The primary recruiter pitch is visual/UX craft (PWA polish, install flow, dark mode) plus backend architecture (Hono + Drizzle + Neon + Clerk, real multi-tenant schema). The decision-log/"Why these choices?" transparency angle still exists but is secondary.
- **Rejected alternative(s):** Judgment/transparency-led signal as the primary pitch (what got cut and why).
- **Why:** Gaurav's explicit choice — picked both craft and architecture options over the transparency-led option offered.
- **Revisit if:** —

### D-008 — Cost ceiling and kill criterion

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** ₹0/month target infra cost (free tiers only); Clerk's free tier (10k MAU) is the first limiter if usage grows. Kill criterion: if Slice 0 isn't deployed within 30 days, descope to Builder OS.
- **Rejected alternative(s):** Higher ceiling (₹3,000–5,000/mo) to allow paid tiers from day one; longer kill window (60–90 days).
- **Why:** Zero real users at launch means zero justified spend. 30 days is tight enough to force momentum given this project has already had two scope pivots (private viewer → public PWA → this scoped v1) — the past-mistakes pattern here is exactly stalled momentum across pivots.
- **Revisit if:** Real usage emerges and free-tier ceilings are actually hit.

### D-009 — Completeness Score and nudge mechanism

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** Fixed 5-check, equal-weight checklist (member coverage, emergency-fund-equivalent holding, both parents' protection logged, ≥3 of 6 asset classes, all holdings have `current_value`) → tier (0–1/2–3/4–5). Single inline nudge = first unmet check in this fixed order, linking to its learn-card.
- **Rejected alternative(s):** Weighted checklist (e.g., protection checks weighted double); deferring exact checklist items to Phase 2.
- **Why:** Mirrors the gating logic already proven in Gaurav's own household plan (`ACTIONS.md`'s protection-gates-block-scale-ups pattern), generalized to any household. Deterministic and needs no weight-tuning with zero usage data.
- **Revisit if:** Real usage shows the fixed order misprioritizes for some household shapes.

### D-010 — Instrument library scope: 30 instruments

- **Date:** 2026-06-23
- **Phase:** 1 Solution
- **Decision:** 6 sections × 5 instruments = 30 total (Equity, Debt, Gold, Hybrid/Guaranteed, Real Estate, Alternative).
- **Rejected alternative(s):** 6×7=40 (high end of original brainstorm range); 4 sections × 5 = 20 (cutting Real Estate and Alternative to v1.5).
- **Why:** 30 covers every instrument already in Gaurav's own household plan (SSY, GPF, LIC, gold, ETH, land) — validated against a real household — while staying bounded enough to finish within the 30-day Slice 0 kill criterion (D-008).
- **Revisit if:** Content-writing for 30 instruments turns out to be the long pole anyway; reconsider for v1.5 expansion only, not a v1 cut.

### D-011 — Do not add emergency-fund / term-insurance learn-cards; make the nudge analytics honest instead

- **Date:** 2026-07-28
- **Phase:** 5 Testing / post-feature-complete
- **Decision:** Keep the library at 30 instruments (D-010 stands). Close the Slice 7 review finding — "`learn_card_slug` carries route sentinels, diluting that PostHog field" — by adding a `target_type` (`'learn_card' | 'route'`) property to `nudge_shown` and `learn_card_clicked`, sourced from a single `NUDGE_TARGET` map in `server/lib/nudge.ts`.
- **Rejected alternative(s):** Adding dedicated emergency-fund and term-insurance instruments (30 → 32) and pointing the affected nudges at them — the fix assumed when the finding was first logged.
- **Why:** Two reasons, one measured and one structural. **Measured:** the fix would not have closed the finding. Only *one* of six nudge destinations (`emergency_fund` → the fixed-deposit page) resolves to an instrument page at all; the other five navigate to `/portfolio`, `/profile` and `/explore` (see `NUDGE_HREF` in `nudge-card.tsx`). Adding two cards would have converted exactly one sentinel and left four, so the field would still have needed a hardcoded route-name list to interpret. **Structural:** neither concept is an asset class. The library's six categories are an investment taxonomy; term insurance is a protection product (already modelled in the `protection` table), and an emergency fund is a *purpose* attached to a holding — already modelled as the `is_emergency_fund` flag. Forcing both into the instrument taxonomy to satisfy an analytics field would have bent the domain model to serve telemetry. The one insurance-adjacent instrument that does exist (`hybrid-traditional-insurance`) is the exact product class this project rejects on principle, so it is not a fallback either.
- **Revisit if:** A genuine content need appears for standalone explainers that aren't instruments — in which case they belong in a separate "concepts" surface with its own routing, not appended to the 6×5 instrument grid.

### D-012 — Supersede D-005: PostHog is the only analytics sink; the internal `analytics_events` table was never built

- **Date:** 2026-08-01
- **Phase:** 6 Ship gate
- **Decision:** Drop the internal `analytics_events` write path. PostHog is the sole analytics sink. The table stays in the schema, unwritten, because the cascade-delete code and its tests reference it and removing it is a migration this project does not need. **D-005 is superseded.**
- **Rejected alternative(s):** Build the fan-out now, so D-005 is honoured as written. Rejected: it is new code introduced during a ship gate, to populate a table with no reader, when the metric it was meant to serve is already measured and verified in PostHog (North Star funnel, insight `bMF690Mf`).
- **Why:** D-005 was decided, planned, and never implemented. `src/lib/analytics.ts:45-47` is the whole of `track()`: it calls `posthog.capture()` and returns. `analytics_events` appears in exactly four files — the schema that defines it, the cascade-delete code that preserves it, and two tests — and **no code writes a row to it**. Confirmed empty in the database on 2026-08-01. Every downstream document then described the table as if it existed, including `CASE_STUDY.md`, which told a recruiter about an architecture that was never built. One artifact stayed honest: the box at `IMPLEMENTATION_PLAN.md:19` was never ticked.
- **How it survived:** the same seam-shaped failure as B-001. The Slice 9 integration test asserts `analytics_events` rows survive account deletion, and it passes — because the test inserts its own fixture row first. A green test sat on top of a table nothing populates. Nothing asserted that the application ever writes one.
- **Revisit if:** A query is needed that PostHog genuinely cannot answer, or event data must be owned outside a third party. Both were D-005's original motivations, and neither has been exercised in v1.

### D-013 — Offline scope corrected: library and `/why` only, not the signed-in dashboard

- **Date:** 2026-08-01
- **Phase:** 6 Ship gate
- **Decision:** Offline support covers the **public reading surface only** — the 30-instrument library and `/why`, both verified working offline. The signed-in dashboard is **not** offline-capable, and every document that claimed it was has been corrected. Slice 8's offline steps 6, 7, 9 and 10 are recorded as **failed**, not deferred.
- **Rejected alternative(s):** (a) Cache Clerk's remote script via a workbox runtime rule, so the library loads offline. Plausible but roughly even odds: `clerk-js` would still try to reach Clerk's API to validate the session, and an unreachable API most likely resolves to signed-out, which redirects to a sign-in screen that also cannot render. It would have meant a deploy and another human offline-toggling round to find out. (b) Render the cached dashboard without waiting for Clerk. **Rejected outright, not on cost:** it displays a household's financial data based on nothing but cache contents, with no verified session. That is the exact hazard Slice 8 step 12 exists to catch, so shipping it to satisfy step 7 would have broken step 12 on purpose.
- **Why:** The feature did not work and the project was publicly claiming it did. `/why` served a card titled *"Works offline, and says so honestly"* — which rendered perfectly offline, while the dashboard it described rendered nothing. Correcting the claim costs a line in the portfolio piece. Leaving it costs the one thing this project has consistently protected, which is that its documents can be trusted against the running system.
- **What is genuinely true, and verified 2026-08-01:** `/why` renders fully offline from precache (all 8 decision cards present in the DOM). The service worker, precache and `navigateFallback` all work. The failure is isolated to the authenticated shell.
- **Revisit if:** Clerk ships a self-hosted or bundled `clerk-js` (removing the remote-script dependency), or auth moves to a scheme that can verify a session offline. Either would make a genuine offline dashboard achievable, at which point the promise can be made again — and this time tested before it is written down.

### D-014 — Client-side encryption: the server holds only ciphertext and keys it cannot open

- **Date:** 2026-08-01
- **Phase:** Post-ship feature cycle
- **Decision:** Encrypt household data in the browser. The server stores an opaque envelope per row and two wrapped copies of a data key it can never unwrap. Locked sub-decisions, **not to be reopened**: encrypt each row's whole payload into **one column**, not field by field; the key comes from a **passphrase separate from the Clerk login**, because Google sign-in means there is no password we ever see; recovery is a **one-time code shown at signup with no server-side copy and no account recovery**; the wrapped key lives on the server so **any device** can unlock it; old data is **wiped by hand with no backfill code** (a backfill would have to run in a browser and be thrown away after one use); onboarding leads with the passphrase screen; KDF is **PBKDF2-SHA256 at 600,000 rounds**, with a stored `kdf_alg` column so Argon2id can replace it without rewriting data; the key is held in **IndexedDB as a non-extractable `CryptoKey`**, never as raw bytes and never in `localStorage`.
- **Rejected alternative(s):** A server-held key (ruled out by the goal — the server must not be able to decrypt at all). Field-by-field encryption (more ciphertext, more leak surface, no benefit once the row is the query unit). Postgres RLS or disk encryption (both leave the operator able to read everything, which is the specific thing being removed). Reusing the Clerk password as the key (does not exist for Google SSO users).
- **Why:** The app asks strangers for their net worth. Data separation was application code only — Hono reading `household_id` from the session, with no RLS behind it — so correct route code was the sole barrier between families, and anyone with database access could read names, dates of birth and full portfolios. *"We cannot read your data"* is the product's main selling point, and it cannot be claimed unless it is structurally true. Doing it now was close to free: one real household and one test account.
- **The claim, stated honestly:** it is **"we cannot read your data"**, not "this is impossible to break." We serve the JavaScript, so a bad build could in theory take the key. Proton and the Bitwarden web vault share this limit. Marking the key non-extractable stops a script copying it out; it does **not** stop a script on our own origin calling decrypt with it. A strict CSP and idle auto-lock reduce this and do not remove it. **This limit is accepted deliberately and must not be hidden in the copy.**
- **What the server still learns, in full:** how many holdings, members and protection records a household has; when each row was created and changed; which household is active and how often. **Row size does not leak** — payloads are padded to the next 256-byte multiple before encryption, because AES-GCM output is input size plus 16 bytes and the raw length would otherwise reveal the rough size of an amount and the length of a name.
- **Two structural consequences:** (1) `holdings.instrument_id` stops being a foreign key; the browser already downloads the public instrument library and matches on the client. (2) The `version` column is both the anti-replay term in the four-part AAD (`table_name || household_id || row_id || version`) and the optimistic-concurrency check, replacing last-write-wins — without it two phones silently overwrite each other's whole encrypted row with no way to merge.
- **Hard prerequisite:** Neon backups, upgraded from follow-up to blocker. After the destructive step a lost `household_keys` row means data nobody can ever read again, **even from a perfect database backup**.
- **Accepted cost:** users now carry a second secret on top of their login, on a product targeting 60% onboarding completion. A PostHog event on the key-setup screen measures the drop-off rather than guessing at it. Analytics also loses `asset_class`, `allocation_summary` and tier-change properties, which weakens the North Star funnel (insight `bMF690Mf`) — reworking it is tracked separately.
- **Revisit if:** the XSS limit becomes unacceptable for a claim being made publicly (the answer is a different delivery model, not a different cipher), or a feature genuinely requires server-side computation over plaintext — in which case the trade-off is the product promise itself and this decision, not the implementation.

---

## D-015 — Preview gets its own CSP, and sign-out ends the key's life (2026-08-04)

Two decisions taken while building step 11's rehearsal environment. Both amend D-014 rather than
replacing anything in it.

### The preview CSP is a second, mutually exclusive header rule

**Decision.** `vercel.json` now carries three `headers` entries: the production CSP guarded by
`missing: [{ type: 'host', value: '.*\\.vercel\\.app' }]`, a preview CSP guarded by `has:` on the same
pattern, and the three non-CSP security headers shared by both. The preview policy is the production
policy with `https://clerk.finance.gauravg.dev` replaced by `https://*.clerk.accounts.dev` and
nothing else changed.

**Why a preview needs its own policy at all.** A Clerk *production* instance is pinned to
`clerk.finance.gauravg.dev` by DNS, and `*.vercel.app` cannot take custom DNS — the same wall that
kept Finding 2 open for weeks. So a preview must use the Clerk *development* instance, which serves
from `*.clerk.accounts.dev`, a host the production `script-src` blocks. Without this, a preview
cannot sign in, and step 11's whole purpose is to exercise the signed-in surface.

**Why mutually exclusive, and why `missing` on the production rule.** Vercel applies *every* matching
`headers` entry, and two `Content-Security-Policy` response headers are enforced as their
**intersection** — so a widened policy sitting beside a strict one buys nothing and fails
confusingly. Guarding production with `missing` rather than a second `has` also keeps it
**fail-closed**: a host matching neither rule still receives the strict policy instead of no policy
at all.

**Rejected — a `VERCEL_ENV`-conditional build step.** Vercel parses `vercel.json` from the source
tree to configure the deployment; mutating it inside `buildCommand` has no effect on the headers the
edge network serves. The only build-time escape is a `<meta http-equiv>` tag, which cannot express
`frame-ancestors` and *intersects* with the header policy rather than replacing it — so it can only
make preview stricter, which is the opposite of what is needed. Recorded so it is not re-proposed.

**Rejected — one shared, widened policy.** Puts `*.clerk.accounts.dev` into production permanently to
solve a preview-only problem.

**Guarded by tests, not by intent.** `csp-policy.test.ts` previously took the first CSP header it
found; with two in the file that would have silently begun asserting the preview policy while
reporting green. It now selects the production rule by its guard, with its four original assertions
untouched. Three new tests: preview must equal production with only the Clerk host swapped, exactly
one rule may widen and both must be host-guarded, and preview keeps every hardening directive.
Mutation-tested — injecting `'unsafe-inline'` into the preview `script-src` fails two of the three.

**Deliberately absent: `challenges.cloudflare.com`.** Clerk's sign-up screen is Turnstile-gated and
this policy almost certainly blocks it — but the CSP has never been served in production
(`719d022` predates it), so the rehearsal is the first chance to *observe* that rather than guess.
If step 11 shows the refusal it goes into both policies with the console transcript as evidence.

### Sign-out clears the vault; the idle lock is no longer its only eviction path

**Decision.** `Profile.handleSignOut` now calls `clearVault()` alongside the existing
`clearDashboardCache()`. Guarded — a failure is reported to Sentry and `console.error` and the
sign-out proceeds.

**Why.** `clearVault()` had exactly one production call site, `idle-lock-guard.tsx:33`. Sign-out
ended the Clerk session and blanked the screen — `<SignedIn>` unmounts — while the data key stayed
in IndexedDB, surviving the tab, the browser restart and every route change. Signing out and back in
on the same device reopened every decrypted number with no passphrase, which is not what the Unlock
screen promises. The function already made the shared-device argument in the comment above
`clearDashboardCache()`, and then applied it only to the copy of the data rather than to the thing
that decrypts it.

**Why guarded rather than awaited plainly.** The unguarded version was shipped-and-caught in the same
session and was *worse than the bug*: IndexedDB rejects in some private-browsing modes and on a
corrupted store, so sign-out became impossible exactly where it was most likely to fail — removing
no key while trapping someone in a session they asked to leave. Fail-closed is right for a gate and
wrong for teardown. Reported loudly rather than swallowed, because a key that outlived its sign-out
must not fail silently either.

**Scope.** D-014's server-side claim is unaffected — this was always local key lifetime on a shared
device, never anything the server could see. The `/privacy` leak list needs no change.

---

## D-016 — Strategy ledgers, capped AI counsel, instrument-aware bulk import, and a full-platform redesign (2026-08-17)

- **Date:** 2026-08-17
- **Phase:** Post-ship feature cycle, pre-Phase-0 for this feature set
- **Decision:** Four amendments to v1 scope, approved by Gaurav against a design-concept artifact (mint/treasury visual language, not yet implemented):
  1. **Strategy ledgers.** "Current" stays the untouched baseline household plan. A user may create additional ledgers layered on top of Current, each able to add, modify, or remove instruments independently, compared against Current rather than replacing it. This is the structural answer to the "one static plan" limitation flagged 2026-08-17.
  2. **AI counsel and goal planner, capped.** Both non-goals reversed (see `SOLUTION_BRIEF.md` amendment, same date). Backed by Gaurav's own Anthropic API key — **location not yet confirmed in this repo or its documented env vars; must be located or provisioned before Phase 1, not guessed.** Hard usage cap: **maximum 2 plans per household, maximum 2 edits per plan.** The cap is the entire cost-control mechanism; there is no other rate limit specified.
  3. **Bulk import template is instrument-aware.** The downloadable Excel template ships prefilled with every applicable instrument name and its relevant fields (not a blank grid), so a filled-in sheet's columns match the schema on return.
  4. **Full-platform redesign.** The mint/treasury visual language (see design-concept artifact) is not scoped to Dashboard/Explore/Portfolio/Goal-planner alone — it extends to onboarding, Profile, and instrument detail once approved, so the product does not end up with two visual languages.
- **Rejected alternative(s):** A dark-forward "Wealth Studio" visual direction (single vivid accent on a navy base) — rejected by Gaurav in favor of a treasury/mint theme with light and dark treated as two independently-designed materials, neither inverted from the other. An uncapped or usage-metered AI layer — rejected in favor of a fixed per-household ceiling, since it needs no metering infrastructure and bounds the cost exactly. A migration path binding new ledgers into the Current household row — not discussed; Current stays the protected baseline and everything else is additive, per Gaurav's explicit instruction.
- **Why:** Resolves the budget conflict flagged 2026-08-17 (root `memory/decisions.md`, same date) between the ₹0/month ceiling and an AI-backed layer — a fixed per-household cap keeps the paid dependency bounded and auditable rather than open-ended. The strategy-ledger model is the direct structural expression of Gaurav's stated core reframe: the product's job is modeling multiple what-if strategies against current and future holdings, not maintaining one static record.
- **Open items, explicitly not resolved by this decision:** exact Anthropic API key source/provisioning; real cost estimate for the capped usage; whether the bulk-import template's prefilled member names interact with the client-side-encryption stance (D-014) — a downloaded file containing household member names is plaintext outside the encrypted boundary by construction, and this decision does not yet say whether that is acceptable, only that the template will carry the names.
- **Revisit if:** the Anthropic API key cannot be located/provisioned before Phase 1 begins (blocks the AI counsel and goal-planner items specifically, not the ledger/import/redesign items) — or if the 2-plans/2-edits cap proves too restrictive against real usage once live.
