import { HealthTierCard } from '@/components/health-tier-card'
import { AllocationDonut } from '@/components/allocation-donut'
import type { Completeness } from '@/lib/dashboard'
import type { AllocationSlice } from '@/lib/allocation'

/**
 * The hero's live sample one-pager: real components, synthetic data.
 *
 * This is a public repo, so real household data can never be committed.
 * Every number below is fictional. The allocation values sum to
 * SAMPLE_TOTAL_VALUE and the percentages sum to 100, because a landing page
 * for a financial product showing arithmetic that does not add up is the
 * worst possible detail to get wrong.
 *
 * The checks below must not contradict the donut sitting beside them. The
 * sample allocation spans four asset classes, so assetDiversity has to be
 * true. The two unmet checks are ones the card does not draw, so nothing on
 * screen argues with itself. Three of five keeps the tier at on_track
 * (dashboard.ts: score <= 1 getting_started, <= 3 on_track, else strong).
 */
export const SAMPLE_COMPLETENESS: Completeness = {
  checks: {
    memberCoverage: true,
    emergencyFund: false,
    bothParentsProtected: true,
    assetDiversity: true,
    noStaleValues: false,
  },
  score: 3,
  tier: 'on_track',
}

export const SAMPLE_TOTAL_VALUE = 4_200_000

export const SAMPLE_ALLOCATION: AllocationSlice[] = [
  { assetClass: 'equity', value: 1_890_000, percentage: 45 },
  { assetClass: 'debt', value: 1_050_000, percentage: 25 },
  { assetClass: 'gold', value: 840_000, percentage: 20 },
  { assetClass: 'hybrid', value: 420_000, percentage: 10 },
]

export function SampleOnePager() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6 shadow-card space-y-4">
      <HealthTierCard completeness={SAMPLE_COMPLETENESS} />
      <AllocationDonut state="populated" allocation={SAMPLE_ALLOCATION} totalValue={SAMPLE_TOTAL_VALUE} />
      <p className="text-caption text-muted-foreground">Sample household. Not real data.</p>
    </div>
  )
}
