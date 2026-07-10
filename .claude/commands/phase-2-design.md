# /phase-2-design — Design (Blueprint Phase 2 → DESIGN_FRAMEWORK.md)

Run the 7-stage design process from DESIGN_FRAMEWORK.md. Inputs: approved `SOLUTION_BRIEF.md` + `METRICS_PLAN.md`. Design does not re-litigate scope.

**Stage 0 — Data Model (mandatory before any visual work):** fill `Documentation/design/DATA_MODEL.md` — entities, relationships, ownership, every state (empty/loading/error/populated), full State Matrix. Gate.

**Stage 1 — Brainstorm:** load context, fetch 2–3 real-world reference UIs into `design/references/`, name 3 design risks. Gate.

**Stage 2 — Interview:** one question at a time. Purpose Statement first ("what must this prove to someone who never reads a word?"), then Track A design language (incl. the negative constraint: "what would make this look AI-generated, and what choice prevents it?"), then Track B per-panel real copy — real headlines and CTA labels, never lorem ipsum. Gate.

**Stage 3 — Wireframes:** key screens + empty/error states for every dynamic screen + end-to-end flow diagram. Layout only. Gate.

**Stage 4 — Design System:** tokens (each with usage rule) emitted as real code — `tailwind.config` + CSS variables + `components.json`. Component showcase, inevitability test, negative-constraint check, brand guide. Design language always from scratch — never carried over. Gate.

**Stage 5 — Spec Doc:** fill `Documentation/design/SPEC.md` — all 10 sections including Analytics Surface and Constraints Contract. Self-review first. Gate: "Spec approved."

**Stage 6 — Handoff:** packet = token configs + shadcn install list + component showcase + signed-off SPEC.md → Phase 3.

Never auto-advance between stages.
