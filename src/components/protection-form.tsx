import { useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { track } from '@/lib/analytics'
import {
  createProtection,
  updateProtection,
  ProtectionApiError,
  type Protection,
  type ProtectionInput,
} from '@/lib/protection-api'
import type { FamilyMember } from '@/lib/family-members-api'

const TYPE_OPTIONS: Array<{ value: Protection['type']; label: string }> = [
  { value: 'term-life', label: 'Term life' },
  { value: 'health', label: 'Health' },
  { value: 'disability', label: 'Disability' },
  { value: 'other', label: 'Other' },
]

const STATUS_OPTIONS: Array<{ value: Protection['status']; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'lapsed', label: 'Lapsed' },
  { value: 'pending', label: 'Pending' },
]

/**
 * One shared form for add and edit — same pattern as HoldingForm
 * (Documentation/design/SPEC.md §7): premium and provider are optional
 * fields collapsed under "Optional fields", required fields (member, type,
 * cover amount, status) always visible.
 */
interface ProtectionFormProps {
  members: FamilyMember[]
  initialProtection?: Protection
  submitLabel: string
  submittingLabel: string
  analyticsSurface: string
  onSaved: (record: Protection) => void
}

export function ProtectionForm({
  members,
  initialProtection,
  submitLabel,
  submittingLabel,
  analyticsSurface,
  onSaved,
}: ProtectionFormProps) {
  const { getToken } = useAuth()
  const editing = Boolean(initialProtection)

  const [memberId, setMemberId] = useState(initialProtection?.memberId ?? members[0]?.id ?? '')
  const [type, setType] = useState<Protection['type']>(initialProtection?.type ?? 'term-life')
  const [coverAmount, setCoverAmount] = useState(initialProtection?.coverAmount ?? '')
  const [status, setStatus] = useState<Protection['status']>(initialProtection?.status ?? 'active')
  const [optionalOpen, setOptionalOpen] = useState(false)
  const [premium, setPremium] = useState(initialProtection?.premium ?? '')
  const [provider, setProvider] = useState(initialProtection?.provider ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || !memberId || coverAmount === '') return
    setSubmitting(true)
    setError(null)

    const input: ProtectionInput = {
      memberId,
      type,
      coverAmount,
      status,
      ...(premium ? { premium } : {}),
      ...(provider ? { provider } : {}),
    }

    try {
      const token = await getToken()
      const record = editing
        ? await updateProtection(token, initialProtection!.id, input)
        : await createProtection(token, input)
      track('feature_used', { feature_name: 'add_protection', editing, member_id: record.memberId, type: record.type })
      onSaved(record)
    } catch (err) {
      const message =
        err instanceof ProtectionApiError && err.status === 400
          ? 'Check the member, type, and cover amount and try again.'
          : 'Something went wrong — please try again.'
      setError(message)
      track('error_shown', { error_type: 'protection_save_failed', surface: analyticsSurface, message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="protection-member">For</Label>
        <Select value={memberId} onValueChange={setMemberId} disabled={submitting}>
          <SelectTrigger id="protection-member">
            <SelectValue placeholder="Select a family member" />
          </SelectTrigger>
          <SelectContent>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="protection-type">Type</Label>
        <Select value={type} onValueChange={(v) => setType(v as Protection['type'])} disabled={submitting}>
          <SelectTrigger id="protection-type">
            <SelectValue placeholder="Select a type" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="protection-cover-amount">Cover amount (₹)</Label>
        <Input
          id="protection-cover-amount"
          type="number"
          min="0"
          value={coverAmount}
          onChange={(e) => setCoverAmount(e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="protection-status">Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as Protection['status'])} disabled={submitting}>
          <SelectTrigger id="protection-status">
            <SelectValue placeholder="Select a status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button type="button" variant="ghost" onClick={() => setOptionalOpen((v) => !v)} className="px-0">
        {optionalOpen ? 'Hide optional fields' : 'Optional fields'}
      </Button>

      {optionalOpen && (
        <div className="space-y-4 border-t pt-4">
          <div className="space-y-2">
            <Label htmlFor="protection-premium">Annual premium (₹)</Label>
            <Input
              id="protection-premium"
              type="number"
              min="0"
              value={premium}
              onChange={(e) => setPremium(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="protection-provider">Provider</Label>
            <Input
              id="protection-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              disabled={submitting}
              placeholder="e.g. HDFC Life, LIC"
            />
          </div>
        </div>
      )}

      {error && <p className="text-caption text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={submitting || !memberId || coverAmount === ''}>
        {submitting ? submittingLabel : submitLabel}
      </Button>
    </form>
  )
}
