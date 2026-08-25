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

---

## D-016 Slice 5 — Full-Platform Mint/Treasury Redesign (2026-08-25, corrected 2026-08-25)

**Stage:** Design Stage 2 (Interview, resolved — corrected) → Stage 3 (Wireframes, satisfied by the concept folio for flagship screens; see note below)
**Status:** draft
**Correction note (2026-08-25):** The Stage 2 answers originally recorded below were fabricated by a prior session before the real, already-approved visual concept was located. That concept exists as a Claude Artifact ("The Vittam Mint," first published 2026-08-17) and is now committed to this repo at `Documentation/design/concept/vittam-mint-folio.html`. Gaurav reviewed it and confirmed: **"YES!!! I Love it, use this as it is."** The Stage 2 answers below are rewritten to match that folio, replacing the earlier (wrong) answers on color and typography. Everything else in the original interview (purpose statement, negative constraint, rollout scope, copy scope) already matched the folio and is unchanged.

**Scope this pass:** design system (tokens/components, Stage 4) extracted directly from the folio's CSS and applied to the 5 screens it already mocks in full fidelity — Landing, Dashboard, Explore, Portfolio, Goal planner. **Stage 3 (Wireframes) is satisfied for these 5 screens by the folio's own plates, not redrawn as ASCII wireframes** — confirmed with Gaurav 2026-08-25, who also directed: use the folio's established visual language (tokens + motifs below) as the reference when onboarding, Profile, and instrument detail are wireframed screen-by-screen in their own future build slices, rather than treating them as a separate design problem. Remaining-screen wireframing is not done now (Design Risk 2, Stage 1: scope size against solo-builder capacity).

### Stage 2 — Interview resolutions (corrected)

Answered one question at a time, Gaurav's picks in **bold**. Items 2 and 5 are corrected from the original pass; the rest were already right.

1. **Purpose Statement.** What must this prove to someone who never reads a word? → **This is a serious, trustworthy place for real money.** (Not "effortless/not-a-chore" and not "crafted by a skilled builder" — those are true but secondary to trust, given the product handles real household financial data.)
2. **Color direction.** Does "mint" mean a literal new hue, or just a feel carried by the existing teal? → **CORRECTED: mint is a real new hue, replacing teal as the primary accent, in both themes.** Light: `--mint: #186A4F`, `--mint-strong: #0F5540`, `--mint-tint: #DEEBE2`. Dark: `--mint: #54C795`, `--mint-strong: #7FDCB4`, `--mint-tint: #16281F`. Brass is a second accent present in **both** light and dark (light `--brass: #8F7326`/`--brass-soft: #B49347`/`--brass-tint: #F0E9D4`; dark `--brass: #CDAD62`/`--brass-soft: #A98D4E`/`--brass-tint: #241E10`) — not dark-mode-only, correcting the earlier answer to item 6 below. This resolves Design Risk 1 from Stage 1 (no code anywhere embodies "mint" as a color): the folio is that code.
3. **Negative constraint** (what would make this look AI-generated, and what prevents it?) → **Both named risks apply and both get an explicit guard:** (a) generic shadcn/Tailwind defaults (rounded-xl cards, subtle gray borders) — guarded by requiring every surface to trace to the material metaphor below, never a bare component-library default; (b) trendy motion/gradient/glassmorphism used to fake polish — guarded by "motion is utility-only, communicates state change, never decorative; no gradients; no blur," matching the Ramp reference. The folio's guilloche rosettes and reeded dividers are code-drawn SVG/CSS, not raster or stock imagery, consistent with this guard.
4. **Material metaphor.** Which physical metaphor should every surface trace to? → **Engraved currency / vault, stated in the folio's own words: "Light = fresh currency paper. Dark = vault interior. One engraved language, two native materials."** Concrete motifs: code-drawn guilloche rosettes (SVG, generated in the folio's script block), reeded-edge dividers (`.reed`, repeating-linear-gradient), a coin-shaped FAB with a reeded rim, ledger tables with a double-rule total row, mono ALL-CAPS section labels, a hatched "Reserve" donut slice for the emergency fund. This directly visualizes the D-014 encryption story and, as a side effect, solves public-showcase backlog item 1 (emergency fund invisibility) via the hatched Reserve slice.
5. **Typography.** Keep DM Serif Display + Inter, or swap for something more institutional? → **CORRECTED: swap.** `--serif: "Bodoni MT", Didot, "Playfair Display", "Times New Roman", serif` for headlines/figures; `--sans: "Gill Sans Nova", "Gill Sans", "Trebuchet MS", "Segoe UI", Candara, sans-serif` for body/UI; `--mono: "Cascadia Mono", Consolas, "SF Mono", Menlo, monospace` for ledger labels, tabular figures, and ALL-CAPS eyebrows. DM Serif Display + Inter are retired by this pass.
6. **Dark mode.** Given the material metaphor, does dark mode intensify it? → **Yes — vault interior vs. currency paper, per item 4.** Brass is present in both themes (corrected from an earlier answer that scoped it to dark mode only), each with its own light/dark values (item 2). Mint is likewise defined natively per theme, not a single hue dimmed for dark — see the token values in item 2.
7. **Rollout scope for Stage 3/4.** Build the complete system against every screen now, or against flagship screens only? → **Full token/component system now, extracted from the folio; flagship screens satisfied by the folio's own 5 plates (Landing, Dashboard, Explore, Portfolio, Goal planner) — not redrawn.** Resolves Design Risk 2 directly. Onboarding, Profile, and instrument detail are explicitly out of scope for this pass, per the folio's own closing statement: "Not in this folio: onboarding, Profile, and instrument detail. They inherit the same tokens once the language is approved" — confirmed by Gaurav as the intended approach for those screens' own future wireframing passes.
8. **Track B — copy scope.** Does this pass also rewrite headline/CTA copy, or only the visual treatment around it? → **Visual only.** The existing CFP-voice copy deck (`landing-content.ts`, pinned by `Landing.test.tsx`'s claim-equality assertion) is unchanged. The folio's copy is illustrative of tone/density, not a literal replacement source — Stage 4/5 work must still cross-check any copy the folio shows against the real, approved copy deck rather than importing folio text verbatim.

### Stage 3 — Wireframes, resolution

**Satisfied for the 5 flagship screens by the concept folio directly** — `Documentation/design/concept/vittam-mint-folio.html` (Landing, Dashboard with working ledger-tab scenario switcher, Explore with working add-to-holdings toggle, Portfolio with bulk-import zone + ledger table, Goal planner with projection SVG + proposed-ledger cards). These are full-fidelity mockups, a strictly higher bar than the ASCII wireframes used elsewhere in this document, so no ASCII redraw is done for these 5. The ASCII wireframes for Landing (2a) and Dashboard (2b) originally drawn in this section under the wrong Stage 2 answers (generic "vault frame," no mint/brass, old typefaces) are **superseded and removed** — the folio replaces them as the Stage 3 artifact for those two screens too.

Onboarding, Profile, and instrument-detail wireframes are deferred to their own future build slices, per item 7 above. When drawn, they inherit the folio's tokens and motifs as their starting reference rather than being designed as a separate visual system.

### Gate: Stage 2 (corrected) and Stage 3 (folio-satisfied for the 5 flagship screens; remaining screens deferred to their own future slices, using the folio as reference) — both confirmed by Gaurav 2026-08-25. Proceeding to Stage 4 (Design System).

### Stage 4 — Design System (2026-08-25, draft, pending gate)

Tokens extracted directly from the folio's CSS into the existing token files (updated in place, not duplicated):

- `Documentation/design/tokens/globals.css` — `--primary`/`--primary-strong` retinted mint (native per-theme values, not a dimmed single hue), new `--brass`/`--brass-soft`/`--brass-foreground` tokens in both themes, new `--panel`/`--border-soft` tokens, `--radius` raised 8px → 10px, new `.reed` utility, `section-label` utility switched from sans+muted to mono+brass.
- `Documentation/design/tokens/tailwind.config.ts` — `fontFamily.serif`/`sans`/`mono` swapped to Bodoni MT / Gill Sans Nova / Cascadia Mono (DM Serif Display + Inter retired), new `colors.brass` and `colors.panel`, `colors.asset` retinted, `borderRadius` scale rebuilt around the folio's 8/10/12/14/16px steps plus new named `pill` (999px) and `coin` (50%) tokens, `boxShadow.card`/`lift` added matching the folio's two-level elevation.
- `Documentation/design/tokens/components.json` — no changes; it configures the shadcn CLI, not tokens themselves.
- `Documentation/brand/brand-guide.md` — fully updated in place (§1 visual philosophy, §2 color/typography/radius/shadow tables, §5 anti-patterns, §7 inevitability test — old system's results kept for history, new system's results added, §8 token quick reference). No longer documents the retired teal/DM-Serif system as current.
- `Documentation/design/COMPONENT_SHOWCASE.md` — new "D-016 Slice 5 — Mint/Treasury Motif Components" section added: VaultFrame, GuillocheMotif, ReededDivider, CoinFAB, Mintmark, LedgerTable, ReserveHatchSlice, ThemeToggle. Existing custom components (HealthTierCard, AllocationDonut, etc.) are unchanged in data contract/states — they render inside the new frame/motif components once retokened.

**Negative-constraint check (Stage 2, item 3):** every new token/component above traces to the vault/currency metaphor (guilloche, reed, coin, ledger, hatch) or is a direct extraction from the folio's own CSS — no bare shadcn defaults introduced, no gradients, no glassmorphism, no decorative motion added.

**Stage 4 follow-up (2026-08-25, resolved same day):** the asset-class donut colors were initially left as fixed hex in `tailwind.config.ts` with a note to promote them to CSS custom properties (mirroring `--primary`) before Phase 4. Gaurav directed fixing this now rather than deferring — done: `globals.css` gained native per-theme `--c-equity`/`--c-debt`/`--c-gold`/`--c-ef`/`--c-ssy`/`--c-alt` vars, `tailwind.config.ts`'s `colors.asset` now references `hsl(var(--c-*))`, and `brand-guide.md`'s asset-class table lists both light and dark hex. The "Title" role's serif-vs-sans ambiguity (app-bar name vs. card titles) is left unresolved by explicit decision — not pinned now, resolved when that screen is actually built.

**Gate: Stage 4 approved by Gaurav 2026-08-25, including the asset-color follow-up. Proceeding to Stage 5 (Spec Doc) and Stage 6 (Handoff).**

### Stage 5 — Spec Doc (2026-08-25)

Full spec written as a new "D-016 Slice 5" section appended to `Documentation/design/SPEC.md` (not a separate file — mirrors how this slice's Stage 0/2/3/4 output was appended to the existing `DATA_MODEL.md`/`WIREFRAMES.md` rather than forked into new documents). Covers per-panel decisions for the 5 flagship screens, a constraints contract, implementation cost flags (font-availability risk for the 3 new non-web-safe typefaces is the most consequential one — Bodoni MT/Gill Sans Nova/Cascadia Mono are not guaranteed on most visitors' devices), and 4 open questions escalated to Phase 3.

**Gate: Stage 5 ready for review.**

### Stage 6 — Handoff (2026-08-25)

`Documentation/design/COMPONENT_SHOWCASE.md`'s D-016 Slice 5 section is the handoff artifact, same pattern as v1. Phase 2 (Design) for this slice is complete for the 5 flagship screens: tokens extracted and committed, spec written, design risks addressed or explicitly escalated. Next phase-gate action is Phase 3 (Plan) against `SPEC.md`'s D-016 Slice 5 section, then `model-router` before any build work, per this project's established D-016 pattern.

**Carried into Phase 3, unresolved by design (SPEC.md §S10):** font-loading strategy (fallback chains vs. explicit Google-Fonts-hosted approximations), whether the Explore add-to-holdings toggle is new scope needing its own analytics event, and the standing regression-risk mitigation (real-browser verification at 390px on a throwaway Neon branch before merge, matching the D-016 ledger slice's own rehearsal pattern).

**Gate: Stage 6 (Handoff) complete. Phase 2 (Design) for D-016 Slice 5 is done for its in-scope screens. Ready for Phase 3 (Plan).**

**Superseded (2026-08-25):** the ASCII wireframes for Landing (2a) and Dashboard (2b) and the empty/error-state table that previously followed here were drawn against the wrong Stage 2 answers (generic "vault frame," no mint/brass, old typefaces) and have been removed. The concept folio's Landing and Dashboard plates are the Stage 3 artifact for those two screens now; see "Stage 3 — Wireframes, resolution" above.
