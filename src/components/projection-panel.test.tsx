import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { ProjectionPanel } from './projection-panel'
import { expectNoAxeViolations } from '@/test/axe'
import type { Holding } from '@/lib/holdings-api'
import type { Instrument } from '@/lib/instruments-api'
import type { ProjectionSettings } from '@/lib/projection-settings-api'

const getToken = vi.fn().mockResolvedValue('test-token')
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken }),
}))

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

const getProjectionSettings = vi.fn<(token: string | null, ledgerId: string) => Promise<ProjectionSettings>>()
const putProjectionSettings = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/projection-settings-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/projection-settings-api')>()
  return {
    ...actual,
    getProjectionSettings: (...args: Parameters<typeof getProjectionSettings>) => getProjectionSettings(...args),
    putProjectionSettings: (...args: Parameters<typeof putProjectionSettings>) => putProjectionSettings(...args),
  }
})

function makeHolding(overrides: Partial<Holding>): Holding {
  return {
    id: 'h1',
    householdId: 'hh1',
    memberId: 'm1',
    instrumentId: 'i1',
    assetClass: 'equity',
    investedAmount: '10000',
    currentValue: '10000',
    units: null,
    monthlySip: null,
    startDate: null,
    maturityDate: null,
    nominee: null,
    isEmergencyFund: false,
    notes: null,
    version: 1,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

const instrument: Instrument = {
  id: 'i1',
  slug: 'equity-large-cap-fund',
  category: 1,
  name: 'Large Cap Index Fund',
  summary: '',
  returns: '',
  tax: '',
  liquidity: '',
  risk: '',
  eligibility: '',
  minInvestment: '',
  rateValue: null,
  rateAsOf: null,
  createdAt: '',
}

const holdings: Holding[] = [makeHolding({ id: 'h1', currentValue: '100000' })]

const LEDGER_ID = 'l1'

function emptySettings(overrides: Partial<ProjectionSettings> = {}): ProjectionSettings {
  return { ledgerId: LEDGER_ID, horizonYears: null, rates: [], ...overrides }
}

describe('ProjectionPanel', () => {
  beforeEach(() => {
    track.mockReset()
    getToken.mockClear()
    getProjectionSettings.mockReset()
    getProjectionSettings.mockResolvedValue(emptySettings())
    putProjectionSettings.mockReset()
    putProjectionSettings.mockResolvedValue(undefined)
  })

  it('is hidden entirely, not shown empty, when the ledger has no holdings', () => {
    const { container } = render(<ProjectionPanel state="ready" holdings={[]} instruments={[]} ledgerId={LEDGER_ID} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('still renders while loading even with no holdings loaded yet', () => {
    render(<ProjectionPanel state="loading" holdings={[]} instruments={[]} ledgerId={LEDGER_ID} />)
    expect(screen.getByTestId('projection-panel-loading')).toBeInTheDocument()
  })

  it('shows a skeleton line plus skeleton rate rows in the loading state', () => {
    render(<ProjectionPanel state="loading" holdings={holdings} instruments={[instrument]} ledgerId={LEDGER_ID} />)
    const loading = screen.getByTestId('projection-panel-loading')
    // At least a line skeleton and separate skeleton rate rows -- more than
    // one skeleton element, not one blob standing in for the whole panel.
    expect(loading.querySelectorAll('[class*="animate-pulse"], .skeleton, [data-slot="skeleton"]').length).toBeGreaterThan(1)
  })

  it('renders the chart container with min-w-0 and its own overflow-x context', () => {
    const { container } = render(
      <ProjectionPanel state="ready" holdings={holdings} instruments={[instrument]} ledgerId={LEDGER_ID} />,
    )
    const chartContainer = container.querySelector('[data-testid="projection-chart-container"]')
    expect(chartContainer).not.toBeNull()
    expect(chartContainer?.className).toContain('min-w-0')
    expect(chartContainer?.className).toMatch(/overflow-x/)
  })

  it('shows an inline error message and keeps the last valid line visible', () => {
    const { rerender, container } = render(
      <ProjectionPanel state="ready" holdings={holdings} instruments={[instrument]} ledgerId={LEDGER_ID} />,
    )
    expect(container.querySelector('[data-testid="projection-chart-container"]')).not.toBeNull()

    rerender(<ProjectionPanel state="error" holdings={holdings} instruments={[instrument]} ledgerId={LEDGER_ID} />)

    expect(screen.getByText(/couldn't refresh/i)).toBeInTheDocument()
    // The last valid line is still there, not wiped by the error.
    expect(container.querySelector('[data-testid="projection-chart-container"]')).not.toBeNull()
  })

  it('renders nothing chart-shaped on a first-ever error with no prior good render', () => {
    const { container } = render(
      <ProjectionPanel state="error" holdings={holdings} instruments={[instrument]} ledgerId={LEDGER_ID} />,
    )
    expect(screen.getByText(/couldn't refresh/i)).toBeInTheDocument()
    expect(container.querySelector('[data-testid="projection-chart-container"]')).toBeNull()
  })

  it('is collapsed by default below md, and expands when toggled', () => {
    render(<ProjectionPanel state="ready" holdings={holdings} instruments={[instrument]} ledgerId={LEDGER_ID} />)
    const toggle = screen.getByRole('button', { name: /show/i })
    const content = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    expect(content?.className).toContain('hidden')
    expect(content?.className).toContain('md:block')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(content?.className).not.toMatch(/(^|\s)hidden(\s|$)/)
    expect(content?.className).toContain('md:block')
  })

  it('never uses the sm: breakpoint, which fires at 390px in this project', async () => {
    const { container } = render(
      <ProjectionPanel state="ready" holdings={holdings} instruments={[instrument]} ledgerId={LEDGER_ID} />,
    )
    // Wait for settings to hydrate so the horizon control and rate rows,
    // which mount asynchronously, are included in the sweep below.
    await screen.findByRole('button', { name: /^5$/ })
    const allClassNames = Array.from(container.querySelectorAll('*'))
      .map((el) => el.className)
      .filter((c) => typeof c === 'string')
      .join(' ')
    expect(allClassNames).not.toMatch(/(?<![\w-])sm:/)
  })

  it('has zero axe violations', async () => {
    const { container } = render(
      <ProjectionPanel state="ready" holdings={holdings} instruments={[instrument]} ledgerId={LEDGER_ID} />,
    )
    await screen.findByRole('button', { name: /^5$/ })
    await expectNoAxeViolations(container)
  })

  describe('horizon control (E7)', () => {
    it('renders preset chips for 5, 10, 15 and 20 years', async () => {
      render(<ProjectionPanel state="ready" holdings={holdings} instruments={[instrument]} ledgerId={LEDGER_ID} />)
      for (const years of [5, 10, 15, 20]) {
        expect(await screen.findByRole('button', { name: new RegExp(`^${years}$`) })).toBeInTheDocument()
      }
    })

    it('renders a free numeric horizon field accepting 1 to 40', async () => {
      render(<ProjectionPanel state="ready" holdings={holdings} instruments={[instrument]} ledgerId={LEDGER_ID} />)
      const field = await screen.findByLabelText(/horizon/i)
      expect(field).toHaveAttribute('type', 'number')
      expect(field).toHaveAttribute('min', '1')
      expect(field).toHaveAttribute('max', '40')
    })

    it('hydrates the horizon from GET on load and reflects it in both controls', async () => {
      getProjectionSettings.mockResolvedValue(emptySettings({ horizonYears: 15 }))
      render(<ProjectionPanel state="ready" holdings={holdings} instruments={[instrument]} ledgerId={LEDGER_ID} />)

      const chip15 = await screen.findByRole('button', { name: /^15$/ })
      expect(chip15).toHaveAttribute('aria-pressed', 'true')
      const field = screen.getByLabelText(/horizon/i) as HTMLInputElement
      expect(field.value).toBe('15')
      expect(screen.getByText(/over 15 years/i)).toBeInTheDocument()
    })

    it('clicking a preset chip sets the horizon and persists it via PUT', async () => {
      render(<ProjectionPanel state="ready" holdings={holdings} instruments={[instrument]} ledgerId={LEDGER_ID} />)
      const chip20 = await screen.findByRole('button', { name: /^20$/ })

      fireEvent.click(chip20)

      expect(await screen.findByText(/over 20 years/i)).toBeInTheDocument()
      expect(chip20).toHaveAttribute('aria-pressed', 'true')
      await waitFor(() => {
        expect(putProjectionSettings).toHaveBeenCalledWith(
          'test-token',
          expect.objectContaining({ ledgerId: LEDGER_ID, horizonYears: 20 }),
        )
      })
    })

    it('the free field wins when edited after a chip', async () => {
      render(<ProjectionPanel state="ready" holdings={holdings} instruments={[instrument]} ledgerId={LEDGER_ID} />)
      const chip5 = await screen.findByRole('button', { name: /^5$/ })
      fireEvent.click(chip5)
      expect(await screen.findByText(/over 5 years/i)).toBeInTheDocument()

      const field = screen.getByLabelText(/horizon/i)
      fireEvent.change(field, { target: { value: '12' } })
      fireEvent.blur(field)

      expect(await screen.findByText(/over 12 years/i)).toBeInTheDocument()
      expect(chip5).toHaveAttribute('aria-pressed', 'false')
      await waitFor(() => {
        expect(putProjectionSettings).toHaveBeenCalledWith(
          'test-token',
          expect.objectContaining({ ledgerId: LEDGER_ID, horizonYears: 12 }),
        )
      })
    })

    it('rejects a free-field value outside 1 to 40 without changing the projection', async () => {
      render(<ProjectionPanel state="ready" holdings={holdings} instruments={[instrument]} ledgerId={LEDGER_ID} />)
      await screen.findByRole('button', { name: /^5$/ })
      const field = screen.getByLabelText(/horizon/i)

      fireEvent.change(field, { target: { value: '41' } })
      fireEvent.blur(field)

      expect(await screen.findByText(/between 1 and 40/i)).toBeInTheDocument()
      // Default (10) illustration text is unchanged — the invalid value never committed.
      expect(screen.getByText(/over 10 years/i)).toBeInTheDocument()
      expect(putProjectionSettings).not.toHaveBeenCalled()
    })
  })

  describe('rate rows (E8)', () => {
    const debtInstrument: Instrument = { ...instrument, id: 'i2', slug: 'debt-fund' }
    const equityHolding = makeHolding({ id: 'h1', assetClass: 'equity', currentValue: '100000', instrumentId: 'i1' })
    const debtHolding = makeHolding({ id: 'h2', assetClass: 'debt', currentValue: '50000', instrumentId: 'i2' })
    const twoClassHoldings = [equityHolding, debtHolding]
    const twoInstruments = [instrument, debtInstrument]

    it('renders one row per asset class present, and no others', async () => {
      render(
        <ProjectionPanel state="ready" holdings={twoClassHoldings} instruments={twoInstruments} ledgerId={LEDGER_ID} />,
      )
      expect(await screen.findByTestId('rate-row-equity')).toBeInTheDocument()
      expect(screen.getByTestId('rate-row-debt')).toBeInTheDocument()
      for (const cls of ['gold', 'hybrid', 'real-estate', 'alternative']) {
        expect(screen.queryByTestId(`rate-row-${cls}`)).not.toBeInTheDocument()
      }
    })

    it('lays out rate rows one column below md and two columns at md and up', async () => {
      render(
        <ProjectionPanel state="ready" holdings={twoClassHoldings} instruments={twoInstruments} ledgerId={LEDGER_ID} />,
      )
      const grid = await screen.findByTestId('rate-rows-grid')
      expect(grid.className).toContain('grid-cols-1')
      expect(grid.className).toMatch(/md:grid-cols-2/)
    })

    it('shows the source the current rate came from', async () => {
      render(
        <ProjectionPanel state="ready" holdings={twoClassHoldings} instruments={twoInstruments} ledgerId={LEDGER_ID} />,
      )
      const equityRow = await screen.findByTestId('rate-row-equity')
      // instrument has no assumedAnnualRatePct set in the fixture, so it falls to the class default.
      expect(within(equityRow).getByText(/household default/i)).toBeInTheDocument()
    })

    it('shows an instrument-sourced rate distinctly from a class-override', async () => {
      const rated: Instrument = { ...instrument, assumedAnnualRatePct: '9', rateSource: 'Seeded fund fact sheet' }
      render(
        <ProjectionPanel
          state="ready"
          holdings={[equityHolding]}
          instruments={[rated]}
          ledgerId={LEDGER_ID}
        />,
      )
      const row = await screen.findByTestId('rate-row-equity')
      expect((within(row).getByRole('spinbutton') as HTMLInputElement).value).toBe('9')
      expect(within(row).getByText(/this instrument/i)).toBeInTheDocument()
    })

    it('shows a range, not one holding’s rate, when a class holds differing instrument rates', async () => {
      const equityInstrumentA: Instrument = { ...instrument, id: 'ia', assumedAnnualRatePct: '9' }
      const equityInstrumentB: Instrument = { ...instrument, id: 'ib', assumedAnnualRatePct: '13' }
      const holdingA = makeHolding({ id: 'ha', assetClass: 'equity', currentValue: '10000', instrumentId: 'ia' })
      const holdingB = makeHolding({ id: 'hb', assetClass: 'equity', currentValue: '10000', instrumentId: 'ib' })
      render(
        <ProjectionPanel
          state="ready"
          holdings={[holdingA, holdingB]}
          instruments={[equityInstrumentA, equityInstrumentB]}
          ledgerId={LEDGER_ID}
        />,
      )
      const row = await screen.findByTestId('rate-row-equity')
      expect(within(row).getByText(/9.*13|9%.*13%/i)).toBeInTheDocument()
      // No single rate is presented as though it were the class's own.
      expect(within(row).queryByText(/^9%$/)).not.toBeInTheDocument()
      expect(within(row).queryByText(/^13%$/)).not.toBeInTheDocument()
    })

    it('edits persist through PUT and preserve other classes’ overrides (full-state replace)', async () => {
      getProjectionSettings.mockResolvedValue(
        emptySettings({ rates: [{ assetClass: 'debt', annualRatePct: 6 }] }),
      )
      render(
        <ProjectionPanel state="ready" holdings={twoClassHoldings} instruments={twoInstruments} ledgerId={LEDGER_ID} />,
      )
      const equityRow = await screen.findByTestId('rate-row-equity')
      const equityInput = within(equityRow).getByRole('spinbutton')

      fireEvent.change(equityInput, { target: { value: '12' } })
      fireEvent.blur(equityInput)

      await waitFor(() => {
        expect(putProjectionSettings).toHaveBeenCalledWith(
          'test-token',
          expect.objectContaining({
            ledgerId: LEDGER_ID,
            rates: expect.arrayContaining([
              { assetClass: 'equity', annualRatePct: 12 },
              { assetClass: 'debt', annualRatePct: 6 },
            ]),
          }),
        )
      })
    })

    it('fires projection_rate_overridden with no properties on commit, not on keystroke', async () => {
      render(
        <ProjectionPanel state="ready" holdings={twoClassHoldings} instruments={twoInstruments} ledgerId={LEDGER_ID} />,
      )
      const equityRow = await screen.findByTestId('rate-row-equity')
      const equityInput = within(equityRow).getByRole('spinbutton')

      fireEvent.change(equityInput, { target: { value: '1' } })
      expect(track).not.toHaveBeenCalled()

      fireEvent.change(equityInput, { target: { value: '12' } })
      expect(track).not.toHaveBeenCalled()

      fireEvent.blur(equityInput)

      await waitFor(() => {
        expect(track).toHaveBeenCalledWith('projection_rate_overridden', {})
      })
      expect(track).toHaveBeenCalledTimes(1)

      // The payload must stay empty. `asset_class` here would report which
      // asset classes this household holds, because a rate row is only
      // rendered for a class it holds. See src/lib/analytics.ts.
      const [, properties] = track.mock.calls[0]
      expect(Object.keys(properties as object)).toEqual([])
    })

    it('every rate row input meets the 44px touch target floor', async () => {
      render(
        <ProjectionPanel state="ready" holdings={twoClassHoldings} instruments={twoInstruments} ledgerId={LEDGER_ID} />,
      )
      const equityRow = await screen.findByTestId('rate-row-equity')
      const input = within(equityRow).getByRole('spinbutton')
      expect(input.className).toMatch(/h-11|min-h-11/)
    })
  })

  describe('"See the maths" disclosure panel (E9)', () => {
    const debtInstrument: Instrument = { ...instrument, id: 'i2', slug: 'debt-fund' }
    const equityHolding = makeHolding({ id: 'h1', assetClass: 'equity', currentValue: '100000', instrumentId: 'i1' })
    const debtHolding = makeHolding({ id: 'h2', assetClass: 'debt', currentValue: '50000', instrumentId: 'i2' })
    const twoClassHoldings = [equityHolding, debtHolding]
    const twoInstruments = [instrument, debtInstrument]

    it('renders a toggle, closed by default, that reveals a disclosure panel without hiding the chart', async () => {
      const { container } = render(
        <ProjectionPanel state="ready" holdings={twoClassHoldings} instruments={twoInstruments} ledgerId={LEDGER_ID} />,
      )
      await screen.findByTestId('rate-row-equity')
      const toggle = screen.getByRole('button', { name: /see the maths/i })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByTestId('see-the-maths-panel')).not.toBeInTheDocument()

      fireEvent.click(toggle)

      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByTestId('see-the-maths-panel')).toBeInTheDocument()
      // The chart is still visible with the panel open — this is a disclosure, not a modal.
      expect(container.querySelector('[data-testid="projection-chart-container"]')).not.toBeNull()
    })

    it('shows, per asset class present, the resolved rate, the basis string verbatim, and the as-of date with a staleness note', async () => {
      const rated: Instrument = {
        ...instrument,
        assumedAnnualRatePct: '9',
        rateSource: 'Seeded fund fact sheet',
        assumedRateAsOf: '2025-01-01',
      }
      render(
        <ProjectionPanel state="ready" holdings={[equityHolding]} instruments={[rated]} ledgerId={LEDGER_ID} />,
      )
      const toggle = await screen.findByRole('button', { name: /see the maths/i })
      fireEvent.click(toggle)

      const mathsPanel = screen.getByTestId('see-the-maths-panel')
      const equitySection = within(mathsPanel).getByTestId('maths-row-equity')
      expect(within(equitySection).getByText(/9%/)).toBeInTheDocument()
      // The basis string is rendered verbatim, not paraphrased.
      expect(within(equitySection).getByText('Seeded fund fact sheet')).toBeInTheDocument()
      expect(within(equitySection).getByText(/2025-01-01/)).toBeInTheDocument()
      expect(within(equitySection).getByText(/as of/i)).toBeInTheDocument()
    })

    it('shows the class-default basis verbatim when nothing was seeded or overridden, with no as-of date', async () => {
      render(
        <ProjectionPanel state="ready" holdings={[equityHolding]} instruments={[instrument]} ledgerId={LEDGER_ID} />,
      )
      const toggle = await screen.findByRole('button', { name: /see the maths/i })
      fireEvent.click(toggle)

      const mathsPanel = screen.getByTestId('see-the-maths-panel')
      const equitySection = within(mathsPanel).getByTestId('maths-row-equity')
      expect(
        within(equitySection).getByText(
          /A conservative reading of the long run nominal return on Indian large cap equity indices/,
        ),
      ).toBeInTheDocument()
      expect(within(equitySection).queryByText(/as of/i)).not.toBeInTheDocument()
    })

    it('notes that a divergent class shows a range rather than one holding’s rate', async () => {
      const equityInstrumentA: Instrument = { ...instrument, id: 'ia', assumedAnnualRatePct: '9' }
      const equityInstrumentB: Instrument = { ...instrument, id: 'ib', assumedAnnualRatePct: '13' }
      const holdingA = makeHolding({ id: 'ha', assetClass: 'equity', currentValue: '10000', instrumentId: 'ia' })
      const holdingB = makeHolding({ id: 'hb', assetClass: 'equity', currentValue: '10000', instrumentId: 'ib' })
      render(
        <ProjectionPanel
          state="ready"
          holdings={[holdingA, holdingB]}
          instruments={[equityInstrumentA, equityInstrumentB]}
          ledgerId={LEDGER_ID}
        />,
      )
      const toggle = await screen.findByRole('button', { name: /see the maths/i })
      fireEvent.click(toggle)

      const mathsPanel = screen.getByTestId('see-the-maths-panel')
      const equitySection = within(mathsPanel).getByTestId('maths-row-equity')
      expect(within(equitySection).getByText(/range/i)).toBeInTheDocument()
    })

    it('states the compounding formula in words, not notation', async () => {
      render(
        <ProjectionPanel state="ready" holdings={twoClassHoldings} instruments={twoInstruments} ledgerId={LEDGER_ID} />,
      )
      const toggle = await screen.findByRole('button', { name: /see the maths/i })
      fireEvent.click(toggle)

      const mathsPanel = screen.getByTestId('see-the-maths-panel')
      const text = mathsPanel.textContent ?? ''
      // No mathematical notation: no formula-style exponent/multiplication symbols.
      expect(text).not.toMatch(/[\^×]/)
      expect(text).not.toMatch(/value\(n\)/)
      expect(text.toLowerCase()).toMatch(/each year/)
      expect(text.toLowerCase()).toMatch(/grows/)
    })

    it('discloses that a year’s contributions are treated as arriving at the end of that year and earn no growth that year', async () => {
      render(
        <ProjectionPanel state="ready" holdings={twoClassHoldings} instruments={twoInstruments} ledgerId={LEDGER_ID} />,
      )
      const toggle = await screen.findByRole('button', { name: /see the maths/i })
      fireEvent.click(toggle)
      const text = screen.getByTestId('see-the-maths-panel').textContent ?? ''
      expect(text.toLowerCase()).toMatch(/end of (that|the) year/)
      expect(text.toLowerCase()).toMatch(/no growth|does not grow|earns nothing/)
    })

    it('discloses that a monthly contribution is split across holdings by starting value and never rebalanced', async () => {
      render(
        <ProjectionPanel state="ready" holdings={twoClassHoldings} instruments={twoInstruments} ledgerId={LEDGER_ID} />,
      )
      const toggle = await screen.findByRole('button', { name: /see the maths/i })
      fireEvent.click(toggle)
      const text = screen.getByTestId('see-the-maths-panel').textContent ?? ''
      expect(text.toLowerCase()).toMatch(/starting value/)
      expect(text.toLowerCase()).toMatch(/never rebalanced|not rebalanced|does not rebalance/)
    })

    it('discloses that rounding happens once, at display, and never feeds back into the maths', async () => {
      render(
        <ProjectionPanel state="ready" holdings={twoClassHoldings} instruments={twoInstruments} ledgerId={LEDGER_ID} />,
      )
      const toggle = await screen.findByRole('button', { name: /see the maths/i })
      fireEvent.click(toggle)
      const text = screen.getByTestId('see-the-maths-panel').textContent ?? ''
      expect(text.toLowerCase()).toMatch(/rounded|rounding/)
      expect(text.toLowerCase()).toMatch(/once/)
      expect(text.toLowerCase()).toMatch(/calculator/)
    })

    it('never uses the sm: breakpoint inside the disclosure panel', async () => {
      render(
        <ProjectionPanel state="ready" holdings={twoClassHoldings} instruments={twoInstruments} ledgerId={LEDGER_ID} />,
      )
      const toggle = await screen.findByRole('button', { name: /see the maths/i })
      fireEvent.click(toggle)
      const mathsPanel = screen.getByTestId('see-the-maths-panel')
      const allClassNames = Array.from(mathsPanel.querySelectorAll('*'))
        .map((el) => el.className)
        .filter((c) => typeof c === 'string')
        .join(' ')
      expect(allClassNames).not.toMatch(/(?<![\w-])sm:/)
    })

    it('has zero axe violations with the disclosure panel open', async () => {
      const { container } = render(
        <ProjectionPanel state="ready" holdings={twoClassHoldings} instruments={twoInstruments} ledgerId={LEDGER_ID} />,
      )
      const toggle = await screen.findByRole('button', { name: /see the maths/i })
      fireEvent.click(toggle)
      await expectNoAxeViolations(container)
    })
  })

  describe('projection_viewed telemetry (E10)', () => {
    const debtInstrument: Instrument = { ...instrument, id: 'i2', slug: 'debt-fund' }
    const equityHolding = makeHolding({ id: 'h1', assetClass: 'equity', currentValue: '100000', instrumentId: 'i1' })
    const debtHolding = makeHolding({ id: 'h2', assetClass: 'debt', currentValue: '50000', instrumentId: 'i2' })
    const twoClassHoldings = [equityHolding, debtHolding]
    const twoInstruments = [instrument, debtInstrument]

    const originalMatchMedia = window.matchMedia

    afterEach(() => {
      window.matchMedia = originalMatchMedia
    })

    function mockViewport(matches: boolean) {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as unknown as typeof window.matchMedia
    }

    it('fires once on a desktop (md+) viewport as soon as the projection renders, with horizon_years only', async () => {
      mockViewport(true)
      render(<ProjectionPanel state="ready" holdings={holdings} instruments={[instrument]} ledgerId={LEDGER_ID} />)

      await waitFor(() => {
        expect(track).toHaveBeenCalledWith('projection_viewed', { horizon_years: 10 })
      })
      const viewedCalls = track.mock.calls.filter(([event]) => event === 'projection_viewed')
      expect(viewedCalls).toHaveLength(1)
    })

    it('does not fire on a mobile viewport while the panel is still collapsed', async () => {
      mockViewport(false)
      render(<ProjectionPanel state="ready" holdings={holdings} instruments={[instrument]} ledgerId={LEDGER_ID} />)
      await screen.findByRole('button', { name: /^5$/ })

      const viewedCalls = track.mock.calls.filter(([event]) => event === 'projection_viewed')
      expect(viewedCalls).toHaveLength(0)
    })

    it('fires on a mobile viewport once the user expands the collapsed panel', async () => {
      mockViewport(false)
      render(<ProjectionPanel state="ready" holdings={holdings} instruments={[instrument]} ledgerId={LEDGER_ID} />)
      const showToggle = screen.getByRole('button', { name: /show/i })

      fireEvent.click(showToggle)

      await waitFor(() => {
        const viewedCalls = track.mock.calls.filter(([event]) => event === 'projection_viewed')
        expect(viewedCalls).toHaveLength(1)
      })
    })

    it('does not re-fire on a horizon change, a rate override, or other re-renders once already viewed', async () => {
      mockViewport(true)
      render(<ProjectionPanel state="ready" holdings={holdings} instruments={[instrument]} ledgerId={LEDGER_ID} />)
      const chip20 = await screen.findByRole('button', { name: /^20$/ })
      await waitFor(() => {
        expect(track.mock.calls.filter(([event]) => event === 'projection_viewed')).toHaveLength(1)
      })

      fireEvent.click(chip20)
      await screen.findByText(/over 20 years/i)

      const viewedCalls = track.mock.calls.filter(([event]) => event === 'projection_viewed')
      expect(viewedCalls).toHaveLength(1)
    })

    it('carries no rupee amount on any event fired by this panel', async () => {
      mockViewport(true)
      render(<ProjectionPanel state="ready" holdings={holdings} instruments={[instrument]} ledgerId={LEDGER_ID} />)
      const equityRow = await screen.findByTestId('rate-row-equity')
      const input = within(equityRow).getByRole('spinbutton')
      fireEvent.change(input, { target: { value: '9' } })
      fireEvent.blur(input)

      await waitFor(() => {
        expect(track).toHaveBeenCalledWith('projection_rate_overridden', {})
      })

      // horizon_years is a legitimate number (a setting, not a rupee amount).
      // The forbidden shape is any property that names or carries a rupee
      // figure -- a property key with "inr"/"amount"/"value" in it, or the
      // panel's own formatted rupee string ("₹...").
      for (const [, properties] of track.mock.calls) {
        for (const [key, value] of Object.entries(properties as Record<string, unknown>)) {
          expect(key.toLowerCase()).not.toMatch(/inr|amount|rupee/)
          if (typeof value === 'string') {
            expect(value).not.toMatch(/₹/)
          }
        }
      }
    })

    it('leaves projection_rate_overridden firing with no properties, unchanged', async () => {
      mockViewport(true)
      render(
        <ProjectionPanel state="ready" holdings={twoClassHoldings} instruments={twoInstruments} ledgerId={LEDGER_ID} />,
      )
      const equityRow = await screen.findByTestId('rate-row-equity')
      const input = within(equityRow).getByRole('spinbutton')
      fireEvent.change(input, { target: { value: '9' } })
      fireEvent.blur(input)

      await waitFor(() => {
        expect(track).toHaveBeenCalledWith('projection_rate_overridden', {})
      })
    })
  })
})
