import { assetClassEnum } from '../../drizzle/schema.js'
import { listFamilyMembers } from './family-members.js'
import { listHoldings } from './holdings.js'
import { listProtection } from './protection.js'
import type { db as Db } from './db.js'

export type CompletenessTier = 'getting_started' | 'on_track' | 'strong'

export interface CompletenessChecks {
  memberCoverage: boolean
  emergencyFund: boolean
  bothParentsProtected: boolean
  assetDiversity: boolean
  noStaleValues: boolean
}

export interface CompletenessResult {
  checks: CompletenessChecks
  score: number
  tier: CompletenessTier
}

export interface AllocationSlice {
  assetClass: (typeof assetClassEnum)[number]
  value: number
  percentage: number
}

export interface DashboardResult {
  completeness: CompletenessResult
  allocation: AllocationSlice[]
  totalValue: number
}

// Narrow input shapes for computeCompleteness — only the fields the 5 checks
// actually read, so it's testable against plain fixture objects without
// pulling in full drizzle row types (member/holding/protection).
export interface CompletenessInputMember {
  id: string
  relationship: string
}
export interface CompletenessInputHolding {
  memberId: string
  assetClass: string
  currentValue: string | null
  isEmergencyFund: boolean
}
export interface CompletenessInputProtection {
  memberId: string
  status: string
}

/**
 * DATA_MODEL.md "Completeness Score — Query Spec": 5 binary checks, equal
 * weight. Read-time-only computation — SPEC.md §7's named simpler fallback
 * for this slice's riskiest assumption (no live-recompute-on-write).
 *
 * Design note on vacuous truth: the query spec's literal wording ("every
 * X has Y") is vacuously true over an empty set, but DATA_MODEL.md's own
 * State Matrix documents the just-onboarded/zero-holdings dashboard as
 * "all checks unmet" — so every check here is explicitly guarded to fail
 * when its underlying set (members, or self/spouse members, or holdings)
 * is empty, matching that documented invariant rather than the literal
 * vacuous-truth reading.
 */
export function computeCompleteness(
  members: CompletenessInputMember[],
  holdings: CompletenessInputHolding[],
  protectionRows: CompletenessInputProtection[],
): CompletenessResult {
  const memberIdsWithHoldings = new Set(holdings.map((h) => h.memberId))
  const memberCoverage = members.length > 0 && members.every((m) => memberIdsWithHoldings.has(m.id))

  const emergencyFund = holdings.some((h) => h.isEmergencyFund)

  const parentMembers = members.filter((m) => m.relationship === 'self' || m.relationship === 'spouse')
  const activeProtectionMemberIds = new Set(
    protectionRows.filter((p) => p.status === 'active').map((p) => p.memberId),
  )
  const bothParentsProtected = parentMembers.length > 0 && parentMembers.every((m) => activeProtectionMemberIds.has(m.id))

  const distinctAssetClasses = new Set(holdings.map((h) => h.assetClass))
  const assetDiversity = distinctAssetClasses.size >= 3

  const noStaleValues = holdings.length > 0 && holdings.every((h) => h.currentValue != null && h.currentValue !== '')

  const checks: CompletenessChecks = { memberCoverage, emergencyFund, bothParentsProtected, assetDiversity, noStaleValues }
  const score = Object.values(checks).filter(Boolean).length
  const tier: CompletenessTier = score <= 1 ? 'getting_started' : score <= 3 ? 'on_track' : 'strong'
  return { checks, score, tier }
}

type DashboardDb = Pick<typeof Db, 'select'>

/**
 * Composes the 3 already-scoped list queries (members, holdings, protection
 * — each proven household-scoped in its own slice) rather than a single
 * cross-table join, per DATA_MODEL.md note 6's performance guidance
 * (households have <=50 holdings) and SPEC.md §7's "not one giant join"
 * steer. The 5 checks and the allocation breakdown are then derived in
 * memory from those 3 result sets.
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

  const totals = new Map<string, number>()
  let totalValue = 0
  for (const h of holdings) {
    const value = Number(h.currentValue ?? 0)
    totalValue += value
    totals.set(h.assetClass, (totals.get(h.assetClass) ?? 0) + value)
  }

  const allocation: AllocationSlice[] = assetClassEnum
    .filter((assetClass) => totals.has(assetClass))
    .map((assetClass) => {
      const value = totals.get(assetClass) ?? 0
      return { assetClass, value, percentage: totalValue > 0 ? Math.round((value / totalValue) * 100) : 0 }
    })

  return { completeness, allocation, totalValue }
}
