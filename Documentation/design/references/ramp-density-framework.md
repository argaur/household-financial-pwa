# Reference: Ramp — Density & the Role-Metric-Density-Action Framework

**Source:** [Fintech Dashboard Design: 9 Real Products, Analyzed (adminlte.io)](https://adminlte.io/blog/fintech-dashboard-design-examples/) · [SMB Banking: Deep Dive on Ramp (fintechlabs.com)](https://fintechlabs.com/smb-banking-deep-dive-on-ramp/) · [Ramp design system (styles.refero.design)](https://styles.refero.design/style/b38702a0-75ab-474c-9106-00b624535825)

---

## What it does well

**Design starts from the question the screen answers, not the data available.** Ramp's own framing: a CFO opens the dashboard asking "how much did we spend this week and is anything anomalous?" — the whole layout exists to answer that one question fast, with everything else demoted or hidden. This is a discipline, not a style: before laying out any screen, name the one question that screen answers for the one user who opens it.

**Role-Metric-Density-Action, as an explicit framework.** 1) Define who is looking. 2) Lead with the one number they came for. 3) Calibrate density to their role — high for a finance professional living in the product daily, low for an occasional consumer visitor. 4) Attach one clear next action to that number, never a menu of possibilities. This is directly transferable to a multi-persona app like this one: the same dashboard has to serve a first-time visitor (low density, one hero number, one nudge) and a returning household head comparing ledgers (higher density, more numbers visible at once) — the framework says that's two different "roles," not one screen trying to serve both equally.

**8/12/16/24px spacing rhythm, monochrome base plus a single accent.** Ramp's density feels "comfortable" rather than "cramped" because the spacing scale is small and consistent (not ad hoc), and color is spent almost entirely on one accent — everything else is grayscale/neutral. Motion is "moderate and utility-focused rather than decorative" — transitions communicate state change, they don't perform.

---

## What to steal for this app

| Pattern | Where it applies |
|---|---|
| Name the one question a screen answers before designing it | Every screen in Stage 2 (Interview) — should be answerable in one sentence per screen before any layout work starts |
| Density calibrated by who's looking, not a single density for the whole app | Landing/marketing pages (low density, one hero claim) vs. dashboard-with-ledgers (higher density, multiple numbers at once) — these are legitimately different density targets, not a failure to be consistent |
| One accent color, everything else neutral | Directly compatible with this project's existing teal-as-single-accent system (`brand-guide.md` §2) — the redesign should preserve this discipline even if the specific hue/material changes |
| Small, consistent spacing scale | Already true (Tailwind 4px grid, no custom scale) — worth re-confirming rather than reinventing during the redesign |

---

## What to avoid

- Ramp and Brex are built for finance professionals who live in the product for hours; their density would be actively hostile to a first-time household user who opens this app once a week. The framework transfers, the specific density number does not — this app's ceiling is much closer to Mercury's "calm" end than Ramp's "dense" end even on its most data-heavy screen (ledger compare).
- Ramp's single-neon-accent-on-monochrome look reads as aggressively modern SaaS. That specific visual result would conflict with the "CFP one-pager, not a dashboard SaaS product" positioning this app has held since Phase 2 — steal the *discipline* (one accent, not several), not the *look* (neon-on-monochrome).
