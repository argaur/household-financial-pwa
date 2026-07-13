# How to use Household Financial Planning

Live: https://household-financial-pwa.vercel.app

> Rendered at the `/docs` route. Stub created in Slice 0; each development slice adds its capability section **in the same commit as the feature code**. By deployment, this is complete — never written retroactively.

## What it does

A PWA for Indian households to learn what financial instruments exist, record what they actually hold across family members, and see household-level plan gaps via a scored Household Health panel. As of Slice 9, you can create an account, create and rename your household, add/edit/remove the family members you're planning for, browse a 30-instrument library across 6 asset classes, record and edit your household's holdings, record and edit each member's insurance/protection coverage, sign out, and permanently delete your account.

## Quick start

1. Visit the app. You'll land on a sign-in screen.
2. No account yet? Click "Don't have an account? Sign up" and create one (email + password, or an OAuth provider if enabled in Clerk).
3. After signing in, you'll be asked for your household name (e.g. "Gupta Family") — this is Onboarding Step 1 of 3.
4. Submit it, then add at least one family member — this is Onboarding Step 2 of 3.
5. Record your first holding (who it's for, which instrument, amount invested, current value) — this is Onboarding Step 3 of 3.
6. From the confirmation screen, tap "View your holdings →" to see the Portfolio tab, or "Explore what you can invest in →" to browse the instrument library.

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

After onboarding, the **Portfolio tab** (`/portfolio`) lists every holding grouped by family member, with a running total. Tap the "+" button to record another holding, or tap any existing holding to open it in the same form, pre-filled, and save changes. There is no bottom tab bar yet — Portfolio is reached via a plain link from the post-onboarding confirmation screen until a later slice adds full navigation.

**What's enforced:** the same server-side household scoping as members — every holding is created/edited/listed against your own household only. The family member a holding is assigned to is verified server-side to belong to your household too (not just any member ID that exists somewhere in the database) — this is checked with its own isolation test, since the plain foreign key alone doesn't enforce it. `asset_class` is derived from the instrument you pick, not accepted from the client. Editing a holding uses a `?id=` query parameter rather than a `/holdings/:id` path segment — this project's Vercel zero-config build only routes single-path-segment `/api/*` requests to the catch-all function (see `app/CLAUDE.md`).

### Recording insurance and protection

The **Profile** screen (`/profile`) hosts a "Protection" card for recording insurance/protection coverage per family member: type (term life, health, disability, other), cover amount, status (active, lapsed, pending), and optionally annual premium and provider. Reached via the "Manage your protection cover →" link on the post-onboarding confirmation screen, alongside the existing Portfolio and Explore links.

Tap "Add" to open a form (member, type, cover amount, and status are required; premium and provider are optional fields collapsed until expanded). Records are grouped by member; tap any existing record to edit it in the same form, pre-filled.

**What's enforced:** the same server-side household scoping as holdings and members — every protection record is created/edited/listed against your own household only, with the assigned family member verified server-side to belong to that household (its own isolation test, same pattern as holdings). Editing uses a `?id=` query parameter rather than a `/protection/:id` path segment, for the same Vercel routing reason as holdings. There is no "remove protection" flow yet, matching Slice 4's precedent of shipping add/edit only.

### Managing your account

The **Profile** screen (`/profile`, also called "Your account") now hosts your full account management: a household card (tap "Edit" to rename it), a family members card (tap "Add a family member" to add one, tap any existing member row to edit them, or "Remove" to delete a member), the Protection card above, and an account card with your sign-in email, a "Sign out" link, and a "Delete account" link.

"Sign out" ends your Clerk session immediately — your data is untouched, sign back in anytime.

"Delete account" opens a confirmation sheet: *"Delete your account? This will permanently delete your household, family members, and all holdings. This cannot be undone."* Confirming triggers Clerk to delete your account, which fires a `user.deleted` webhook to this app's backend — that webhook hard-deletes your `households` row, and Postgres cascades that delete to every child row (family members, holdings, protection, goals) via the foreign keys already declared in `drizzle/schema.ts`. Your `analytics_events` rows are the one deliberate exception — they're retained (orphaned, no longer linked to a live account), per this project's data retention policy (`Documentation/design/DATA_MODEL.md`).

Removing an individual family member (without deleting the whole account) has the same cascading effect scoped to that member: any holdings or protection recorded for them are deleted along with them — the confirmation dialog says so before you confirm.

**What's enforced:** household rename and member edit/remove use the same server-side household-scoping pattern as every other route in this app — a member ID that doesn't belong to your household 404s rather than 400s, so a guessed ID never leaks whether it exists elsewhere. The account-deletion webhook is **not** a normal session-authed route (there's no user session — Clerk calls it server-to-server) — it verifies a Svix HMAC signature over the raw request body against a secret only this app and Clerk know, and rejects anything unsigned, wrongly signed, or older than 5 minutes (replay protection) before touching the database. It's mounted at a flat `/api/clerk-webhook` path (not `/api/webhooks/clerk`) for the same Vercel single-path-segment routing reason as every other `?id=`-style route in this app — verified against a real `vercel build` output, not assumed.

**Manual step needed before this works in production:** the Clerk dashboard needs (1) a webhook endpoint registered pointing at `https://household-financial-pwa.vercel.app/api/clerk-webhook`, subscribed to the `user.deleted` event, with its signing secret set as the `CLERK_WEBHOOK_SECRET` environment variable in Vercel, and (2) "Allow users to delete their own account" enabled under User & Authentication settings (Clerk's self-service account deletion is off by default) — neither of these was done as part of this slice, per the standing rule that live third-party dashboard changes and deploys need Gaurav's explicit go-ahead.

## FAQ

**Why is there no dashboard yet?**
Slice 1 proves out authentication and the per-household data-scoping pattern (the riskiest architectural assumption in the whole build) before building the features that depend on it — family members, holdings, and the dashboard all come after. See `IMPLEMENTATION_PLAN.md`.

**Why is there no visible product yet? (Slice 0 note, still true)**
Slice 0 (Walking Skeleton) proved the deployment pipeline before any feature code was written — see prior note in git history for context.

## Known limitations

- No dashboard yet — that's Slice 6 (Completeness Score + AllocationDonut). There is no bottom tab bar yet either; Portfolio and the library are both reached via plain links from the post-onboarding confirmation screen until Slice 6+ adds full navigation.
- No "remove holding" flow yet — the Portfolio tab supports add and edit only, per Slice 4's scoped capability (`IMPLEMENTATION_PLAN.md`); `COPY_DECK.md`'s remove-holding copy is written ahead for a later slice.
- No "remove protection" flow yet — the Profile page's Protection card supports add and edit only, same scoped-capability precedent as Slice 4's holdings.
- Account deletion works end to end in code (webhook signature-verified, cascade tested against a populated fixture) but is **not yet live in production** — the Clerk dashboard webhook registration + `CLERK_WEBHOOK_SECRET` env var and the "allow self-service account deletion" toggle are manual steps still owed (see "Managing your account" above).
- `signup_failed` / `login_failed` analytics events (in `METRICS_PLAN.md`) are not yet instrumented — Clerk's prebuilt sign-in/sign-up UI doesn't expose a failure callback without a fully custom auth form, which was judged out of scope for this slice. `signup_completed` / `login_completed` are instrumented.
- Server-side (API route) error capture is deferred; only client-side Sentry is wired so far.
- Clerk/Sentry env vars are set in Vercel's Production environment only — Preview environment addition is a follow-up (the Vercel CLI's non-interactive preview-branch flow didn't cooperate; needs the dashboard).
