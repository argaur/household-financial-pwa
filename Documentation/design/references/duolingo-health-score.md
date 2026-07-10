# Reference: Duolingo — Health Score / Streak Mechanic

**Source:** [Duolingo Streak System Breakdown (Medium)](https://medium.com/@salamprem49/duolingo-streak-system-detailed-breakdown-design-flow-886f591c953f) · [Duolingo Gamification Secrets (orizon.co)](https://www.orizon.co/blog/duolingos-gamification-secrets) · [Design Breakdown (925studios.co)](https://www.925studios.co/blog/duolingo-design-breakdown)

---

## What it does well

**One number that ties everything together.** XP is Duolingo's single common metric — it advances streaks, league ranking, and achievement progress simultaneously. Without a single shared metric, each mechanic (streak, leaderboard, badges) operates in isolation and none gains the gravitational pull of a unified score.

**Always-visible streak on the home screen.** The streak count (flame icon + day number) is never buried. It's in the primary header of the home screen. Users glance at it before doing anything else. Visibility is what gives it behavioral power — you can't maintain a streak you can't see.

**Streaks increase commitment by 60%.** The streak's design insight is that the number itself creates loss aversion: losing a 30-day streak hurts more than gaining a new one. The *asymmetry* between gain and loss is the retention mechanism, not the reward.

**Color carries meaning without labels.** Green = success, orange = streak, yellow = XP, red = error/hearts. Users learn the color language fast because it's consistent everywhere. No reading required — the color tells you the status.

**Progress within a session is immediate.** XP is awarded before the lesson screen closes. The reward is tightly coupled to the behavior — no delay between action and feedback.

---

## What to steal for this app

| Pattern | Where it applies |
|---|---|
| Single visible score on the home screen hero — not buried, not secondary | Household Health tier (Getting Started / On Track / Strong) displayed prominently on the Home dashboard, above the donut |
| Score that advances multiple goals simultaneously | Completeness Score advances when holdings are added (Check #1, #4, #5), protection is added (Check #3), or emergency fund is flagged (Check #2) — one action, multiple check progress |
| Color = status, consistent everywhere | Tier colors: Getting Started = amber, On Track = teal/blue, Strong = green. Consistent in the tier card, in the nudge, and in the empty states |
| Immediate positive feedback on progress | When a check flips from unmet → met (e.g. user adds first holding in debt class, Check #4 advances), show a brief celebration moment before navigating back to the dashboard |
| Loss aversion framing isn't applicable — but "number you want to see grow" is | Score is always shown as a tier + check count (e.g. "3 of 5 checks") so users see both where they are and how close the next tier is |

---

## What to avoid

- Duolingo uses playful, cartoon-adjacent visual language (Duo the owl, bright primary colors, rounded bubbly UI). Our target user is a household investor managing real money — the design language should be calm and premium, not playful. The mechanic is the steal; the aesthetic is explicitly not.
- Duolingo's streak mechanic works partly through loss aversion (breaking a streak hurts). We don't have a streak — we have a completeness score that only goes up (or stays stable). No "you lost progress" messaging. Framing is always "here's what's next," never "you fell behind."
- Duolingo's color-per-meaning system works because they own those colors completely and use them everywhere. We should pick 2–3 semantic colors max and define them in the design system before any screen design — not discover them screen by screen.
