import { describe, it, expect, vi } from 'vitest'
import { render, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Privacy } from './Privacy'
import { Why } from './Why'
import * as privacyNote from '@/lib/privacy-note'
import { AI_REQUEST_LIMIT } from '@/lib/privacy-note'

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))

/**
 * D-018 Q7 / D-024. The AI-request exception has to read identically on
 * /privacy and /why, or the two pages quietly drift apart over time. This
 * file pins that as one equality assertion (not two independent substring
 * checks on two separately rendered pages, which would pass even if the two
 * copies diverged as long as each individually mentioned Anthropic).
 */
describe('AI-request copy: cross-page consistency and style', () => {
  it('renders byte-identical claim text on /privacy and /why', () => {
    const { container: privacyContainer } = render(
      <MemoryRouter>
        <Privacy />
      </MemoryRouter>,
    )
    const { container: whyContainer } = render(
      <MemoryRouter>
        <Why />
      </MemoryRouter>,
    )

    const privacyText = within(privacyContainer).getByText(AI_REQUEST_LIMIT.body).textContent
    const whyText = within(whyContainer).getByText(AI_REQUEST_LIMIT.body).textContent

    expect(privacyText).toBe(whyText)
  })

  it('the two-part claim survives intact: our database does not store it, AND Anthropic may retain it', () => {
    // Guards against a future edit that keeps one half and drops the other.
    expect(AI_REQUEST_LIMIT.body).toMatch(/does not store/i)
    expect(AI_REQUEST_LIMIT.body).toMatch(/anthropic/i)
    expect(AI_REQUEST_LIMIT.body).toMatch(/retain/i)
    expect(AI_REQUEST_LIMIT.body).toMatch(/its own/i)
  })

  it('has zero em-dashes (U+2014) or en-dashes (U+2013) in every exported privacy-note string', () => {
    const emDash = '—'
    const enDash = '–'
    const offenders: string[] = []

    for (const [name, value] of Object.entries(privacyNote)) {
      const strings: string[] =
        typeof value === 'string'
          ? [value]
          : Array.isArray(value)
            ? value.filter((v): v is string => typeof v === 'string')
            : value && typeof value === 'object'
              ? Object.values(value as Record<string, unknown>).filter(
                  (v): v is string => typeof v === 'string',
                )
              : []

      for (const s of strings) {
        if (s.includes(emDash) || s.includes(enDash)) offenders.push(`${name}: ${s}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
