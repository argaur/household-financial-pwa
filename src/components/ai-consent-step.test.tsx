import { useEffect, useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AiConsentStep } from './ai-consent-step'

/**
 * A minimal stand-in for a real host modal (the goal-plan trigger and C3's
 * "Review this ledger" button both build one later, neither exists yet). It
 * exists only to prove AiConsentStep behaves correctly as a step that swaps
 * an already-open modal's body — the same shape `NewLedgerModal` uses for
 * its goal step — rather than needing its own Dialog. It reproduces the
 * Radix reset trap this project has already paid for once (D-016, again in
 * `new-ledger-modal.tsx`): the dialog stays mounted between opens and is
 * reset only on the open transition, never remounted.
 */
type HostStep = 'other' | 'consent'

function Host({
  open,
  onOpenChange,
  onConfirm,
  remaining,
  kind,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  remaining: number
  kind?: 'goal_plan' | 'counsel'
}) {
  const [step, setStep] = useState<HostStep>('other')

  useEffect(() => {
    if (open) setStep('other')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {step === 'other' ? (
          <>
            <DialogHeader>
              <DialogTitle>Some other step</DialogTitle>
              <DialogDescription>Not the consent step.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" onClick={() => setStep('consent')}>
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <AiConsentStep remaining={remaining} kind={kind} onConfirm={onConfirm} onCancel={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function renderHost(props: Partial<React.ComponentProps<typeof Host>> = {}) {
  const onOpenChange = props.onOpenChange ?? vi.fn()
  const onConfirm = props.onConfirm ?? vi.fn()
  const utils = render(
    <MemoryRouter>
      <Host
        open={props.open ?? true}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        remaining={props.remaining ?? 3}
        kind={props.kind}
      />
    </MemoryRouter>,
  )
  return { ...utils, onOpenChange, onConfirm }
}

describe('AiConsentStep', () => {
  it('renders as a body swap inside the existing modal, not a new dialog or portal', () => {
    renderHost()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    // Still exactly one dialog on the page — the consent step replaced the
    // body of the same dialog rather than opening a second one.
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: /this request leaves your device/i })).toBeInTheDocument()
  })

  it('renders every time: consenting on request 1 does not suppress the step on request 2', () => {
    const onConfirm = vi.fn()
    const { rerender, onOpenChange } = renderHost({ onConfirm })

    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByRole('heading', { name: /this request leaves your device/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /send this request/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    // Close and reopen — the dialog stays mounted (Radix), not remounted.
    rerender(
      <MemoryRouter>
        <Host open={false} onOpenChange={onOpenChange} onConfirm={onConfirm} remaining={3} />
      </MemoryRouter>,
    )
    rerender(
      <MemoryRouter>
        <Host open onOpenChange={onOpenChange} onConfirm={onConfirm} remaining={3} />
      </MemoryRouter>,
    )

    // Back on the host's own first step, not the consent step left over from before.
    expect(screen.getByRole('heading', { name: /some other step/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /this request leaves your device/i })).not.toBeInTheDocument()

    // A second request reaches the consent step again, unremembered.
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByRole('heading', { name: /this request leaves your device/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /send this request/i }))
    expect(onConfirm).toHaveBeenCalledTimes(2)
  })

  it('renders both what-is-sent and what-is-not-sent lists', () => {
    renderHost()
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.getByTestId('ai-consent-what-is-sent')).toHaveTextContent(
      'What is sent: your asset mix as percentages, rounded totals, your goal name, and the instruments in your plan.',
    )
    expect(screen.getByTestId('ai-consent-what-is-not-sent')).toHaveTextContent(
      "What is not sent: your family members' names, nominees, exact amounts, or anything from your profile.",
    )
  })

  it('states, before the confirm action, that a failed attempt still counts', () => {
    renderHost({ remaining: 5 })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    const counterLine = screen.getByTestId('ai-consent-counter-line')
    expect(counterLine).toHaveTextContent(
      'This uses one of your 5 remaining plans. It is counted when the request is sent, even if it fails.',
    )

    const confirmButton = screen.getByRole('button', { name: /send this request/i })
    // The disclosure is already in the document, ahead of the confirm control,
    // by the time the step is shown — never gated behind a click or a toggle,
    // and never appended after the CTA in DOM order.
    expect(confirmButton).not.toBeDisabled()
    expect(counterLine.compareDocumentPosition(confirmButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders the remaining count from the value it is given, not a hardcoded number', () => {
    const { rerender, onOpenChange, onConfirm } = renderHost({ remaining: 7 })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByTestId('ai-consent-counter-line')).toHaveTextContent('one of your 7 remaining plans')

    rerender(
      <MemoryRouter>
        <Host open={false} onOpenChange={onOpenChange} onConfirm={onConfirm} remaining={7} />
      </MemoryRouter>,
    )
    rerender(
      <MemoryRouter>
        <Host open onOpenChange={onOpenChange} onConfirm={onConfirm} remaining={1} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByTestId('ai-consent-counter-line')).toHaveTextContent('one of your 1 remaining plans')
  })

  it('cancel dismisses without invoking the send seam', () => {
    const onConfirm = vi.fn()
    const { onOpenChange } = renderHost({ onConfirm })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    fireEvent.click(screen.getByRole('button', { name: /not now/i }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('confirm invokes the send seam exactly once', () => {
    const onConfirm = vi.fn()
    renderHost({ onConfirm })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    fireEvent.click(screen.getByRole('button', { name: /send this request/i }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('links to how Vittam handles data, and carries a working privacy link', () => {
    renderHost()
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    const link = screen.getByRole('link', { name: /how vittam handles your data/i })
    expect(link).toHaveAttribute('href', '/privacy')
  })

  it('contains zero em-dashes and en-dashes in its rendered copy', () => {
    renderHost()
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    const text = screen.getByRole('dialog').textContent ?? ''
    expect(text).not.toContain('—')
    expect(text).not.toContain('–')
  })

  it('defaults to "plans" when no kind is given, so an existing caller is unaffected', () => {
    renderHost({ remaining: 3 })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByTestId('ai-consent-counter-line')).toHaveTextContent(
      'This uses one of your 3 remaining plans. It is counted when the request is sent, even if it fails.',
    )
  })

  it('says "plans" for kind="goal_plan", explicitly', () => {
    renderHost({ remaining: 3, kind: 'goal_plan' })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByTestId('ai-consent-counter-line')).toHaveTextContent('one of your 3 remaining plans')
  })

  it('says "reviews", not "plans", for kind="counsel" (D-024 Chunk C, the noun problem)', () => {
    renderHost({ remaining: 2, kind: 'counsel' })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    const counterLine = screen.getByTestId('ai-consent-counter-line')
    expect(counterLine).toHaveTextContent(
      'This uses one of your 2 remaining reviews. It is counted when the request is sent, even if it fails.',
    )
    expect(counterLine).not.toHaveTextContent(/plans/)
  })
})
