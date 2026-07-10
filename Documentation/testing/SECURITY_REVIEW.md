# Security Review — [Project Name]

**Layer 0 of Phase 5 — runs FIRST, before any other testing layer. All checks must pass before Layer 1 begins.**
**Why first:** AI-generated CRUD ships IDOR and missing authz constantly — it implements the happy path you asked for. Solo, you are the only person who finds this before an attacker does.

Run the `security-review` skill, then verify each row with evidence (curl output, test link, grep result — not "looks fine").

---

| # | Check | Assertion | Result | Evidence |
|---|---|---|---|---|
| 1 | Authz on every endpoint | Wrong-user requests return 403, not 200 (authn ≠ authz) | pass / FAIL | |
| 2 | Object ownership (IDOR) | User A cannot read or modify User B's data by changing an ID | | |
| 3 | Input sanitization | All user input sanitized at system boundaries | | |
| 4 | Rate limiting | Auth + paid/destructive endpoints return 429 under burst | | |
| 5 | Secrets in client bundle | Production build grepped — no API keys, tokens, service-role keys | | |
| 6 | Admin operations | Server-side only — no client-callable admin routes | | |
| 7 | [Project-specific] | | | |

---

## Open Failures

[Every FAIL row gets an entry: root cause → fix commit → regression test → re-verified date. Zero open failures = gate condition.]
