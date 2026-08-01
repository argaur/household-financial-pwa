import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { FORBIDDEN_ANALYTICS_PROPERTIES } from '@/test/analytics-guard'

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

describe('event registry — portfolio-shape guard', () => {
  // General on purpose: this reads the registry itself, not any one event, so
  // a future event that declares `asset_class` (or any other stripped
  // property) fails here without needing a dedicated test written for it.
  it('never declares a property that reveals what a household owns, for any event', () => {
    const source = fs.readFileSync(path.resolve(__dirname, './analytics.ts'), 'utf-8')
    const interfaceMatch = source.match(/export interface EventMap \{([\s\S]*?)\n\}/)
    expect(interfaceMatch).not.toBeNull()
    const body = interfaceMatch![1]
    for (const name of FORBIDDEN_ANALYTICS_PROPERTIES) {
      expect(body, `EventMap must not declare '${name}' on any event`).not.toMatch(new RegExp(`\\b${name}\\s*[?:]`))
    }
  })
})
