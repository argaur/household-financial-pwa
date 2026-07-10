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
