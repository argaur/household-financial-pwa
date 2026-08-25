# Component Showcase — Vittam (Household Financial Planning PWA)

**Stage:** Design Stage 6 (Handoff)
**Status:** final for Phase 2 v1. **D-016 Slice 5 (2026-08-25) adds new motif components below** — Stage 4 for that slice, not yet through its own Stage 6 handoff.
**Purpose:** Reference for Phase 4 build fidelity — every component that will exist in the app, its states, its governing tokens, and where it appears. Not implementation code; the contract implementation must match.

---

## shadcn baseline (installed as-is, no overrides)

Install command (also in `brand-guide.md` §4):

```bash
npx shadcn@latest add button input select checkbox dialog sheet toast skeleton badge separator progress label textarea
```

| Component | States needed | Used on |
|---|---|---|
| Button (primary, ghost, danger link) | default, hover, focus-visible, disabled, loading | Every screen — CTAs |
| Input (text, number, date) | default, focus, error, disabled | Onboarding forms, holding form, add-member sheet |
| Select | default, open, selected, disabled | Instrument picker, relationship, risk appetite |
| Checkbox | unchecked, checked, focus | Emergency fund flag |
| Dialog | open/closed | Not used for destructive confirms >2 lines (see Sheet) |
| Sheet (bottom) | open/closed, drag-to-dismiss | Add member, add/edit holding, delete-account confirm |
| Toast | success, error | Save-failed transient errors |
| Skeleton | loading (shimmer) | Dashboard, Portfolio, Library — see WIREFRAMES.md §8 |
| Badge | tier variants (3), asset-class variants (6) | Health tier badge, donut legend swatches |
| Separator | default | Between form sections, card dividers |
| Progress | 3-segment onboarding indicator | Onboarding steps 1–3 |
| Label | default, required | Every form field |
| Textarea | default, focus | Notes field only |

---

## Custom components (built for this product)

### HealthTierCard
- **States:** Getting Started (0–1) / On Track (2–3) / Strong (4–5), each with fixed tier copy from `COPY_DECK.md`
- **Tokens:** tier text/background/border triplets from `brand-guide.md` §2 (tier status colors) — never color alone (accessibility rule)
- **Appears on:** Home / Dashboard (all 3 states — populated, empty, error does not show this card)

### AllocationDonut
- **States:** populated (real segments + legend), ghost/empty (outline ring, no segments — flagged as a real implementation cost in `SPEC.md` §7), loading (shimmer circle per WIREFRAMES.md §8)
- **Tokens:** asset-class palette (6 colors, `brand-guide.md` §2) — Recharts, never shows a percentage unless ≥1 holding exists (component-inventory rule)
- **Appears on:** Home / Dashboard

### NudgeCard
- **States:** one of 5 fixed check bodies (member-without-holdings, no-emergency-fund, parent-without-protection, <3 asset classes, stale current values) — copy fixed in `COPY_DECK.md`
- **Rule:** exactly one rendered at any time, never zero (post-onboarding) or more than one — enforced in `SPEC.md` §6
- **Appears on:** Home / Dashboard (populated + empty states)

### HoldingRow
- **States:** default, tapped (opens edit sheet)
- **Grouping:** rendered inside per-member group blocks, never flat or grouped by asset class
- **Appears on:** Portfolio — Populated

### SectionCard
- **States:** default, tapped (opens library section)
- **Layout:** full-width list, never a grid (locked wireframe decision)
- **Appears on:** Explore — Library Sections

### BottomTabBar
- **States:** each of 4 tabs active/inactive, FAB always enabled
- **Rule:** never hidden on scroll, in any screen state — enforced in `SPEC.md` §6
- **Appears on:** every screen except onboarding, consent modal, and instrument detail

---

## D-016 Slice 5 — Mint/Treasury Motif Components (new, 2026-08-25)

Extracted from `Documentation/design/concept/vittam-mint-folio.html`. These are new primitives the flagship-screen restyle introduces; they are not a replacement for the custom components above (HealthTierCard, AllocationDonut, etc. keep their existing data contracts and states) — they are the visual frame/motif those components render inside once retokened.

| Component | States | Tokens | Appears on (folio plates) |
|---|---|---|---|
| VaultFrame (card wrapper) | default, hover (lift) | `border-border rounded-lg shadow-card`, `shadow-lift` on hover | Every major card — health, donut, nudge, ledger, counsel cards |
| GuillocheMotif | static, decorative | `text-brass`, `--guilloche-opacity` (.38 light / .35 dark) | Landing cover only — code-drawn SVG, not raster |
| ReededDivider | static | `reed` utility class | Section breaks, FAB rim visual |
| CoinFAB | default, pressed | `rounded-coin`, brass reeded rim, mint fill | Bottom tab bar center action (replaces the v1 FAB's plain circle) |
| Mintmark (small brass ring) | static | `border-brass`, reeded conic-gradient mask | Site header / folio header wordmark accent |
| LedgerTable | default, with total row (double rule) | `font-mono .num`, `--panel` header bg | Portfolio, Goal planner proposed-ledger cards |
| ReserveHatchSlice (donut segment) | static | `fill-asset-ef`, hatched pattern fill | AllocationDonut — the emergency-fund slice specifically, solves public-showcase backlog item 1 |
| ThemeToggle (pill) | light active, dark active | `rounded-pill`, `bg-primary` on active segment | Folio header only — confirm whether the app needs an equivalent, or keeps its existing theme toggle unchanged |

**Not yet designed:** onboarding, Profile, and instrument-detail equivalents of any of the above. They inherit these tokens/components once wireframed in their own future slices (per Gaurav's direction, `WIREFRAMES.md` D-016 Slice 5 section).

---

## Cross-reference

- Token source: `Documentation/design/tokens/tailwind.config.ts` + `globals.css`
- Copy source: `Documentation/design/COPY_DECK.md`
- Layout source: `Documentation/design/WIREFRAMES.md`
- Full usage rules: `Documentation/brand/brand-guide.md` §4 (Component Inventory)
