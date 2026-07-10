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
