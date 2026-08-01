/**
 * Shared household predicates used by BOTH the Completeness Score
 * (dashboard.ts) and the nudge context builder (nudge.ts). Extracted so the
 * two never drift — a Slice 7 review finding flagged that each had its own
 * copy of "who counts as a parent" and "who has active protection", which
 * could one day make the Health card and the nudge below it disagree on
 * screen. Single source of truth, no domain state of its own.
 */

/** Relationships that count as a "parent" for the protection check. */
export function isParentRelationship(relationship: string): boolean {
  return relationship === 'self' || relationship === 'spouse'
}

/** Member ids that have at least one *active* protection record. */
export function activeProtectionMemberIds(rows: { memberId: string; status: string }[]): Set<string> {
  return new Set(rows.filter((p) => p.status === 'active').map((p) => p.memberId))
}
