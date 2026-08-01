import { listFamilyMembers } from './family-members.js'
import { listHoldings } from './holdings.js'
import { listProtection } from './protection.js'
import {
  computeCompleteness,
  type CompletenessInputHolding,
  type CompletenessInputMember,
  type CompletenessInputProtection,
  type CompletenessResult,
} from '../../src/lib/dashboard.js'
import {
  buildNudgeContext,
  selectNudge,
  type Nudge,
  type NudgeInputHolding,
  type NudgeInputMember,
  type NudgeInputProtection,
} from '../../src/lib/nudge.js'
import { computeAllocation, type AllocationInputHolding, type AllocationSlice } from '../../src/lib/allocation.js'
import type { db as Db } from './db.js'

export interface DashboardResult {
  completeness: CompletenessResult
  /** Slice 7 — always present; exactly one nudge, never zero (SPEC.md §7). */
  nudge: Nudge
  allocation: AllocationSlice[]
  totalValue: number
}

type DashboardDb = Pick<typeof Db, 'select'>

/**
 * Composes the 3 already-scoped list queries (members, holdings, protection
 * — each proven household-scoped in its own slice) rather than a single
 * cross-table join, per DATA_MODEL.md note 6's performance guidance
 * (households have <=50 holdings) and SPEC.md §7's "not one giant join"
 * steer. The 5 checks and the allocation breakdown are then derived in
 * memory from those 3 result sets.
 *
 * The 5 checks (computeCompleteness), the nudge (selectNudge/buildNudgeContext)
 * and the allocation breakdown (computeAllocation) are pure functions that
 * live in src/lib so the browser can run them too once dashboard data becomes
 * client-side encrypted — this function stays server-side because it's the
 * part that actually reads the database.
 */
export async function getDashboard(db: DashboardDb, householdId: string): Promise<DashboardResult> {
  const [members, holdings, protectionRows] = await Promise.all([
    listFamilyMembers(db, householdId),
    listHoldings(db, householdId),
    listProtection(db, householdId),
  ])

  // These three loops replace `as unknown as` casts that used to sit here.
  // The plaintext columns are nullable now — every encrypted row has them set
  // to null — and the casts were quietly promising TypeScript a `string` where
  // there is a `string | null`. A row the server cannot read is skipped rather
  // than asserted into existence: this computation is genuinely blind to
  // encrypted data, and the honest expression of that is a shorter list, not a
  // `!`. The client-side dashboard is what makes these rows count again.
  const memberInputs: Array<CompletenessInputMember & NudgeInputMember> = []
  for (const member of members) {
    if (member.name === null || member.relationship === null) continue
    memberInputs.push({ id: member.id, name: member.name, relationship: member.relationship })
  }

  const holdingInputs: Array<CompletenessInputHolding & NudgeInputHolding & AllocationInputHolding> = []
  for (const holding of holdings) {
    if (holding.assetClass === null) continue
    holdingInputs.push({
      memberId: holding.memberId,
      assetClass: holding.assetClass,
      currentValue: holding.currentValue,
      isEmergencyFund: holding.isEmergencyFund,
    })
  }

  const protectionInputs: Array<CompletenessInputProtection & NudgeInputProtection> = []
  for (const record of protectionRows) {
    if (record.status === null) continue
    protectionInputs.push({ memberId: record.memberId, status: record.status })
  }

  const completeness = computeCompleteness(memberInputs, holdingInputs, protectionInputs)

  // Slice 7 — derived from the same three result sets, no extra queries.
  const nudge = selectNudge(completeness.checks, buildNudgeContext(memberInputs, holdingInputs, protectionInputs))

  const { allocation, totalValue } = computeAllocation(holdingInputs)

  return { completeness, nudge, allocation, totalValue }
}
