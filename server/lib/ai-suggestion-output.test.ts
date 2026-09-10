import { describe, it, expect } from 'vitest'
import { instrumentsSeedData } from '../seed/instruments-data.js'
import {
  EDUCATION_NOT_ADVICE_CAVEAT,
  LIBRARY_INSTRUMENT_SLUGS,
  MAX_SUGGESTION_ALLOCATIONS,
  validateSuggestionOutput,
} from './ai-suggestion-output.js'

/**
 * A4. The allowlist is the enforcement mechanism, so these tests are about what
 * it *refuses*, and above all about the fact that it refuses the whole response
 * rather than quietly dropping the offending row.
 */

const VALID = {
  allocations: [
    { slug: 'equity-index-funds-etfs', weightPct: 60 },
    { slug: 'debt-ppf', weightPct: 40 },
  ],
  reasoning: 'An eighteen year horizon leaves room for a growth-weighted mix.',
}

describe('LIBRARY_INSTRUMENT_SLUGS is sourced from the library, not hand-copied', () => {
  it('is exactly the set of slugs the seeded library carries', () => {
    expect([...LIBRARY_INSTRUMENT_SLUGS].sort()).toEqual(instrumentsSeedData.map((row) => row.slug).sort())
  })

  it('covers all 30 instruments, so the enum cannot silently drift from the library', () => {
    expect(LIBRARY_INSTRUMENT_SLUGS).toHaveLength(instrumentsSeedData.length)
  })

  it('uses the two slugs these tests name, so a rename fails loudly here', () => {
    for (const slug of VALID.allocations.map((a) => a.slug)) {
      expect(LIBRARY_INSTRUMENT_SLUGS).toContain(slug)
    }
  })
})

describe('validateSuggestionOutput — the happy path', () => {
  it('accepts allocations whose slugs are all in the library', () => {
    const result = validateSuggestionOutput(VALID)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.suggestion.allocations).toEqual(VALID.allocations)
    expect(result.suggestion.reasoning).toBe(VALID.reasoning)
  })

  it('attaches the fixed education-not-advice caveat, which the model never supplies', () => {
    const result = validateSuggestionOutput(VALID)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.suggestion.caveat).toBe(EDUCATION_NOT_ADVICE_CAVEAT)
    expect(EDUCATION_NOT_ADVICE_CAVEAT.length).toBeGreaterThan(0)
    // Gaurav's standing style rule for user-facing copy.
    expect(EDUCATION_NOT_ADVICE_CAVEAT).not.toMatch(/—/)
  })

  it('refuses a model-supplied caveat outright, so the line cannot be rewritten by the model', () => {
    const result = validateSuggestionOutput({ ...VALID, caveat: 'Buy this today, guaranteed returns.' })
    expect(result.status).toBe('invalid_output')
  })
})

describe('validateSuggestionOutput — an unknown slug invalidates the WHOLE response', () => {
  it('rejects the response rather than filtering the bad row out', () => {
    const raw = {
      ...VALID,
      allocations: [
        { slug: 'equity-index-funds-etfs', weightPct: 50 },
        { slug: 'hdfc-sanchay-par-advantage-ulip', weightPct: 30 },
        { slug: 'debt-ppf', weightPct: 20 },
      ],
    }
    const result = validateSuggestionOutput(raw)

    // The silent-filter implementation returns ok with the two good rows. This
    // assertion is the one that fails it.
    expect(result.status).toBe('invalid_output')
    expect(result).not.toHaveProperty('suggestion')
  })

  it('rejects a response whose only allocation is a product name, not a library slug', () => {
    const raw = { ...VALID, allocations: [{ slug: 'SBI Smart Champ child plan', weightPct: 100 }] }
    expect(validateSuggestionOutput(raw).status).toBe('invalid_output')
  })

  it('rejects an embedded-insurance product by construction, because it is not in the library', () => {
    // The standing product rule (no ULIPs, no "child plans") is held here by
    // the enum, not by a keyword filter. These strings are refused because they
    // are not library slugs, which is the whole point of D-024 decision 5.
    for (const slug of ['ulip', 'child-plan', 'money-back-endowment']) {
      expect(LIBRARY_INSTRUMENT_SLUGS).not.toContain(slug)
      expect(validateSuggestionOutput({ ...VALID, allocations: [{ slug, weightPct: 100 }] }).status).toBe(
        'invalid_output',
      )
    }
  })
})

describe('validateSuggestionOutput — everything else it refuses', () => {
  it('rejects a non-object, a null, and a string', () => {
    for (const raw of [null, undefined, 'ok', 42, []]) {
      expect(validateSuggestionOutput(raw).status).toBe('invalid_output')
    }
  })

  it('rejects an unknown top-level key', () => {
    expect(validateSuggestionOutput({ ...VALID, buyLink: 'https://example.test' }).status).toBe('invalid_output')
  })

  it('rejects an unknown key on an allocation, including a rupee amount', () => {
    const raw = { ...VALID, allocations: [{ slug: 'debt-ppf', weightPct: 100, amountInr: 500_000 }] }
    expect(validateSuggestionOutput(raw).status).toBe('invalid_output')
  })

  it('rejects an empty allocation list and one longer than the cap', () => {
    expect(validateSuggestionOutput({ ...VALID, allocations: [] }).status).toBe('invalid_output')
    const tooMany = Array.from({ length: MAX_SUGGESTION_ALLOCATIONS + 1 }, (_, index) => ({
      slug: LIBRARY_INSTRUMENT_SLUGS[index % LIBRARY_INSTRUMENT_SLUGS.length]!,
      weightPct: 1,
    }))
    expect(validateSuggestionOutput({ ...VALID, allocations: tooMany }).status).toBe('invalid_output')
  })

  it('rejects a repeated slug', () => {
    const raw = {
      ...VALID,
      allocations: [
        { slug: 'debt-ppf', weightPct: 50 },
        { slug: 'debt-ppf', weightPct: 50 },
      ],
    }
    expect(validateSuggestionOutput(raw).status).toBe('invalid_output')
  })

  it('rejects a weight outside 0..100', () => {
    expect(validateSuggestionOutput({ ...VALID, allocations: [{ slug: 'debt-ppf', weightPct: 101 }] }).status).toBe(
      'invalid_output',
    )
    expect(validateSuggestionOutput({ ...VALID, allocations: [{ slug: 'debt-ppf', weightPct: -1 }] }).status).toBe(
      'invalid_output',
    )
  })

  it('rejects missing or over-long reasoning', () => {
    const { reasoning: _reasoning, ...withoutReasoning } = VALID
    expect(validateSuggestionOutput(withoutReasoning).status).toBe('invalid_output')
    expect(validateSuggestionOutput({ ...VALID, reasoning: 'x'.repeat(5000) }).status).toBe('invalid_output')
  })
})
