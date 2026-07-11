import { useEffect, useState } from 'react'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { HoldingForm } from '@/components/holding-form'
import { track } from '@/lib/analytics'
import { listInstruments, type Instrument } from '@/lib/instruments-api'
import type { FamilyMember } from '@/lib/family-members-api'
import type { Holding } from '@/lib/holdings-api'

interface OnboardingStep3Props {
  members: FamilyMember[]
  onContinue: () => void
}

// Copy: Documentation/design/COPY_DECK.md — "Step 3 — Add first holding (of 3)".
// Layout: Documentation/design/WIREFRAMES.md — 1d. Reuses the same HoldingForm
// component as the Portfolio tab's add/edit sheet (SPEC.md §7's flagged risk).
export function OnboardingStep3({ members, onContinue }: OnboardingStep3Props) {
  const [instrumentsState, setInstrumentsState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [startedAt] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await listInstruments()
        if (cancelled) return
        setInstruments(result)
        setInstrumentsState('loaded')
      } catch {
        if (cancelled) return
        setInstrumentsState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function handleSaved(_holding: Holding) {
    track('onboarding_step_completed', { step: 'holdings', duration_ms: Date.now() - startedAt })
    track('onboarding_completed', {})
    onContinue()
  }

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg py-12 space-y-6 pb-28">
        <Progress value={100} className="h-1" />
        <p className="text-caption text-muted-foreground">Step 3 of 3</p>

        <header className="space-y-2">
          <h1 className="font-display text-display">What do you currently hold?</h1>
          <p className="text-body text-muted-foreground">
            Record your first investment or asset. You can add everything else after.
          </p>
        </header>

        <Separator />

        {instrumentsState === 'loading' && (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {instrumentsState === 'error' && (
          <p className="text-caption text-destructive">We couldn't load the instrument list. Refresh to try again.</p>
        )}

        {instrumentsState === 'loaded' && (
          <HoldingForm
            members={members}
            instruments={instruments}
            submitLabel="See my plan"
            submittingLabel="Saving…"
            analyticsSurface="onboarding_step_3"
            onSaved={handleSaved}
          />
        )}
      </div>
    </main>
  )
}
