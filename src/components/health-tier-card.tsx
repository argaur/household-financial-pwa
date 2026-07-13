import type { Completeness, CompletenessTier } from '@/lib/dashboard-api'

// Copy: Documentation/design/COPY_DECK.md — "Household Health panel".
const TIER_LABELS: Record<CompletenessTier, string> = {
  getting_started: 'Getting Started',
  on_track: 'On Track',
  strong: 'Strong',
}

const TIER_CONTEXT: Record<CompletenessTier, string> = {
  getting_started: 'Your plan is in its early stages. The steps below will strengthen it.',
  on_track: 'Your household has the foundations covered. Keep building.',
  strong: 'Your household has a strong financial foundation across the essentials.',
}

// Full class-name literals required — Tailwind's scanner can't see through
// string interpolation. Mirrors tailwind.config.ts's `tier` token group
// (same pattern already used by HomeShell.tsx's health badge).
const TIER_CLASSES: Record<CompletenessTier, string> = {
  getting_started: 'bg-tier-getting-started-bg text-tier-getting-started border-tier-getting-started-border',
  on_track: 'bg-tier-on-track-bg text-tier-on-track border-tier-on-track-border',
  strong: 'bg-tier-strong-bg text-tier-strong border-tier-strong-border',
}

interface HealthTierCardProps {
  completeness: Completeness
}

export function HealthTierCard({ completeness }: HealthTierCardProps) {
  const { tier, score } = completeness
  return (
    <section className={`rounded-lg border p-4 space-y-2 ${TIER_CLASSES[tier]}`}>
      <h2 className="section-label">Household health</h2>
      <p className="font-display text-display">{TIER_LABELS[tier]}</p>
      <p className="text-body">{score} of 5 checks complete</p>
      <hr className="border-current/20" />
      <p className="text-caption">{TIER_CONTEXT[tier]}</p>
    </section>
  )
}
