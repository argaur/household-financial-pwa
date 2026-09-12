import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PiiDisclosureStep } from './pii-disclosure-step'
import { expectNoAxeViolations } from '@/test/axe'
import { expectNoCallCarriesPortfolioShape } from '@/test/analytics-guard'
import { buildImportTemplateFilename, localDateStamp } from '@/lib/import-filename'

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

const fixedDate = new Date(2026, 8, 11) // 2026-09-11, local fields — see import-filename.ts

describe('PiiDisclosureStep', () => {
  beforeEach(() => {
    track.mockReset()
  })

  it('is a step, not a checkbox beside the download button', () => {
    render(
      <PiiDisclosureStep
        ledgerName="Current"
        memberNames={['Gaurav', 'Rinku']}
        date={fixedDate}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    // Requirement 1, verbatim: a checkbox next to a download button does not
    // satisfy this. There must be no checkbox anywhere in this step at all —
    // consent is the whole step, not a box ticked beside the action.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    // The step itself must present as a disclosure, not merely a button.
    expect(screen.getByRole('heading')).toBeInTheDocument()
  })

  it('states what the file will contain: member names, and holdings once filled in', () => {
    render(
      <PiiDisclosureStep
        ledgerName="Current"
        memberNames={['Gaurav', 'Rinku']}
        date={fixedDate}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/Gaurav/)).toBeInTheDocument()
    expect(screen.getByText(/Rinku/)).toBeInTheDocument()
    expect(screen.getByText(/holdings/i)).toBeInTheDocument()
  })

  it('states the file is outside the app\'s protection once saved', () => {
    render(
      <PiiDisclosureStep
        ledgerName="Current"
        memberNames={['Gaurav']}
        date={fixedDate}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/plain file on your device/i)).toBeInTheDocument()
  })

  it('discloses that a browser extension with file access is outside the trust boundary, without proposing any mitigation', () => {
    render(
      <PiiDisclosureStep
        ledgerName="Current"
        memberNames={['Gaurav']}
        date={fixedDate}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const extensionCopy = screen.getByText(/extension/i)
    expect(extensionCopy).toBeInTheDocument()
    // Disclose, don't engineer around it — SPEC.md/D-025 hard requirement.
    // A "block" or "scan for" word here would mean an attempted mitigation.
    expect(extensionCopy.textContent).not.toMatch(/block|scan|detect|prevent/i)
  })

  it('fires pii_disclosure_shown with surface "bulk_import" once, when it renders', () => {
    render(
      <PiiDisclosureStep
        ledgerName="Current"
        memberNames={['Gaurav']}
        date={fixedDate}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('pii_disclosure_shown', { surface: 'bulk_import' })
    expectNoCallCarriesPortfolioShape(track)
  })

  it('does not refire pii_disclosure_shown on a re-render with the same ledger', () => {
    const { rerender } = render(
      <PiiDisclosureStep
        ledgerName="Current"
        memberNames={['Gaurav']}
        date={fixedDate}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    rerender(
      <PiiDisclosureStep
        ledgerName="Current"
        memberNames={['Gaurav', 'Rinku']}
        date={fixedDate}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(track).toHaveBeenCalledTimes(1)
  })

  it('the file name carries the ledger name and the date, and is handed to onConfirm', () => {
    const onConfirm = vi.fn()
    render(
      <PiiDisclosureStep
        ledgerName="Retirement / Growth"
        memberNames={['Gaurav']}
        date={fixedDate}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    const expectedFilename = buildImportTemplateFilename('Retirement / Growth', fixedDate)
    expect(screen.getByText(new RegExp(expectedFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /download/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith(expectedFilename)
  })

  it('onCancel fires on "Not now" and never also calls onConfirm', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <PiiDisclosureStep
        ledgerName="Current"
        memberNames={['Gaurav']}
        date={fixedDate}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /not now/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <PiiDisclosureStep
        ledgerName="Current"
        memberNames={['Gaurav', 'Rinku']}
        date={fixedDate}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    await expectNoAxeViolations(container)
  })

  it('uses no sm: full-width or layout class — this project fires sm: at 390px', () => {
    const { container } = render(
      <PiiDisclosureStep
        ledgerName="Current"
        memberNames={['Gaurav']}
        date={fixedDate}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const classAttrs = Array.from(container.querySelectorAll('*')).map((el) => el.getAttribute('class') ?? '')
    for (const classes of classAttrs) {
      expect(classes).not.toMatch(/\bsm:(grid-cols|w-auto|flex-row|inline-flex)\b/)
    }
  })
})

describe('import-filename helpers', () => {
  it('localDateStamp uses local date fields, not toISOString', () => {
    // Constructed from local y/m/d fields, so this is 2026-09-11 in whatever
    // timezone the test runs under. The expectation is built the same way
    // (getFullYear/getMonth/getDate), never via toISOString, so this pins
    // the "local date parts" requirement regardless of the runner's TZ.
    const d = new Date(2026, 8, 11, 0, 30)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    expect(localDateStamp(d)).toBe(`${y}-${m}-${day}`)
  })

  it('buildImportTemplateFilename sanitizes an unsafe ledger name and ends in .xlsx', () => {
    const filename = buildImportTemplateFilename('Retirement / Growth: 2026', fixedDate)
    expect(filename).toMatch(/^vittam-import-.*\.xlsx$/)
    expect(filename).not.toMatch(/[\\/:*?"<>|]/)
  })
})
