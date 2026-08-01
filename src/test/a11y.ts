import { expect } from 'vitest'

/**
 * Structural checks that real `axe-core` (see `src/test/axe.ts`) genuinely
 * does NOT cover in jsdom, kept as a hand-rolled supplement rather than a
 * replacement.
 *
 * Everything axe already covers has been deleted from here — accessible
 * names on form controls (axe `label`), dangling `aria-describedby` /
 * `aria-labelledby` targets (axe `aria-valid-attr-value`), skipped heading
 * levels (axe `heading-order`), positive `tabindex` (axe `tabindex`), and
 * `img` without `alt` (axe `image-alt`). Running both would be two checks
 * doing one job.
 *
 * What's left needs either layout (tap-target size) or a whole-page
 * invariant axe has no opinion on (exactly one h1 — axe's
 * `page-has-heading-one` only requires *at least* one).
 */
export function expectStructuralA11y(container: HTMLElement): void {
  // Exactly one h1 per screen. Axe requires at least one (page-has-heading-one)
  // but does not flag a second — this is this project's own stricter rule.
  const h1s = container.querySelectorAll('h1')
  expect(h1s.length, 'a screen must have exactly one h1').toBe(1)

  // Buttons and links are ≥44px tall (SPEC.md §6). Checked by class, because
  // jsdom has no layout — h-11 and min-h-11 are the project's 44px tokens.
  // Axe cannot check this under jsdom at all: it needs computed layout.
  //
  // A small control counts when its own label row is the 44px target: a
  // checkbox inside `<label class="min-h-11">` is toggled by tapping anywhere
  // on that row, so the box being 16px is a visual choice, not a tap-target
  // failure. The ancestor must genuinely carry the sizing class — this is not
  // a blanket exemption for nesting.
  const sizedTo44 = (el: Element | null): boolean =>
    /(^|\s)(h-11|min-h-11|h-\[44px\]|py-3|py-4)(\s|$)/.test(el?.getAttribute('class') ?? '')

  for (const el of container.querySelectorAll<HTMLElement>('button, a[href]')) {
    const ownRowIsSized = sizedTo44(el) || sizedTo44(el.closest('label'))
    expect(ownRowIsSized, `tap target is not sized to 44px: ${el.textContent?.trim().slice(0, 40) || el.id}`).toBe(true)
  }
}
