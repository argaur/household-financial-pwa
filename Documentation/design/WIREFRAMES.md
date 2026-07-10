# Wireframes — Household Financial Planning PWA

**Stage:** Design Stage 3
**Status:** draft
**Date:** 2026-07-02
**Viewport reference:** 390px × 844px (iPhone 14 Pro). Bottom tab bar = 80px. Safe area top = 44px. Usable content area ≈ 720px tall.
**Layout principle:** Vertical document flow — each screen scrolls through sections like a CFP one-pager. No lateral navigation within a screen.

---

## End-to-End Flow Diagram

```
[App boot]
    │
    ├─ No Clerk session ──────────────────► [Clerk sign-in / sign-up screen]
    │                                                │
    │                                                ▼
    └─ Clerk session exists                   [Consent modal — shown once]
             │                                       │
             ▼                                       ▼
     API: fetch household                    [Onboarding Step 1]
             │                               Create household
             ├─ No household ─────────────►  [Onboarding Step 2]
             │                               Add family members
             │                               [Onboarding Step 3]
             │                               Add first holding
             │                                       │
             └─ Household exists ─────────────────── ▼
                      │                       [Home / Dashboard]
                      ▼                              │
              [Home / Dashboard] ◄───────────────────┤
                      │                              │
             [Bottom tab bar navigation]             │
                      │                              │
          ┌───────────┼───────────┬──────────┐       │
          ▼           ▼           ▼          ▼       │
       [Home]     [Explore]  [Portfolio] [Profile]   │
                      │           │
               [Library section]  [Add holding form]
                      │           (via FAB or empty state CTA)
               [Instrument detail]
                      │
               [Record this in my plan]
                      │
               [Add holding form] ──► [Portfolio / Dashboard updated]
```

---

## Wireframe Notation

```
[TXT]    = text element (size/weight noted inline)
[IMG]    = image / chart / illustration
[BTN]    = primary button (full width unless noted)
[LINK]   = text link or secondary CTA
[INP]    = input field
[SEL]    = select / dropdown
[CHK]    = checkbox
[ICO]    = icon
[TAB]    = tab bar item
[---]    = divider / section separator
[~~~]    = above-fold fold line
░░░░░    = skeleton / loading placeholder
```

---

## 0. Consent Modal

Shown once after first sign-in, before onboarding Step 1. Bottom sheet overlay.

```
╔═════════════════════╗
║                     ║
║  ╔═══════════════╗  ║
║  ║               ║  ║
║  ║ [TXT lg-bold] ║  ║
║  ║ Before we     ║  ║
║  ║ begin         ║  ║
║  ║               ║  ║
║  ║ [TXT sm]      ║  ║
║  ║ This tool     ║  ║
║  ║ helps you     ║  ║
║  ║ track and     ║  ║
║  ║ understand    ║  ║
║  ║ your          ║  ║
║  ║ household's   ║  ║
║  ║ financial     ║  ║
║  ║ picture. It   ║  ║
║  ║ does not      ║  ║
║  ║ constitute    ║  ║
║  ║ financial     ║  ║
║  ║ advice...     ║  ║
║  ║               ║  ║
║  ║ [BTN primary] ║  ║
║  ║ I understand  ║  ║
║  ║   — continue  ║  ║
║  ╚═══════════════╝  ║
╚═════════════════════╝
```

**Layout notes:** Bottom sheet, dismissible only via the CTA (not tap-outside). No close X. Forces acknowledgement.

---

## 1a. Onboarding — Step 1 (Create Household)

```
╔═════════════════════╗
║  ← [LINK cancel]    ║  ← only shown if user has navigated back; hidden on first visit
╠═════════════════════╣
║ [progress bar ●○○]  ║  ← thin bar, 3 segments, 1 filled
║ [TXT xs] Step 1of3  ║
╠═════════════════════╣
║                     ║
║ [TXT xl-bold]       ║
║ Let's start with    ║
║ your family.        ║
║                     ║
║ [TXT sm-muted]      ║
║ Before we can plan, ║
║ we need to know     ║
║ who we're           ║
║ planning for.       ║
║                     ║
║ [---]               ║
║                     ║
║ [TXT sm-label]      ║
║ Your household name ║
║ [INP]               ║
║ e.g. Gupta Family   ║
║                     ║
║ [TXT xs-muted]      ║
║ Appears as a label  ║
║ throughout your     ║
║ plan — just for you.║
║                     ║
║ [~~~~~~~~~~~~~~~]   ║  ← fold line
║                     ║
╠═════════════════════╣
║ [BTN primary]       ║  ← sticky bottom
║      Continue       ║
╚═════════════════════╝
```

---

## 1b. Onboarding — Step 2 (Add Family Members) — Empty state

```
╔═════════════════════╗
║ [progress bar ●●○]  ║
║ [TXT xs] Step 2of3  ║
╠═════════════════════╣
║                     ║
║ [TXT xl-bold]       ║
║ Who are we          ║
║ planning for?       ║
║                     ║
║ [TXT sm-muted]      ║
║ Add everyone whose  ║
║ financial future    ║
║ you want to track.  ║
║                     ║
║ [---]               ║
║                     ║
║  ┌─────────────┐    ║
║  │ [TXT muted] │    ║
║  │ Start by    │    ║
║  │ adding      │    ║
║  │ yourself.   │    ║
║  │             │    ║
║  │ [BTN ghost] │    ║
║  │ Add a family│    ║
║  │   member    │    ║
║  └─────────────┘    ║
║                     ║
║ [~~~~~~~~~~~~~~~]   ║
║                     ║
╠═════════════════════╣
║ [BTN primary]       ║  ← disabled until ≥1 member added
║      Continue       ║
╚═════════════════════╝
```

---

## 1c. Onboarding — Step 2 — Member added, Add member form (sheet)

```
╔═════════════════════╗
║ [progress bar ●●○]  ║
║ [TXT xs] Step 2of3  ║
╠═════════════════════╣
║ ┌─────────────────┐ ║  ← member card (added)
║ │ Gaurav Gupta    │ ║
║ │ Self · DOB: ... │ ║
║ └─────────────────┘ ║
║                     ║
║ [BTN ghost +]       ║
║ Add another member  ║
║                     ║
║ [~~~~~~~~~~~~~~~]   ║
╠═════════════════════╣
║ [BTN primary]       ║
║     Continue        ║
╚═════════════════════╝
```

**Add member bottom sheet (slides up over Step 2):**
```
╔═════════════════════╗
║  [ICO drag handle]  ║
║                     ║
║ [TXT lg-bold]       ║
║ Add a family member ║
║                     ║
║ [TXT sm] Full name  ║
║ [INP] —             ║
║                     ║
║ [TXT sm] Relationship║
║ [SEL] Self ▾        ║
║                     ║
║ [TXT sm] Date of birth║
║ [INP date] DD/MM/YYYY║
║ [TXT xs-muted]      ║
║ Used to surface     ║
║ age-based milestones║
║                     ║
║ [TXT sm] Risk appetite║
║ [SEL] Optional ▾    ║
║                     ║
║ [BTN primary]       ║
║    Add to plan      ║
╚═════════════════════╝
```

---

## 1d. Onboarding — Step 3 (Add First Holding)

```
╔═════════════════════╗
║ [progress bar ●●●]  ║
║ [TXT xs] Step 3of3  ║
╠═════════════════════╣
║                     ║
║ [TXT xl-bold]       ║
║ What do you         ║
║ currently hold?     ║
║                     ║
║ [TXT sm-muted]      ║
║ Record your first   ║
║ investment or asset.║
║ You can add         ║
║ everything else     ║
║ after.              ║
║                     ║
║ [TXT sm] For        ║
║ [SEL] Gaurav Gupta ▾║
║                     ║
║ [TXT sm] Instrument ║
║ [SEL] Select... ▾   ║
║                     ║
║ [TXT sm] Amount invested (₹) ║
║ [INP number] 0      ║
║                     ║
║ [TXT sm] Current value (₹) ║
║ [INP number] 0      ║
║ [TXT xs-muted]      ║
║ Your best estimate  ║
║ is fine.            ║
║                     ║
║ [~~~~~~~~~~~~~~~]   ║  ← fold line
║                     ║
║ ─ Optional fields ─ ║  ← collapsed by default
║                     ║
║ [CHK] Mark as       ║
║       emergency fund║
║                     ║
╠═════════════════════╣
║ [BTN primary]       ║
║    See my plan      ║
╚═════════════════════╝
```

**Optional fields (expanded, below fold):**
Units held · Monthly SIP · Start date · Maturity date · Nominee · Notes

---

## 2a. Home / Dashboard — Populated (Score 2–3, On Track)

```
╔═════════════════════╗
║ [TXT xs-muted]      ║  ← household name (small, top)
║ Gupta Family        ║
║ [TXT xl-bold]       ║
║ Your plan           ║
╠═════════════════════╣
║                     ║
║ ┌─────────────────┐ ║
║ │[TXT xs-label]   │ ║  ← Health card — full width
║ │ HOUSEHOLD HEALTH│ ║
║ │                 │ ║
║ │ [TXT 2xl-bold]  │ ║
║ │  On Track       │ ║  ← tier name — largest text on card
║ │                 │ ║
║ │ [TXT sm-muted]  │ ║
║ │ 3 of 5 checks   │ ║
║ │ complete        │ ║
║ │                 │ ║
║ │ [---]           │ ║
║ │                 │ ║
║ │ [TXT xs-muted]  │ ║
║ │ Your household  │ ║
║ │ has the         │ ║
║ │ foundations     │ ║
║ │ covered. Keep   │ ║
║ │ building.       │ ║
║ └─────────────────┘ ║
║                     ║
║ [~~~~~~~~~~~~~~~]   ║  ← fold line
║                     ║
║ ┌─────────────────┐ ║
║ │[TXT xs-label]   │ ║  ← Donut card
║ │WHERE YOUR MONEY │ ║
║ │LIVES            │ ║
║ │                 │ ║
║ │   [IMG donut]   │ ║  ← allocation donut, centered
║ │                 │ ║
║ │ ● Equity  62%   │ ║  ← legend rows
║ │ ● Debt    18%   │ ║
║ │ ● Gold    12%   │ ║
║ │ ● Alt      8%   │ ║
║ │                 │ ║
║ │[TXT xs-muted]   │ ║
║ │Total recorded   │ ║
║ │₹34,50,000       │ ║
║ └─────────────────┘ ║
║                     ║
║ ┌─────────────────┐ ║
║ │[TXT xs-label]   │ ║  ← Nudge card
║ │ NEXT STEP       │ ║
║ │                 │ ║
║ │[TXT sm]         │ ║
║ │Rinku has no     │ ║
║ │protection cover │ ║
║ │on record. Term  │ ║
║ │life cover is    │ ║
║ │the foundation...│ ║
║ │                 │ ║
║ │[LINK →]         │ ║
║ │Learn about term │ ║
║ │insurance        │ ║
║ └─────────────────┘ ║
║                     ║
╠═════════════════════╣
║[TAB] [TAB][+][TAB][TAB]║  ← bottom tab bar
║Home  Expl   Port  Prof ║
╚═════════════════════╝
```

---

## 2b. Home / Dashboard — Empty state (Score 0, just onboarded)

```
╔═════════════════════╗
║ Gupta Family        ║
║ [TXT xl-bold]       ║
║ Your plan           ║
╠═════════════════════╣
║                     ║
║ ┌─────────────────┐ ║
║ │ HOUSEHOLD HEALTH│ ║
║ │                 │ ║
║ │ Getting Started │ ║
║ │ 1 of 5 checks   │ ║
║ │ complete        │ ║
║ │ ─────────────── │ ║
║ │ Your plan is in │ ║
║ │ its early stages│ ║
║ │ The steps below │ ║
║ │ will strengthen │ ║
║ │ it.             │ ║
║ └─────────────────┘ ║
║                     ║
║ ┌─────────────────┐ ║
║ │WHERE YOUR MONEY │ ║
║ │LIVES            │ ║
║ │                 │ ║
║ │  [IMG donut     │ ║  ← ghost/outline donut ring (no data segments)
║ │   outline]      │ ║
║ │                 │ ║
║ │[TXT sm-muted]   │ ║
║ │Nothing recorded │ ║
║ │yet. Add your    │ ║
║ │first investment │ ║
║ │to see your      │ ║
║ │allocation.      │ ║
║ │                 │ ║
║ │[BTN ghost]      │ ║
║ │ Record a holding│ ║
║ └─────────────────┘ ║
║                     ║
║ ┌─────────────────┐ ║
║ │ NEXT STEP       │ ║
║ │ [Nudge — Check  │ ║
║ │  #1 or #2...]   │ ║
║ └─────────────────┘ ║
╠═════════════════════╣
║[TAB] [TAB][+][TAB][TAB]║
╚═════════════════════╝
```

---

## 2c. Home / Dashboard — Error state

```
╔═════════════════════╗
║ Gupta Family        ║
║ Your plan           ║
╠═════════════════════╣
║                     ║
║  [ICO warning]      ║
║                     ║
║  [TXT sm]           ║
║  Couldn't load      ║
║  your data. Check   ║
║  your connection    ║
║  and try again.     ║
║                     ║
║  [BTN ghost]        ║
║     Retry           ║
║                     ║
╠═════════════════════╣
║[TAB] [TAB][+][TAB][TAB]║
╚═════════════════════╝
```

---

## 3a. Explore — Library Sections

```
╔═════════════════════╗
║ [TXT xl-bold]       ║
║ What can you        ║
║ invest in?          ║
║ [TXT sm-muted]      ║
║ 30 instruments      ║
║ across 6 asset      ║
║ classes, explained  ║
║ plainly.            ║
╠═════════════════════╣
║                     ║
║ ┌─────────────────┐ ║
║ │ [TXT lg-bold]   │ ║  ← Section card (full width, tap to open)
║ │ Equity          │ ║
║ │ [TXT sm-muted]  │ ║
║ │ Ownership in    │ ║
║ │ companies       │ ║
║ │ [TXT xs-muted]  │ ║
║ │ 5 instruments → │ ║
║ └─────────────────┘ ║
║                     ║
║ ┌─────────────────┐ ║
║ │ Debt            │ ║
║ │ Lending your    │ ║
║ │ money, earning  │ ║
║ │ interest        │ ║
║ │ 5 instruments → │ ║
║ └─────────────────┘ ║
║                     ║
║ ┌─────────────────┐ ║
║ │ Gold            │ ║
║ │ Tangible value, │ ║
║ │ independent of  │ ║
║ │ markets         │ ║
║ │ 5 instruments → │ ║
║ └─────────────────┘ ║
║                     ║
║ [~~~~~~~~~~~~~~~]   ║
║                     ║
║ [+ 3 more sections below fold]
╠═════════════════════╣
║[TAB] [TAB][+][TAB][TAB]║
╚═════════════════════╝
```

---

## 3b. Library Section — Instrument List (e.g. Equity)

```
╔═════════════════════╗
║ ← Explore           ║  ← back nav
║ [TXT xl-bold]       ║
║ Equity              ║
║ [TXT sm-muted]      ║
║ Ownership in        ║
║ companies           ║
╠═════════════════════╣
║                     ║
║ ┌─────────────────┐ ║
║ │ [TXT md-bold]   │ ║  ← Instrument card (5 per section)
║ │ Large Cap Index │ ║
║ │ Fund            │ ║
║ │                 │ ║
║ │ [TXT xs-muted]  │ ║
║ │ Returns: 12–15% │ ║
║ │ Risk: Moderate- │ ║
║ │ High            │ ║
║ │          [→]    │ ║
║ └─────────────────┘ ║
║                     ║
║ ┌─────────────────┐ ║
║ │ Mid & Small Cap │ ║
║ │ Fund            │ ║
║ │ Returns: 14–18% │ ║
║ │ Risk: High      │ ║
║ │          [→]    │ ║
║ └─────────────────┘ ║
║                     ║
║ [~~~~~~~~~~~~~~~]   ║
║ [+ 3 more below]    ║
╠═════════════════════╣
║[TAB] [TAB][+][TAB][TAB]║
╚═════════════════════╝
```

**Progressive disclosure:** Instrument card shows only Name, Returns, Risk at the list level. All other fields visible only on the detail page. Solves Risk 3 (data density at 390px).

---

## 3c. Instrument Detail Page

```
╔═════════════════════╗
║ ← Equity            ║  ← back to section
╠═════════════════════╣
║                     ║
║ [TXT xs badge]      ║
║ EQUITY              ║
║                     ║
║ [TXT xl-bold]       ║
║ Large Cap Index     ║
║ Fund                ║
║                     ║
║ [TXT sm-muted]      ║
║ [instrument summary ║
║  sentence]          ║
║                     ║
║ [---]               ║
║                     ║
║ [TXT xs-label]      ║
║ TYPICAL RETURNS     ║
║ [TXT md]            ║
║ 12–15% per year     ║
║ (historical, not    ║
║ guaranteed)         ║
║                     ║
║ [TXT xs-label]      ║
║ TAX TREATMENT       ║
║ [TXT md]            ║
║ LTCG >1yr: 10%      ║
║ above ₹1L.          ║
║ STCG <1yr: 15%.     ║
║                     ║
║ [~~~~~~~~~~~~~~~]   ║
║                     ║
║ [TXT xs-label]      ║
║ LIQUIDITY           ║
║ [TXT md] High —     ║
║ redeemable any day. ║
║                     ║
║ [TXT xs-label]      ║
║ RISK LEVEL          ║
║ [TXT md] Moderate   ║
║ to High             ║
║                     ║
║ [TXT xs-label]      ║
║ WHO CAN INVEST      ║
║ [TXT md] Indian     ║
║ residents; minors   ║
║ with guardian.      ║
║                     ║
║ [TXT xs-label]      ║
║ MINIMUM INVESTMENT  ║
║ [TXT md] ₹500 / mo  ║
║ (SIP); ₹1,000 lump  ║
║                     ║
╠═════════════════════╣
║ [BTN primary]       ║  ← sticky
║ Record this in      ║
║    my plan          ║
╚═════════════════════╝
```

---

## 4a. Portfolio — Empty State

```
╔═════════════════════╗
║ [TXT xl-bold]       ║
║ Your holdings       ║
╠═════════════════════╣
║                     ║
║                     ║
║  [IMG illustration  ║  ← simple outline illustration
║   — blank ledger    ║    (no coins, no graphs)
║   or document]      ║
║                     ║
║  [TXT md-bold]      ║
║  Nothing recorded   ║
║  yet.               ║
║                     ║
║  [TXT sm-muted]     ║
║  Add your           ║
║  investments,       ║
║  savings, and       ║
║  assets to see      ║
║  your complete      ║
║  household picture. ║
║                     ║
║  [BTN ghost]        ║
║  Record your first  ║
║     holding         ║
║                     ║
╠═════════════════════╣
║[TAB] [TAB][+][TAB][TAB]║
╚═════════════════════╝
```

---

## 4b. Portfolio — Populated

```
╔═════════════════════╗
║ [TXT xl-bold]       ║
║ Your holdings       ║
║ [TXT sm-muted]      ║
║ 5 holdings ·        ║
║ ₹34,50,000          ║
╠═════════════════════╣
║                     ║
║ [TXT sm-bold]       ║  ← Member group header
║ Gaurav Gupta        ║
║ 3 holdings · ₹X     ║
║                     ║
║ ┌─────────────────┐ ║
║ │[TXT sm-bold]    │ ║  ← holding row
║ │ Large Cap Index │ ║
║ │ Fund            │ ║
║ │[TXT xs-muted]   │ ║
║ │ Equity · ₹2,50k │ ║
║ │ current         │ ║
║ └─────────────────┘ ║
║ ┌─────────────────┐ ║
║ │ Physical Gold   │ ║
║ │ Gold · ₹18,00k  │ ║
║ └─────────────────┘ ║
║                     ║
║ [---]               ║
║                     ║
║ [TXT sm-bold]       ║  ← Second member group
║ Rinku               ║
║ 2 holdings · ₹X     ║
║                     ║
║ ┌─────────────────┐ ║
║ │ Parag Parikh    │ ║
║ │ Flexi Cap       │ ║
║ │ Equity · ₹X     │ ║
║ └─────────────────┘ ║
║                     ║
║ [~~~~~~~~~~~~~~~]   ║
║                     ║
╠═════════════════════╣
║[TAB] [TAB][+][TAB][TAB]║
╚═════════════════════╝
```

Holding row → tap → slides to Edit Holding form.

---

## 5. Add / Edit Holding Form

```
╔═════════════════════╗
║ ← [LINK] Cancel     ║
║ [TXT lg-bold]       ║
║ Record a holding    ║  ← (or "Update holding" for edit)
╠═════════════════════╣
║                     ║
║ [TXT sm] For        ║
║ [SEL] Gaurav ▾      ║
║                     ║
║ [TXT sm] Instrument ║
║ [SEL] Select... ▾   ║
║                     ║
║ [TXT sm] Asset class║
║ [INP disabled]      ║  ← auto-filled from instrument
║ Equity              ║
║                     ║
║ [TXT sm]            ║
║ Amount invested (₹) ║
║ [INP number]        ║
║                     ║
║ [TXT sm]            ║
║ Current value (₹)   ║
║ [INP number]        ║
║ [TXT xs-muted]      ║
║ Your best estimate. ║
║ Update anytime.     ║
║                     ║
║ ─ Optional ─        ║  ← expandable
║ Units held          ║
║ Monthly SIP (₹)     ║
║ Start date          ║
║ Maturity date       ║
║ Nominee             ║
║                     ║
║ [CHK]               ║
║ Mark as emergency   ║
║ fund                ║
║ [TXT xs-muted]      ║
║ This is my          ║
║ household's         ║
║ emergency reserve.  ║
║                     ║
║ [TXT sm] Notes      ║
║ [INP textarea]      ║
║                     ║
║ [~~~~~~~~~~~~~~~]   ║
╠═════════════════════╣
║ [BTN primary]       ║
║    Add to plan      ║  ← (or "Save changes" for edit)
╚═════════════════════╝
```

---

## 6. Profile

```
╔═════════════════════╗
║ [TXT xl-bold]       ║
║ Your account        ║
╠═════════════════════╣
║                     ║
║ [TXT xs-label]      ║
║ YOUR HOUSEHOLD      ║
║ ┌─────────────────┐ ║
║ │ [TXT md-bold]   │ ║
║ │ Gupta Family    │ ║
║ │ [LINK] Edit     │ ║
║ └─────────────────┘ ║
║                     ║
║ [TXT xs-label]      ║
║ FAMILY MEMBERS      ║
║ ┌─────────────────┐ ║
║ │ Gaurav Gupta    │ ║
║ │ Self · 33 yrs   │ ║
║ └─────────────────┘ ║
║ ┌─────────────────┐ ║
║ │ Rinku           │ ║
║ │ Spouse · 30 yrs │ ║
║ └─────────────────┘ ║
║ [BTN ghost +]       ║
║ Add a family member ║
║                     ║
║ [---]               ║
║                     ║
║ [TXT xs-label]      ║
║ ACCOUNT             ║
║ [TXT sm]            ║
║ ar.gaurav20@...     ║  ← email from Clerk
║                     ║
║ [LINK danger]       ║
║ Sign out            ║
║                     ║
║ [LINK danger]       ║
║ Delete account      ║
║                     ║
╠═════════════════════╣
║[TAB] [TAB][+][TAB][TAB]║
╚═════════════════════╝
```

---

## 7. "Why These Choices?" Page

```
╔═════════════════════╗
║ ← [back to Profile] ║
╠═════════════════════╣
║                     ║
║ [TXT xl-bold]       ║
║ How this was        ║
║ built               ║
║                     ║
║ [TXT sm-muted]      ║
║ Every decision in   ║
║ this product has a  ║
║ reason. Here's the  ║
║ thinking behind     ║
║ what you're using.  ║
║                     ║
║ [---]               ║
║                     ║
║ [TXT sm]            ║
║ Most financial      ║
║ products are built  ║
║ for brokers, not    ║
║ for households...   ║
║                     ║
║ [Decision entry 1]  ║  ← one block per D-00x entry
║ [Decision entry 2]  ║
║ [Decision entry N]  ║
║                     ║
║ [~~~~~~~~~~~~~~~]   ║
║                     ║
║ [LINK external]     ║
║ View full decision  ║
║ log on GitHub →     ║
║                     ║
╠═════════════════════╣
║[TAB] [TAB][+][TAB][TAB]║
╚═════════════════════╝
```

---

## 8. Loading Skeletons

Used on every dynamic screen while data is fetching. Preserve layout — skeletons match the populated layout exactly.

**Dashboard loading:**
```
╔═════════════════════╗
║ ░░░░░░░░░           ║  ← household name skeleton
║ ░░░░░░░░░░░░        ║  ← page title skeleton
╠═════════════════════╣
║ ┌─────────────────┐ ║
║ │ ░░░░░░░░░░░░░░░ │ ║  ← Health card skeleton (3 lines)
║ │ ░░░░░░░         │ ║
║ │ ░░░░░░░░░░░░░   │ ║
║ └─────────────────┘ ║
║ ┌─────────────────┐ ║
║ │     ░░░░░░░░    │ ║  ← Donut skeleton (circle)
║ │   ░░      ░░   │ ║
║ │  ░░░      ░░░  │ ║
║ │  ░░░      ░░░  │ ║
║ │   ░░      ░░   │ ║
║ │     ░░░░░░░░    │ ║
║ └─────────────────┘ ║
║ ┌─────────────────┐ ║
║ │ ░░░░░░░░░░░░░░░ │ ║  ← Nudge card skeleton
║ │ ░░░░░░░         │ ║
║ └─────────────────┘ ║
╠═════════════════════╣
║[TAB] [TAB][+][TAB][TAB]║
╚═════════════════════╝
```

---

## Design Decisions Embedded in Wireframes

| Decision | Rationale |
|---|---|
| Bottom tab bar always visible (not hidden on scroll) | Financial data needs to be constantly navigable — hiding nav adds friction |
| FAB center position in tab bar | Follows established mobile pattern (Google, Notion); makes the primary action (record holding) always reachable with one thumb |
| Health card is above the donut | Score is the hook that drives return visits — it must be seen before the chart |
| Ghost donut on empty dashboard | Communicates the promise of what's coming; prevents the screen from reading as broken |
| Progressive disclosure on instrument cards | Shows Name + Returns + Risk in the list; full detail only on tap. Solves Risk 3 (data density at 390px) without truncating content |
| "Optional fields" collapsed by default in holding form | Required fields (who, what instrument, how much) above fold; optional fields accessible without cluttering the primary entry task |
| Section cards are full-width, not a grid | Document flow — scanning a list of 6 sections is faster and more readable than a grid on 390px |
| Holding rows grouped by member (not by asset class) | Matches the mental model of "planning for people" — the household is the unit, members are the entries |
| "Why these choices?" linked from Profile, not from a bottom tab | It's content for curious/returning users and recruiters, not part of the daily planning workflow |
