import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AllocationDonut } from './allocation-donut'
import { expectNoAxeViolations } from '@/test/axe'
import type { AllocationSlice } from '@/lib/allocation'

const allocation: AllocationSlice[] = [
  { assetClass: 'equity', value: 6000, percentage: 60 },
  { assetClass: 'debt', value: 3000, percentage: 30 },
  { assetClass: 'gold', value: 1000, percentage: 10 },
]

/** Same allocation, but part of the debt slice is flagged as the reserve. */
const allocationWithReserve: AllocationSlice[] = [
  { assetClass: 'equity', value: 6000, percentage: 60 },
  { assetClass: 'debt', value: 3000, percentage: 30, reserveValue: 1200 },
  { assetClass: 'gold', value: 1000, percentage: 10 },
]

function hatchPattern(container: HTMLElement): SVGPatternElement | null {
  return container.querySelector('pattern[id^="ef-hatch-"]')
}

function hatchedSectors(container: HTMLElement, patternId: string): Element[] {
  return Array.from(container.querySelectorAll(`path[fill="url(#${patternId})"]`))
}

function renderDonut(props: Partial<React.ComponentProps<typeof AllocationDonut>>) {
  return render(
    <MemoryRouter>
      <AllocationDonut state="empty" allocation={[]} totalValue={0} {...props} />
    </MemoryRouter>,
  )
}

describe('AllocationDonut', () => {
  it('shows a loading skeleton in the loading state', () => {
    renderDonut({ state: 'loading' })
    expect(screen.getByTestId('allocation-donut-loading')).toBeInTheDocument()
  })

  it('shows the empty/ghost state with a CTA linking to /portfolio', () => {
    renderDonut({ state: 'empty' })
    expect(screen.getByText('Nothing recorded yet.')).toBeInTheDocument()
    expect(screen.getByText(/add your first investment/i)).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: /record a holding/i })
    expect(cta).toHaveAttribute('href', '/portfolio')
  })

  it('shows the legend and total for the populated state', () => {
    renderDonut({ state: 'populated', allocation, totalValue: 10000 })
    expect(screen.getByText('Equity')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('Debt')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()
    expect(screen.getByText('Gold')).toBeInTheDocument()
    expect(screen.getByText('10%')).toBeInTheDocument()
    expect(screen.getByText('Total recorded value')).toBeInTheDocument()
    expect(screen.getByText('₹10,000')).toBeInTheDocument()
  })

  // 2026-09-11 regression guard. The donut and its legend were the one place
  // in the app still painting hard-coded LIGHT-theme hexes, so in dark mode
  // every arc and dot was the wrong colour while the rest of the surface had
  // followed the theme. Both now reference the per-theme CSS variables that
  // globals.css already defines. Asserting the exact reference is the point:
  // any hex creeping back into ASSET_HEX fails here.
  describe('asset colours follow the theme', () => {
    it('paints each arc from its per-theme asset variable, not a fixed hex', () => {
      const { container } = renderDonut({ state: 'populated', allocation, totalValue: 10000 })

      const fills = Array.from(container.querySelectorAll('.recharts-pie-sector path')).map((p) =>
        p.getAttribute('fill'),
      )
      expect(fills).toEqual(['hsl(var(--c-equity))', 'hsl(var(--c-debt))', 'hsl(var(--c-gold))'])
      expect(fills.some((f) => f?.startsWith('#'))).toBe(false)
    })

    it('paints each legend dot from the same variable as its arc', () => {
      const { container } = renderDonut({ state: 'populated', allocation, totalValue: 10000 })

      const dots = Array.from(container.querySelectorAll('li span.rounded-full')) as HTMLElement[]
      expect(dots).toHaveLength(3)
      expect(dots.map((d) => d.style.backgroundColor)).toEqual([
        'hsl(var(--c-equity))',
        'hsl(var(--c-debt))',
        'hsl(var(--c-gold))',
      ])
    })
  })

  // D-016 Slice 5 / SPEC.md §S6 — the reserve treatment gets its own
  // assertions, deliberately not folded into the 0-holdings ghost-state test
  // above: they cover different states and would mask each other.
  describe('emergency-fund (reserve) hatch', () => {
    it('hatches the emergency-fund portion of a slice when one is flagged', () => {
      const { container } = renderDonut({
        state: 'populated',
        allocation: allocationWithReserve,
        totalValue: 10000,
      })

      const pattern = hatchPattern(container)
      expect(pattern).not.toBeNull()
      // Folio geometry: 5x5 tile, rotated 45°, teal ground, one surface rule.
      expect(pattern!.getAttribute('patternTransform')).toBe('rotate(45)')
      // Was the literal '#2E7D8C' until 2026-09-11. That hex was the LIGHT
      // value of --c-ef, so the hatch painted a light-theme teal in dark mode.
      // It now references the per-theme variable, which is the whole point of
      // the fix — asserting a hex again would re-pin the bug.
      expect(pattern!.querySelector('rect')?.getAttribute('fill')).toBe('hsl(var(--c-ef))')
      expect(pattern!.querySelector('line')?.getAttribute('stroke')).toBe('hsl(var(--card))')

      // Exactly one arc carries the hatch: the ₹1,200 reserve inside debt.
      expect(hatchedSectors(container, pattern!.id)).toHaveLength(1)
    })

    it('splits the affected class into an open arc and a reserve arc, leaving other classes whole', () => {
      const { container } = renderDonut({
        state: 'populated',
        allocation: allocationWithReserve,
        totalValue: 10000,
      })

      // equity, debt-open, debt-reserve, gold — the reserve is carved out of
      // its own class, never promoted to a class of its own, so the legend's
      // per-class percentages stay exactly true.
      const sectors = container.querySelectorAll('.recharts-pie-sector path')
      expect(sectors).toHaveLength(4)
      expect(screen.getByText('Debt')).toBeInTheDocument()
      expect(screen.getByText('30%')).toBeInTheDocument()
      expect(screen.queryByText(/emergency/i)).toBeNull()
    })

    it('renders no pattern at all when no holding is flagged as emergency fund', () => {
      const { container } = renderDonut({ state: 'populated', allocation, totalValue: 10000 })
      expect(hatchPattern(container)).toBeNull()
      expect(container.querySelectorAll('[fill^="url(#"]')).toHaveLength(0)
    })

    it('gives each mounted donut its own pattern id, since SVG ids are document-global', () => {
      const { container } = render(
        <MemoryRouter>
          <AllocationDonut state="populated" allocation={allocationWithReserve} totalValue={10000} />
          <AllocationDonut state="populated" allocation={allocationWithReserve} totalValue={10000} />
        </MemoryRouter>,
      )

      const ids = Array.from(container.querySelectorAll('pattern')).map((p) => p.id)
      expect(ids).toHaveLength(2)
      expect(new Set(ids).size).toBe(2)
      // And each donut points at its own def, not its neighbour's.
      ids.forEach((id) => expect(hatchedSectors(container, id)).toHaveLength(1))
    })

    it('has zero axe violations with the reserve hatch rendered', async () => {
      const { container } = renderDonut({
        state: 'populated',
        allocation: allocationWithReserve,
        totalValue: 10000,
      })
      await expectNoAxeViolations(container)
    })
  })
})
