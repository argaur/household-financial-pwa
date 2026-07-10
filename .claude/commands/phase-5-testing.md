# /phase-5-testing — Testing (Blueprint Phase 5, four layers in order)

**Layer 0 — Security pass, runs FIRST.** Run the `security-review` skill, fill `Documentation/testing/SECURITY_REVIEW.md` with evidence per check: authz on every endpoint (403 not 200 for wrong user), IDOR/object ownership, input sanitization at boundaries, rate limits on auth + paid/destructive ops, no secrets in client bundle (grep the production build), admin server-side only. All pass before Layer 1.

**Layer 1 — Automated tests.** Unit (pytest/vitest) for business logic, integration (httpx/testcontainers) for API+DB, Playwright E2E for critical journeys. Happy-path rule: every capability gets one E2E. Destructive-action rule: every delete/payment/irreversible action gets E2E for success path AND the guard (confirm dialog, permission denial). Coverage: 100% of business-logic modules, rationale documented — no gameable percentage.

**Layer 2 — Edge cases.** Run the 8-category checklist per feature into `EDGE_CASES.md`. Every row: tested (link) or accepted (written rationale). No third state.

**Layer 3 — Acceptance criteria.** Verify `ACCEPTANCE_CRITERIA.md` covers every capability, written for a non-technical tester, including the accessibility checks from the SPEC.md Constraints Contract. Gaurav walks through manually; results logged.

**Gate — all five true:** CI green · SECURITY_REVIEW zero open failures · every EDGE_CASES row resolved · acceptance walked through manually · zero open P0/P1 in BUG_LOG.
