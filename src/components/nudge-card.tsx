import { Link } from 'react-router-dom'
import { track } from '@/lib/analytics'
import { getSectionByUrlSlug } from '@/lib/library-sections'
import type { Nudge, NudgeCheckId } from '@/lib/dashboard-api'

// Copy: Documentation/design/COPY_DECK.md — "Nudge (single — first unmet
// check in order)". Two deviations from that deck, both deliberate and
// flagged there for backfill:
//   - check 3's CTA reads "Record protection cover →" rather than "Learn
//     about term insurance →": no term-insurance learn-card exists among the
//     30 seeded instruments, and the one insurance-adjacent instrument is the
//     product class this project's standing decision rejects.
//   - `complete` is new copy — COPY_DECK defines no all-checks-pass nudge,
//     but SPEC.md §7 requires exactly one card, never zero.
//
// Every CTA is observational or navigational; none is a buy action
// (SPEC.md §7, and app/CLAUDE.md's "Education, not advice" constraint).

const DEBT_SECTION = getSectionByUrlSlug('debt')

const NUDGE_HREF: Record<NudgeCheckId, string> = {
  member_coverage: '/portfolio',
  emergency_fund: `/explore/${DEBT_SECTION?.urlSlug ?? 'debt'}/debt-fixed-deposit`,
  both_parents_protected: '/profile',
  asset_diversity: '/explore',
  no_stale_values: '/portfolio',
  complete: '/explore',
}

function bodyFor(nudge: Nudge): string {
  switch (nudge.checkId) {
    // The no-name fallbacks below drop the "[X] has no…" observation rather
    // than guessing at a subject. computeCompleteness fails these checks
    // closed on an EMPTY set too (zero members, or zero self/spouse members —
    // reachable since Slice 9 added member removal), so a household with no
    // members at all lands here. Asserting "someone has no holdings" or "a
    // parent has no cover" would then be factually false, not just vague.
    case 'member_coverage':
      return nudge.memberName
        ? `${nudge.memberName} has no holdings recorded yet. Every member in your plan should have at least one investment or asset mapped.`
        : 'Every member in your plan should have at least one investment or asset mapped.'
    case 'emergency_fund':
      return 'Your household has no emergency fund on record. This is the first safety net any plan needs — before any other investment.'
    case 'both_parents_protected':
      return nudge.memberName
        ? `${nudge.memberName} has no protection cover on record. Term life cover is the foundation of a household financial plan — everything else builds on it.`
        : 'Term life cover is the foundation of a household financial plan — everything else builds on it. Record cover for each parent in your household.'
    case 'asset_diversity': {
      const n = nudge.assetClassCount ?? 0
      return `Your household's investments are concentrated in ${n} asset ${n === 1 ? 'class' : 'classes'}. A well-rounded plan typically spans at least three different types.`
    }
    case 'no_stale_values':
      return "Some of your holdings don't have an up-to-date current value. Keeping these current is what makes your allocation accurate."
    case 'complete':
      return 'Every check in your household plan is covered. Keep the values current as things change, and revisit the library when your circumstances shift.'
  }
}

function ctaFor(nudge: Nudge): string {
  switch (nudge.checkId) {
    case 'member_coverage':
      return nudge.memberName ? `Add a holding for ${nudge.memberName} →` : 'Add a holding →'
    case 'emergency_fund':
      return 'Learn about emergency funds →'
    case 'both_parents_protected':
      return 'Record protection cover →'
    case 'asset_diversity':
      return 'Explore asset classes →'
    case 'no_stale_values':
      return 'Update holdings →'
    case 'complete':
      return 'Explore what else exists →'
  }
}

interface NudgeCardProps {
  nudge: Nudge
}

export function NudgeCard({ nudge }: NudgeCardProps) {
  return (
    <section className="rounded-lg border p-4 space-y-2">
      <h2 className="section-label">Next step</h2>
      <p className="text-body">{bodyFor(nudge)}</p>
      <Link
        to={NUDGE_HREF[nudge.checkId]}
        className="inline-flex min-h-[44px] items-center text-body underline"
        onClick={() =>
          track('learn_card_clicked', { check_id: nudge.checkId, learn_card_slug: nudge.learnCardSlug })
        }
      >
        {ctaFor(nudge)}
      </Link>
    </section>
  )
}
