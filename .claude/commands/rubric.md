# /rubric — Framework selection (run before any new project, and at every gate)

Run the FRAMEWORK.md 5-question rubric on the current project. Never vibe-check.

Score each yes/no, show the table, tally:

1. Handles money (payments, billing, subscriptions)?
2. Stores user PII or requires authentication?
3. Multi-entity data model (3+ related tables/collections)?
4. Portfolio centerpiece (recruiter-facing, case study required)?
5. Lifespan > 1 month, or other people will use it?

**2+ yes → Blueprint. Mandatory, no override. 0–1 yes → Builder OS.**

Then:
- Present the scored table and the verdict to Gaurav for confirmation. Under speed pressure everything feels like Builder OS — the rubric is the resistance, encoded.
- If this is a re-run at a phase/session gate, also check the reclassification triggers in FRAMEWORK.md (auth/payments/data-model/users appeared → promote; kill criterion fired / stalled 2+ weeks → demote).
- Record the result and score in the project CLAUDE.md "Framework state" block and in DECISIONS_LOG.md.

**Path resolution:** if `FRAMEWORK.md` is not in the current project, read it from the framework home: `C:\Users\Gaurav Gupta\Documents\Projects\Claude Optimisation\FRAMEWORK.md`.

**Existing/older project without a Framework state block:** score the rubric against the project as it exists today (not as originally imagined). After Gaurav confirms: create/update the CLAUDE.md Framework state block, map current work to the nearest phase (e.g. half-built features → Phase 4, name the implicit slices), and offer `new-project.sh` bootstrap for missing Documentation/ structure — it never overwrites existing files' content, only adds what's absent. Do not restart completed work to retro-fit earlier gates; log gaps in DECISIONS_LOG.md instead.
