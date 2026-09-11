import { describe, expect, it } from 'vitest'
import { bucketImportRows, identifyInstrument, type RawImportRow } from './import-bucketing'
import type { Holding } from './holdings-api'
import type { Instrument } from './instruments-api'
import type { TemplateMember } from './import-template'

/**
 * D-025 step I7 — bucketing. See `import-bucketing.ts`'s module doc for why
 * fuzzy instrument matching structurally cannot resolve an `instrumentId`:
 * `identifyInstrument`'s `fuzzy` and `none` branches carry no such field.
 */

function makeInstrument(overrides: Partial<Instrument> & Pick<Instrument, 'slug' | 'category' | 'name'>): Instrument {
  return {
    id: overrides.slug,
    summary: '',
    returns: '',
    tax: '',
    liquidity: '',
    risk: '',
    eligibility: '',
    minInvestment: '',
    rateValue: null,
    rateAsOf: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeHolding(overrides: Partial<Holding>): Holding {
  return {
    id: 'h1',
    householdId: 'hh1',
    memberId: 'm1',
    instrumentId: 'i1',
    assetClass: 'equity',
    investedAmount: '10000',
    currentValue: '10000',
    units: null,
    monthlySip: null,
    startDate: null,
    maturityDate: null,
    nominee: null,
    isEmergencyFund: false,
    notes: null,
    version: 1,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

const MEMBER: TemplateMember = { id: 'm1', name: 'Gaurav' }

const NIFTY_FUND = makeInstrument({
  id: 'i-nifty-50-index-fund',
  slug: 'equity-nifty-50-index-fund',
  category: 1,
  name: 'Nifty 50 Index Fund',
})

const FIXED_DEPOSIT = makeInstrument({
  id: 'i-fixed-deposit',
  slug: 'debt-fixed-deposit',
  category: 2,
  name: 'Fixed Deposit (FD)',
})

const INSTRUMENTS = [NIFTY_FUND, FIXED_DEPOSIT]

function makeRow(overrides: Partial<RawImportRow>): RawImportRow {
  return {
    member: MEMBER,
    rowNumber: 1,
    slug: NIFTY_FUND.slug,
    instrumentName: NIFTY_FUND.name,
    investedAmount: null,
    currentValue: null,
    units: null,
    monthlySip: null,
    startDate: null,
    maturityDate: null,
    nominee: null,
    emergencyFund: false,
    notes: null,
    ...overrides,
  }
}

describe('bucketImportRows', () => {
  it('buckets a fully valid, non-duplicate row as Ready', () => {
    const row = makeRow({ investedAmount: 50000, currentValue: 55000 })
    const result = bucketImportRows({ rows: [row], instruments: INSTRUMENTS, existingHoldings: [] })

    expect(result.ready).toHaveLength(1)
    expect(result.needsAttention).toHaveLength(0)
    expect(result.possibleDuplicate).toHaveLength(0)
    expect(result.skipped).toHaveLength(0)
    expect(result.ready[0].resolved?.instrumentId).toBe(NIFTY_FUND.id)
    expect(result.ready[0].resolved?.investedAmount).toBe(50000)
    expect(result.ready[0].resolved?.currentValue).toBe(55000)
  })

  it('leaves an untouched prefilled row Skipped, not an error', () => {
    const row = makeRow({}) // every user-editable cell still blank
    const result = bucketImportRows({ rows: [row], instruments: INSTRUMENTS, existingHoldings: [] })

    expect(result.skipped).toHaveLength(1)
    expect(result.ready).toHaveLength(0)
    expect(result.needsAttention).toHaveLength(0)
  })

  it('buckets an unreadable amount cell as Needs attention with the I6 message, no cell value echoed', () => {
    const row = makeRow({ investedAmount: 'lots of money', currentValue: 55000 })
    const result = bucketImportRows({ rows: [row], instruments: INSTRUMENTS, existingHoldings: [] })

    expect(result.needsAttention).toHaveLength(1)
    const [needsAttention] = result.needsAttention
    expect(needsAttention.reasons.some((r) => r.includes('Amount invested'))).toBe(true)
    expect(needsAttention.reasons.some((r) => r.includes('lots of money'))).toBe(false)
    expect(result.ready).toHaveLength(0)
  })

  it('buckets a shorthand amount ("1.5L") as Needs attention rather than guessing', () => {
    const row = makeRow({ investedAmount: '1.5L', currentValue: 55000 })
    const result = bucketImportRows({ rows: [row], instruments: INSTRUMENTS, existingHoldings: [] })

    expect(result.needsAttention).toHaveLength(1)
    expect(result.needsAttention[0].reasons.some((r) => r.toLowerCase().includes('shorthand'))).toBe(true)
  })

  it('buckets a touched row missing the required Current value as Needs attention', () => {
    const row = makeRow({ investedAmount: 50000, currentValue: null })
    const result = bucketImportRows({ rows: [row], instruments: INSTRUMENTS, existingHoldings: [] })

    expect(result.needsAttention).toHaveLength(1)
    expect(result.needsAttention[0].reasons.some((r) => r.includes('Current value'))).toBe(true)
  })

  it('buckets a row for an instrument absent from the library as Skipped', () => {
    const row = makeRow({
      slug: 'not-a-real-slug',
      instrumentName: 'Some Totally Unknown Thing Nobody Sells',
      investedAmount: 50000,
      currentValue: 55000,
    })
    const result = bucketImportRows({ rows: [row], instruments: INSTRUMENTS, existingHoldings: [] })

    expect(result.skipped).toHaveLength(1)
    expect(result.ready).toHaveLength(0)
    expect(result.needsAttention).toHaveLength(0)
  })

  it('flags a same-slug, same-member existing holding as Possible duplicate even when amounts differ', () => {
    const existing = makeHolding({ instrumentId: NIFTY_FUND.id, memberId: MEMBER.id, investedAmount: '10000' })
    const row = makeRow({ investedAmount: 99999, currentValue: 120000 })
    const result = bucketImportRows({ rows: [row], instruments: INSTRUMENTS, existingHoldings: [existing] })

    expect(result.possibleDuplicate).toHaveLength(1)
    expect(result.ready).toHaveLength(0)
  })

  it('does NOT flag a duplicate when the slug matches but the member differs', () => {
    const existing = makeHolding({ instrumentId: NIFTY_FUND.id, memberId: 'someone-else', investedAmount: '10000' })
    const row = makeRow({ investedAmount: 50000, currentValue: 55000 })
    const result = bucketImportRows({ rows: [row], instruments: INSTRUMENTS, existingHoldings: [existing] })

    expect(result.possibleDuplicate).toHaveLength(0)
    expect(result.ready).toHaveLength(1)
  })

  it('does NOT flag a duplicate when the member matches but the instrument differs', () => {
    const existing = makeHolding({ instrumentId: FIXED_DEPOSIT.id, memberId: MEMBER.id, investedAmount: '10000' })
    const row = makeRow({ investedAmount: 50000, currentValue: 55000 })
    const result = bucketImportRows({ rows: [row], instruments: INSTRUMENTS, existingHoldings: [existing] })

    expect(result.possibleDuplicate).toHaveLength(0)
    expect(result.ready).toHaveLength(1)
  })

  // ---------------------------------------------------------------------
  // The sharpest rule in this step: a fuzzy/near-miss instrument name must
  // surface for confirmation and must NEVER silently resolve to a slug.
  // ---------------------------------------------------------------------
  it('does NOT auto-resolve a near-miss instrument name -- it goes to Needs attention with a suggestion, unresolved', () => {
    // One character short of "Nifty 50 Index Fund" -- close enough that a
    // naive/loose matcher (e.g. "starts with" or a generous threshold) would
    // accept it outright.
    const row = makeRow({
      slug: '', // the hidden slug column was edited away/blank, forcing name-based lookup
      instrumentName: 'Nifty 50 Index Fnd',
      investedAmount: 50000,
      currentValue: 55000,
    })
    const result = bucketImportRows({ rows: [row], instruments: INSTRUMENTS, existingHoldings: [] })

    expect(result.ready).toHaveLength(0)
    expect(result.possibleDuplicate).toHaveLength(0)
    expect(result.needsAttention).toHaveLength(1)

    const [flagged] = result.needsAttention
    expect(flagged.resolved).toBeUndefined()
    expect(flagged.suggestedInstrument?.slug).toBe(NIFTY_FUND.slug)
    expect(flagged.reasons.some((r) => r.includes('Nifty 50 Index Fund'))).toBe(true)
  })

  it('identifyInstrument never carries an instrumentId on its fuzzy or none branches (structural, not just behavioural)', () => {
    const fuzzy = identifyInstrument({ slug: '', instrumentName: 'Nifty 50 Index Fnd' }, INSTRUMENTS)
    const none = identifyInstrument({ slug: '', instrumentName: 'Nothing Like Any Of These' }, INSTRUMENTS)

    expect(fuzzy.kind).toBe('fuzzy')
    expect('instrumentId' in fuzzy).toBe(false)
    expect(none.kind).toBe('none')
    expect('instrumentId' in none).toBe(false)
  })

  it('an exact slug match resolves even if the display name column was edited to something else', () => {
    const row = makeRow({ slug: NIFTY_FUND.slug, instrumentName: 'renamed by user', investedAmount: 50000, currentValue: 55000 })
    const result = bucketImportRows({ rows: [row], instruments: INSTRUMENTS, existingHoldings: [] })

    expect(result.ready).toHaveLength(1)
    expect(result.ready[0].resolved?.instrumentId).toBe(NIFTY_FUND.id)
  })

  it('an exact case-insensitive name match resolves when the slug is blank', () => {
    const row = makeRow({ slug: '', instrumentName: 'nifty 50 index fund', investedAmount: 50000, currentValue: 55000 })
    const result = bucketImportRows({ rows: [row], instruments: INSTRUMENTS, existingHoldings: [] })

    expect(result.ready).toHaveLength(1)
    expect(result.ready[0].resolved?.instrumentId).toBe(NIFTY_FUND.id)
  })
})
