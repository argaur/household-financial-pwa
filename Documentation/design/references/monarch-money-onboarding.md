# Reference: Monarch Money — Onboarding Flow

**Source:** [Product Teardown: Monarch Money (johnstone.substack.com)](https://johnstone.substack.com/p/product-teardown-monarch-money) · [Monarch UX Flow (pageflows.com)](https://pageflows.com/ios/products/monarch-money/) · [Monarch User Flow Examples (nicelydone.club)](https://nicelydone.club/apps/monarch/components)

---

## What it does well

**Linear value-prop carousel before any form.** Monarch's sign-up shows 5 value propositions in sequence ("See all your money in one place," "Get a complete picture of your finances," etc.) before presenting any input field. Sets the user's mental model of what they're about to enter — makes the subsequent form fields feel purposeful, not arbitrary.

**Onboarding as a series of small, fact-only steps.** Each onboarding screen asks for exactly one thing. No branching, no optional paths, no "skip for now." The user can't get confused about what to do next. Every step completion moves a progress indicator forward — the cost of continuing is always visible.

**"Complete picture" is the aha moment, not the inputs.** Monarch routes users to a unified net worth dashboard the moment enough accounts are connected to show something. The dashboard isn't the destination of onboarding — it's the reward the onboarding is earning.

**58 documented UI components.** Monarch's design system is exceptionally consistent — every input, every state, every transition is the same component in a different configuration. No one-off screens.

---

## What to steal for this app

| Pattern | Where it applies |
|---|---|
| Linear, fact-only steps with visible progress indicator | Onboarding Steps 1–3 (household → members → first holding). 3 steps, always visible "Step X of 3" |
| One-thing-per-screen principle | Each onboarding step: one form, one purpose, no optional detours |
| Dashboard reveal as the reward for completing onboarding | After Step 3 (first holding added), immediate redirect to the populated dashboard — no confirmation screen in between |
| Small, purposeful step-forward CTAs | "Continue" / "Add member" / "Add holding" — not "Submit" or "Next" |

---

## What to avoid

- Monarch's onboarding assumes bank/broker account linking (the core of their product). Our equivalent is manual form entry, not OAuth. The step structure is the same but the interaction is different — forms with field validation, not connection flows.
- Monarch uses a desktop-first layout for their web product. We are mobile-first PWA. The visual density and layout assumptions don't transfer directly.
