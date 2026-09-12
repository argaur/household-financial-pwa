import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AiCapNotice, goalPlanCapState, counselCapState, type AiCapState } from './ai-cap-notice'
import type { AiSuggestionsUsage } from '@/lib/ai-suggestions-api'

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

beforeEach(() => {
  track.mockReset()
})

function usage(overrides: Partial<AiSuggestionsUsage> = {}): AiSuggestionsUsage {
  return { plansUsed: 0, plansCap: 2, editsUsed: 0, editsCap: 2, globalOpen: true, ...overrides }
}

describe('AiCapNotice', () => {
  it('renders informational, never as an error/alert region', () => {
    render(<AiCapNotice state="plansExhausted" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('household plans exhausted: verbatim COPY_DECK.md copy', () => {
    render(<AiCapNotice state="plansExhausted" />)
    expect(screen.getByText('You have used both of your plans')).toBeInTheDocument()
    expect(
      screen.getByText('Building and editing plans by hand stays fully available. A paid tier with more is coming.'),
    ).toBeInTheDocument()
  })

  it("this ledger's edits exhausted: verbatim COPY_DECK.md copy, distinct from the plans message", () => {
    render(<AiCapNotice state="editsExhausted" />)
    expect(screen.getByText('You have used both reviews for this plan')).toBeInTheDocument()
    expect(
      screen.getByText("Other plans still have their own reviews. Editing this one by hand stays fully available."),
    ).toBeInTheDocument()
  })

  it('global monthly breaker tripped: verbatim COPY_DECK.md copy, names a monthly limit not the household\'s own cap', () => {
    render(<AiCapNotice state="globalPaused" />)
    expect(screen.getByText('This feature is paused for the month')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Vittam runs on a fixed monthly budget for this, and it has been reached. Your own limits have not been used up. Everything else works as normal.',
      ),
    ).toBeInTheDocument()
  })

  it('all three states are textually distinct from one another', () => {
    const { unmount: u1 } = render(<AiCapNotice state="plansExhausted" />)
    const plansText = screen.getByTestId('ai-cap-notice').textContent
    u1()
    const { unmount: u2 } = render(<AiCapNotice state="editsExhausted" />)
    const editsText = screen.getByTestId('ai-cap-notice').textContent
    u2()
    render(<AiCapNotice state="globalPaused" />)
    const globalText = screen.getByTestId('ai-cap-notice').textContent

    expect(new Set([plansText, editsText, globalText]).size).toBe(3)
  })

  it('contains zero em-dashes and en-dashes', () => {
    for (const state of ['plansExhausted', 'editsExhausted', 'globalPaused'] as const) {
      const { container, unmount } = render(<AiCapNotice state={state} />)
      const text = container.textContent ?? ''
      expect(text).not.toContain('—')
      expect(text).not.toContain('–')
      unmount()
    }
  })
})

describe('AiCapNotice telemetry (A9, METRICS_PLAN.md)', () => {
  it('fires ai_cap_reached with cap_type=plans exactly once, no other property, for plansExhausted', () => {
    render(<AiCapNotice state="plansExhausted" />)
    const calls = track.mock.calls.filter(([event]) => event === 'ai_cap_reached')
    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toEqual({ cap_type: 'plans' })
  })

  it('fires ai_cap_reached with cap_type=edits for editsExhausted', () => {
    render(<AiCapNotice state="editsExhausted" />)
    expect(track).toHaveBeenCalledWith('ai_cap_reached', { cap_type: 'edits' })
  })

  it('fires ai_cap_reached with cap_type=global for globalPaused', () => {
    render(<AiCapNotice state="globalPaused" />)
    expect(track).toHaveBeenCalledWith('ai_cap_reached', { cap_type: 'global' })
  })

  it('does not re-fire on a re-render with the same state', () => {
    const { rerender } = render(<AiCapNotice state="plansExhausted" />)
    expect(track.mock.calls.filter(([event]) => event === 'ai_cap_reached')).toHaveLength(1)
    rerender(<AiCapNotice state="plansExhausted" />)
    expect(track.mock.calls.filter(([event]) => event === 'ai_cap_reached')).toHaveLength(1)
  })

  it('fires again with the new cap_type when the state prop actually changes', () => {
    const { rerender } = render(<AiCapNotice state="plansExhausted" />)
    rerender(<AiCapNotice state="globalPaused" />)
    const calls = track.mock.calls.filter(([event]) => event === 'ai_cap_reached')
    expect(calls).toHaveLength(2)
    expect(calls[1][1]).toEqual({ cap_type: 'global' })
  })

  it('no ai_cap_reached payload carries anything but cap_type', () => {
    render(<AiCapNotice state="plansExhausted" />)
    for (const [, payload] of track.mock.calls) {
      expect(Object.keys(payload as object)).toEqual(['cap_type'])
    }
  })
})

describe('goalPlanCapState', () => {
  it('is null when nothing is exhausted', () => {
    expect(goalPlanCapState(usage())).toBeNull()
  })

  it('is plansExhausted when the household has used its plans, regardless of edits', () => {
    expect(goalPlanCapState(usage({ plansUsed: 2, plansCap: 2, editsUsed: 0 }))).toBe('plansExhausted')
  })

  it("is globalPaused when the household still has plans left but the breaker is tripped", () => {
    expect(goalPlanCapState(usage({ plansUsed: 0, globalOpen: false }))).toBe('globalPaused')
  })

  it('prefers plansExhausted over globalPaused when both are true', () => {
    expect(goalPlanCapState(usage({ plansUsed: 2, plansCap: 2, globalOpen: false }))).toBe('plansExhausted')
  })

  it("never reports editsExhausted -- edits are per ledger, not per household plan creation", () => {
    expect(goalPlanCapState(usage({ editsUsed: 2, editsCap: 2 }))).toBeNull()
  })
})

describe('counselCapState', () => {
  it('is null when nothing is exhausted', () => {
    expect(counselCapState(usage())).toBeNull()
  })

  it("is editsExhausted when this ledger's reviews are used, regardless of plans", () => {
    expect(counselCapState(usage({ editsUsed: 2, editsCap: 2, plansUsed: 0 }))).toBe('editsExhausted')
  })

  it('is globalPaused when edits remain but the breaker is tripped', () => {
    expect(counselCapState(usage({ editsUsed: 0, globalOpen: false }))).toBe('globalPaused')
  })

  it('prefers editsExhausted over globalPaused when both are true', () => {
    expect(counselCapState(usage({ editsUsed: 2, editsCap: 2, globalOpen: false }))).toBe('editsExhausted')
  })

  it('never reports plansExhausted -- plans are per household, not per ledger review', () => {
    expect(counselCapState(usage({ plansUsed: 2, plansCap: 2 }))).toBeNull()
  })
})

/**
 * Host harness modeled on `new-ledger-modal.tsx`'s real shape (blank / copy /
 * goal options inside one Dialog whose body is swapped by step, never a
 * second surface) -- reproduced minimally here rather than importing the
 * real modal, the same choice `ai-consent-step.test.tsx` made for its own
 * host. Exercises two required assertions at once: manual ledger creation
 * (the blank/copy options) stays fully available in every cap state, and the
 * Radix reset trap (D-016's paid-for lesson: the dialog stays mounted
 * between opens, reset only on the open transition) holds for a body that
 * can now also be a cap notice.
 */
type HostStep = 'options' | 'goal'

function NewLedgerHost({ capState }: { capState: AiCapState | null }) {
  const [open, setOpen] = useState(true)
  const [step, setStep] = useState<HostStep>('options')

  function openFresh() {
    setStep('options')
    setOpen(true)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        {step === 'options' ? (
          <>
            <DialogHeader>
              <DialogTitle>New ledger</DialogTitle>
              <DialogDescription>Start from blank, copy Current, or plan toward a goal.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Button type="button" onClick={() => {}}>
                Start blank
              </Button>
              <Button type="button" onClick={() => {}}>
                Copy Current
              </Button>
              {capState ? (
                <AiCapNotice state={capState} />
              ) : (
                <Button type="button" onClick={() => setStep('goal')}>
                  Plan toward a goal
                </Button>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        ) : (
          <DialogHeader>
            <DialogTitle>Goal step</DialogTitle>
          </DialogHeader>
        )}
      </DialogContent>
      <Button type="button" onClick={openFresh} data-testid="reopen">
        Reopen
      </Button>
    </Dialog>
  )
}

describe('manual ledger creation stays fully available in every cap state', () => {
  it.each(['plansExhausted', 'editsExhausted', 'globalPaused'] as const)(
    'blank and copy stay enabled buttons when the goal option is replaced by %s',
    (capState) => {
      render(<NewLedgerHost capState={capState} />)

      const blank = screen.getByRole('button', { name: /start blank/i })
      const copy = screen.getByRole('button', { name: /copy current/i })
      expect(blank).toBeEnabled()
      expect(copy).toBeEnabled()

      // The goal option itself is gone, replaced in place by the notice.
      expect(screen.queryByRole('button', { name: /plan toward a goal/i })).not.toBeInTheDocument()
      expect(screen.getByTestId('ai-cap-notice')).toHaveAttribute('data-cap-state', capState)
    },
  )

  it('with no cap reached, the goal option is a normal enabled button, not a notice', () => {
    render(<NewLedgerHost capState={null} />)
    expect(screen.getByRole('button', { name: /plan toward a goal/i })).toBeEnabled()
    expect(screen.queryByTestId('ai-cap-notice')).not.toBeInTheDocument()
  })
})

describe('Radix reset trap: open, interact, close, reopen, assert clean', () => {
  it('a cap notice shown on one open does not leak into a fresh open of the same dialog', () => {
    render(<NewLedgerHost capState="plansExhausted" />)
    expect(screen.getByTestId('ai-cap-notice')).toHaveAttribute('data-cap-state', 'plansExhausted')

    // Close, then reopen via the host's own control (Radix keeps the dialog
    // mounted between opens -- this exercises that, not a fresh mount).
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    fireEvent.click(screen.getByTestId('reopen'))

    // Back on the options step, cap notice present and correct, not stuck on
    // whatever step or state a prior interaction left behind.
    expect(screen.getByRole('heading', { name: /new ledger/i })).toBeInTheDocument()
    expect(screen.getByTestId('ai-cap-notice')).toHaveAttribute('data-cap-state', 'plansExhausted')
    expect(screen.getByRole('button', { name: /start blank/i })).toBeEnabled()
  })
})
