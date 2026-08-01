import { expect } from 'vitest'

/**
 * Structural accessibility checks for a rendered screen.
 *
 * HONEST SCOPE — read this before trusting it. This is **not** axe. `axe-core`
 * is not a dependency of this project and adding one is not this change's call
 * to make, so what follows is a hand-written subset covering the rule families
 * that jsdom can actually evaluate: labelling, roles, heading order, tab order
 * and tap-target sizing. It cannot evaluate colour contrast, computed layout,
 * or anything that needs a real layout engine.
 *
 * The project's standing claim is "all screens scan 0 axe violations", and that
 * claim is earned in a real browser against the deployed app, not here. These
 * assertions stop a regression reaching that scan; they do not replace it.
 */
export function expectStructuralA11y(container: HTMLElement): void {
  // Every form control is reachable by name. This is the single largest source
  // of real axe violations on form-heavy screens.
  const controls = container.querySelectorAll<HTMLElement>('input, select, textarea')
  for (const control of controls) {
    const id = control.getAttribute('id')
    const labelled =
      (id && container.querySelector(`label[for="${id}"]`)) ||
      control.getAttribute('aria-label') ||
      control.getAttribute('aria-labelledby')
    expect(labelled, `control ${control.outerHTML.slice(0, 80)} has no accessible name`).toBeTruthy()
  }

  // Every aria-describedby / aria-labelledby target actually exists.
  for (const el of container.querySelectorAll<HTMLElement>('[aria-describedby], [aria-labelledby]')) {
    for (const attribute of ['aria-describedby', 'aria-labelledby']) {
      const value = el.getAttribute(attribute)
      if (!value) continue
      for (const id of value.split(/\s+/)) {
        expect(container.querySelector(`#${id}`), `${attribute}="${id}" points at nothing`).not.toBeNull()
      }
    }
  }

  // Exactly one h1, and no skipped heading levels.
  const headings = [...container.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')]
  const levels = headings.map((h) => Number(h.tagName.slice(1)))
  expect(levels.filter((l) => l === 1).length, 'a screen must have exactly one h1').toBe(1)
  for (let i = 1; i < levels.length; i += 1) {
    expect(levels[i] - levels[i - 1], `heading level jumps from h${levels[i - 1]} to h${levels[i]}`).toBeLessThanOrEqual(1)
  }

  // A positive tabindex rewrites the document's tab order for the whole page.
  for (const el of container.querySelectorAll<HTMLElement>('[tabindex]')) {
    expect(Number(el.getAttribute('tabindex')), 'positive tabindex breaks tab order').toBeLessThanOrEqual(0)
  }

  // Buttons and links are ≥44px tall (SPEC.md §6). Checked by class, because
  // jsdom has no layout — h-11 and min-h-11 are the project's 44px tokens.
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

  // An image with no alt text is invisible to a screen reader.
  for (const img of container.querySelectorAll<HTMLElement>('img')) {
    expect(img.hasAttribute('alt'), 'img without alt').toBe(true)
  }
}
