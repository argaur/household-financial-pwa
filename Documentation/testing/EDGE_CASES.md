# Edge Cases — [Project Name]

**Rule:** Run the 8-category checklist for every feature. Every row ends in one of two states: **tested** (link the test) or **accepted** (written rationale). No third state.

Categories: 1 Empty inputs · 2 Boundary values · 3 Malformed inputs · 4 Concurrent operations · 5 Auth states · 6 Network failures · 7 State transitions · 8 Permissions/ownership

---

## Feature: [name]

| # | Category | Case | Expected behavior | Status | Test link / acceptance rationale |
|---|---|---|---|---|---|
| 1 | Empty inputs | null / "" / empty list / missing field | | tested / accepted | |
| 2 | Boundary values | 0, 1, max, max+1, negative | | | |
| 3 | Malformed inputs | wrong type, oversized payload, injection-shaped strings | | | |
| 4 | Concurrent ops | two writes at once, race on shared state | | | |
| 5 | Auth states | unauthenticated, wrong user, expired token | | | |
| 6 | Network failures | third-party down, slow/partial response | | | |
| 7 | State transitions | back nav, mid-flow refresh, stale data | | | |
| 8 | Permissions | user A reads/modifies user B's data | | | |

---

## Feature: [next]

[Repeat table.]
