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

---

## D-017 — Phase 0 Read-Back approved: encryption stays intact via a thin server proxy, and every D-016 ambiguity resolved (2026-08-17)

- **Date:** 2026-08-17
- **Phase:** 0 PRD Intake, Read-Back gate — **approved**
- **Decision:** Gaurav approved the D-016 feature-bundle Read-Back (`SOLUTION_BRIEF.md` §"Phase 0 Intake — D-016 Feature Bundle") with the following resolutions to its nine named ambiguities and the architectural conflict:
  1. **Encryption model extended, not broken.** The database keeps storing ciphertext only (D-014 unchanged). Decryption still happens only in the browser. The Anthropic call cannot be a direct browser-to-Anthropic request — that would ship the secret API key to every client. Resolution: the browser decrypts locally, sends plaintext over TLS to a new thin server route, that route immediately forwards it to Anthropic and relays the answer back, and **writes nothing to Neon and nothing to logs**. The server sees plaintext in flight for the duration of one request only, never at rest. This is a genuine, narrow exception to "the server cannot read your data" and must be stated as such on `/privacy`, not folded silently into the existing claim.
  2. **The usage cap counts AI-driven actions only.** Manual edits to a plan (a user typing a different amount, adding a holding by hand) never count against the 2-edits-per-plan cap. This rule applies to every future usage restriction in this app, not just this one — the caps exist to bound Anthropic API calls, never to bound how a household uses its own data.
  3. **Cap scope is per household, not per user**, for now. Revisit with real usage data once the app has any (no schema decision that assumes user-level caps).
  4. **Cap-hit behavior is a soft message, not a block.** When a household exhausts its cap, manual editing stays fully available; only the AI action is disabled, with copy naming the limitation and pointing at a paid tier "coming soon" — no specific price, date, or feature list promised yet, since none exists.
  5. **Plans and ledgers are the same object.** Every strategy ledger (including one born from an adopted goal-planner draft) gets the same view: an allocation donut, the emergency-fund Reserve treatment, and the same summary details as the Current baseline. There is no second, lesser view for AI-originated plans.
  6. **Instrument drift is disclosed, not silently absorbed.** If an instrument referenced by an existing ledger later changes or is removed from the library, the ledger keeps its original data untouched and displays a prominent warning (bold, red-toned) describing what changed since the ledger was created. Never delete or silently reconcile a ledger's historical reference.
  7. **Full-platform redesign explicitly includes the landing page**, reopening what shipped 2026-08-12. Gaurav's own words: even after approving that redesign, "the final design was still not good enough to be launched in public... I'm the only user till date and even I tried the platform just now only because the design is way too basic and way too boring for any user to give a try." The landing page is not exempt from the mint/treasury language on the theory that it was "already done."
  8. **Build order:** strategy ledgers land first (data model plus the ledger UI), since the AI counsel, the goal planner, and the redesigned dashboard mockup all assume ledgers already exist.
  9. **Bulk-import template PII exposure accepted, not blocked.** The template ships prefilled with member names as D-016 already decided. The downloaded file is plaintext outside the encrypted boundary the moment it lands on a device — an accepted, disclosed risk analogous to the AI-call exception above, and gets its own line wherever that exception is documented (`/privacy`, the download UI's copy).
- **Rejected alternative(s):** A direct browser-to-Anthropic call with a scoped/short-lived token — not raised by Gaurav, ruled out here as strictly worse than the thin-proxy approach for no benefit, since it still requires a server-issued credential per call. A hard paywall block on cap-out — rejected in favor of the softer "limitations, paid tier coming soon" message, since the free product still needs to function fully on manual entry. User-level (not household-level) caps — deferred, not rejected, pending real usage data.
- **Why:** Every resolution here either protects an existing hard constraint (D-014's encryption claim, kept true in substance even though the AI feature is a narrow, disclosed exception) or narrows an open question to the smallest change that satisfies Gaurav's stated intent, so Phase 1 does not inherit ambiguity that was already resolvable.
- **Revisit if:** real usage shows the per-household cap needs to move to per-user, or the thin-proxy design turns out to need persistence (e.g., streaming responses that must be resumable) — at which point the "never at rest" claim needs re-examination before it ships, not after.

**Gate status: Phase 0 Read-Back approved 2026-08-17.** ~~Phase 1 (Solution Stage interview) is queued but deliberately not started this session~~ — **run 2026-08-17 in a fresh session as asked. See D-018.**

---

## D-018 — Phase 1 Solution Stage resolved for the D-016 bundle (2026-08-17)

- **Date:** 2026-08-17
- **Phase:** 1 Solution Stage — **draft complete, gate not yet passed**
- **Decision:** Eight questions run against the D-017-approved read-back, scoped to this bundle only. Full brief in `SOLUTION_BRIEF.md` §"Phase 1 Solution Stage — D-016 Feature Bundle"; metrics in `METRICS_PLAN.md` §"D-016 Feature Bundle — Metrics".
  1. **Journey.** A tab strip above the dashboard (`Current | ledgers | + New`) plus a two-field modal (name, blank-or-copy). Gaurav's words: "option A for now, we will capture usage data for this to see whether people are even using this or not" — so ledger creation and switching are instrumented as first-class adoption events, not just rolled into the success criteria.
  2. **Slice 1 is thin.** Tab strip, create, fully editable per-ledger dashboard, and a compare strip showing the delta against Current on three numbers only (total value, equity share, monthly SIP). **Cap: four ledgers plus Current**, a fixed constant in both schema and copy. No side-by-side view.
  3. **Two proposed non-goals were rejected and promoted to goals.** Gaurav: "#2 and #5 needs to be goals since they add value to the users."
     - **Projections** are in scope as a per-ledger compound-growth line: one user-overridable annual return rate per asset class, a user-chosen horizon, deterministic maths, no AI, available on every ledger including Current. This **reopens an explicit v1 non-goal** and is recorded here as a deliberate scope expansion rather than absorbed silently. It does not need the historical snapshots the v1 non-goal cited, because it projects forward from present values.
     - **AI suggestions may target Current**, under reading 1 of two offered: the AI proposes an edit to Current as a card and nothing changes until Apply is tapped. This widens the target from draft ledgers to Current included, and is **compatible with D-017 §5 and the standing Apply-or-Dismiss rule, so D-017 is not amended.** Reading 2 (more direct writes to Current) was offered and not taken.
  4. **Ledger storage is a full encrypted snapshot.** `ledger_id` on the holdings table, `is_baseline` marks Current, creation copies every row under the same household data key. **Editing Current after a ledger exists does not propagate into that ledger** — confirmed explicitly, and it must be stated in the ledger tab copy with the snapshot date.
  5. **AI model is `claude-sonnet-5`** with structured outputs, through the D-017 thin proxy. Gaurav: "use claude sonnet models for the proxy, keep it cheap." Measured, not estimated: roughly 4k input and 1k output per call at $3/$15 per Mtok is about $0.027 (roughly ₹2.40), so the per-household worst case at the cap is about ₹14.
  6. **Seven falsifiable success criteria**, the five drafted in Phase 0 plus a return-usage clause on the ledger criterion and one each for projections and AI-on-Current. Full event list in `METRICS_PLAN.md`.
  7. **Recruiter signal leads with the encryption exception decision**, redesign as supporting craft. Gaurav: "A, and put it on both /why and /privacy." Both pages get the section, not just `/privacy`.
  8. **Risk register of eight**, with the regulatory reading of projections named as the largest and explicitly not softened.
- **Cost and Kill budget** (mandatory field, both values, no TBDs):

  | Budget | Value |
  |---|---|
  | Max monthly infra cost | ₹0 across Neon, Vercel, Clerk, PostHog, Sentry. Plus Anthropic on `claude-sonnet-5`, bounded by the 2 plans x 2 edits per household cap rather than by a monthly figure. Roughly ₹2,800 lifetime at 200 households. First free tier to bite remains Clerk at 10k MAU |
  | Kill criterion | **None. Replaced by a checkpoint:** review ledger slice 1 progress 30 days after the first commit, with no automatic descope and no forced action |

  **The absent kill criterion is a deliberate deviation from the Blueprint contract, recorded as one.** The framework makes this field mandatory. A 30-day hard descope was proposed (keep ledgers and the redesign, drop AI and bulk import), Gaurav declined it — "no need for kill criterion, rest all is agreed" — and when the deviation and its history were put to him directly he chose the softer checkpoint over both a hard criterion and a blank field. The counter-argument is on record and should not be re-litigated without new evidence: v1's own risk register credits the 30-day Slice 0 deadline with breaking a stall pattern that had already cost this project two scope iterations, and risk 2 of this bundle is that same pattern, still open. The checkpoint keeps a date on the calendar without an automatic action attached.
- **Rejected alternative(s):** A separate "Strategy Lab" page and AI-only ledger creation (Q1). A side-by-side compare view in slice 1, and ledgers with no comparison at all (Q2). Making projections and AI-on-Current non-goals, and the more-autonomous reading of AI writes to Current (Q3). Delta-overlay ledger storage and client-only ledgers (Q4). Claude Haiku 4.5, Claude Opus 5, and a split Haiku-plus-Sonnet routing for the proxy (Q5). Dropping the cap-exhaustion metric (Q6). Leading the portfolio pitch with either the AI layer's discipline or the redesign (Q7). A hard 30-day descope, and a silently blank Cost-and-Kill field (Q8, Q8a).
- **Why:** Each answer takes the smallest change that satisfies the stated intent. Slice 1 is deliberately thin because Gaurav's own Q1 answer made adoption an open question, and the most expensive item in the bundle (the compare view) is the one most cheaply deferred behind a usage signal. Full snapshots win over overlays because the server cannot diff ciphertext regardless, so an overlay buys nothing and costs every read path. Sonnet 5 wins because at this volume the cap, not the model, is the cost control.
- **Open items, explicitly not resolved:** **No Anthropic API key exists anywhere in this environment.** Project `.env*` files, the whole `~/.claude` tree, and other project memories were searched on 2026-08-17 and found nothing. One must be minted at console.anthropic.com (or its location disclosed) and set in Vercel Production env only. This blocks implementation of the AI counsel, the goal planner, and the soft cap message. It does not block ledgers, projections, bulk import, or the redesign, and it did not block scoping any of them. Also open: whether the projection horizon is a free field or presets; whether the proxy ever needs streaming (which would reopen D-017's "never at rest" claim).
- **Revisit if:** `ledger_switched` shows real multi-ledger usage (then the side-by-side compare view comes back off the non-goal list), or criterion 7 lands below 30% (then AI targeting Current gets reverted to ledgers only), or the 30-day checkpoint finds slice 1 not deployed (then the descope conversation happens with evidence rather than in advance).

**Gate status: PASSED 2026-08-17.** Gaurav: "Solution approved." Phase 2 (Design) is unblocked and not started.

**Key provisioning, resolved 2026-08-17.** `gopass` is installed at `C:\Users\Gaurav Gupta\AppData\Local\gopass\gopass.exe`, just not on this session's PATH — the earlier "not found" was a PATH gap, not a missing install. Store confirmed at `G:\My Drive\gopass-store.git`. `gopass ls` shows no `financial-planning/ANTHROPIC_API_KEY` entry; several other projects have their own (`life-os/api`, `telegram-bot`, `group-travel-pwa/backend`, plus two in `archive/`). Gaurav chose to **reuse `group-travel-pwa/backend/ANTHROPIC_API_KEY`** rather than mint a fresh, project-scoped key. This is the key the D-017 thin proxy pulls into Vercel Production env when the AI slice is actually built (Phase 4) — not fetched or set yet, since Phase 2 (Design) hasn't started. Reusing a key shared with another project means usage and billing are not isolated per project; worth a line in that build slice's own risk note if it matters later, not a blocker now.

---

## D-019 — Phase 2 Design: Stage 0 approved, Stages 1–5 explicitly skipped (2026-08-24)

- **Date:** 2026-08-24
- **Phase:** 2 Design — **Stage 0 gate passed; Stages 1–5 deliberately not run**
- **Decision:** Ran Stage 0 (Data Model) against the approved D-016/D-017/D-018 brief — appended to `Documentation/design/DATA_MODEL.md` under "D-016 Bundle Additions": a new `ledgers` table (household → ledgers → holdings, replacing the direct household → holdings edge), `holdings.ledger_id` with a migration backfilling one `Current` baseline ledger per existing household, soft-delete (`is_active`) plus `updated_at` on `instruments` for drift detection, a new `ledger_projection_settings` table for the deterministic compound-growth line, and an `ai_plans_created` counter on `households` for the AI cap. Gaurav approved the data model but chose to **skip Stages 1 through 5** (Brainstorm, Interview, Wireframes, Design System, Spec Doc) and go straight to Phase 3 Plan, since the mint/treasury visual language was already built and approved as a design-concept artifact in D-016, and the existing v1 design system (`brand-guide.md`, `tokens/`, `COMPONENT_SHOWCASE.md`) already covers tokens, components, and the inevitability test for a product that already shipped — re-running those stages from scratch would re-litigate an already-approved direction, not produce a new one.
- **Rejected alternative(s):** Running the full 7-stage process regardless, on the theory that a mandatory gate list has no override — rejected by Gaurav directly; he owns scope and pace, and DESIGN_FRAMEWORK.md's stage list exists to prevent code before design decisions, not to force a redundant restatement of an already-locked design language.
- **Why:** Same class of deviation as D-018's kill-criterion call — a mandatory framework field/stage, deliberately shortened with the reason on record, not silently skipped.
- **Consequence, accepted as a gap:** wireframes for the new ledger-specific screens (tab strip, new-ledger modal, projection view, AI suggestion card, drift banner, bulk-import flow) are **not** laid out before Phase 3 planning starts. The State Matrix rows added to `DATA_MODEL.md` describe states, not layouts. Phase 3's plan should flag any screen where layout ambiguity blocks a task from being written concretely, and route back to a targeted wireframe pass for that screen only rather than reopening all of Stage 3.
- **Revisit if:** Phase 3 planning hits a screen where "what does this look like" blocks writing a task — at that point run a scoped Stage 3 pass for that screen alone, not the full stage.

**Gate status: Stage 0 approved 2026-08-24. Stages 1–5 skipped by explicit decision. Phase 3 (Plan) is next.**

---

## D-020 — Ledger delete on Current unblocked; ledger name encrypted, reversing D-016 (2026-08-24)

- **Date:** 2026-08-24
- **Phase:** 4 Build, Chunk 1 follow-up review — two small decisions from the same session with Gaurav
- **Decision:**
  1. **Delete now works on the Current (baseline) ledger.** The server was always safe — `deleteHolding` was deliberately never baseline-aware — but `src/components/holding-form.tsx` gated the affordance on `canDelete = editing && Boolean(ledgerId)`, and the baseline tab passes no `ledgerId`, so Current was blocked for no server-side reason. The `ledgerId` half of that condition is dropped, leaving `canDelete = editing`; the confirm copy now names the ledger ("Remove this holding from Current? This can't be undone."); the `ledger_edited` analytics event stays guarded by `if (ledgerId)` on the delete path, so a Current-ledger delete fires no event, matching how Current edits were already excluded.
  2. **Ledger names are now client-side encrypted**, reversing D-016's explicit "ledger name stays plaintext" design call. Migration `0005_luxuriant_aqueduct` is purely additive plus one relaxation: `ALTER TABLE "ledgers" ALTER COLUMN "name" DROP NOT NULL`, `ADD COLUMN "ciphertext" text`, `ADD COLUMN "iv" text`, `ADD COLUMN "alg" text`, `ADD COLUMN "version" integer DEFAULT 1 NOT NULL`. Server: `createLedgerSchema` extends `encryptedCreateSchema`, so a plaintext `name` is now rejected as an unknown key (verified empirically — `.extend()` inherits Zod strictness). `serialize()` returns `name` and the envelope together. Client: `src/lib/ledgers-api.ts` seals `{ name }` under a new `LEDGERS_TABLE = 'ledgers'` AAD binding via `sealRow`, unseals via `decryptWireRow`/`decryptWireRows`, mirroring `holdings-api.ts`; the 60-character max-length check moved client-side since the server can no longer read a name.
  - **The baseline row is the one exemption, by design.** `ensureBaselineLedger` writes `'Current'` server-side before the user has necessarily unlocked their vault, and it is not user data, so that row keeps a plain `name` with null envelope columns forever. Every non-baseline ledger stores `name = null` with the envelope populated.
- **Why the reversal carries no product-facing change:** production holds exactly one ledger row (the baseline "Current"), and this branch (`d016-ledgers`) has never been merged to `main`, so no user has ever created a second ledger or ever seen a ledger name stored as plaintext. There was no legacy plaintext ledger data to migrate or delete. This is purely internal encryption hardening, not a response to any observed exposure.
- **Rejected alternative(s):** Leaving ledger name plaintext as D-016 originally called it — rejected once the reversal was recognized as free (no user-facing state to migrate) and consistent with the rest of the household data model, where D-014 already encrypts everything else client-side.
- **Status:** Migration `0005` is generated, committed, and **not applied to any database, including production.** `deleteHolding`/`holding-form.tsx` changes and the ledger-name encryption changes are committed on `d016-ledgers` and **not merged to `main`**; production remains pre-D-016 code with schema at `0004`. Suite **1151/1151** across 90 files, typecheck clean (baseline before this work was 1136/1136).
- **Revisit if:** this branch is promoted and the migration is applied — at that point verify the baseline-row exemption still holds against real production data (the "Current" row for the one existing household), not just against test fixtures.

---

## D-021 — Explore "+ Add" deferred to a follow-on PR; the prefill flow it was told to reuse does not exist (2026-08-25)

- **Date:** 2026-08-25
- **Phase:** 4 Build, D-016 Slice 5 (full-platform mint/treasury redesign), Chunk 4
- **Decision:** **Chunk 4 ships as a visual retint only. The "+ Add" entry point on Explore instrument cards, and its `explore_holding_added` telemetry, are deferred to their own follow-on PR.** This takes the split the Phase 3 plan already pre-authorized in Chunk 4's own scope flag ("ship the visual retint of Explore's cards now, defer the '+ Add' entry point (and its telemetry) to its own follow-on PR"), so it is a planned option being exercised, not a mid-slice descope.
- **Why: the approved plan rested on a flow that was never built.** Chunk 4's dispatch step said to "confirm the existing add-holding form's prefill mechanism (used by instrument-detail today) and reuse it verbatim — no new form, no new endpoint." Read directly from source, that mechanism does not exist:
  - `src/pages/InstrumentDetail.tsx` has no "Record this in my plan" CTA. The string appears only in `COPY_DECK.md`, `SPEC.md` and `WIREFRAMES.md` — specced in v1, never implemented.
  - `src/components/holding-form.tsx` exposed only `initialHolding?: Holding` (whole-holding **edit** mode). There was no instrument-only prefill prop.
  - `HoldingForm` renders from exactly two places, both authenticated: `OnboardingStep3.tsx` and `Portfolio.tsx`. There is no path from a public `/explore` route into it.
  - This corroborates `app/CLAUDE.md`'s public-showcase backlog item (4), "One-click add-from-instrument-library", still listed as pending/not started.
  Building that mechanism is materially more scope than the approved "no new form", on the one chunk the plan had already flagged as carrying new interactive behaviour. Per the standing rule, it routes back rather than being absorbed silently.
- **Note on the Phase 3 gate review, for future gate discipline:** the gate scored Chunk 4 "PASS, after one correction" and tagged the interaction shape `[P] — read directly`, having verified the shape of the interaction against the folio's Plate III copy and against `holdingPayloadSchema`. It never checked that the flow it instructed the chunk to *reuse* existed. **A `[P]` tag on "what this should do" is not a `[P]` tag on "the thing it builds on is there."** Verifying a reuse target's existence belongs in the gate's boundary-contract check.
- **Rejected alternative(s):** (a) Build the missing prefill mechanism inside Chunk 4 and merge it — rejected as unapproved scope expansion on an already-flagged chunk. Working code for this path exists and is preserved, unmerged, at commit `cc32697` on branch `d016-slice5-chunk4-quarantine` (a new `initialInstrumentId` prop on `HoldingForm` plus a new `AddHoldingSheet` component, signed-out handled via Clerk `<SignedIn>`); Gaurav directed it be left orphaned as-is, neither rebased nor deleted. It branched off Chunk 1 only, so it predates Chunks 2/3/5 and would need a rebase if ever revived. (b) Amend the Phase 3 plan in place to legitimise the extra scope — rejected as re-planning during execution.
- **Consequence, accepted:** `explore_holding_added` is defined in `METRICS_PLAN.md` but fires nowhere in source. That is a known, deliberate gap until the follow-on PR lands, not a wiring bug.
- **Revisit if:** the follow-on PR is picked up — at that point the real decision to make first is whether the instrument-detail "Record this in my plan" CTA (specced in v1, never built) should be built as the primary path, with Explore's "+ Add" as the second entry point the plan always described it as, rather than Explore's being built first against no existing path.

---

## D-022 — D-016 Slice 5 Chunk 6 (390px browser verification) not run; branch not promotable (2026-08-25)

- **Date:** 2026-08-25
- **Phase:** 4 Build, D-016 Slice 5, Chunk 6
- **Decision:** **Chunk 6 was not run and is NOT satisfied.** Neither the Chrome browser connection nor the throwaway Neon branch was provisioned this session, and Gaurav directed that no proxy be substituted for the real thing. Chunk 6 is recorded here as **outstanding**, explicitly not as done, skipped-but-verified, or waived.
- **Why this matters more than usual:** the Phase 3 plan names Chunk 6 "mandatory gate, last, before merge — not optional, not deferrable to post-merge." The precedent is direct and recent: the D-016 ledger slice's own rehearsal found three real bugs that a fully green suite had missed, one of them a `sm:grid-cols-3` that fired at exactly 390px because this project redefines `sm` to that width. A green typecheck and a green suite are the exact evidence that failed to catch it last time, so they cannot stand in for it now.
- **Rejected alternative(s):** Substituting a static class audit or a type-check for the browser pass and calling the gate met — rejected explicitly by Gaurav. `app/CLAUDE.md` already carries an identical open item from 2026-08-12 ("reading classes is not looking at the screen"), and adding a second unverified redesign on top of the first compounds the same debt rather than clearing it.
- **Consequence:** branch `d016-slice5-mint` is **not promotable to `main`**. Since `main` auto-deploys, promoting it would put four retinted screens into production having never been rendered at the project's own primary phone width.
- **Revisit if:** the Chrome extension is connected and a throwaway Neon branch is provisioned — then run Chunk 6's four dispatch steps as written, in both light and dark mode, before any promotion.
- **Superseded same day:** Gaurav explicitly instructed promotion anyway ("merge and push current completed tasks. We will tackle pending ones in next session"), overriding this gate with the gap stated plainly beforehand. `d016-slice5-mint` was pushed to `main` at `33fce5f`, which auto-deploys — Landing, Dashboard, Portfolio, and Explore are live in the mint/brass system as of 2026-08-25 with Chunk 6 still not run. This is a deliberate, informed override, not a resolution of the finding above. Chunk 6 remains owed against the live site, not against a branch — it is now the top of `memory/project.md`'s Next up.

---
