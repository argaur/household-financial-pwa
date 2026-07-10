# How to use Household Financial Planning

Live: https://household-financial-pwa.vercel.app

> Rendered at the `/docs` route. Stub created in Slice 0; each development slice adds its capability section **in the same commit as the feature code**. By deployment, this is complete — never written retroactively.

## What it does

A PWA for Indian households to learn what financial instruments exist, record what they actually hold across family members, and see household-level plan gaps via a scored Household Health panel. No feature capabilities exist yet — see Known limitations.

## Quick start

Not yet available — onboarding ships in Slice 1–4. Check back after the first feature slices land.

## Capabilities

None yet. Slice 0 is infrastructure only (deploy pipeline, DB connection, analytics, error tracking) — no user-facing capability to document.

## FAQ

**Why is there no visible product yet?**
Slice 0 (Walking Skeleton) exists to prove the deployment pipeline — frontend, database, analytics, error tracking — before any feature code is written. This is deliberate: `IMPLEMENTATION_PLAN.md` orders slices hardest-unknown-first, and infrastructure risk is retired before feature risk.

## Known limitations

- No onboarding, dashboard, or library yet — Slice 0 only.
- Server-side (API route) error capture is deferred; only client-side Sentry is wired so far.
- The home screen you see now (`/`) is a temporary system-status page, not the product's actual home screen — it will be replaced entirely once Slice 4 (onboarding) ships.
