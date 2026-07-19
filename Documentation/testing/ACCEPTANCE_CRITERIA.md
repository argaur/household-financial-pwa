# Acceptance Criteria — Household Financial Planning PWA

**Audience:** A non-technical tester. No jargon, no assumed context.
**Written:** Together with the matching `HOW_TO_USE.md` section at the end of each development slice — not at the end of the project.
**Walked through manually by Gaurav before the deployment gate; results logged per capability.**

---

## Capability: Slice 0 — Walking Skeleton (system status page)

**Setup:** Visit https://household-financial-pwa.vercel.app in any browser. No login or test data needed.

**Steps:**
1. Load the page.
2. Look at the "API + Database" row under System status.
3. Click "Fire test PostHog event."
4. Click "Fire test Sentry error."

**Expected:** Page shows "Walking Skeleton" heading on a warm off-white background. The status row shows a green "connected" badge (not red/error). Both buttons show a confirmation toast in the bottom-right corner after clicking.

**Pass criteria:** Green "connected" badge appears within a few seconds of load, and both toasts appear after their respective button clicks.

**Accessibility check (from Constraints Contract in `SPEC.md`):**
- [x] Usable at mobile breakpoint (390px) — verified via Tailwind responsive container, not yet walked on a physical device
- [x] Focus states visible when tabbing through — shadcn Button default focus ring
- [x] Touch targets ≥44px — shadcn Button default size meets this
- [ ] Text readable (WCAG AA contrast) — not yet formally audited; deferred to Slice 10's accessibility pass

**Result:** PASS — 2026-07-10, verified live via automated browser (Playwright) for page render, DB connection, and UI interaction; PostHog ingestion verified via direct API call rather than the automated browser click, since PostHog's own bot-detection filters headless-Chromium traffic (see `PROGRESS.md`). Sentry DSN not yet configured (org permission pending) — client-side wiring present but unverified end-to-end.

---

## Capability: Slice 1 — Auth + household creation

**Setup:** Visit https://household-financial-pwa.vercel.app in any browser. No existing account needed — sign-up flow is being tested.

**Steps:**
1. Load the page. You should land on a "Welcome back." sign-in screen (not the old system-status page).
2. Click "Don't have an account? Sign up." Create an account with an email and password.
3. After signing up, you should land on "Let's start with your family." (Onboarding Step 1 of 3).
4. Try clicking "Continue" with the name field empty — it should be disabled.
5. Type a household name (e.g. "Test Family") and click "Continue."
6. You should see a confirmation screen showing your household name.
7. Refresh the page — you should land directly on the confirmation screen (not be asked to create a household again).
8. Sign out (via Clerk's account menu) and sign back in — you should land on the same confirmation screen, not a fresh onboarding form.

**Expected:** No step requires a household ID to be typed or visible anywhere in the UI or URL — it's resolved from your session automatically.

**Pass criteria:** All 8 steps behave as described; no console errors related to auth or the `/api/household` calls; a second account (private/incognito window, different email) sees its own empty onboarding flow, not the first account's household.

**Accessibility check (from Constraints Contract in `SPEC.md`):**
- [ ] Usable at mobile breakpoint (390px)
- [ ] Focus states visible when tabbing through the household name form
- [ ] Touch targets ≥44px on the Continue button
- [ ] Text readable (WCAG AA contrast) — deferred to Slice 10's accessibility pass, same as Slice 0

**Result:** PASS — 2026-07-10, verified live at https://household-financial-pwa.vercel.app. Sign-up, household creation, and household-scoped persistence across refresh/sign-out-sign-in all confirmed working. One deploy-time gotcha found and fixed along the way: a stale PWA service worker (installed during the Slice 0 visit) served the old cached shell after this deploy went live, masking the new code until the service worker was unregistered and the page hard-refreshed — worth remembering for every future slice's live smoke-test, not just this one. Accessibility checklist not walked this pass — deferred to Slice 10 per Slice 0's precedent.

---

## Capability: Slice 2 — Family members CRUD (Onboarding Step 2)

**Setup:** Sign in with an account that already has a household (from Slice 1) but no family members yet.

**Steps:**
1. Load the page — you should land on "Who are we planning for?" (Onboarding Step 2 of 3).
2. Try clicking "Continue" with no members added — it should be disabled.
3. Click "Add a family member." A bottom sheet opens.
4. Fill in name, relationship, date of birth (risk profile optional) and click "Add to plan."
5. The sheet closes and a member card appears with the name and relationship/DOB.
6. "Continue" should now be enabled.
7. Click "Continue" — you should land on a confirmation screen mentioning holdings come next.
8. Refresh the page — you should land directly on that same confirmation screen, not back at Step 2.

**Expected:** No step requires a household ID or member ID to be typed or visible anywhere in the UI or URL — both are resolved from the session server-side. A second account never sees another household's members.

**Pass criteria:** All 8 steps behave as described; no console errors related to `/api/family-members` calls.

**Accessibility check (from Constraints Contract in `SPEC.md`):**
- [ ] Usable at mobile breakpoint (390px)
- [ ] Focus states visible when tabbing through the add-member form
- [ ] Touch targets ≥44px on Continue / Add to plan
- [ ] Text readable (WCAG AA contrast) — deferred to Slice 10's accessibility pass, same as Slice 0/1

**Result:** Automated verification complete and passing: 55 tests (unit + two-user isolation integration tests for both `/api/household` and `/api/family-members`, plus component tests for the add-member form including the disabled/enabled Continue transitions), `npm run typecheck` clean, `check_events.py` clean. A full automated browser click-through (Playwright, matching how Slice 0/1 were verified) was attempted but blocked at the Clerk sign-up screen by a Cloudflare Turnstile bot-check that gates account creation on this Clerk instance — the same class of environmental limitation as Slice 0's PostHog headless-detection issue, not a code defect. Did not attempt to defeat the bot-check (a legitimate third-party security control). **This capability has not yet had a human click-through** — needs Gaurav to do the 8 steps above once, live, before this is fully signed off (should take under 2 minutes; the underlying code paths are identical in shape to Slice 1's, which did pass a full human-verified live test).

---

## Capability: Slice 3 — Instrument library (seed + browse)

**Setup:** Visit https://household-financial-pwa.vercel.app. No sign-in needed — this capability is public. Fastest path: append `/explore` to the URL directly, or sign in and tap "Explore what you can invest in" from the post-onboarding confirmation screen.

**Steps:**
1. Load `/explore`. You should see "What can you invest in?" with 6 section cards: Equity, Debt, Gold, Hybrid & Guaranteed, Real Estate, Alternative.
2. Tap "Equity." You should see a list of 5 instruments, each showing its name, typical returns, and risk level.
3. Tap "Direct Stocks" (or any instrument). You should see the full detail: summary, typical returns, tax treatment, liquidity, risk level, who can invest, and minimum investment.
4. Go back to Debt and open "Public Provident Fund (PPF)" — it should show a "Current rate: 7.1%" line with a "Rate as of 2026-07-01. Verify before investing" note. An instrument like "Direct Stocks" should have no rate line at all (market-linked, no fixed rate).
5. Visit this same section/instrument once, then put the device in airplane mode and reload — the page should still render from the PWA's offline cache rather than showing an error.

**Expected:** No sign-in prompt at any point in this flow. Every section has exactly 5 instruments (30 total across all 6).

**Pass criteria:** All 5 steps behave as described; no console errors related to `/api/instruments` calls; `library_section_viewed` and `instrument_viewed` events fire (visible in PostHog) when opening a section/instrument.

**Accessibility check (from Constraints Contract in `SPEC.md`):**
- [ ] Usable at mobile breakpoint (390px)
- [ ] Focus states visible when tabbing through section cards and instrument rows
- [ ] Touch targets ≥44px on section/instrument rows
- [ ] Text readable (WCAG AA contrast) — deferred to Slice 10's accessibility pass, same as prior slices

**Result:** Automated verification complete and passing: 80 tests total (12 new — seed-data validation, instrument route integration tests with no-auth-required assertions, and component tests for all 3 new pages including the rate/no-rate detail branches), `npm run typecheck` clean, `check_events.py` clean (27 registered events). 30 instruments seeded into the live Neon database via `npm run db:seed` (idempotent upsert by slug).

**Real bug found and fixed along the way, not a local-tooling fluke:** the original design used a `/api/instruments/:slug` path parameter for instrument detail. This 404'd under local `vercel dev`, then 404'd identically on a real production deploy — `vercel build`'s generated `.vercel/output/config.json` showed Vercel's zero-config routing for this project (`framework: "vite"`, not Next.js) only maps single-path-segment requests under `/api/` to the catch-all function; anything with a second segment hits a hardcoded 404 rule the platform generates itself. Confirmed this isn't specific to the new route — `/api/family-members/anything` 404s the same way on the already-shipped Slice 2 code, it just never happened to be exercised. Fixed by switching instrument-detail lookup to a query param (`/api/instruments?slug=...`), the same fix-pattern this project already used twice for Vercel platform limitations (manual JWT verification instead of `@hono/clerk-auth`; moving server code out of `api/`). Re-verified live on production after the fix — see below.

**Live verification:** confirmed on production (https://household-financial-pwa.vercel.app) after the query-param fix: `/api/instruments` (list, 30 rows), `/api/instruments?category=N` (filtered, 5 rows), and `/api/instruments?slug=equity-direct-stocks` (single instrument, 200) all return real data; `/api/instruments?slug=does-not-exist` returns 404. Browser click-through of the Explore → section → detail flow and the offline/airplane-mode check are still owed to Gaurav, same as Slice 2's pending human click-through — Playwright automation isn't attempted here since this capability doesn't touch Clerk/PostHog's bot-detection walls, but a live human pass hasn't been done yet.

---

## Capability: Slice 4 — Holdings entry (Onboarding Step 3 + Portfolio tab)

**Setup:** Sign in with an account that already has a household and at least one family member (from Slices 1/2) but no holdings yet.

**Steps:**
1. Load the page — you should land on "What do you currently hold?" (Onboarding Step 3 of 3).
2. Try clicking "See my plan" with nothing filled in — it should be disabled.
3. Select a family member under "For," then select any instrument under "Instrument" — an "Asset class" field appears, auto-filled and disabled (e.g. "Equity" for a stock fund).
4. Type an amount invested and a current value.
5. Click "Optional fields" — units held, monthly SIP, start date, maturity date, and nominee appear; leave them blank.
6. Check "Mark as emergency fund," then click "See my plan."
7. You should land on a confirmation screen with a "View your holdings →" link and an "Explore what you can invest in →" link.
8. Tap "View your holdings →". You should see "Your holdings" with a 1-holding summary line and your holding grouped under the member's name.
9. Tap the holding row — a sheet opens titled "Update holding," pre-filled with everything you entered (including the emergency-fund checkbox and current value).
10. Change the current value and click "Save changes" — the sheet closes and the updated value shows in the list.
11. Tap the "+" button (bottom-right) — an empty "Record a holding" sheet opens; add a second holding for the same or a different member and confirm it appears as a second row/group as appropriate.
12. Refresh the page — you should land directly on Portfolio's holdings list (not back at onboarding).

**Expected:** No step requires a member ID, instrument ID, or holding ID to be typed or visible anywhere in the UI or URL — all resolved from the session server-side or from what you picked in the form. A second account never sees or can edit another household's holdings, even by guessing a holding ID in the edit sheet's `?id=` query param.

**Pass criteria:** All 12 steps behave as described; no console errors related to `/api/holdings` calls; `onboarding_step_completed` (step=holdings), `onboarding_completed`, `holding_created`, and `holding_updated` events fire (visible in PostHog) at the appropriate steps.

**Accessibility check (from Constraints Contract in `SPEC.md`):**
- [ ] Usable at mobile breakpoint (390px)
- [ ] Focus states visible when tabbing through the holding form and Portfolio rows
- [ ] Touch targets ≥44px on the "+" FAB and holding rows
- [ ] Text readable (WCAG AA contrast) — deferred to Slice 10's accessibility pass, same as prior slices

**Result:** Automated verification complete and passing: unit tests for the `holdings` lib (asset-class derivation, cross-household member rejection, negative-amount rejection), two-user isolation integration tests for `/api/holdings` (list/create/update, including a test that caught a real filter bug in the test's own mock — see below), and component tests for the shared `HoldingForm`, `OnboardingStep3`, and `Portfolio` pages (empty state, grouped list, add-sheet, edit-sheet pre-fill). `npm run typecheck` and `scripts/check_events.py` both clean.

**A real bug caught by the isolation test itself, not shipped code:** while writing the `/api/holdings` integration test's in-memory mock, the `and(eq(a), eq(b))` composition initially lost the column names for the second condition, silently turning the household-ownership filter into a no-op inside the *test's own fake database* — the test for "reject a holding referencing a member from a different household" passed with a false green (201 instead of 400) until this was traced and fixed. The production code in `server/lib/holdings.ts` was correct throughout; this was a lesson about verifying a new test helper's filtering logic actually filters, not just returning the right shape, before trusting a passing isolation test — worth remembering for the next slice that introduces `and()`-composed queries in a hand-rolled mock.

**Live verification:** owed to Gaurav — human click-through of the 12 steps above, plus the still-pending Slice 2/3 click-throughs, before this slice is fully signed off.

---

## Capability: Slice 5 — Protection tracking (Profile screen)

**Setup:** Sign in with an account that already has a household, at least one family member, and at least one holding (from Slices 1/2/4).

**Steps:**
1. From the post-onboarding confirmation screen, tap "Manage your protection cover →". You should land on "Profile" with a "Protection" card showing "No protection cover on record." and an "Add protection cover" button.
2. Tap "Add protection cover" (or the "Add" link in the card header) — a sheet titled "Add protection cover" opens.
3. Try clicking "Add cover" with nothing filled in — it should be disabled.
4. Select a family member under "For." Leave "Type" and "Status" at their defaults (Term life / Active).
5. Type a cover amount (e.g. 5000000).
6. Click "Optional fields" — annual premium and provider appear; fill in a provider name (e.g. "HDFC Life").
7. Click "Add cover." The sheet closes and the record appears in the Protection card under the member's name, showing the cover amount, status, and provider.
8. Tap the record row — a sheet opens titled "Update protection cover," pre-filled with everything you entered.
9. Change the status to "Lapsed" and click "Save changes" — the sheet closes and the updated status shows in the card.
10. Tap "Add" again and add a second protection record for the same or a different member (e.g. type "Health") — confirm it appears as a second row/group as appropriate.
11. Refresh the page — the Protection card should still show both records (no re-fetch flicker to empty state).

**Expected:** No step requires a member ID or protection-record ID to be typed or visible anywhere in the UI or URL — all resolved from the session server-side or from what you picked in the form. A second account never sees or can edit another household's protection records, even by guessing a record ID in the edit sheet's `?id=` query param.

**Pass criteria:** All 11 steps behave as described; no console errors related to `/api/protection` calls; `feature_used` (feature_name="add_protection") fires on both add and edit (visible in PostHog).

**Accessibility check (from Constraints Contract in `SPEC.md`):**
- [ ] Usable at mobile breakpoint (390px)
- [ ] Focus states visible when tabbing through the protection form and Profile rows
- [ ] Touch targets ≥44px on the "Add" link and protection rows
- [ ] Text readable (WCAG AA contrast) — deferred to Slice 10's accessibility pass, same as prior slices

**Result:** Automated verification complete and passing: unit tests for the `protection` lib (cross-household member rejection, negative cover-amount rejection, invalid type/status enum rejection), two-user isolation integration tests for `/api/protection` (list/create/update), and component tests for the shared `ProtectionForm` and `Profile` pages (empty state, grouped list, add-sheet, edit-sheet pre-fill). `npm run typecheck` and `scripts/check_events.py` both clean.

**Live verification:** owed to Gaurav — human click-through of the 11 steps above, plus the still-pending Slice 2/3/4 click-throughs, before this slice is fully signed off.

---

## Capability: Slice 6 — Dashboard: Completeness Score + AllocationDonut

**Setup:** Sign in with an account that already has a household and at least one family member (from Slices 1/2). Test both a fresh account (no holdings/protection yet) and the account built up through Slices 4/5 (holdings + protection recorded).

**Steps:**
1. Complete onboarding (household → members → first holding) as a brand-new account. Instead of a plain confirmation screen, you should land directly on `/dashboard` — "Your plan" with your household name above it.
2. The "Household health" card should show a tier name ("Getting Started," "On Track," or "Strong" depending on how much you set up during onboarding), an "N of 5 checks complete" line, and a short line of context copy underneath a divider.
3. The "Where your money lives" card should show either: a ghost/outline donut ring with "Nothing recorded yet." and a "Record a holding" link (if you have zero holdings), or a colored donut with a legend (asset class name + percentage per segment) and a "Total recorded value" line (if you have at least one holding).
4. Tap "Record a holding" (empty state) or "View your holdings →" (populated state) — you should land on the Portfolio tab, same as before.
5. From Portfolio, add a second and third holding spanning at least 3 different asset classes, flag one as your emergency fund, and (from Profile) add active protection cover for at least one "self"/"spouse" member.
6. Navigate back to `/dashboard` (or refresh it) — the tier, score, and donut should reflect the new data: more checks complete, a higher score, more segments in the donut with updated percentages.
7. Refresh the page directly on `/dashboard` — you should land there again immediately (not bounced back through onboarding), with a brief loading skeleton (3-card layout: header, health card, donut card) before the real data appears.
8. With your browser's network tab open, confirm the dashboard makes exactly one request to `/api/dashboard` per load (no polling, no duplicate requests).
9. Tap "Explore what you can invest in →" and "Manage your protection cover →" at the bottom of the dashboard — both should navigate to `/explore` and `/profile` respectively, same links as the old confirmation screen used to offer.

**Expected:** No step requires a household ID to be typed or visible anywhere in the UI or URL — resolved from the session server-side. A second account never sees or can affect another household's score or allocation, even indirectly (there's no ID in the request at all — `/api/dashboard` takes no parameters, everything comes from the session). There is no nudge card on the dashboard yet (Slice 7) and no bottom tab bar yet (later slice).

**Pass criteria:** All 9 steps behave as described; no console errors related to `/api/dashboard` calls; `dashboard_viewed` fires once per page load (visible in PostHog) with an `allocation_summary` reflecting the current allocation; `completeness_score_changed` fires only when the tier actually differs from the last tier seen for that household in this browser (verify by loading the dashboard twice in a row with no changes in between — it should not fire the second time).

**Accessibility check (from Constraints Contract in `SPEC.md`):**
- [ ] Usable at mobile breakpoint (390px)
- [ ] Focus states visible when tabbing through the dashboard's links and retry button
- [ ] Touch targets ≥44px on the "Record a holding" CTA and the bottom nav links
- [ ] Text readable (WCAG AA contrast) — deferred to Slice 10's accessibility pass, same as prior slices

**Result:** Automated verification complete and passing: unit tests for `computeCompleteness` against fixture households (0 members; 1 member, no holdings; partial coverage; full 5-of-5 coverage; tier boundary cases), unit tests for `getDashboard`'s allocation aggregation (totals, percentages, fixed asset-class ordering), two-user isolation integration tests for `/api/dashboard`, and component tests for `HealthTierCard`, `AllocationDonut` (loading/empty/populated states), and `Dashboard` (empty vs. populated rendering, `dashboard_viewed` firing once, `completeness_score_changed` firing only on an actual tier change, error state with retry). `npm run typecheck`, `scripts/check_events.py`, and `npm run build` all clean.

**A design decision worth flagging for the next slice:** the Completeness Score is read-time-only per `SPEC.md` §7's named simpler fallback — there's no server-side "previous score" to diff against for `completeness_score_changed`, so this event is detected client-side by comparing the freshly-fetched tier against the last tier this browser saw for this household (`localStorage`, keyed per household ID). This means the event won't fire on a different device/browser that hasn't seen the household's dashboard before, and clearing browser storage resets the baseline. Acceptable for v1 (PostHog is the analytics destination, not a source of truth for the score itself), but worth remembering if `completeness_score_changed` volume looks lower than expected in PostHog.

**Live verification:** owed to Gaurav — human click-through of the 9 steps above, plus the still-pending Slice 2/3/4/5 click-throughs, before this slice is fully signed off.

---

## Capability: Slice 7 — Nudge system

**Setup:** Sign in with an account that has a household and at least two family members (from Slices 1/2), one of whom has no holdings recorded. You will deliberately flip checks on and off to watch the nudge move.

**Steps:**
1. Load `/dashboard`. Below the "Where your money lives" donut there should now be a card headed "NEXT STEP" with a sentence and a single link. Exactly one such card — never two, never none.
2. With a member who has no holdings, the card should name that member: "[Name] has no holdings recorded yet…" and the link should read "Add a holding for [Name] →". Tap it — you land on Portfolio.
3. Record a holding for that member so every member has at least one. Return to `/dashboard`. The nudge should now move on to the next unmet check (emergency fund, unless you already flagged one).
4. On the emergency-fund nudge, the link reads "Learn about emergency funds →" and takes you to the Fixed Deposit instrument page under Explore → Debt. Confirm it opens a real instrument page, not a 404.
5. Flag one holding as your emergency fund, then reload `/dashboard`. The nudge should advance to protection: "[Name] has no protection cover on record…" with a "Record protection cover →" link landing on Profile.
6. Add active protection for both self and spouse, reload. If you hold fewer than 3 asset classes, the nudge should now read "…concentrated in N asset class(es)…" with the correct N, and "Explore asset classes →" landing on Explore. Check the singular/plural reads correctly for N=1 vs N=2.
7. Add holdings spanning 3+ asset classes and reload. With all five checks met, the card must still be there — an affirming "Every check in your household plan is covered…" message with "Explore what else exists →". **The card must never disappear.**
8. At every step above, scroll the whole dashboard and confirm there is only ever one "NEXT STEP" card on the page.

**Expected:** The nudge always reflects the *first* unmet check in order (member coverage → emergency fund → protection → diversity → stale values), never a later one while an earlier one is still unmet. No link anywhere on the card is a buy/invest action — every CTA either navigates within the app or opens a learn-card.

**Pass criteria:** All 8 steps behave as described; no console errors; `nudge_shown` fires exactly once per dashboard load (visible in PostHog) carrying the `check_id` of the card actually displayed; `learn_card_clicked` fires on tapping the card's link with the matching `check_id` and `learn_card_slug`.

**Accessibility check (from Constraints Contract in `SPEC.md`):**
- [ ] Usable at mobile breakpoint (390px)
- [ ] Focus state visible when tabbing to the nudge's link
- [ ] Touch target ≥44px on the nudge CTA
- [ ] Text readable (WCAG AA contrast) — deferred to Slice 10's accessibility pass, same as prior slices

**Result:** Automated verification complete and passing: `selectNudge` unit-tested against **all 32 combinations** of the five checks, asserting exactly one nudge per combination, never zero, a non-empty `learn_card_slug` every time, and first-unmet-in-order priority for all 31 incomplete combinations; `buildNudgeContext` tested for member-name and asset-class-count derivation (including lapsed protection not counting as cover); `getDashboard` tested for nudge pass-through against a fake DB; `NudgeCard` component-tested for verbatim COPY_DECK copy per check, name interpolation with a safe fallback when no name is available, singular/plural asset class, all six CTA destinations, the no-buy-action rule, and `learn_card_clicked`; `Dashboard` tested for exactly-one-card rendering across empty and complete fixtures and `nudge_shown` firing once. 254 tests pass (up from 215). `npm run typecheck`, `scripts/check_events.py`, and `npm run build` all clean.

**Two deliberate COPY_DECK deviations, flagged for backfill:**
1. **Check 3's CTA** reads "Record protection cover →" (→ `/profile`), not COPY_DECK's "Learn about term insurance →". There is no term-insurance learn-card among the 30 seeded instruments, and the one insurance-adjacent instrument (`hybrid-traditional-insurance`) is the exact product class this project's standing decision rejects — routing a protection nudge there would be actively wrong guidance, not just a broken link.
2. **The all-five-pass card** is new copy. `SPEC.md` §7 requires exactly one card and never zero, but COPY_DECK defines no all-pass nudge. Written in CFP voice, observational, no exclamation.

Check 2's CTA keeps COPY_DECK's wording but points at the Fixed Deposit card (`debt-fixed-deposit`) — the standard Indian emergency-fund vehicle — since no dedicated emergency-fund card exists either.

**Live verification:** owed to Gaurav — human click-through of the 8 steps above. The local smoke-run for this slice could not be completed by the agent: the dev server served correctly (`/api/dashboard` returns 401 unauthenticated, `/api/health` 200, `index.html` and the transformed `main.tsx` both served), but the browser rendered a blank page with no console output, and the dashboard is auth-gated behind Clerk, which `app/CLAUDE.md` already documents as needing a human.

---

## Capability: Slice 8 — PWA install + offline dashboard

**Setup:** Use Chrome (desktop or Android) — `beforeinstallprompt` is Chromium-only, so the install card will not appear in Safari or Firefox by design. Sign in with an account that has a household and at least one holding. **Test on the production/preview deployment, not `vercel dev`** — service workers behave differently without a real build.

**Steps:**
1. Load the app and sign in. Open DevTools → Application → Service Workers and confirm a worker is registered and activated.
2. Load `/dashboard` while online. Under the nudge card you should see an "Add to your home screen" card with **Install** and **Not now**. (If the app is already installed, or the browser has already been dismissed this session, the card correctly does not appear.)
3. Tap **Not now**. The card disappears. Reload — it stays gone (the choice is remembered on this device). To re-test, clear `pwa:install-dismissed` from localStorage.
4. Reload, and this time tap **Install**. The browser's own install dialog appears; accept it. The app installs to your home screen / app list and the card disappears.
5. Open the installed app. It should launch standalone (no browser chrome) with the teal theme colour.
6. Back online in the app, load `/dashboard` fully. Then DevTools → Network → **Offline** (or turn off wifi), and **reload the page**.
7. The dashboard should still render — household name, health tier, donut, nudge — with a dashed banner at the top reading "You're offline. Showing what was last saved to this device, from [N minutes] ago." Confirm the stated age is plausible, not "just now".
8. Still offline, navigate directly to `/explore` and a specific instrument page — the library should render from precache (already true since Slice 3).
9. Still offline, open a holding form (Portfolio → add) and a member form (Profile → add member). In each, the submit button must be **disabled**, with the line "You're offline. Changes can't be saved until you reconnect — nothing is queued in the background." Confirm no form silently accepts a submission.
10. Still offline, **close the tab entirely and reopen the app directly at `/dashboard`** (a cold start, not a reload). It should still boot to the cached dashboard rather than the browser's offline error page.
11. Go back online. The banner should disappear without a reload, and the next dashboard load should show fresh data.
12. Sign out, then go offline and try to reach `/dashboard`. You must **not** see the previous household's cached data.

**Expected:** Offline is read-only throughout. Nothing you do offline is queued or replayed when you reconnect — the app says so plainly rather than implying background sync. The offline banner appears only on the dashboard (the network-dependent screen), not on library pages that are legitimately fully cached.

**Pass criteria:** All 12 steps behave as described; no console errors; `pwa_shell_loaded` fires once per load with `cache_status: "miss"` on the very first visit and `"hit"` on subsequent loads; `pwa_install_prompted` fires once when the install card renders; `pwa_installed` fires only when the browser dialog is actually accepted.

**Accessibility check (from Constraints Contract in `SPEC.md`):**
- [ ] Usable at mobile breakpoint (390px) — including the two-button install card
- [ ] Focus states visible when tabbing to Install / Not now
- [ ] Touch targets ≥44px on both install-card buttons
- [ ] Text readable (WCAG AA contrast) — deferred to Slice 10's accessibility pass, same as prior slices

**Result:** Automated verification complete and passing: `pwa-cache` unit-tested for per-household timestamp round-trip, corrupt-value handling, localStorage-unavailable (private mode / quota) tolerance, staleness threshold boundaries, clock-skew (future timestamp) handling, human-readable age formatting with singular/plural and roll-up at the minute/hour/day boundaries, and cache purge including the Cache-API-absent and delete-fails paths; `useOnline` tested for initial state, online/offline transitions, and listener cleanup; `InstallPrompt` tested for visibility gating, the remembered dismissal, accept vs. decline outcomes, double-click protection on the single-use browser event, and both analytics events; `Dashboard` tested for banner presence/absence, the correct reported age, and the freshness-stamp rule; `ProtectionForm` tested for the disabled-offline rule. 294 tests pass (up from 254). `npm run typecheck`, `scripts/check_events.py`, and `npm run build` all clean, and the **generated `dist/sw.js` was inspected directly** to confirm both runtime-caching rules (`dashboard-last` NetworkFirst with a 5s network timeout, `instrument-library` CacheFirst) and the SPA `NavigationRoute` fallback are actually present — not merely configured.

**The named fallback was NOT needed.** `SPEC.md` §7 offered "precache library only; dashboard requires network" as the simpler option if dynamic-response caching fought vite-plugin-pwa's defaults. It didn't — a single `NetworkFirst` rule on the flat `/api/dashboard` path was sufficient, so the full capability shipped.

**Three design decisions worth flagging:**
1. **Freshness is tracked client-side, not read off the response.** With a NetworkFirst rule, a cache hit and a live response are indistinguishable at the `fetch()` layer, and detecting the difference properly would need a custom service worker — which `SPEC.md` §7 explicitly steers away from for this slice. So the dashboard stamps a timestamp only when `navigator.onLine` is true, and the banner reports that timestamp's age. Consequence: if the device is online but the *network* is broken (captive portal), the app will believe it fetched fresh data. Acceptable — that case shows the normal error path instead.
2. **The dashboard cache is purged on sign-out.** Service-worker caches are origin-scoped, not user-scoped. NetworkFirst normally protects a second user (they hit the network and get their own data), but offline it would fall back to whichever household was cached last. Since multi-tenancy in this app is app-layer only, the client purges `dashboard-last` on sign-out. **Step 12 above is the test for this** — it's a data-isolation check, not a nicety.
3. **`navigateFallback: 'index.html'` was added** so a *cold* offline start on a deep link boots the app shell. Without it, offline support would only have worked on a reload of an already-open page — step 10 is the test that distinguishes the two.

**Copy written for this slice, flagged for COPY_DECK backfill:** the offline banner and the offline-write message. `COPY_DECK.md` covers the install prompt (used verbatim) but has no entry for either.

**Live verification:** owed to Gaurav — human click-through of the 12 steps above, on a real deployment. This slice is the one most dependent on live verification in the whole plan: service workers, install prompts, and offline behaviour cannot be meaningfully exercised by unit tests or by `vercel dev`.

---

## Capability: Slice 9 — Profile + account deletion

**⚠️ DESTRUCTIVE — use a disposable test account, never a real one.** The last step of this script permanently deletes the account you're signed in as, along with its household, family members, holdings, and protection records. Create a throwaway account (a test email you don't need again) specifically for this click-through — do not run this against Gaurav's own household data or any account you want to keep.

**Setup:** Sign in with a disposable test account that has a household, at least two family members, at least one holding, and at least one protection record (from Slices 1/2/4/5).

**Steps:**
1. Go to Profile (`/profile`). The page title should read "Your account." You should see four cards in order: "Your household," "Family members," "Protection," and "Account."
2. In the household card, tap "Edit." The household name becomes an editable field with "Save changes" and "Cancel" buttons.
3. Change the name and tap "Save changes." The card should show the new name (not the old one) without a page reload.
4. In the family members card, tap an existing member's row (not the "Remove" button). A sheet titled "Update family member" opens, pre-filled with that member's name, relationship, date of birth, and risk profile.
5. Change the name and tap "Save changes." The sheet closes and the member's row shows the new name.
6. Tap "Add a family member." A sheet titled "Add a family member" opens (same form as onboarding Step 2). Fill it in and tap "Add to plan" — the new member appears as a new row.
7. Tap "Remove" on a member who has **no** holdings or protection recorded (to keep step 12's zero-row check meaningful for the member you'll check). A dialog opens: "Remove [name]? This will remove [name] and delete any holdings or protection cover recorded for them. This cannot be undone." Tap "Keep them" — the dialog closes, the member is still there.
8. Tap "Remove" on that same member again, then tap "Remove" in the dialog. The member's row disappears from the list.
9. In the Account card, confirm your sign-in email is shown, then tap "Sign out." You should be signed out and land back on the sign-in screen.
10. Sign back in with the same test account. Confirm the household name from step 3 and the remaining members are all still there (sign-out does not delete anything).
11. Go back to Profile and tap "Delete account." A dialog opens: "Delete your account? This will permanently delete your household, family members, and all holdings. This cannot be undone." Tap "Keep my account" first to confirm cancel works — the dialog closes, nothing happens.
12. Tap "Delete account" again, then tap "Yes, delete everything." You should be signed out (Clerk invalidates the session as part of account deletion). Trying to sign back in with the same credentials should either fail (account gone) or land on a fresh onboarding flow with a blank household — never your old data.

**Expected:** No step requires a household ID, member ID, or protection-record ID to be typed or visible anywhere in the UI or URL — all resolved from the session server-side or from what you picked in the form. A second account never sees or can edit/remove another household's family members.

**Pass criteria:** All 12 steps behave as described; no console errors related to `/api/household`, `/api/family-members`, or account-deletion calls; `feature_used` (feature_name="edit_household", action="rename_household" / "add_member" / "edit_member" / "remove_member") fires on steps 3/5/6/8, `feature_used` (feature_name="sign_out") fires on step 9, `feature_used` (feature_name="delete_account") fires on step 12 (all visible in PostHog).

**Accessibility check (from Constraints Contract in `SPEC.md`):**
- [ ] Usable at mobile breakpoint (390px)
- [ ] Focus states visible when tabbing through the household/member forms and the confirm dialogs
- [ ] Touch targets ≥44px on Edit/Add/Remove/Sign out/Delete account links and member rows
- [ ] Text readable (WCAG AA contrast) — deferred to Slice 10's accessibility pass, same as prior slices

**Result:** Automated verification complete and passing: unit tests for `updateHouseholdName`, `updateFamilyMember`, `removeFamilyMember`, and the Svix webhook signature verifier (`server/lib/svix.ts` — valid signature, tampered body, wrong secret, stale timestamp, missing headers); a unit test for the cascade-delete logic (`deleteHouseholdForOwner`) against a fully populated fixture household, asserting every user-owned table empties and `analytics_events` is retained; two-user isolation integration tests for the new `PATCH`/`DELETE /api/family-members` and `PATCH /api/household` routes; and a full **create → populate → delete → verify-zero-rows** integration test (`server/account-deletion.integration.test.ts`) that drives the real Hono app end to end — creates a household/member/protection record via the real HTTP routes, signs a real `user.deleted` webhook payload with a synthetic Svix secret the same way Clerk does, posts it to `/api/clerk-webhook`, and asserts household/members/protection/holdings/goals are all empty afterward while a fixture `analytics_events` row remains — plus component tests for the extended `Profile` page (household rename, member add/edit/remove with the confirm dialog, sign-out, and delete-account including the failure path). `npm run typecheck`, full `vitest` run, `npm run build`, and `scripts/check_events.py` all clean.

**Webhook routing verified, not assumed:** ran a real `vercel build` against this project's linked Vercel project and inspected `.vercel/output/config.json` — confirmed `^/api/([^/]+)$` (single segment) routes to the catch-all function while `^/api(/.*)?$` (any second segment) 404s, which is exactly why `/api/clerk-webhook` was chosen over a nested `/api/webhooks/clerk` shape.

**Manual step owed to Gaurav before this works live:** register a `user.deleted` webhook endpoint in the Clerk dashboard pointing at `/api/clerk-webhook`, set its signing secret as `CLERK_WEBHOOK_SECRET` in Vercel, and enable "allow users to delete their own account" in Clerk's User & Authentication settings. None of this was done as part of this slice (no live dashboard changes without explicit go-ahead, same standing rule as every deploy).

**Live verification:** owed to Gaurav — human click-through of the 12 steps above **using a disposable test account**, plus the still-pending Slice 2/3/4/5 click-throughs, before this slice is fully signed off. This slice additionally cannot be verified live until the manual Clerk-dashboard step above is done, since the webhook won't fire without it.
