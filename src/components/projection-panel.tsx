import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import { VaultFrame } from '@/components/vault-frame'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { track } from '@/lib/analytics'
import { projectHoldings, type ProjectedHolding, type ProjectionHolding, type ProjectionResult } from '@/lib/projection/engine'
import { ASSET_HEX, ASSET_LABELS } from '@/lib/asset-classes'
import { ASSET_CLASS_ORDER, type AssetClass } from '@/lib/allocation'
import type { RateSource } from '@/lib/projection/rates'
import {
  getProjectionSettings,
  putProjectionSettings,
  MIN_HORIZON_YEARS_UI,
  MAX_HORIZON_YEARS_UI,
  MIN_ANNUAL_RATE_PCT,
  MAX_ANNUAL_RATE_PCT,
  type ProjectionRateEntry,
} from '@/lib/projection-settings-api'
import type { Holding } from '@/lib/holdings-api'
import type { Instrument } from '@/lib/instruments-api'

/**
 * E6/E7/E8 (D-024 AI import) — the projection panel.
 *
 * Placement: inside the LEDGER VIEW (src/pages/Portfolio.tsx), below the
 * compare strip and above the ledger table. SPEC.md §G4 says the panel
 * "lives inside the ledger view, below the allocation donut" — but the
 * donut only ever renders on the Dashboard (src/pages/Dashboard.tsx), never
 * in the ledger view, and there is no donut anywhere near a ledger's
 * holdings. That phrase reads as if it assumed the donut had been (or would
 * be) duplicated into the ledger view, which never happened. This panel is
 * placed relative to the ledger view's own real landmarks instead: after
 * LedgerCompareStrip (a per-ledger summary) and before LedgerTable (the
 * holdings themselves), which is the closest honest match to "a summary,
 * then the projection, then the detail" the spec's ordering implies.
 *
 * E7 adds the horizon control (preset chips 5/10/15/20 plus a free 1..40
 * field, SPEC.md G4) and E8 adds editable per-class rate rows, both wired to
 * GET/PUT /api/projection-settings. E9 adds the "See the maths" disclosure
 * panel (a section, not a modal -- the chart stays visible while it is
 * open). E10 adds `projection_viewed`, fired once per ledger the first time
 * a freshly computed projection is actually visible (see that effect's own
 * comment below for the exact rule).
 */

export type ProjectionPanelState = 'loading' | 'ready' | 'error'

interface ProjectionPanelProps {
  state: ProjectionPanelState
  /** The active ledger's own holdings. Empty means the panel hides entirely. */
  holdings: Holding[]
  /** Looked up per holding to resolve the instrument's seeded rate assumption. */
  instruments: Instrument[]
  /** The active ledger — GET/PUT /api/projection-settings are scoped to this id. */
  ledgerId: string
}

/** Used only until GET /api/projection-settings resolves (or fails). Not a decision, a loading-state fallback. */
const FALLBACK_HORIZON_YEARS = 10

const currency = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
function formatInr(value: number): string {
  return `₹${currency.format(value)}`
}

function toProjectionHoldings(holdings: Holding[], instruments: Instrument[]): ProjectionHolding[] {
  return holdings.map((holding) => {
    const instrument = instruments.find((i) => i.id === holding.instrumentId)
    return {
      assetClass: holding.assetClass,
      currentValue: holding.currentValue,
      instrumentAnnualRatePct: instrument?.assumedAnnualRatePct,
      instrumentRateSource: instrument?.rateSource,
      instrumentRateAsOf: instrument?.assumedRateAsOf,
    }
  })
}

/** Two decimal places, matching the server's numeric(5,2) column and its schema's precision check. */
function roundRatePct(value: number): number {
  return Math.round(value * 100) / 100
}

/** How one asset class's rate row should read, honest about a class with more than one instrument rate in play. */
interface RateRowData {
  assetClass: AssetClass
  /** The rate to prefill the input with, only when every holding in the class currently resolves to one figure. */
  uniformRatePct: number | null
  /** The distinct resolved rates present, low to high, only when they differ. */
  rateRangePct: [number, number] | null
  source: RateSource | 'mixed-instrument'
  basis: string
}

/**
 * One row per asset class present in the ledger's holdings, in the project's
 * fixed display order, and no others (SPEC.md G4, DATA_MODEL.md).
 *
 * A class can hold instruments with different resolved rates. That can only
 * happen on the 'instrument' branch of resolveAnnualRate — an override or
 * the class default apply the SAME figure to every holding in the class, so
 * divergence is only ever real when nothing has been overridden yet. Rather
 * than pick one holding's rate and show it as though it were the class's,
 * a divergent class reports the RANGE across its holdings and leaves the
 * edit field blank until the household states one number for the whole
 * class — which is what committing an edit here always does.
 */
function buildRateRows(result: ProjectionResult): RateRowData[] {
  const byClass = new Map<AssetClass, ProjectedHolding[]>()
  for (const holding of result.holdings) {
    const list = byClass.get(holding.assetClass) ?? []
    list.push(holding)
    byClass.set(holding.assetClass, list)
  }

  const rows: RateRowData[] = []
  for (const assetClass of ASSET_CLASS_ORDER) {
    const group = byClass.get(assetClass)
    if (!group || group.length === 0) continue
    const distinct = Array.from(new Set(group.map((h) => h.rate.annualRatePct))).sort((a, b) => a - b)
    if (distinct.length === 1) {
      rows.push({
        assetClass,
        uniformRatePct: distinct[0],
        rateRangePct: null,
        source: group[0].rate.source,
        basis: group[0].rate.basis,
      })
    } else {
      rows.push({
        assetClass,
        uniformRatePct: null,
        rateRangePct: [distinct[0], distinct[distinct.length - 1]],
        source: 'mixed-instrument',
        basis:
          'These holdings carry different seeded instrument rates. Set one rate to apply it to every holding in this class.',
      })
    }
  }
  return rows
}

const SOURCE_LABELS: Record<RateRowData['source'], string> = {
  'class-override': 'Your override',
  instrument: 'From this instrument',
  'class-default': 'Household default',
  'mixed-instrument': 'Varies by instrument',
}

const HORIZON_PRESETS = [5, 10, 15, 20] as const

/**
 * One line of "See the maths" for one asset class. E9 (D-024 AI import).
 *
 * A class can hold more than one distinct (rate, basis, as-of) combination
 * when nothing has been overridden yet -- see buildRateRows's own comment.
 * Rather than collapse that into one figure, this panel lists every distinct
 * combination present, and separately states that the summary row above
 * shows a range in that case. Nothing here is paraphrased: `basis` is
 * rendered exactly as rates.ts produced it, which is the whole audit promise.
 */
interface MathsRowEntry {
  annualRatePct: number
  basis: string
  asOf: string | null
}

interface MathsRowData {
  assetClass: AssetClass
  entries: MathsRowEntry[]
  isRange: boolean
}

function buildMathsRows(result: ProjectionResult): MathsRowData[] {
  const byClass = new Map<AssetClass, ProjectedHolding[]>()
  for (const holding of result.holdings) {
    const list = byClass.get(holding.assetClass) ?? []
    list.push(holding)
    byClass.set(holding.assetClass, list)
  }

  const rows: MathsRowData[] = []
  for (const assetClass of ASSET_CLASS_ORDER) {
    const group = byClass.get(assetClass)
    if (!group || group.length === 0) continue
    const seen = new Set<string>()
    const entries: MathsRowEntry[] = []
    for (const holding of group) {
      const key = `${holding.rate.annualRatePct}|${holding.rate.basis}|${holding.rate.asOf ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({ annualRatePct: holding.rate.annualRatePct, basis: holding.rate.basis, asOf: holding.rate.asOf })
    }
    rows.push({ assetClass, entries, isRange: entries.length > 1 })
  }
  return rows
}

export function ProjectionPanel({ state, holdings, instruments, ledgerId }: ProjectionPanelProps) {
  const { getToken } = useAuth()
  const contentId = useId()
  const horizonFieldId = useId()
  const mathsContentId = useId()
  const [expanded, setExpanded] = useState(false)
  // E9: "See the maths". A disclosure, not a modal -- it opens alongside the
  // chart rather than over it, so this is independent of `expanded`.
  const [mathsExpanded, setMathsExpanded] = useState(false)
  // The last successfully computed projection, kept across an error so the
  // state matrix's "last valid line stays visible" behaviour is real rather
  // than asserted.
  const [lastGood, setLastGood] = useState<ProjectionResult | null>(null)

  // E7: the ledger's horizon. Hydrated from GET, held here so the chips and
  // the free field drive one shared value.
  const [horizonYears, setHorizonYears] = useState<number>(FALLBACK_HORIZON_YEARS)
  const [horizonInput, setHorizonInput] = useState<string>(String(FALLBACK_HORIZON_YEARS))
  const [horizonError, setHorizonError] = useState<string | null>(null)

  // E8: per-class overrides, keyed by asset class. Hydrated from GET; PUT
  // always sends the FULL map back (server semantics: an omitted class is
  // deleted), never just the one row that changed.
  const [rateOverrides, setRateOverrides] = useState<Partial<Record<AssetClass, number>>>({})
  const [rateInputs, setRateInputs] = useState<Partial<Record<AssetClass, string>>>({})

  const settingsLoadedForLedger = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    settingsLoadedForLedger.current = null
    async function load() {
      try {
        const token = await getToken()
        const settings = await getProjectionSettings(token, ledgerId)
        if (cancelled) return
        const loadedHorizon = settings.horizonYears ?? FALLBACK_HORIZON_YEARS
        setHorizonYears(loadedHorizon)
        setHorizonInput(String(loadedHorizon))
        setHorizonError(null)
        const overrides: Partial<Record<AssetClass, number>> = {}
        for (const rate of settings.rates) overrides[rate.assetClass] = rate.annualRatePct
        setRateOverrides(overrides)
      } catch {
        // Settings failed to load: the panel still works off the fallback
        // horizon and no overrides, same "degrade, don't break" posture as
        // the rest of this panel's error handling.
      } finally {
        if (!cancelled) settingsLoadedForLedger.current = ledgerId
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [ledgerId, getToken])

  const result = useMemo(() => {
    if (state !== 'ready' || holdings.length === 0) return null
    try {
      return projectHoldings({
        holdings: toProjectionHoldings(holdings, instruments),
        horizonYears,
        classOverrides: rateOverrides,
      })
    } catch {
      // A holding the engine cannot read is bad data, not a reason to blank
      // the whole panel; fall through to whatever was last good, same as a
      // network error would.
      return null
    }
  }, [state, holdings, instruments, horizonYears, rateOverrides])

  useEffect(() => {
    if (result) setLastGood(result)
  }, [result])

  // E10: `projection_viewed`. Fires once per ledger, the first time a freshly
  // computed projection is both ready AND actually visible to the user --
  // never on a component mounting off-screen, never again on a later
  // re-render (a horizon edit, a rate edit, a rerender from a sibling state
  // change) for the same ledger. "Visible" means one of two things: the
  // panel's mobile collapse (below md, 768px) has been opened by the user, or
  // the viewport is already md and up, where the content div is always shown
  // regardless of `expanded` (see the section's own comment above). A stale
  // `lastGood` line shown during an error is not counted as a fresh view.
  const viewedFiredForLedger = useRef<string | null>(null)
  useEffect(() => {
    if (state !== 'ready' || !result) return
    if (viewedFiredForLedger.current === ledgerId) return
    const isDesktopViewport =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 768px)').matches
    if (!expanded && !isDesktopViewport) return
    viewedFiredForLedger.current = ledgerId
    track('projection_viewed', { horizon_years: horizonYears })
  }, [state, result, expanded, ledgerId, horizonYears])

  // Hidden entirely, not shown empty (DATA_MODEL.md "Projection panel (any
  // ledger)" row). Loading and error states still render below even with an
  // empty holdings array -- this hide applies to the confirmed-empty state only.
  if (state === 'ready' && holdings.length === 0) return null

  const displayResult = state === 'ready' ? result : lastGood

  async function persist(next: { horizonYears?: number; rateOverrides?: Partial<Record<AssetClass, number>> }) {
    const overrides = next.rateOverrides ?? rateOverrides
    const rates: ProjectionRateEntry[] = ASSET_CLASS_ORDER.filter((c) => overrides[c] !== undefined).map((c) => ({
      assetClass: c,
      annualRatePct: overrides[c] as number,
    }))
    try {
      const token = await getToken()
      await putProjectionSettings(token, {
        ledgerId,
        horizonYears: next.horizonYears ?? horizonYears,
        rates,
      })
    } catch {
      // A failed save leaves the local state (already applied optimistically)
      // as the working value for this session; nothing here blanks the panel
      // over a network hiccup on an assumption the user can simply reset.
    }
  }

  function commitHorizon(value: number) {
    setHorizonYears(value)
    setHorizonInput(String(value))
    setHorizonError(null)
    void persist({ horizonYears: value })
  }

  function handlePresetClick(years: number) {
    commitHorizon(years)
  }

  function handleHorizonInputChange(raw: string) {
    setHorizonInput(raw)
  }

  function handleHorizonInputBlur() {
    const trimmed = horizonInput.trim()
    const parsed = Number(trimmed)
    if (
      trimmed === '' ||
      !Number.isFinite(parsed) ||
      !Number.isInteger(parsed) ||
      parsed < MIN_HORIZON_YEARS_UI ||
      parsed > MAX_HORIZON_YEARS_UI
    ) {
      setHorizonError(`Enter a whole number of years between ${MIN_HORIZON_YEARS_UI} and ${MAX_HORIZON_YEARS_UI}.`)
      return
    }
    commitHorizon(parsed)
  }

  function handleRateInputChange(assetClass: AssetClass, raw: string) {
    setRateInputs((prev) => ({ ...prev, [assetClass]: raw }))
  }

  function handleRateInputBlur(assetClass: AssetClass, raw: string) {
    const trimmed = raw.trim()
    if (trimmed === '') return // No change offered; leave the existing resolution alone.
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed < MIN_ANNUAL_RATE_PCT || parsed > MAX_ANNUAL_RATE_PCT) {
      setRateInputs((prev) => ({ ...prev, [assetClass]: raw }))
      return
    }
    const rounded = roundRatePct(parsed)
    const next = { ...rateOverrides, [assetClass]: rounded }
    setRateOverrides(next)
    setRateInputs((prev) => ({ ...prev, [assetClass]: String(rounded) }))
    // No properties: `asset_class` would report which classes this household
    // holds, since a rate row only exists for a class it holds. See the note
    // on this event in src/lib/analytics.ts.
    track('projection_rate_overridden', {})
    void persist({ rateOverrides: next })
  }

  const rateRows = displayResult ? buildRateRows(displayResult) : []
  const mathsRows = displayResult ? buildMathsRows(displayResult) : []

  return (
    <section aria-labelledby="projection-panel-heading">
      <VaultFrame className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 id="projection-panel-heading" className="section-label">
            Where this could go
          </h2>
          {/* Collapsed by default below md, always expanded at md and up
              (the content div's own md:block below forces this regardless
              of `expanded`) -- so the toggle has nothing to do at md+ and is
              hidden there. */}
          <button
            type="button"
            className="md:hidden min-h-11 px-2 text-caption underline"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
        </div>

        <div id={contentId} className={cn(expanded ? 'block' : 'hidden', 'md:block space-y-4')}>
          {state === 'loading' && (
            <div className="space-y-3" data-testid="projection-panel-loading">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          )}

          {state === 'error' && (
            <p className="text-caption text-destructive">
              We couldn't refresh this illustration. Showing the last version we could calculate.
            </p>
          )}

          {displayResult && (
            <div className="space-y-4">
              {/* min-w-0 lets this shrink inside a flex/grid ancestor;
                  overflow-x-auto is its OWN scroll context, so a long axis
                  label scrolls the chart rather than pushing the page wide
                  at 390px (SPEC.md §G6.4). */}
              <div className="min-w-0 overflow-x-auto" data-testid="projection-chart-container">
                <LineChart
                  width={320}
                  height={160}
                  data={displayResult.points}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="year" tickLine={false} axisLine={false} />
                  <YAxis hide />
                  <Line
                    type="monotone"
                    dataKey="valueInr"
                    stroke={ASSET_HEX.equity}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </div>

              <p className="text-caption text-muted-foreground">
                An illustration, not a promise. Over {horizonYears} year
                {horizonYears === 1 ? '' : 's'}, this could reach {formatInr(displayResult.finalValueInr)}, if these
                rates hold.
              </p>

              {/* E7: horizon control. Presets and the free field drive the
                  same `horizonYears` state, so whichever is used last wins —
                  there is no separate precedence rule to encode. */}
              <div className="space-y-2">
                <span id={`${horizonFieldId}-legend`} className="text-caption font-medium">
                  Horizon
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {HORIZON_PRESETS.map((years) => (
                    <Button
                      key={years}
                      type="button"
                      variant={horizonYears === years ? 'default' : 'outline'}
                      size="sm"
                      aria-pressed={horizonYears === years}
                      onClick={() => handlePresetClick(years)}
                    >
                      {years}
                    </Button>
                  ))}
                  <label htmlFor={horizonFieldId} className="sr-only">
                    Horizon, in years, from {MIN_HORIZON_YEARS_UI} to {MAX_HORIZON_YEARS_UI}
                  </label>
                  <input
                    id={horizonFieldId}
                    type="number"
                    inputMode="numeric"
                    min={MIN_HORIZON_YEARS_UI}
                    max={MAX_HORIZON_YEARS_UI}
                    step={1}
                    value={horizonInput}
                    onChange={(e) => handleHorizonInputChange(e.target.value)}
                    onBlur={handleHorizonInputBlur}
                    className="h-11 w-20 rounded-md border border-input bg-background px-3 text-body"
                    aria-describedby={horizonError ? `${horizonFieldId}-error` : undefined}
                  />
                  <span className="text-caption text-muted-foreground">years</span>
                </div>
                {horizonError && (
                  <p id={`${horizonFieldId}-error`} className="text-caption text-destructive">
                    {horizonError}
                  </p>
                )}
              </div>

              {/* E8: editable rate rows, one per asset class present. */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="rate-rows-grid">
                {rateRows.map((row) => (
                  <RateRow
                    key={row.assetClass}
                    row={row}
                    inputValue={rateInputs[row.assetClass] ?? (row.uniformRatePct !== null ? String(row.uniformRatePct) : '')}
                    onChange={(raw) => handleRateInputChange(row.assetClass, raw)}
                    onBlur={(raw) => handleRateInputBlur(row.assetClass, raw)}
                  />
                ))}
              </div>

              {/* E9: "See the maths". DATA_MODEL.md note 14 calls this the
                  regulatory surface, not a nicety -- it is what turns the
                  chart above from an assertion into something a household
                  can audit. A disclosure, not a modal: the chart stays
                  mounted and visible with this open. */}
              <div className="space-y-3 border-t border-border pt-4">
                <button
                  type="button"
                  className="min-h-11 px-2 text-caption font-medium underline"
                  aria-expanded={mathsExpanded}
                  aria-controls={mathsContentId}
                  onClick={() => setMathsExpanded((prev) => !prev)}
                >
                  {mathsExpanded ? 'Hide the maths' : 'See the maths'}
                </button>

                {mathsExpanded && (
                  <div id={mathsContentId} data-testid="see-the-maths-panel" className="space-y-4">
                    <div className="space-y-2 text-caption text-muted-foreground">
                      <p>
                        <span className="font-medium text-foreground">How this chart is built, in words.</span> Each
                        year, every holding grows by its assumed annual rate. Then that year's contributions, if any,
                        are added in full at the end of the year, so they do not grow during the year they arrive.
                        The next year starts from that total and repeats. Nothing here is a forecast: it is
                        arithmetic run forward from the rates below, which you can change at any time.
                      </p>
                      <p>
                        Contributions land at the end of each year, not spread across it, and earn no growth in the
                        year they arrive. This understates the result rather than flattering it.
                      </p>
                      <p>
                        A monthly contribution is split across your holdings in proportion to each holding's starting
                        value, fixed at the start of the projection. That split is never rebalanced as the years pass,
                        so each rupee then compounds on its own, at its own class's rate.
                      </p>
                      <p>
                        Rounding happens once, at the point a figure is shown. The chart itself is computed at full
                        precision from the starting value every year; a displayed figure is never fed back into the
                        maths. That is what lets you reproduce a point on this chart with a calculator.
                      </p>
                      <p>
                        Where a class holds instruments seeded with different rates and you have not set your own
                        rate for the class, the rate row above shows a range rather than picking one holding's rate
                        to stand for all of them.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {mathsRows.map((row) => (
                        <div
                          key={row.assetClass}
                          data-testid={`maths-row-${row.assetClass}`}
                          className="rounded-md border border-border p-2 text-caption"
                        >
                          <p className="font-medium text-body text-foreground">{ASSET_LABELS[row.assetClass]}</p>
                          {row.isRange && (
                            <p className="text-muted-foreground">
                              These holdings resolve to a range of rates, not one figure, so the row above leaves the
                              class rate unset until you state one.
                            </p>
                          )}
                          {row.entries.map((entry, index) => (
                            <div key={index} className="mt-1">
                              <p className="text-foreground">{entry.annualRatePct}% a year</p>
                              <p className="text-muted-foreground">{entry.basis}</p>
                              {entry.asOf && (
                                <p className="text-muted-foreground">
                                  As of {entry.asOf}. This date does not change how the chart is calculated; it is
                                  only shown so you can judge for yourself whether the rate is still current.
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </VaultFrame>
    </section>
  )
}

interface RateRowProps {
  row: RateRowData
  inputValue: string
  onChange: (raw: string) => void
  onBlur: (raw: string) => void
}

function RateRow({ row, inputValue, onChange, onBlur }: RateRowProps) {
  const inputId = useId()
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-md border border-border p-2"
      data-testid={`rate-row-${row.assetClass}`}
    >
      <div className="min-w-0">
        <label htmlFor={inputId} className="block text-body font-medium">
          {ASSET_LABELS[row.assetClass]}
        </label>
        <p className="text-caption text-muted-foreground">
          {row.rateRangePct ? `${row.rateRangePct[0]}% to ${row.rateRangePct[1]}% a year` : null}
          {row.rateRangePct ? ' · ' : null}
          {SOURCE_LABELS[row.source]}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          step={0.01}
          value={inputValue}
          placeholder={row.rateRangePct ? 'Set one rate' : undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onBlur(e.target.value)}
          className="h-11 w-20 rounded-md border border-input bg-background px-2 text-body"
          aria-label={`Annual rate for ${ASSET_LABELS[row.assetClass]}, percent a year`}
        />
        <span className="text-caption text-muted-foreground">% a yr</span>
      </div>
    </div>
  )
}
