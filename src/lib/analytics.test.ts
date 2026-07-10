import { describe, it, expect, vi } from 'vitest'

vi.mock('posthog-js', () => ({
  default: { capture: vi.fn() },
}))

import posthog from 'posthog-js'
import { track } from './analytics'

describe('track', () => {
  it('forwards the event name and properties to posthog.capture', () => {
    track('feature_used', { feature_name: 'posthog_smoke_test' })
    expect(posthog.capture).toHaveBeenCalledWith('feature_used', { feature_name: 'posthog_smoke_test' })
  })

  it('supports events with no properties', () => {
    track('onboarding_completed', {})
    expect(posthog.capture).toHaveBeenCalledWith('onboarding_completed', {})
  })
})
