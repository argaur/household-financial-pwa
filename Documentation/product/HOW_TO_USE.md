# How to use Household Financial Planning

Live: https://household-financial-pwa.vercel.app

> Rendered at the `/docs` route. Stub created in Slice 0; each development slice adds its capability section **in the same commit as the feature code**. By deployment, this is complete — never written retroactively.

## What it does

A PWA for Indian households to learn what financial instruments exist, record what they actually hold across family members, and see household-level plan gaps via a scored Household Health panel. As of Slice 3, you can create an account, create your household, add the family members you're planning for, and browse a 30-instrument library across 6 asset classes — holdings entry (Step 3 of onboarding) is the next slice.

## Quick start

1. Visit the app. You'll land on a sign-in screen.
2. No account yet? Click "Don't have an account? Sign up" and create one (email + password, or an OAuth provider if enabled in Clerk).
3. After signing in, you'll be asked for your household name (e.g. "Gupta Family") — this is Onboarding Step 1 of 3.
4. Submit it, then add at least one family member — this is Onboarding Step 2 of 3.
5. Once you've added someone, tap "Explore what you can invest in →" to browse the instrument library — no sign-in needed for this part, and it works offline once you've visited a section.

## Capabilities

### Signing up and creating your household

Sign up or sign in via Clerk (email/password or OAuth). Once signed in, a household row is created for you, scoped entirely to your account — no other user can see or modify it. If you already have a household, you skip straight past the creation form.

**What's enforced:** every household-related request resolves your identity from the Clerk session server-side; nothing about which household you're operating on is ever taken from the request body or URL. Two different accounts cannot see or affect each other's household, even with a malformed or missing session.

### Adding family members

On Onboarding Step 2 ("Who are we planning for?"), tap "Add a family member" to open a form: full name, relationship (self/spouse/child/parent/other), date of birth (required — used later for age-based milestones like SSY eligibility), and an optional risk appetite. Add as many as you like; "Continue" only unlocks once at least one member exists.

**What's enforced:** the same server-side scoping pattern as households — every member is resolved and created against your own household only, never a client-supplied ID. A second account never sees or can add to your household's member list.

### Browsing the instrument library

Tap "Explore what you can invest in" (or visit `/explore` directly) to see 6 section cards — Equity, Debt, Gold, Hybrid & Guaranteed, Real Estate, Alternative — each holding 5 curated instruments (30 total). Tap a section to see its instruments (name, typical returns, and risk level at a glance); tap an instrument for the full picture: returns, tax treatment, liquidity, risk, who can invest, minimum investment, and — where a government-declared rate applies (e.g. PPF, SSY, EPF) — the current rate with a "verify before investing" note, since these change quarterly.

**What's enforced:** this is public, read-only content — no sign-in required, and there are no write routes for it at all (only a seed script populates it). It's precached by the PWA on first visit, so it keeps working with the phone in airplane mode afterward.

## FAQ

**Why is there no dashboard yet?**
Slice 1 proves out authentication and the per-household data-scoping pattern (the riskiest architectural assumption in the whole build) before building the features that depend on it — family members, holdings, and the dashboard all come after. See `IMPLEMENTATION_PLAN.md`.

**Why is there no visible product yet? (Slice 0 note, still true)**
Slice 0 (Walking Skeleton) proved the deployment pipeline before any feature code was written — see prior note in git history for context.

## Known limitations

- No holdings or dashboard yet — those are Slices 4 and 6. There is no bottom tab bar yet either; the library is reached via a plain link from the post-onboarding confirmation screen until Slice 6+ adds full navigation.
- `signup_failed` / `login_failed` analytics events (in `METRICS_PLAN.md`) are not yet instrumented — Clerk's prebuilt sign-in/sign-up UI doesn't expose a failure callback without a fully custom auth form, which was judged out of scope for this slice. `signup_completed` / `login_completed` are instrumented.
- Server-side (API route) error capture is deferred; only client-side Sentry is wired so far.
- Clerk/Sentry env vars are set in Vercel's Production environment only — Preview environment addition is a follow-up (the Vercel CLI's non-interactive preview-branch flow didn't cooperate; needs the dashboard).
