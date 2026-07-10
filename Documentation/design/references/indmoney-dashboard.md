# Reference: INDmoney — Portfolio Dashboard

**Source:** [INDmoney Portfolio Tracker](https://www.indmoney.com/features/track-all-investments) · [UI/UX Case Study (Prateek Patil, Medium)](https://uiuxprateek.medium.com/redesigning-the-indmoney-app-a-ui-ux-case-study-4b7d930e86b3) · [Investment Dashboard UX Guide (Lollypop, 2026)](https://lollypop.design/blog/2026/may/investment-dashboard-ux-design-guide/)

---

## What it does well

**Single "everything in one view" hero.** INDmoney's dashboard lands on a unified total net worth figure with a donut chart breaking that value into asset classes (stocks, MF, FD, gold, etc.). The donut is the first element — no navigation, no card scanning required before the user understands their complete picture. The segments label with both percentage and absolute rupee amount in context.

**Portfolio Scan as a health metaphor.** Their "Portfolio Scan" surfaces allocation imbalances and sector overlaps. Framing it as a scan (not a report) gives it diagnostic authority without making explicit advice — closest Indian precedent to the Household Health tier mechanic we're building.

**P&L dashboard is secondary.** The profit/loss view is hidden behind a tab, not the hero. The hero is always "what you have," not "how you're doing vs. benchmarks." Right priority for a household-tracking app.

**Visual hierarchy:** Net worth total → donut → category breakdown → individual holdings list. Strict top-down information architecture — doesn't ask the user to scan in two directions.

---

## What to steal for this app

| Pattern | Where it applies |
|---|---|
| Donut chart as the dashboard hero, above the fold, labeled with both % and ₹ | Portfolio tab hero widget (allocation donut) |
| Asset-class segments as the primary grouping unit, not individual holdings | Donut segments → 6 asset classes (Equity/Debt/Gold/Hybrid/Real Estate/Alternative) |
| Net worth total as a single number above the donut | Sum of all `current_value` across household holdings |
| Portfolio Scan framing (diagnostic, not advisory) | "Household Health" tier card — same authority without giving advice |

---

## What to avoid

- INDmoney shows live prices and absolute P&L prominently. We're manual-entry only — showing ₹0 or stale change % would look broken. No P&L display in v1.
- INDmoney's design is stock-broker-dense: lots of numbers in small text. We need less density, more legibility — Indian household investor, not day-trader.
