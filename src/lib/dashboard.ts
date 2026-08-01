import { isParentRelationship, activeProtectionMemberIds } from './household-checks.js'

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

  const parentMembers = members.filter((m) => isParentRelationship(m.relationship))
  const protectedMemberIds = activeProtectionMemberIds(protectionRows)
  const bothParentsProtected = parentMembers.length > 0 && parentMembers.every((m) => protectedMemberIds.has(m.id))

  const distinctAssetClasses = new Set(holdings.map((h) => h.assetClass))
  const assetDiversity = distinctAssetClasses.size >= 3

  const noStaleValues = holdings.length > 0 && holdings.every((h) => h.currentValue != null && h.currentValue !== '')

  const checks: CompletenessChecks = { memberCoverage, emergencyFund, bothParentsProtected, assetDiversity, noStaleValues }
  const score = Object.values(checks).filter(Boolean).length
  const tier: CompletenessTier = score <= 1 ? 'getting_started' : score <= 3 ? 'on_track' : 'strong'
  return { checks, score, tier }
}
