# Portfolio Angle — Household Financial Planning PWA

**Phase:** Solution Stage output
**Status:** draft — pending Phase 1 "Solution approved"

---

## One-Sentence Hook

> A household financial planning PWA that turns a 30-minute "what do I actually own?" exercise into a 3-step onboarding and a single number you want to watch climb.

---

## The Single Screenshot / GIF That Sells It

**What to capture:** The moment right after onboarding's 3rd step — the dashboard rendering with the real asset-class allocation donut, the Household Health tier, and the single ordered nudge appearing together. This is the "aha" moment the entire core journey (D-001) is built around.

**File location:** `Documentation/product/screenshots/hero.png`

**Caption (shown under the screenshot in the README):**
> Three steps in, and the household's real allocation, health tier, and next action are already on screen — no demo data, no waiting.

---

## The Technical Decision Worth Bragging About

Chose manual-only value entry over live price-fetching (mfapi.in/CoinGecko/gold APIs) for every instrument type in v1, deliberately cutting a feature the original brainstorm had scoped in. The dashboard's core value — seeing your household's real allocation and completeness — doesn't require live prices, so the tradeoff traded "feels more real-time" for zero external API failure modes, no rate-limit/CORS handling, and a materially smaller v1 surface area, all in service of a hard 30-day Slice-0 kill criterion on a solo-developer project that had already drifted through two prior scope pivots.

**Where this appears:** `CASE_STUDY.md` under "Decisions and tradeoffs" (source: `DECISIONS_LOG.md` D-002, D-008)

---

## Recruiter Grep Keywords (3 max)

1. "multi-tenant Postgres schema"
2. "PWA install + offline-first"
3. "serverless edge API" (Hono on Vercel Functions + Drizzle + Neon)

---

## README Placement Check

Before shipping, confirm:

- [ ] One-sentence hook is the first line of the README after the project name
- [ ] Hero screenshot appears in the README above the fold
- [ ] Technical decision is referenced in the README with a link to CASE_STUDY.md
- [ ] Keywords appear naturally in the README (not stuffed)
