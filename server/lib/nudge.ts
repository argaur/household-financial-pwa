import type { CompletenessChecks } from './dashboard.js'
import { isParentRelationship, activeProtectionMemberIds } from './household-checks.js'

/**
 * Slice 7 — nudge selection. Pure derived state on top of Slice 6's
 * Completeness checks; no queries of its own.
 *
 * SPEC.md §7 (Constraints Contract) makes "exactly one NudgeCard rendered at
 * any time — never zero and never more than one" a testable invariant, which
 * is why this lives in its own module with its own 2^5 suite
 * (IMPLEMENTATION_PLAN.md, Slice 7) rather than inside dashboard.ts.
 *
 * Priority order is DATA_MODEL.md's "Completeness Score — Query Spec"
 * numbering (1..5), which is also the declaration order of
 * `CompletenessChecks` in dashboard.ts. NUDGE_CHECK_ORDER below is the single
 * source of that ordering — keep the two aligned.
 */

export type NudgeCheckId =
  | 'member_coverage'
  | 'emergency_fund'
  | 'both_parents_protected'
  | 'asset_diversity'
  | 'no_stale_values'
  | 'complete'

/** Index i here corresponds to the i-th key of CompletenessChecks. */
export const NUDGE_CHECK_ORDER = [
  'member_coverage',
  'emergency_fund',
  'both_parents_protected',
  'asset_diversity',
  'no_stale_values',
] as const satisfies readonly NudgeCheckId[]

const CHECK_KEYS = [
  'memberCoverage',
  'emergencyFund',
  'bothParentsProtected',
  'assetDiversity',
  'noStaleValues',
] as const satisfies readonly (keyof CompletenessChecks)[]

/**
 * Target each nudge's CTA points at, and the value reported as
 * `learn_card_slug` on both `nudge_shown` and `learn_card_clicked`.
 *
 * Two of these deviate from COPY_DECK.md's literal CTA targets, deliberately:
 * COPY_DECK assumes "emergency funds" and "term insurance" learn-cards, but
 * neither exists among the 30 seeded instruments, and the one
 * insurance-adjacent instrument (`hybrid-traditional-insurance`) is the exact
 * product class this project's standing decision rejects — sending a
 * protection nudge there would be actively wrong advice. So:
 *   - emergency_fund -> the fixed-deposit card, the standard Indian
 *     emergency-fund vehicle, keeping COPY_DECK's CTA wording.
 *   - both_parents_protected -> the Protection card on Profile (Slice 5),
 *     with reworded CTA copy. Flagged for COPY_DECK backfill.
 */
export const NUDGE_LEARN_CARD_SLUG: Record<NudgeCheckId, string> = {
  member_coverage: 'portfolio',
  emergency_fund: 'debt-fixed-deposit',
  both_parents_protected: 'protection',
  asset_diversity: 'explore',
  no_stale_values: 'portfolio',
  complete: 'explore',
}

export interface NudgeContext {
  /** Name of the first member with no holdings recorded (check 1). */
  memberWithoutHoldings?: string
  /** Name of the first self/spouse member with no active protection (check 3). */
  unprotectedParent?: string
  /** Distinct asset classes held across the household (check 4). */
  assetClassCount: number
}

export interface Nudge {
  checkId: NudgeCheckId
  learnCardSlug: string
  /** Present only for checks whose copy interpolates a member name (1 and 3). */
  memberName?: string
  /** Present only for check 4, whose copy interpolates the count. */
  assetClassCount?: number
}

/**
 * Total function: returns exactly one nudge for every one of the 32 possible
 * check combinations. The all-pass case returns the affirming `complete`
 * nudge rather than nothing — SPEC.md §7 says never zero, and COPY_DECK.md
 * defines no all-pass copy, so that copy is new and flagged for backfill.
 */
export function selectNudge(checks: CompletenessChecks, context: NudgeContext): Nudge {
  const firstUnmetIndex = CHECK_KEYS.findIndex((key) => !checks[key])
  const checkId: NudgeCheckId = firstUnmetIndex === -1 ? 'complete' : NUDGE_CHECK_ORDER[firstUnmetIndex]

  const nudge: Nudge = { checkId, learnCardSlug: NUDGE_LEARN_CARD_SLUG[checkId] }

  // Only attach interpolation data the selected check's copy actually uses —
  // an absent name stays absent rather than becoming the string "undefined"
  // in the rendered sentence (the card handles the fallback wording).
  if (checkId === 'member_coverage' && context.memberWithoutHoldings) {
    nudge.memberName = context.memberWithoutHoldings
  }
  if (checkId === 'both_parents_protected' && context.unprotectedParent) {
    nudge.memberName = context.unprotectedParent
  }
  if (checkId === 'asset_diversity') {
    nudge.assetClassCount = context.assetClassCount
  }

  return nudge
}

// Narrow input shapes, mirroring dashboard.ts's Completeness* inputs — only
// the fields the context builder reads, so it's testable against plain
// fixtures without drizzle row types. `name` is what these add over the
// Completeness inputs, and the only reason this builder exists separately.
export interface NudgeInputMember {
  id: string
  name: string
  relationship: string
}
export interface NudgeInputHolding {
  memberId: string
  assetClass: string
}
export interface NudgeInputProtection {
  memberId: string
  status: string
}

/**
 * Derives the copy-interpolation data from the same three result sets
 * getDashboard already loads — no additional queries. "First" means first in
 * the list query's own order, so the nudge stays stable between reloads.
 */
export function buildNudgeContext(
  members: NudgeInputMember[],
  holdings: NudgeInputHolding[],
  protectionRows: NudgeInputProtection[],
): NudgeContext {
  const memberIdsWithHoldings = new Set(holdings.map((h) => h.memberId))
  const memberWithoutHoldings = members.find((m) => !memberIdsWithHoldings.has(m.id))?.name

  const protectedMemberIds = activeProtectionMemberIds(protectionRows)
  const unprotectedParent = members.find(
    (m) => isParentRelationship(m.relationship) && !protectedMemberIds.has(m.id),
  )?.name

  const assetClassCount = new Set(holdings.map((h) => h.assetClass)).size

  return { memberWithoutHoldings, unprotectedParent, assetClassCount }
}
