# Brand Guide — Household Financial Planning PWA

**Last updated:** 2026-07-02
**Status:** Approved at Phase 2 Stage 4 gate. Living document — update here first, never in components.

---

## 1. Identity

- **Product name:** (TBD — no name locked yet. Placeholder: "FamilyPlan" for internal reference only)
- **Positioning sentence:** Personal financial planning is not an expert-level job — this is what it looks like when someone builds that clearly.
- **Visual philosophy:** A CFP's vertical one-pager, made interactive on a mobile screen.
- **The one design question that replaces all style debates:** *Would a CFP include this section in a printed client plan?*

---

## 2. Visual System

### Color Palette

Full CSS variables in `Documentation/design/tokens/globals.css`. Quick reference:

| Token | Light hex | Dark hex | Semantic role | Usage rule |
|---|---|---|---|---|
| `--background` | `#F7F5F1` | `#141210` | Page background | Never for cards |
| `--card` | `#FDFCFA` | `#1E1C19` | Card surfaces | All card backgrounds |
| `--foreground` | `#1A1814` | `#F7F5F1` | Primary text | Headlines, body, labels |
| `--muted-foreground` | `#6B6660` | `#A09A94` | Secondary text | Helper text, metadata |
| `--primary` | `#1B6B6B` | `#3D9B9B` | Deep teal | Primary actions, links, active nav, focus |
| `--border` | `#E8E5E0` | `#2C2A26` | Warm border | Cards, dividers, inputs |
| `--destructive` | `#991B1B` | `#991B1B` | Error / danger | Errors, delete only |
| `--accent` | `#E8F3F2` | dark teal tint | Teal tint bg | Active state backgrounds |

**Tier status colors** (used only for the Health tier badge):

| Tier | Text | Background | Border |
|---|---|---|---|
| Getting Started | `#92400E` | `#FEF3C7` | `#FDE68A` |
| On Track | `#1B6B6B` | `#E8F3F2` | `#B2DFDB` |
| Strong | `#166534` | `#DCFCE7` | `#86EFAC` |

**Asset class palette** (used only in the allocation donut and its legend):

| Class | Color | Hex |
|---|---|---|
| Equity | Deep teal | `#2D6A6A` |
| Debt | Slate | `#475569` |
| Gold | Warm amber | `#B45309` |
| Hybrid & Guaranteed | Muted purple | `#6D28D9` |
| Real Estate | Forest green | `#15803D` |
| Alternative | Terracotta | `#9F3939` |

### Typography Scale

**Fonts:** `DM Serif Display` (400 only) + `Inter` (400, 500, 600). Load via Google Fonts.

| Role | Size | Font | Weight | Class name |
|---|---|---|---|---|
| Display | 32px | DM Serif Display | 400 | `font-display text-display` |
| Heading | 24px | DM Serif Display | 400 | `font-display text-heading` |
| Title | 18px | Inter | 600 | `font-sans text-title font-semibold` |
| Body Large | 16px | Inter | 400 | `font-sans text-body-lg` |
| Body | 14px | Inter | 400 | `font-sans text-body` |
| Caption | 12px | Inter | 400 | `font-sans text-caption` |
| Section Label | 12px | Inter | 600 | `section-label` (utility class in globals.css) |

**Rules:**
- `DM Serif Display` — only at ≥ 20px. Never in forms, labels, or UI chrome.
- `Section Label` — ALL CAPS, wide tracking — only for card section headers ("HOUSEHOLD HEALTH"). Never for nav, body, or CTAs.
- Monetary values — always with `.tabular` class (`font-variant-numeric: tabular-nums`).

### Spacing

Base: Tailwind 4px grid. No custom scale.

| Usage | Value |
|---|---|
| Card internal padding | `p-4` (16px) mobile; `p-6` (24px) desktop |
| Between cards | `space-y-3` (12px) |
| Page horizontal padding | `px-4` |
| Form field gap | `space-y-4` (16px) |

### Border Radius

| Name | Value | Used for |
|---|---|---|
| `rounded-lg` | 8px | Cards |
| `rounded-md` | 6px | Buttons, inputs |
| `rounded-sm` | 4px | Badges, small chips |
| `rounded-xl` | 12px | Bottom sheets only |
| `rounded-2xl` | 16px | Modals only |

### Shadows

| Token | Used for |
|---|---|
| `shadow-card` | Cards (very subtle) |
| `shadow-sheet` | Bottom sheets |
| `shadow-modal` | Modals, consent overlay |

### Animation

- **Philosophy:** Purposeful, not decorative. Motion communicates state change, not personality.
- `prefers-reduced-motion` honored globally — all non-essential animations disabled.
- Loading skeletons use the `animate-shimmer` utility (defined in tailwind.config.ts).
- No entrance animations on scroll. No parallax.

### Icons

- **Family:** Lucide (already in shadcn baseline). Stroke-based, consistent weight.
- **Size:** 16px in body text; 20px in navigation and buttons; 24px as standalone icons.
- **Min tap target:** 44px (icon + padding).
- No decorative illustrations on data screens. Empty states use a simple outline icon or none.

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

| Choice | Derived from | Result |
|---|---|---|
| Warm off-white `#F7F5F1` background | "Paper" in the CFP one-pager metaphor | Fails on a crypto exchange, a dev tool. Passes. |
| DM Serif Display for display text | Editorial authority of a CFP's printed document | Fails on a SaaS dashboard or task manager. Passes. |
| Section labels in ALL CAPS + wide tracking | CFP document section dividers | Fails on a social app. Passes. |
| 3 sections on home screen only | CFP one-pager presents one thing at a time | Would feel limiting on a trading platform — right here. Passes. |
| Muted asset class colors | Annual report palette, not bright UI | Would feel dull on travel/e-commerce — authoritative here. Passes. |

**Verdict: all choices derived, none imposed. Test passes.**

---

## 8. Token Quick Reference

| What you want | Class / token |
|---|---|
| Page background | `bg-background` |
| Card surface | `bg-card border border-border rounded-lg shadow-card` |
| Primary text | `text-foreground` |
| Secondary / helper text | `text-muted-foreground` |
| Primary action | `bg-primary text-primary-foreground` |
| Teal link / text | `text-primary` |
| Section label | `section-label` (utility class) |
| Display heading | `font-display text-display` |
| Monetary value | `tabular` (utility class) + appropriate `text-*` size |
| Tier badge: Getting Started | `bg-tier-getting-started-bg text-tier-getting-started border border-tier-getting-started-border` |
| Tier badge: On Track | `bg-tier-on-track-bg text-tier-on-track border border-tier-on-track-border` |
| Tier badge: Strong | `bg-tier-strong-bg text-tier-strong border border-tier-strong-border` |
| Donut color: equity | `fill-asset-equity` / `#2D6A6A` |
| Error text | `text-destructive` |
| Error border | `border-destructive` |
| Bottom sheet | `rounded-xl shadow-sheet` |
