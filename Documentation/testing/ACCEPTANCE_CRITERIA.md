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
