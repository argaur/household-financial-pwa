import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { expectNoAxeViolations } from '@/test/axe'
import { GuillocheMotif } from './guilloche-motif'

function renderMotif(props: Parameters<typeof GuillocheMotif>[0] = {}) {
  const { container } = render(<GuillocheMotif data-testid="motif" {...props} />)
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('GuillocheMotif rendered no svg')
  return { container, svg }
}

describe('GuillocheMotif', () => {
  it('draws the rosette as vectors, not a raster asset', () => {
    const { svg } = renderMotif()
    expect(svg).toHaveAttribute('viewBox', '0 0 200 200')
    expect(svg.querySelector('image')).toBeNull()
    expect(svg.innerHTML).not.toMatch(/data:image/)
  })

  it('defaults to the folio landing-cover ring count', () => {
    const { svg } = renderMotif()
    expect(svg.querySelectorAll('ellipse')).toHaveLength(30)
  })

  it('honours a caller ring count and sweeps the ellipses evenly across 180 degrees', () => {
    const { svg } = renderMotif({ rings: 4 })
    const rotations = Array.from(svg.querySelectorAll('ellipse'), (e) => e.getAttribute('transform'))
    expect(rotations).toEqual([
      'rotate(0 100 100)',
      'rotate(45 100 100)',
      'rotate(90 100 100)',
      'rotate(135 100 100)',
    ])
  })

  it('closes the rosette with a single hairline ring', () => {
    const { svg } = renderMotif()
    const circles = svg.querySelectorAll('circle')
    expect(circles).toHaveLength(1)
    expect(circles[0]).toHaveAttribute('r', '97')
    expect(circles[0]).toHaveAttribute('fill', 'none')
  })

  it('takes its colour from currentColor so text-brass drives it in both themes', () => {
    const { svg } = renderMotif()
    expect(svg.className.baseVal).toContain('text-brass')
    for (const shape of svg.querySelectorAll('ellipse, circle')) {
      expect(shape).toHaveAttribute('stroke', 'currentColor')
    }
  })

  it('reads its opacity from the --guilloche-opacity token, as a class and never an inline style', () => {
    const { svg } = renderMotif()
    // React coerces `style={{ opacity: 'var(...)' }}` to NaN and drops the
    // rule with no error, so the token has to arrive as a class.
    expect(svg.className.baseVal).toContain('opacity-[var(--guilloche-opacity)]')
    expect(svg.getAttribute('style') ?? '').not.toMatch(/opacity/)
  })

  it('is decorative: hidden from assistive tech, not focusable, not clickable', () => {
    const { svg } = renderMotif()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
    expect(svg.className.baseVal).toContain('pointer-events-none')
  })

  it('merges a caller className without dropping its own decorative tokens', () => {
    const { svg } = renderMotif({ className: 'absolute -top-[150px]' })
    expect(svg.className.baseVal).toContain('absolute')
    expect(svg.className.baseVal).toContain('-top-[150px]')
    expect(svg.className.baseVal).toContain('pointer-events-none')
  })

  it('has no axe violations', async () => {
    const { container } = renderMotif()
    await expectNoAxeViolations(container)
  })
})
