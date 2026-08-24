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

---

## D-016 Feature Bundle — Portfolio Angle (Phase 1, 2026-08-17)

Added by the Phase 1 Solution Stage interview. The v1 angle above still stands for the product as a whole; this section is what the bundle adds. **Approved 2026-08-17** with the Phase 1 gate.

### What changed about the pitch

v1 chose craft and architecture over the product-judgment meta-narrative. Correct for a tracker. This bundle produces material v1 did not have: a written decision where a hard privacy guarantee met a feature that structurally could not respect it, resolved by a narrow disclosed exception rather than by dropping the feature or quietly weakening the claim.

**The bundle leads with that decision.** Redesign and architecture become supporting evidence.

### One-Sentence Hook (this bundle)

> Model a different financial future beside your current one, get AI counsel on the gap, and read exactly what that costs you in privacy, because the product says so on its own privacy page.

### The Decision Worth Bragging About

Vittam encrypts household data in the browser. The server holds ciphertext and two wrapped copies of a key it cannot open (D-014). Then the product needed an AI layer, and an AI cannot reason about data nobody can read.

Three options existed. Call Anthropic from the browser, which ships a secret API key to every client. Read plaintext on the server, which makes the encryption claim false. Or drop the feature.

The chosen fourth path: the browser decrypts locally, sends plaintext over TLS to a thin server route that forwards it to Anthropic and relays the reply, and **writes nothing to Neon and nothing to logs**. The server sees plaintext in flight for one request, never at rest.

The part that makes it a portfolio artifact is not the architecture. It is that the exception is **disclosed on `/why` and `/privacy` in plain language**, scoped exactly, and logged with its rejected alternatives (D-017, D-018). A hiring manager sees plenty of people who shipped an AI feature. Very few can point at a decision where they knowingly traded a guarantee they had made, bounded the trade, and published the price.

The same section carries the second, smaller disclosure: the bulk-import template ships prefilled with household member names, so a downloaded spreadsheet is plaintext PII outside the encrypted boundary the moment it lands on a device. Accepted, disclosed, not hidden.

**Where this appears:** `CASE_STUDY.md` under "Decisions and tradeoffs" (source: `DECISIONS_LOG.md` D-014, D-017, D-018), plus in-product on `/why` and `/privacy`.

### The Screenshot

**What to capture:** the dashboard with the ledger tab strip visible, an alternate ledger active, and its compare strip showing the delta against Current, in the Mint treasury visual language.

**Caption:**
> Current stays untouched. Everything else is a what-if you can put beside it.

**Second capture, for the case study rather than the README:** the `/privacy` encryption-exception section. An unglamorous screenshot that carries the actual argument.

### Recruiter Grep Keywords (3 max, this bundle)

1. "client-side E2E encryption with a disclosed exception"
2. "LLM proxy architecture (no persistence, no logging)"
3. "capped AI usage with Apply/Dismiss human-in-the-loop"

### Placement Check (this bundle)

- [ ] Encryption-exception section live on `/why` and on `/privacy`, same substance, no marketing softening
- [ ] Bulk-import PII line appears in the same place as the AI exception
- [ ] Ledger compare screenshot in the README above the fold, replacing or joining the v1 hero
- [ ] `CASE_STUDY.md` carries the three-options-and-a-fourth narrative, with the rejected options named
- [ ] Every AI card in screenshots shows Apply and Dismiss, so the human-in-the-loop claim is visible rather than asserted
