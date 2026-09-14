import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

  /*
    2026-09-13 — the rosette now unfurls once on mount, rings opening from
    the centre outward like a bud. The stagger and each ring's final angle
    have to reach CSS from the component, because the angle is computed per
    ring and a keyframe cannot know it.
  */
  describe('unfurl reveal', () => {
    it('gives every ring the reveal class and a staggered delay', () => {
      const { svg } = renderMotif({ rings: 4 })
      const rings = Array.from(svg.querySelectorAll('ellipse'))
      for (const ring of rings) expect(ring.getAttribute('class')).toContain('guilloche-ring')
      expect(rings.map((r) => (r as SVGElement).style.animationDelay)).toEqual(['0ms', '16ms', '32ms', '48ms'])
    })

    it('hands each ring its own final rotation, so the keyframe can hold it', () => {
      const { svg } = renderMotif({ rings: 4 })
      const vars = Array.from(svg.querySelectorAll('ellipse'), (r) =>
        (r as SVGElement).style.getPropertyValue('--ring-rotation'),
      )
      expect(vars).toEqual(['0deg', '45deg', '90deg', '135deg'])
    })

    it('keeps the rotate attribute as the no-CSS and reduced-motion fallback', () => {
      // The CSS transform only exists inside the no-preference media query.
      // Without the attribute the rosette would collapse to 30 identical
      // ellipses for anyone who asked for reduced motion.
      const { svg } = renderMotif({ rings: 4 })
      expect(svg.querySelectorAll('ellipse')[1]).toHaveAttribute('transform', 'rotate(45 100 100)')
    })

    it('lands the outer hairline ring last', () => {
      const { svg } = renderMotif({ rings: 4 })
      const rim = svg.querySelector('circle') as SVGElement
      expect(rim.getAttribute('class')).toContain('guilloche-rim')
      expect(rim.style.animationDelay).toBe('64ms')
    })
  })

  describe('unfurl reveal — the stylesheet half', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8')
    const block = css.slice(css.indexOf('guilloche-unfurl'))

    it('runs once, never loops', () => {
      expect(css).toContain('@keyframes guilloche-unfurl')
      expect(block).not.toMatch(/infinite|alternate/)
    })

    it('is gated on prefers-reduced-motion: no-preference', () => {
      const gate = css.lastIndexOf('prefers-reduced-motion: no-preference', css.indexOf('.guilloche-ring'))
      expect(gate).toBeGreaterThan(-1)
    })

    it('animates transform and opacity only — never a layout property', () => {
      const frames = block.slice(block.indexOf('@keyframes guilloche-unfurl'))
      expect(frames).not.toMatch(/\b(width|height|top|left|margin|padding|stroke-width)\s*:/)
    })

    it('never starts from scale(0) — nothing appears out of nothing', () => {
      expect(block).not.toMatch(/scale\(0\)/)
    })

    it('shares one convention with the other one-shot reveal in the app', () => {
      // 2026-09-13: `landing-fade-up` was an inline <style> inside
      // Landing.tsx describing the same convention in a second place. Both
      // now live in globals.css under one heading. If a third reveal is
      // added, it belongs here too, gated the same way.
      expect(css).toContain('@keyframes landing-fade-up')
      const gate = css.lastIndexOf('prefers-reduced-motion: no-preference', css.indexOf('.landing-fade-up'))
      expect(gate).toBeGreaterThan(-1)
      const fadeBlock = css.slice(css.indexOf('.landing-fade-up'), css.indexOf('.guilloche-ring'))
      expect(fadeBlock).not.toMatch(/infinite|alternate/)
    })
  })

  it('has no axe violations', async () => {
    const { container } = renderMotif()
    await expectNoAxeViolations(container)
  })
})
