/**
 * Typed event registry — the only place event names/properties are declared.
 * Every call site imports `track()` from here; no raw PostHog SDK calls in feature code.
 * Source of truth for this list: Documentation/solution/METRICS_PLAN.md — keep in sync.
 * scripts/check_events.py verifies every event fired in code exists in this map.
 */
import posthog from 'posthog-js'

export interface EventMap {
  // Universal baseline — fires on every project, never remove.
  page_viewed: { path: string; referrer: string }
  session_started: { utm_source?: string; utm_medium?: string; device_type: string }
  signup_completed: { method: string; source: string }
  signup_failed: { method: string; error_reason: string }
  login_completed: { method: string }
  login_failed: { method: string; error_reason: string }
  feature_used: { feature_name: string; [key: string]: unknown }
  error_shown: { error_type: string; surface: string; message: string }
  cta_clicked: { cta_name: string; surface: string; destination: string }

  // Project-specific — one row per v1 feature (METRICS_PLAN.md).
  onboarding_started: { step: 'household' | 'members' | 'holdings' }
  onboarding_step_completed: { step: 'household' | 'members' | 'holdings'; duration_ms: number }
  onboarding_completed: Record<string, never>
  // instrument_id and asset_class removed 2026-08-01: they describe what a
  // household holds, not that a holding was saved. member_id stays — it is a
  // household-scoped opaque id, not portfolio shape.
  holding_created: { member_id: string }
  holding_updated: { member_id: string }
  // allocation_summary removed 2026-08-01: it was the household's asset-class
  // percentages by another name.
  dashboard_viewed: { household_id: string }
  // before_tier/after_tier removed 2026-08-01: a tier is a coarse read on
  // portfolio shape. The event still fires — a household can be counted, just
  // not read.
  completeness_score_changed: { household_id: string }
  // target_type distinguishes an instrument page from an app route — five of
  // the six nudge destinations are routes, so learn_card_slug alone is not
  // interpretable in PostHog (server/lib/nudge.ts NUDGE_TARGET).
  // check_id removed 2026-08-01: it names which of the 5 household checks
  // failed, which is portfolio shape by another name.
  nudge_shown: { learn_card_slug: string; target_type: 'learn_card' | 'route' }
  learn_card_clicked: { learn_card_slug: string; target_type: 'learn_card' | 'route' }
  library_section_viewed: { section: string }
  instrument_viewed: { section: string; instrument_slug: string }
  nav_tab_clicked: { tab_name: string }
  fab_clicked: { tab_name: string }
  pwa_shell_loaded: { cache_status: 'hit' | 'miss' }
  pwa_install_prompted: { surface: string }
  pwa_installed: { surface: string }
  why_page_viewed: Record<string, never>
  // Client-side encryption setup (key setup + unlock). Properties are
  // deliberately empty/enumerated: a passphrase, a recovery code, a salt, an IV
  // or a wrapped key must never become an analytics property.
  key_setup_started: Record<string, never>
  // Fires once the passphrase step succeeds (the recovery-code screen is
  // reached) — the only checkpoint between key_setup_started and
  // key_setup_completed, so drop-off during passphrase entry can be told
  // apart from drop-off during recovery-code review. No secret here either.
  key_setup_step_completed: { step: 'passphrase' }
  key_setup_completed: Record<string, never>
  vault_unlocked: { method: 'passphrase' | 'recovery_code' }
  consent_accepted: { disclaimer_version: string }
  // Strategy ledgers (D-016/D-018). Per METRICS_PLAN.md's property discipline,
  // no event here may carry anything describing what a household owns — so
  // there is no ledger name, no holding count, no amount and no asset class on
  // any of them. A ledger is countable, never readable.
  //
  // `source` is the one property carried, because criterion 1's funnel segments
  // on it: a ledger copied from Current is a different intent from an empty one.
  ledger_created: { source: 'blank' | 'copy' }
  // Criterion 1b — the number that decides whether the side-by-side compare
  // view is ever built — needs only the fact that a switch happened, so that a
  // session boundary can be measured between it and the matching creation.
  ledger_switched: Record<string, never>
  ledger_deleted: Record<string, never>
  // A non-Current ledger dashboard renders its delta strip (METRICS_PLAN
  // feature 3). No properties — the strip's numbers describe what a
  // household owns, which the property-discipline rule above forbids.
  compare_strip_viewed: Record<string, never>
  // A holding is added, changed, or removed inside a non-baseline ledger
  // (METRICS_PLAN feature 2). No properties, same reason as above.
  ledger_edited: Record<string, never>
  // Fires when a 5th ledger is attempted and blocked (METRICS_PLAN criterion 3
  // class: a capacity signal, not a failure).
  ledger_cap_reached: Record<string, never>
}

export function track<E extends keyof EventMap>(event: E, properties: EventMap[E]): void {
  posthog.capture(event as string, properties as Record<string, unknown>)
}
