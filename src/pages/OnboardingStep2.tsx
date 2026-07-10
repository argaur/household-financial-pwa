import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { track } from '@/lib/analytics'
import {
  listFamilyMembers,
  createFamilyMember,
  FamilyMembersApiError,
  type FamilyMember,
  type CreateFamilyMemberInput,
} from '@/lib/family-members-api'

interface OnboardingStep2Props {
  onContinue: () => void
}

const RELATIONSHIP_OPTIONS: Array<{ value: FamilyMember['relationship']; label: string }> = [
  { value: 'self', label: 'Self' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'child', label: 'Child' },
  { value: 'parent', label: 'Parent' },
  { value: 'other', label: 'Other' },
]

const RISK_PROFILE_OPTIONS: Array<{ value: NonNullable<FamilyMember['riskProfile']>; label: string }> = [
  { value: 'conservative', label: 'Conservative' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'aggressive', label: 'Aggressive' },
]

// Copy: Documentation/design/COPY_DECK.md — "Step 2 — Add family members (of 3)".
// Layout: Documentation/design/WIREFRAMES.md — 1b/1c (empty state + add-member sheet).
export function OnboardingStep2({ onContinue }: OnboardingStep2Props) {
  const { getToken } = useAuth()
  const [membersState, setMembersState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [startedAt] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = await getToken()
        const result = await listFamilyMembers(token)
        if (cancelled) return
        setMembers(result)
        setMembersState('loaded')
      } catch {
        if (cancelled) return
        setMembersState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [getToken])

  function handleMemberAdded(member: FamilyMember) {
    setMembers((prev) => [...prev, member])
    setSheetOpen(false)
    track('feature_used', { feature_name: 'add_family_member' })
  }

  function handleContinue() {
    track('onboarding_step_completed', { step: 'members', duration_ms: Date.now() - startedAt })
    onContinue()
  }

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg py-12 space-y-6 pb-28">
        <Progress value={66} className="h-1" />
        <p className="text-caption text-muted-foreground">Step 2 of 3</p>

        <header className="space-y-2">
          <h1 className="font-display text-display">Who are we planning for?</h1>
          <p className="text-body text-muted-foreground">Add everyone whose financial future you want to track.</p>
        </header>

        <Separator />

        {membersState === 'loading' && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {membersState === 'error' && (
          <p className="text-caption text-destructive">We couldn't load your family members. Refresh to try again.</p>
        )}

        {membersState === 'loaded' && members.length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center space-y-4">
            <p className="text-body text-muted-foreground">Start by adding yourself.</p>
            <Button variant="ghost" onClick={() => setSheetOpen(true)}>
              Add a family member
            </Button>
          </div>
        )}

        {membersState === 'loaded' && members.length > 0 && (
          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.id} className="rounded-lg border p-4">
                <p className="text-body font-medium">{member.name}</p>
                <p className="text-caption text-muted-foreground capitalize">
                  {member.relationship} · DOB: {member.dateOfBirth}
                </p>
              </div>
            ))}
            <Button variant="ghost" onClick={() => setSheetOpen(true)}>
              Add another member
            </Button>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t bg-background p-4">
        <div className="container max-w-lg">
          <Button className="w-full" disabled={members.length === 0} onClick={handleContinue}>
            Continue
          </Button>
        </div>
      </div>

      <AddMemberSheet open={sheetOpen} onOpenChange={setSheetOpen} onMemberAdded={handleMemberAdded} />
    </main>
  )
}

interface AddMemberSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onMemberAdded: (member: FamilyMember) => void
}

function AddMemberSheet({ open, onOpenChange, onMemberAdded }: AddMemberSheetProps) {
  const { getToken } = useAuth()
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState<FamilyMember['relationship'] | ''>('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [riskProfile, setRiskProfile] = useState<NonNullable<FamilyMember['riskProfile']> | ''>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setName('')
    setRelationship('')
    setDateOfBirth('')
    setRiskProfile('')
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || !relationship) return
    setSubmitting(true)
    setError(null)

    try {
      const token = await getToken()
      const input: CreateFamilyMemberInput = {
        name,
        relationship,
        dateOfBirth,
        ...(riskProfile ? { riskProfile } : {}),
      }
      const member = await createFamilyMember(token, input)
      resetForm()
      onMemberAdded(member)
    } catch (err) {
      const message =
        err instanceof FamilyMembersApiError && err.status === 400
          ? 'Check the name, relationship, and date of birth and try again.'
          : "Something went wrong — please try again."
      setError(message)
      track('error_shown', { error_type: 'add_family_member_failed', surface: 'onboarding_step_2', message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm()
        onOpenChange(next)
      }}
    >
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add a family member</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="member-name">Full name</Label>
            <Input
              id="member-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="member-relationship">Their relationship to you</Label>
            <Select
              value={relationship}
              onValueChange={(value) => setRelationship(value as FamilyMember['relationship'])}
              disabled={submitting}
            >
              <SelectTrigger id="member-relationship">
                <SelectValue placeholder="Select relationship" />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="member-dob">Date of birth</Label>
            <Input
              id="member-dob"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              disabled={submitting}
              max={new Date().toISOString().slice(0, 10)}
            />
            <p className="text-caption text-muted-foreground">
              Used to surface age-based milestones — SSY eligibility, retirement horizon, etc.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="member-risk-profile">Risk appetite</Label>
            <Select
              value={riskProfile}
              onValueChange={(value) => setRiskProfile(value as NonNullable<FamilyMember['riskProfile']>)}
              disabled={submitting}
            >
              <SelectTrigger id="member-risk-profile">
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                {RISK_PROFILE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-caption text-muted-foreground">Optional — you can set this later.</p>
          </div>

          {error && <p className="text-caption text-destructive">{error}</p>}

          <Button
            type="submit"
            className="w-full"
            disabled={submitting || name.trim().length === 0 || !relationship || dateOfBirth.length === 0}
          >
            {submitting ? 'Adding…' : 'Add to plan'}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
