import { useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { track } from '@/lib/analytics'
import {
  createFamilyMember,
  updateFamilyMember,
  FamilyMembersApiError,
  type FamilyMember,
  type CreateFamilyMemberInput,
} from '@/lib/family-members-api'

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

/**
 * Slice 9's Profile screen member add/edit — same field set and copy as
 * OnboardingStep2's AddMemberSheet (Documentation/design/COPY_DECK.md's
 * "Add member form" block), factored into its own reusable component here
 * rather than extracted out of OnboardingStep2 itself: onboarding's sheet is
 * add-only and already shipped/tested, so leaving it untouched avoids any
 * risk of a Slice 9 change regressing Slice 2's onboarding flow.
 */
interface MemberFormProps {
  initialMember?: FamilyMember
  submitLabel: string
  submittingLabel: string
  analyticsSurface: string
  onSaved: (member: FamilyMember) => void
}

export function MemberForm({ initialMember, submitLabel, submittingLabel, analyticsSurface, onSaved }: MemberFormProps) {
  const { getToken } = useAuth()
  const editing = Boolean(initialMember)

  const [name, setName] = useState(initialMember?.name ?? '')
  const [relationship, setRelationship] = useState<FamilyMember['relationship'] | ''>(initialMember?.relationship ?? '')
  const [dateOfBirth, setDateOfBirth] = useState(initialMember?.dateOfBirth ?? '')
  const [riskProfile, setRiskProfile] = useState<NonNullable<FamilyMember['riskProfile']> | ''>(
    initialMember?.riskProfile ?? '',
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || !relationship || name.trim().length === 0 || dateOfBirth.length === 0) return
    setSubmitting(true)
    setError(null)

    const input: CreateFamilyMemberInput = {
      name,
      relationship,
      dateOfBirth,
      ...(riskProfile ? { riskProfile } : {}),
    }

    try {
      const token = await getToken()
      const member = editing ? await updateFamilyMember(token, initialMember!.id, input) : await createFamilyMember(token, input)
      track('feature_used', { feature_name: 'edit_household', action: editing ? 'edit_member' : 'add_member', member_id: member.id })
      onSaved(member)
    } catch (err) {
      const message =
        err instanceof FamilyMembersApiError && err.status === 400
          ? 'Check the name, relationship, and date of birth and try again.'
          : 'Something went wrong — please try again.'
      setError(message)
      track('error_shown', { error_type: 'member_save_failed', surface: analyticsSurface, message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="profile-member-name">Full name</Label>
        <Input id="profile-member-name" value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} autoFocus />
      </div>

      <div className="space-y-2">
        <Label htmlFor="profile-member-relationship">Their relationship to you</Label>
        <Select
          value={relationship}
          onValueChange={(value) => setRelationship(value as FamilyMember['relationship'])}
          disabled={submitting}
        >
          <SelectTrigger id="profile-member-relationship">
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
        <Label htmlFor="profile-member-dob">Date of birth</Label>
        <Input
          id="profile-member-dob"
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          disabled={submitting}
          max={new Date().toISOString().slice(0, 10)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="profile-member-risk-profile">Risk appetite</Label>
        <Select
          value={riskProfile}
          onValueChange={(value) => setRiskProfile(value as NonNullable<FamilyMember['riskProfile']>)}
          disabled={submitting}
        >
          <SelectTrigger id="profile-member-risk-profile">
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
        {submitting ? submittingLabel : submitLabel}
      </Button>
    </form>
  )
}
