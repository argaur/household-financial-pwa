import axeCore, { type AxeResults } from 'axe-core'
import { expect } from 'vitest'

/**
 * Real `axe-core` scans of a rendered screen, run against jsdom.
 *
 * `color-contrast` is explicitly disabled below, and must stay disabled here
 * — not because contrast doesn't matter, but because jsdom has no canvas, so
 * axe's `colorContrastMatches` check cannot sample pixels. Empirically:
 * rendering deliberately unreadable text (`#fafafa` on `#ffffff`, 12px)
 * through this rule in this environment produces `violations: 0, passes: 0,
 * incomplete: 1`, and jsdom throws `Not implemented:
 * HTMLCanvasElement.prototype.getContext` from inside axe while it tries. A
 * bare `expect(results).toHaveNoViolations()` treats "incomplete" as passing
 * — so without this override, unreadable text scans green. `color-contrast`
 * is not merely uncovered here; it is silently hollow if left enabled.
 *
 * `src/test/axe-contrast-gap.test.ts` pins this exact limitation: it asserts
 * `color-contrast` still comes back `incomplete`, not `passes`, in this
 * environment. If that test ever fails — after adding the `canvas` package,
 * or moving these scans into a real browser — that is the signal to remove
 * this override and get real contrast coverage from axe instead.
 *
 * Contrast is NOT covered by anything in this file. It is verified against
 * the live deployed app instead (see CLAUDE.md's accessibility note).
 */
const DISABLED_RULES = {
  'color-contrast': { enabled: false },
} as const

/** Runs axe-core on `root` with the jsdom-safe rule set. Prefer `document.body` as `root` for any screen that can have Radix portal content (Dialog/Sheet/Select) open, since those mount outside the render container. */
export async function runAxe(root: Element | Document): Promise<AxeResults> {
  return axeCore.run(root, { rules: DISABLED_RULES })
}

/** Runs axe-core on `root` and asserts zero violations. See the module doc for what this deliberately does not cover. */
export async function expectNoAxeViolations(root: Element | Document): Promise<void> {
  const results = await runAxe(root)
  expect(results).toHaveNoViolations()
}
