import { useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useOnline, OFFLINE_WRITE_MESSAGE } from '@/lib/use-online'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { track } from '@/lib/analytics'
import { LIBRARY_SECTIONS } from '@/lib/library-sections'
import { createHolding, updateHolding, HoldingsApiError, type Holding, type HoldingInput } from '@/lib/holdings-api'
import type { FamilyMember } from '@/lib/family-members-api'
import type { Instrument } from '@/lib/instruments-api'

/**
 * Shared by Onboarding Step 3 (first holding) and the Portfolio tab's
 * add/edit sheet — same field set and progressive disclosure both places
 * (Documentation/design/WIREFRAMES.md 1d and 5), one code path for both
 * add and edit (Documentation/design/SPEC.md §7's flagged risk).
 */
interface HoldingFormProps {
  members: FamilyMember[]
  instruments: Instrument[]
  initialHolding?: Holding
  submitLabel: string
  submittingLabel: string
  analyticsSurface: string
  onSaved: (holding: Holding) => void
}

export function HoldingForm({
  members,
  instruments,
  initialHolding,
  submitLabel,
  submittingLabel,
  analyticsSurface,
  onSaved,
}: HoldingFormProps) {
  const { getToken } = useAuth()
  const editing = Boolean(initialHolding)
  const online = useOnline()

  const [memberId, setMemberId] = useState(initialHolding?.memberId ?? members[0]?.id ?? '')
  const [instrumentId, setInstrumentId] = useState(initialHolding?.instrumentId ?? '')
  const [investedAmount, setInvestedAmount] = useState(initialHolding?.investedAmount ?? '')
  const [currentValue, setCurrentValue] = useState(initialHolding?.currentValue ?? '')
  const [optionalOpen, setOptionalOpen] = useState(false)
  const [units, setUnits] = useState(initialHolding?.units ?? '')
  const [monthlySip, setMonthlySip] = useState(initialHolding?.monthlySip ?? '')
  const [startDate, setStartDate] = useState(initialHolding?.startDate ?? '')
  const [maturityDate, setMaturityDate] = useState(initialHolding?.maturityDate ?? '')
  const [nominee, setNominee] = useState(initialHolding?.nominee ?? '')
  const [isEmergencyFund, setIsEmergencyFund] = useState(initialHolding?.isEmergencyFund ?? false)
  const [notes, setNotes] = useState(initialHolding?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedInstrument = instruments.find((i) => i.id === instrumentId)
  const assetClassLabel = selectedInstrument
    ? (LIBRARY_SECTIONS.find((s) => s.category === selectedInstrument.category)?.title ?? '')
    : ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || !memberId || !instrumentId) return
    setSubmitting(true)
    setError(null)

    const input: HoldingInput = {
      memberId,
      instrumentId,
      investedAmount,
      currentValue,
      ...(units ? { units } : {}),
      ...(monthlySip ? { monthlySip } : {}),
      ...(startDate ? { startDate } : {}),
      ...(maturityDate ? { maturityDate } : {}),
      ...(nominee ? { nominee } : {}),
      ...(notes ? { notes } : {}),
      isEmergencyFund,
    }

    try {
      const token = await getToken()
      const holding = editing ? await updateHolding(token, initialHolding!.id, input) : await createHolding(token, input)
      track(editing ? 'holding_updated' : 'holding_created', {
        instrument_id: holding.instrumentId,
        asset_class: holding.assetClass,
        member_id: holding.memberId,
      })
      onSaved(holding)
    } catch (err) {
      const message =
        err instanceof HoldingsApiError && err.status === 400
          ? 'Check the member, instrument, and amounts and try again.'
          : 'Something went wrong — please try again.'
      setError(message)
      track('error_shown', { error_type: 'holding_save_failed', surface: analyticsSurface, message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="holding-member">For</Label>
        <Select value={memberId} onValueChange={setMemberId} disabled={submitting}>
          <SelectTrigger id="holding-member">
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
        <Label htmlFor="holding-instrument">Instrument</Label>
        <Select value={instrumentId} onValueChange={setInstrumentId} disabled={submitting}>
          <SelectTrigger id="holding-instrument">
            <SelectValue placeholder="Select an instrument" />
          </SelectTrigger>
          <SelectContent>
            {instruments.map((instrument) => (
              <SelectItem key={instrument.id} value={instrument.id}>
                {instrument.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {assetClassLabel && (
        <div className="space-y-2">
          <Label htmlFor="holding-asset-class">Asset class</Label>
          <Input id="holding-asset-class" value={assetClassLabel} disabled readOnly />
          <p className="text-caption text-muted-foreground">Auto-filled from the instrument you select.</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="holding-invested-amount">Amount invested (₹)</Label>
        <Input
          id="holding-invested-amount"
          type="number"
          min="0"
          value={investedAmount}
          onChange={(e) => setInvestedAmount(e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="holding-current-value">Current value (₹)</Label>
        <Input
          id="holding-current-value"
          type="number"
          min="0"
          value={currentValue}
          onChange={(e) => setCurrentValue(e.target.value)}
          disabled={submitting}
        />
        <p className="text-caption text-muted-foreground">
          Your best estimate. Update it whenever you review your portfolio.
        </p>
      </div>

      <Button type="button" variant="ghost" onClick={() => setOptionalOpen((v) => !v)} className="px-0">
        {optionalOpen ? 'Hide optional fields' : 'Optional fields'}
      </Button>

      {optionalOpen && (
        <div className="space-y-4 border-t pt-4">
          <div className="space-y-2">
            <Label htmlFor="holding-units">Units held</Label>
            <Input id="holding-units" type="number" min="0" value={units} onChange={(e) => setUnits(e.target.value)} disabled={submitting} />
            <p className="text-caption text-muted-foreground">Applicable for mutual funds (units), gold (grams), etc.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="holding-sip">Monthly SIP amount (₹)</Label>
            <Input
              id="holding-sip"
              type="number"
              min="0"
              value={monthlySip}
              onChange={(e) => setMonthlySip(e.target.value)}
              disabled={submitting}
            />
            <p className="text-caption text-muted-foreground">Leave blank if this is a lump sum or non-SIP holding.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="holding-start-date">Start date</Label>
            <Input
              id="holding-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={submitting}
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="holding-maturity-date">Maturity date</Label>
            <Input
              id="holding-maturity-date"
              type="date"
              value={maturityDate}
              onChange={(e) => setMaturityDate(e.target.value)}
              disabled={submitting}
            />
            <p className="text-caption text-muted-foreground">Applicable for FDs, SSY, bonds, and similar instruments.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="holding-nominee">Nominee</Label>
            <Input id="holding-nominee" value={nominee} onChange={(e) => setNominee(e.target.value)} disabled={submitting} />
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 pt-2">
        <Checkbox
          id="holding-emergency-fund"
          checked={isEmergencyFund}
          onCheckedChange={(checked) => setIsEmergencyFund(checked === true)}
          disabled={submitting}
        />
        <div className="space-y-1">
          <Label htmlFor="holding-emergency-fund" className="font-normal">
            Mark as emergency fund
          </Label>
          <p className="text-caption text-muted-foreground">This holding is my household's emergency reserve.</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="holding-notes">Notes</Label>
        <Textarea
          id="holding-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={submitting}
          placeholder="Any details you want to remember about this holding."
        />
      </div>

      {error && <p className="text-caption text-destructive">{error}</p>}

      {!online && <p className="text-caption text-muted-foreground">{OFFLINE_WRITE_MESSAGE}</p>}

      <Button
        type="submit"
        className="w-full"
        disabled={
          !online || submitting || !memberId || !instrumentId || investedAmount === '' || currentValue === ''
        }
      >
        {submitting ? submittingLabel : submitLabel}
      </Button>
    </form>
  )
}
