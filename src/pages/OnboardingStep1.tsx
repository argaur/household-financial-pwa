import { useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { track } from '@/lib/analytics'
import { createHousehold, HouseholdApiError, type Household } from '@/lib/household-api'

interface OnboardingStep1Props {
  onHouseholdCreated: (household: Household) => void
}

// Copy: Documentation/design/COPY_DECK.md — "Step 1 — Create household (of 3)".
// Steps 2/3 (family members, holdings) ship in Slice 2/4 — this component only
// proves the household is created and scoped to the signed-in Clerk user.
export function OnboardingStep1({ onHouseholdCreated }: OnboardingStep1Props) {
  const { getToken } = useAuth()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startedAt] = useState(() => Date.now())

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)

    try {
      const token = await getToken()
      const household = await createHousehold(token, name)
      track('onboarding_step_completed', { step: 'household', duration_ms: Date.now() - startedAt })
      onHouseholdCreated(household)
    } catch (err) {
      const message =
        err instanceof HouseholdApiError && err.status === 400
          ? 'Household name is required.'
          : "Something went wrong — please try again."
      setError(message)
      track('error_shown', { error_type: 'onboarding_household_create_failed', surface: 'onboarding_step_1', message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg py-12 space-y-6">
        <Progress value={33} className="h-1" />
        <p className="text-caption text-muted-foreground">Step 1 of 3</p>

        <header className="space-y-2">
          <h1 className="font-display text-display">Let's start with your family.</h1>
          <p className="text-body text-muted-foreground">
            Before we can plan, we need to know who we're planning for.
          </p>
        </header>

        <Separator />

        <form onSubmit={handleSubmit} className="space-y-2">
          <Label htmlFor="household-name">Your household name</Label>
          <Input
            id="household-name"
            placeholder="e.g. Gupta Family"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            autoFocus
          />
          <p className="text-caption text-muted-foreground">
            This appears as a label throughout your plan — it's just for you.
          </p>

          {error && <p className="text-caption text-destructive">{error}</p>}

          <Button type="submit" className="w-full mt-4" disabled={submitting || name.trim().length === 0}>
            {submitting ? 'Creating…' : 'Continue'}
          </Button>
        </form>
      </div>
    </main>
  )
}
