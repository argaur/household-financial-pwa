import { describe, it, expect } from 'vitest'
import { riskLevel } from './instrument-preview'

describe('riskLevel', () => {
  it('takes the clause before an em-dash', () => {
    expect(riskLevel('High — concentrated in single-company performance; no diversification unless built manually.')).toBe(
      'High',
    )
  })

  it('takes the clause before a semicolon', () => {
    expect(riskLevel('Moderate to high; heavily strategy-dependent.')).toBe('Moderate to high')
  })

  it('takes the first sentence when the level runs to a period', () => {
    expect(riskLevel('Low. Principal is contractually fixed.')).toBe('Low')
  })

  it('keeps a comma-joined level phrase whole rather than cutting a list', () => {
    expect(riskLevel("Moderate to high, depending on the fund's stated category (large-cap, mid-cap, small-cap, sectoral).")).toBe(
      "Moderate to high, depending on the fund's stated category (large-cap, mid-cap, small-cap, sectoral)",
    )
  })

  it('returns the whole string when there is no boundary', () => {
    expect(riskLevel('Moderate')).toBe('Moderate')
  })

  it('never returns empty for degenerate input', () => {
    expect(riskLevel(' — odd leading dash')).not.toBe('')
  })
})
