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

  const completeness = computeCompleteness(
    members as unknown as CompletenessInputMember[],
    holdings as unknown as CompletenessInputHolding[],
    protectionRows as unknown as CompletenessInputProtection[],
  )

  // Slice 7 — derived from the same three result sets, no extra queries.
  const nudge = selectNudge(
    completeness.checks,
    buildNudgeContext(
      members as unknown as NudgeInputMember[],
      holdings as unknown as NudgeInputHolding[],
      protectionRows as unknown as NudgeInputProtection[],
    ),
  )

  const { allocation, totalValue } = computeAllocation(holdings as unknown as AllocationInputHolding[])

  return { completeness, nudge, allocation, totalValue }
}
