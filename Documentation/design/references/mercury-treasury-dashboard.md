# Reference: Mercury — Banking / Treasury Dashboard

**Source:** [Mercury Design Breakdown: Banking UX Built for Startups (925studios.co)](https://www.925studios.co/blog/mercury-design-breakdown) · [Mercury Treasury Dashboard UI (SaaSFrame)](https://www.saasframe.io/examples/mercury-treasury-dashboard) · [Mercury — Banking Editorial Warmth (github.com/rohitg00/awesome-claude-design)](https://github.com/rohitg00/awesome-claude-design/blob/main/design-md/warm/mercury.md)

---

## What it does well

**Color built on functional restraint, not visual energy.** Green is Mercury's primary brand color and explicitly carries "growth" framing; blue is secondary and carries "stability." Red and yellow are reserved *exclusively* for error and warning states — no promotional oranges, no engagement-bait purples, no decorative accent colors anywhere else in the product. This is the direct opposite of a typical consumer-fintech palette (Cash App, Robinhood) that uses color to create energy and urgency.

**Traditional banking apps create anxiety by overusing red** — a negative balance, an upcoming bill, and a form validation error can all render in the same red, so the user's eye can't tell "you're overdrawn" from "you typo'd a field." Mercury deliberately narrows red to genuine error/danger states only, which is exactly this project's own existing rule (`--destructive` reserved for errors and delete, never for a bill reminder or a normal negative delta).

**Visual hierarchy does the "institutional" work, not decoration.** A treasury dashboard is inherently dense — balances, transactions, cash-flow charts, wire controls all compete for the same screen. Mercury's answer is prioritization, not minimalism-for-its-own-sake: financial position (balances, cash flow) surfaces at the top level; operational controls (permissions, wire setup) live one level down. The "calm" feeling comes from *what's on screen right now*, not from a lack of features.

**112 documented UI components across 367 screens** — a mature, consistent component library rather than one-off screens. Every card, every modal, every state transition reuses the same primitive in a different configuration. 108 modal instances specifically — meaning Mercury solves "confirm this action" once and reuses it everywhere, rather than each flow inventing its own confirmation pattern.

---

## What to steal for this app

| Pattern | Where it applies |
|---|---|
| Color-as-restraint: exactly one growth-associated hue (this app's teal, or a mint if adopted) plus one stability hue, red/yellow locked to error/warning only | Every screen in the redesign — the discipline is the point, not a specific hex |
| Hierarchy over minimalism for density: position/total-value data always above operational controls (edit, delete, settings) | Dashboard, ledger compare strip, Portfolio screen — the number the user came for sits above the buttons that change it |
| One confirmation-modal pattern, reused everywhere | Already partially true (holding delete, ledger delete share a pattern) — worth stating explicitly as a system rule rather than a coincidence |
| Component-library discipline: same primitive, different configuration, no one-off screens | The redesign's actual execution risk — see Design Risk 2 below |

---

## What to avoid

- Mercury is B2B treasury software for startups managing six- and seven-figure operating accounts — its target user is a finance-literate professional who wants density and speed. This app's user is a financially-literate-but-not-expert household member who wants clarity first. Copying Mercury's information density directly would work against this project's "education, not advice" and "CFP one-pager" positioning.
- Mercury's dark mode and elevation/shadow treatment aren't documented in the sources available — cannot be stolen sight-unseen. If a genuinely institutional dark surface is wanted, it needs its own reference pass against the live product, not this teardown.
