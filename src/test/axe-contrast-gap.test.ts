import { describe, it, expect } from 'vitest'
import axeCore from 'axe-core'

/**
 * Pins the jsdom limitation documented in `src/test/axe.ts`: axe's
 * `color-contrast` rule cannot evaluate anything here, because jsdom has no
 * canvas for `colorContrastMatches` to sample pixels from.
 *
 * This test runs axe WITHOUT the `color-contrast` override, against text that
 * is deliberately unreadable (near-white on white, 12px — nowhere close to
 * the 4.5:1 WCAG AA floor). If jsdom could evaluate contrast, this would
 * report a violation. It cannot, so the rule comes back `incomplete` instead
 * — never `passes`, which is the specific failure mode that would let an
 * unreadable screen scan green.
 *
 * If this test starts failing, that means `color-contrast` now runs to a
 * verdict in this environment (e.g. after installing the `canvas` package, or
 * because these tests moved into a real browser) — remove the override in
 * `src/test/axe.ts` and let axe cover contrast for real.
 */
describe('axe color-contrast in jsdom — known gap, not a real check', () => {
  it('reports color-contrast as incomplete, never as passing, on unreadable text', async () => {
    document.body.innerHTML = `
      <div style="background-color: #ffffff; padding: 20px;">
        <p style="color: #fafafa; font-size: 12px;">
          This text is nearly invisible against its background.
        </p>
      </div>
    `

    const results = await axeCore.run(document.body, {
      rules: { 'color-contrast': { enabled: true } },
    })

    const contrastViolation = results.violations.find((v) => v.id === 'color-contrast')
    const contrastPass = results.passes.find((v) => v.id === 'color-contrast')
    const contrastIncomplete = results.incomplete.find((v) => v.id === 'color-contrast')

    expect(contrastViolation, 'jsdom can now detect a real contrast violation — re-enable the rule for real').toBeUndefined()
    expect(contrastPass, 'jsdom is reporting a false pass on unreadable text — do not trust this rule here').toBeUndefined()
    expect(contrastIncomplete, 'expected color-contrast to come back incomplete in jsdom').toBeDefined()

    document.body.innerHTML = ''
  })
})
