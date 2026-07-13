# How to use Household Financial Planning

Live: https://household-financial-pwa.vercel.app

> Rendered at the `/docs` route. Stub created in Slice 0; each development slice adds its capability section **in the same commit as the feature code**. By deployment, this is complete — never written retroactively.

## What it does

A PWA for Indian households to learn what financial instruments exist, record what they actually hold across family members, and see household-level plan gaps via a scored Household Health panel. As of Slice 6, you can create an account, create your household, add the family members you're planning for, browse a 30-instrument library across 6 asset classes, record and edit your household's holdings, record and edit each member's insurance/protection coverage, and see it all summarized on your personal dashboard — a Household Health score and an allocation chart. The nudge system (Slice 7) is next.

## Quick start

1. Visit the app. You'll land on a sign-in screen.
2. No account yet? Click "Don't have an account? Sign up" and create one (email + password, or an OAuth provider if enabled in Clerk).
3. After signing in, you'll be asked for your household name (e.g. "Gupta Family") — this is Onboarding Step 1 of 3.
4. Submit it, then add at least one family member — this is Onboarding Step 2 of 3.
5. Record your first holding (who it's for, which instrument, amount invested, current value) — this is Onboarding Step 3 of 3.
6. You land on your dashboard (`/dashboard`) — a Household Health score and an allocation donut for what you've recorded so far. From there, tap "View your holdings →" to see the Portfolio tab, "Explore what you can invest in →" to browse the instrument library, or "Manage your protection cover →" for the Profile screen.

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

### Recording a holding

Onboarding Step 3 ("What do you currently hold?") records your first holding: who it's for, which instrument, amount invested, and current value (your best estimate — you can update it anytime). Optional fields — units held, monthly SIP, start date, maturity date, nominee, notes — are collapsed under "Optional fields" until you expand them. A checkbox lets you flag a holding as your household's emergency fund.

After onboarding, the **Portfolio tab** (`/portfolio`) lists every holding grouped by family member, with a running total. Tap the "+" button to record another holding, or tap any existing holding to open it in the same form, pre-filled, and save changes. There is no bottom tab bar yet — Portfolio is reached via a plain "View your holdings →" link from the dashboard until a later slice adds full navigation.

**What's enforced:** the same server-side household scoping as members — every holding is created/edited/listed against your own household only. The family member a holding is assigned to is verified server-side to belong to your household too (not just any member ID that exists somewhere in the database) — this is checked with its own isolation test, since the plain foreign key alone doesn't enforce it. `asset_class` is derived from the instrument you pick, not accepted from the client. Editing a holding uses a `?id=` query parameter rather than a `/holdings/:id` path segment — this project's Vercel zero-config build only routes single-path-segment `/api/*` requests to the catch-all function (see `app/CLAUDE.md`).

### Recording insurance and protection

The **Profile** screen (`/profile`) hosts a "Protection" card for recording insurance/protection coverage per family member: type (term life, health, disability, other), cover amount, status (active, lapsed, pending), and optionally annual premium and provider. Reached via the "Manage your protection cover →" link on the dashboard, alongside the existing Portfolio and Explore links.

Tap "Add" to open a form (member, type, cover amount, and status are required; premium and provider are optional fields collapsed until expanded). Records are grouped by member; tap any existing record to edit it in the same form, pre-filled.

**What's enforced:** the same server-side household scoping as holdings and members — every protection record is created/edited/listed against your own household only, with the assigned family member verified server-side to belong to that household (its own isolation test, same pattern as holdings). Editing uses a `?id=` query parameter rather than a `/protection/:id` path segment, for the same Vercel routing reason as holdings. There is no "remove protection" flow yet, matching Slice 4's precedent of shipping add/edit only. The Profile page is deliberately minimal in this slice — just the Protection card; household/member editing, sign-out, and account deletion land in a later slice on this same page.

### Understanding your Household Health score

The dashboard's Household Health card (`/dashboard`) scores your household against 5 fixed, equal-weight checks: (1) every family member has at least one holding recorded, (2) at least one holding is flagged as your emergency fund, (3) both "self" and "spouse" members (if you've added them) have an active protection record, (4) your holdings span 3 or more of the 6 asset classes, and (5) none of your holdings are missing a current value. Your score (0–5) maps to a tier — **Getting Started** (0–1), **On Track** (2–3), or **Strong** (4–5) — shown with a short line of context copy.

Below the tier card, the **allocation donut** shows how your household's recorded value is split across asset classes (equity, debt, gold, hybrid, real estate, alternative), with a legend and total recorded value. A household with nothing recorded yet sees a ghost outline ring and a "Record a holding" link instead.

**What's enforced:** the score is computed server-side, scoped to your household the same way every other read in this app is (`getHouseholdForOwner` resolving from the Clerk session, then 3 already-scoped list queries against members/holdings/protection — no client-supplied household ID anywhere). The score is computed at read time only (on dashboard load), not recomputed live on every write — see "Known limitations" below.

## FAQ

**Why is the score only updated when I load the dashboard, not immediately after I add a holding?**
This is a deliberate simplification (`SPEC.md` §7's named fallback for Slice 6's riskiest assumption): computing the 5-check score live on every relevant write (holding/member/protection create or edit) would need triggers or recomputation hooks across 3 tables for a v1 with no usage data yet to justify that cost. Read-time-only computation means there can be a slight lag between an action (e.g. adding a holding) and the score reflecting it — you'll see the updated score next time the dashboard loads, which in practice is almost always immediately (the onboarding flow lands you there right after adding your first holding).

**Why is there no visible product yet? (Slice 0 note, still true)**
Slice 0 (Walking Skeleton) proved the deployment pipeline before any feature code was written — see prior note in git history for context.

## Known limitations

- No nudge card yet — the dashboard shows the Health tier card and allocation donut only; the single ordered "next step" nudge (first unmet check, linking to its learn-card) is Slice 7.
- The Completeness Score is read-time-only (see FAQ above), not recomputed live on every write — an intentional deferral, not a bug.
- No bottom tab bar yet — Portfolio, Explore, and Profile are all reached via plain links from the dashboard until a later slice adds full navigation.
- No "remove holding" flow yet — the Portfolio tab supports add and edit only, per Slice 4's scoped capability (`IMPLEMENTATION_PLAN.md`); `COPY_DECK.md`'s remove-holding copy is written ahead for a later slice.
- No "remove protection" flow yet — the Profile page's Protection card supports add and edit only, same scoped-capability precedent as Slice 4's holdings.
- Profile is minimal (Protection card only) — household/member editing, sign-out, and account deletion are Slice 9.
- `signup_failed` / `login_failed` analytics events (in `METRICS_PLAN.md`) are not yet instrumented — Clerk's prebuilt sign-in/sign-up UI doesn't expose a failure callback without a fully custom auth form, which was judged out of scope for this slice. `signup_completed` / `login_completed` are instrumented.
- Server-side (API route) error capture is deferred; only client-side Sentry is wired so far.
- Clerk/Sentry env vars are set in Vercel's Production environment only — Preview environment addition is a follow-up (the Vercel CLI's non-interactive preview-branch flow didn't cooperate; needs the dashboard).
