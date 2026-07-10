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
  holding_created: { instrument_id: string; asset_class: string; member_id: string }
  holding_updated: { instrument_id: string; asset_class: string; member_id: string }
  dashboard_viewed: { household_id: string; allocation_summary: string }
  completeness_score_changed: { household_id: string; before_tier: string; after_tier: string }
  nudge_shown: { check_id: string; learn_card_slug: string }
  learn_card_clicked: { check_id: string; learn_card_slug: string }
  library_section_viewed: { section: string }
  instrument_viewed: { section: string; instrument_slug: string }
  nav_tab_clicked: { tab_name: string }
  fab_clicked: { tab_name: string }
  pwa_shell_loaded: { cache_status: 'hit' | 'miss' }
  pwa_install_prompted: { surface: string }
  pwa_installed: { surface: string }
  why_page_viewed: Record<string, never>
  consent_accepted: { disclaimer_version: string }
}

export function track<E extends keyof EventMap>(event: E, properties: EventMap[E]): void {
  posthog.capture(event as string, properties as Record<string, unknown>)
}
