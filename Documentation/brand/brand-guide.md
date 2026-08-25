# Brand Guide — Vittam (Household Financial Planning PWA)

**Last updated:** 2026-08-25 (D-016 Slice 5 — full-platform mint/treasury redesign, Stage 4)
**Status:** Approved at Phase 2 Stage 4 gate, 2026-08-12; **superseded 2026-08-25** by the mint/treasury visual system below. Living document — update here first, never in components. Product name locked 2026-08-12, unchanged by this pass.
**Source of the current system:** `Documentation/design/concept/vittam-mint-folio.html` (the approved concept folio, "The Vittam Mint"), extracted into `Documentation/design/tokens/tailwind.config.ts` and `globals.css`. Landing, Dashboard, Explore, Portfolio, and Goal planner are covered by the folio's own plates. Onboarding, Profile, and instrument detail have not been restyled yet — they inherit these tokens once wireframed in their own future slices (see `WIREFRAMES.md`'s D-016 Slice 5 section).

---

## 1. Identity

- **Product name:** Vittam (Sanskrit for wealth). Locked, not a placeholder.
- **Positioning sentence:** Personal financial planning is not an expert-level job — this is what it looks like when someone builds that clearly.
- **Visual philosophy (2026-08-25):** Engraved currency / vault. "Light = fresh currency paper. Dark = vault interior. One engraved language, two native materials." Supersedes the 2026-08-12 "CFP's vertical one-pager" framing — the CFP-document *voice* (§3, unchanged) still holds, but the *visual* metaphor is now the vault/currency pair, directly visualizing the D-014 encryption story ("we cannot read your data") rather than the printed-document metaphor.
- **The one design question that replaces all style debates:** *Does this surface trace to the vault/currency metaphor, or is it a bare component-library default wearing the metaphor's colors?* (Replaces the "printed client plan" question, which the CFP-voice guidance in §3 still answers for copy.)

---

## 2. Visual System

### Color Palette (2026-08-25 — mint/brass, replaces teal)

Full CSS variables in `Documentation/design/tokens/globals.css`. Each color is defined natively per theme — dark is not light dimmed. Quick reference:

| Token | Light hex | Dark hex | Semantic role | Usage rule |
|---|---|---|---|---|
| `--background` | `#F0F3EE` | `#0C110E` | Page background — currency paper / vault interior | Never for cards |
| `--card` | `#FAFCF8` | `#131A15` | Card surfaces | All card backgrounds |
| `--panel` | `#E9EEE5` | `#0F1511` | Recessed surface | Ledger table head, inset zones only |
| `--foreground` | `#17211A` | `#E7EDE6` | Primary text | Headlines, body, labels |
| `--muted-foreground` | `#5D6B60` | `#8FA093` | Secondary text | Helper text, metadata |
| `--primary` (mint) | `#186A4F` | `#54C795` | Primary actions, links, active nav, focus | Replaces teal. Dark value is brighter than light, not the same hue dimmed |
| `--primary-strong` | `#0F5540` | `#7FDCB4` | Hover/active state on primary | New this pass |
| `--brass` | `#8F7326` | `#CDAD62` | Second accent, **both themes** | Mono eyebrows, guilloche motif, coin-mark rims, dashed import-zone borders only. Never generic UI chrome, never a second primary button color |
| `--border` | `#D4DBCF` | `#26312A` | Standard border | Cards, dividers, inputs |
| `--border-soft` | `#E2E7DD` | `#1B241E` | Lighter-weight divider | Folio-header underline, subtle separators |
| `--destructive` | `#991B1B` | lightened for WCAG AA on the dark background | Error / danger | Errors, delete only |
| `--accent` (mint tint) | `#DEEBE2` | `#16281F` | Active state backgrounds | Mint tint, not brass |

**Tier status colors** (used only for the Health tier badge; unchanged in structure from v1, "On Track" retinted from teal to mint):

| Tier | Text | Background | Border |
|---|---|---|---|
| Getting Started | `#92400E` | `#FEF3C7` | `#FDE68A` |
| On Track | `#186A4F` (mint, was teal `#1B6B6B`) | `#DEEBE2` | `#B7D8C6` |
| Strong | `#166534` | `#DCFCE7` | `#86EFAC` |

**Asset class palette** (allocation donut + legend, Explore card accent edges. Never generic UI chrome. Retinted this pass, values below are the folio's LIGHT set — dark-mode native values are documented in `tailwind.config.ts`'s `colors.asset` comment and should be promoted to CSS vars, mirroring `--primary`, before Phase 4 implementation):

| Class | Color | Hex (light) |
|---|---|---|
| Equity | Deep mint-green | `#1E7A5A` |
| Debt | Slate-blue | `#4E6B80` |
| Gold | Warm brass-adjacent gold | `#A07E2B` |
| Emergency fund | Teal-cyan, **hatched fill in the donut** (new this pass — solves public-showcase backlog item 1, emergency fund invisibility) | `#2E7D8C` |
| SSY / guaranteed | Muted purple | `#7A5FA8` |
| Alternative | Terracotta | `#A04A3A` |

The same hex serves both themes for most classes; every use is a decorative identity mark beside a text label (accent edge, legend dot, chart fill), never the only carrier of information.

### Typography Scale (2026-08-25 — Bodoni MT / Gill Sans Nova / Cascadia Mono, replaces DM Serif Display / Inter)

**Fonts:** `Bodoni MT` (serif, fallback Didot/Playfair Display) + `Gill Sans Nova` (sans, fallback Gill Sans/Trebuchet MS) + `Cascadia Mono` (mono, fallback Consolas/SF Mono). System/web-safe fallback stacks throughout — none of these three are Google Fonts, so the fallback chain is load-bearing, not decorative. `Yatra One` (wordmark) is retained unchanged; the folio does not redesign the wordmark.

| Role | Size | Font | Class name |
|---|---|---|---|
| Wordmark | 20 to 24px | Yatra One | `font-wordmark` (unchanged) |
| Hero | 40px (mobile-fit; folio uses clamp 32–72px for its desktop showcase) | Bodoni MT | `font-serif text-hero` |
| Display | 30px | Bodoni MT | `font-serif text-display` |
| Heading | 24px | Bodoni MT | `font-serif text-heading` |
| Title | 18px | Bodoni MT (folio uses serif for app-bar name; sans for card titles — confirm per-instance) | `font-serif text-title` or `font-sans text-title font-semibold` |
| Body Large | 16px | Gill Sans Nova | `font-sans text-body-lg` |
| Body | 14px | Gill Sans Nova | `font-sans text-body` |
| Caption | 13px | Gill Sans Nova | `font-sans text-caption` |
| Label | 12px | Gill Sans Nova | `font-sans text-label` |
| Eyebrow / section label | 11px | Cascadia Mono | `section-label` (utility class, now mono + brass, not sans + muted) |

**Rules:**
- `text-hero` — restricted to the public landing page and `/why`. Never on app screens.
- `font-wordmark` (Yatra One) — the "Vittam" name only. Never for headings, nav, or body text.
- `Bodoni MT` (serif) — only at ≥ 18px (headlines, tier names, donut-center totals, figures with weight). Never in forms, labels, or UI chrome — this raised the size floor from 20px to 18px this pass to match the folio's app-bar name usage.
- `Cascadia Mono` — eyebrows, ALL-CAPS section labels, and `.tabular`/`.num` numeric displays only. Never for prose.
- Section Label — now **mono + brass**, ALL CAPS, `.22em` tracking (was sans + muted-foreground). Only for card section headers ("HOUSEHOLD HEALTH"). Never for nav, body, or CTAs.
- Monetary values — always with `.tabular` class (mono, `font-variant-numeric: tabular-nums`).

### Spacing

Base: Tailwind 4px grid. No custom scale. Unchanged by this pass.

| Usage | Value |
|---|---|
| Card internal padding | `p-4` (16px) mobile; `p-6` (24px) desktop |
| Between cards | `space-y-3` (12px) |
| Page horizontal padding | `px-4` |
| Form field gap | `space-y-4` (16px) |

### Border Radius (2026-08-25 — folio scale)

| Name | Value | Used for |
|---|---|---|
| `rounded` (DEFAULT) | 8px | Buttons, small elements |
| `rounded-md` | 10px | Inputs, fields, panels |
| `rounded-lg` | 12px | Standard cards |
| `rounded-xl` | 14px | Larger cards, spec cards |
| `rounded-2xl` | 16px | App-bar cards, bottom sheets |
| `rounded-sm` | 4px | Small badges, legend dots |
| `rounded-pill` | 999px | Theme toggle, badges, ledger tabs (new named token, was implicit `rounded-full`) |
| `rounded-coin` | 50% | FAB, avatar, mintmark (new named token) |

### Shadows (2026-08-25 — folio's two-level elevation)

| Token | Used for |
|---|---|
| `shadow-card` | Cards — matches folio's `--shadow` (was a separate, lighter value) |
| `shadow-lift` | Hover/elevated state (ledger cards, counsel cards) — new this pass, matches folio's `--shadow-lift` |
| `.emboss` (text-shadow utility, not boxShadow) | Serif headlines only — a subtle engraved-plate highlight, folio's `--emboss` |

`shadow-sheet` / `shadow-modal` from v1 are retained as-is for bottom sheets/modals — the folio does not define its own values for these; do not invent new ones without checking the folio's app-frame shadow first.

### Animation

- **Philosophy:** Purposeful, not decorative. Motion communicates state change, not personality. Folio's explicit negative-constraint guard (Stage 2, Design Risk in Stage 1): no gradients, no glassmorphism, no decorative motion.
- `prefers-reduced-motion` honored globally — all non-essential animations disabled.
- Loading skeletons use the `animate-shimmer` utility (defined in tailwind.config.ts).
- No entrance animations on scroll. No parallax.
- The folio-header's sticky `backdrop-filter: blur()` is UI chrome (a sticky nav treatment), not content motion or glassmorphism — it does not violate the no-blur guard, which targets card/surface treatments.

### Icons

- **Family:** Lucide (already in shadcn baseline). Stroke-based, consistent weight. Unchanged by this pass.
- **Size:** 16px in body text; 20px in navigation and buttons; 24px as standalone icons.
- **Min tap target:** 44px (icon + padding).
- No decorative illustrations on data screens. Empty states use a simple outline icon or none. The folio's guilloche rosettes and reeded dividers are decorative motifs at the page/section level, not icons, and are code-drawn SVG/CSS — this rule (no stock illustration) still holds.

---

## 3. Voice & Tone

Full copy in `Documentation/design/COPY_DECK.md`. Quick reference:

**Voice:** A CFP speaking plainly to a new client. Direct. Assumes intelligence. Personal without being familiar. Educational without being condescending.

| Write | Not |
|---|---|
| "Let's start with your family." | "Let's kick off your financial journey!" |
| "Record a holding" | "Add investment" |
| "Nothing recorded yet." | "No data found" / "Nothing here yet!" |
| "Your best estimate is fine." | "Enter current market value" |
| "This will permanently delete..." | "Are you sure?" |
| "Couldn't load your data. Try again." | "Something went wrong. Please try again later." |

**Never:** Exclamation marks on empty states. "Unlock" anything. "Powerful insights." Filler preambles. Jargon without a definition immediately following.

---

## 4. Component Inventory

| Component | Source | When NOT to use |
|---|---|---|
| Button | shadcn | — |
| Input | shadcn | — |
| Select | shadcn | — |
| Checkbox | shadcn | — |
| Dialog | shadcn | Not for destructive confirmations > 2 lines — use Sheet |
| Sheet (bottom) | shadcn | Not for simple alerts — use Toast |
| Toast | shadcn | Not for persistent errors — use inline error |
| Skeleton | shadcn | Not for auth-blocked states — use redirect |
| Badge | shadcn | Tier badge only — not for status chips elsewhere |
| Separator | shadcn | Between form sections only |
| Progress | shadcn | Onboarding step indicator only |
| Label | shadcn | Always paired with an Input |
| Textarea | shadcn | Notes field only |
| HealthTierCard | Custom | — |
| AllocationDonut | Custom (Recharts) | Never show % unless ≥1 holding exists |
| NudgeCard | Custom | Only one nudge shown at a time, ever |
| HoldingRow | Custom | — |
| SectionCard | Custom | — |
| BottomTabBar | Custom | Never hide on scroll |
| SiteHeader | Custom (2026-08-05) | One per app, mounted above routes — never per page |

### shadcn install command

```bash
npx shadcn@latest add button input select checkbox dialog sheet toast skeleton badge separator progress label textarea
```

---

## 5. Anti-Patterns

What this product refuses to be:

- Not a stock broker UI — no live price tickers, no P&L in red/green
- Not a robo-advisor — no buy/sell CTAs, no recommendation engine
- Not a chatbot — no conversational onboarding, no "Hi [name]! 👋"
- Not a dashboard of widgets — 3 sections on the home screen, nothing more
- Not AI-generated — no gradient cards, no glassmorphism, no stock illustration icons
- Not generic shadcn/Tailwind defaults — every surface must trace to the vault/currency metaphor (Stage 2 negative constraint, D-016 Slice 5); a bare rounded-xl card with a subtle gray border and no motif is a fail, not a neutral default

---

## 6. Accessibility Checklist

- [ ] 44px minimum tap targets on all interactive elements
- [ ] Visible focus rings on every focusable element (`ring-2 ring-ring ring-offset-2`)
- [ ] `prefers-reduced-motion` support — shimmer and transitions disabled
- [ ] All form inputs have associated `<label>` elements
- [ ] No color-only information — tier status uses label + color, never color alone
- [ ] Asset class donut legend uses color + text label (not color + nothing)
- [ ] `aria-hidden` on decorative separator lines
- [ ] Consent modal: focus trapped until CTA is pressed
- [ ] Bottom tab bar: `aria-current="page"` on active tab

**Contrast:** All text on card surfaces meets WCAG AA (4.5:1 for body, 3:1 for large text). Section labels (12px, wide tracking) use `--muted-foreground` on `--card` — verify contrast at implementation; may need to use `--foreground` instead if it fails.

---

## 7. Inevitability Test Results

*"If the design language could be transplanted to a different product without feeling wrong, it was imposed, not derived."*

**v1 (2026-08-12), superseded system — kept for history:**

| Choice | Derived from | Result |
|---|---|---|
| Warm off-white `#F7F5F1` background | "Paper" in the CFP one-pager metaphor | Fails on a crypto exchange, a dev tool. Passes. |
| DM Serif Display for display text | Editorial authority of a CFP's printed document | Fails on a SaaS dashboard or task manager. Passes. |
| Section labels in ALL CAPS + wide tracking | CFP document section dividers | Fails on a social app. Passes. |
| 3 sections on home screen only | CFP one-pager presents one thing at a time | Would feel limiting on a trading platform — right here. Passes. |
| Muted asset class colors | Annual report palette, not bright UI | Would feel dull on travel/e-commerce — authoritative here. Passes. |

**2026-08-25, current system (D-016 Slice 5):**

| Choice | Derived from | Result |
|---|---|---|
| Mint green primary, brass second accent | Fresh currency paper (light) / vault interior (dark) — an engraved-note palette, not a generic brand color pick | Would feel arbitrary on a task manager or dev tool — here it is the literal color of the metaphor. Passes. |
| Bodoni MT (serif) for headlines/figures | The weight and formality of engraved currency typography and treasury ledgers | Fails on a social app or a playful consumer product. Passes. |
| Cascadia Mono for eyebrows and tabular figures | Ledger/ticker convention — fixed-width numerals read as "counted," not "estimated" | Would feel cold on a lifestyle app; correct here, where the product's whole claim is precision about real money. Passes. |
| Guilloche rosette + reeded-edge motifs, code-drawn | The literal engraving on currency notes and coin edges, a real anti-counterfeiting device repurposed as a trust signal | Fails anywhere the "this is genuine, not counterfeit" claim isn't the point — here the product's whole pitch is "your data is genuinely protected." Passes. |
| Hatched donut slice for the emergency fund | Ledger convention for "reserved, not spendable" (cross-hatching on a balance sheet) | Would be a strange one-off flourish on a generic pie chart elsewhere; here it solves a real named gap (emergency fund invisibility) using the vocabulary the rest of the page already speaks. Passes. |
| Vault frame (weighty border, deliberate inset) around major cards | Safe-deposit box / vault door framing, visualizing the D-014 "we cannot read your data" claim | Would read as an arbitrary heavy-border trend on a product without an encryption claim to back it — here it is that claim, made visible. Passes. |

**Verdict: all choices derived, none imposed, in both systems. Current system inherits the same discipline the v1 system was held to.**

---

## 8. Token Quick Reference (2026-08-25)

| What you want | Class / token |
|---|---|
| Page background | `bg-background` |
| Card surface | `bg-card border border-border rounded-lg shadow-card` |
| Primary text | `text-foreground` |
| Secondary / helper text | `text-muted-foreground` |
| Primary action | `bg-primary text-primary-foreground` |
| Mint link / text | `text-primary` |
| Brass eyebrow / motif accent | `text-brass` / `border-brass` — scoped uses only, see §2 |
| Section label | `section-label` (utility class — now mono + brass) |
| Hero heading (landing/`/why` only) | `font-serif text-hero` |
| Display heading | `font-serif text-display` |
| Monetary value | `tabular` (utility class, mono) + appropriate `text-*` size |
| Reeded divider | `reed` (utility class) |
| Tier badge: Getting Started | `bg-tier-getting-started-bg text-tier-getting-started border border-tier-getting-started-border` |
| Tier badge: On Track | `bg-tier-on-track-bg text-tier-on-track border border-tier-on-track-border` |
| Tier badge: Strong | `bg-tier-strong-bg text-tier-strong border border-tier-strong-border` |
| Donut color: equity | `fill-asset-equity` / `#1E7A5A` |
| Donut color: emergency fund | `fill-asset-ef` / `#2E7D8C`, hatched pattern fill |
| Error text | `text-destructive` |
| Error border | `border-destructive` |
| Bottom sheet | `rounded-2xl shadow-sheet` |
| Elevated/hover card | `shadow-lift` |
