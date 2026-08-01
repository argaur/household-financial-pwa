import { describe, it, expect } from 'vitest'
import { buildAad, type RowAad } from './aad'
import { CryptoError } from './errors'

const base: RowAad = {
  tableName: 'holdings',
  householdId: 'hh_01HQ',
  rowId: 'row_42',
  version: 3,
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

describe('buildAad', () => {
  it('is deterministic for the same tuple', () => {
    expect(buildAad(base)).toEqual(buildAad({ ...base }))
  })

  it('changes when any single field changes', () => {
    const baseline = hex(buildAad(base))
    expect(hex(buildAad({ ...base, tableName: 'protection' }))).not.toBe(baseline)
    expect(hex(buildAad({ ...base, householdId: 'hh_other' }))).not.toBe(baseline)
    expect(hex(buildAad({ ...base, rowId: 'row_43' }))).not.toBe(baseline)
    expect(hex(buildAad({ ...base, version: 4 }))).not.toBe(baseline)
  })

  it('cannot collide when field boundaries shift', () => {
    // The whole point of length-prefixing: naive concatenation would make
    // ("a" , "bc") and ("ab" , "c") produce the same bytes.
    const left = hex(buildAad({ tableName: 'a', householdId: 'bc', rowId: 'd', version: 1 }))
    const right = hex(buildAad({ tableName: 'ab', householdId: 'c', rowId: 'd', version: 1 }))
    expect(left).not.toBe(right)

    const l2 = hex(buildAad({ tableName: 't', householdId: 'hh', rowId: 'r', version: 1 }))
    const r2 = hex(buildAad({ tableName: 't', householdId: 'h', rowId: 'hr', version: 1 }))
    expect(l2).not.toBe(r2)
  })

  it('is not fooled by a delimiter smuggled into a field', () => {
    const a = hex(buildAad({ tableName: 'holdings|hh', householdId: 'x', rowId: 'r', version: 1 }))
    const b = hex(buildAad({ tableName: 'holdings', householdId: 'hh|x', rowId: 'r', version: 1 }))
    expect(a).not.toBe(b)
  })

  it('handles non-ASCII identifiers', () => {
    const withUnicode = buildAad({ ...base, rowId: 'आरव' })
    expect(withUnicode.length).toBeGreaterThan(0)
    expect(hex(withUnicode)).not.toBe(hex(buildAad(base)))
  })

  it('rejects an invalid version at the boundary', () => {
    expect(() => buildAad({ ...base, version: -1 })).toThrow(CryptoError)
    expect(() => buildAad({ ...base, version: 1.5 })).toThrow(CryptoError)
    expect(() => buildAad({ ...base, version: Number.NaN })).toThrow(CryptoError)
    expect(() => buildAad({ ...base, version: 2 ** 32 })).toThrow(CryptoError)
  })

  it('rejects an empty table name or row id', () => {
    expect(() => buildAad({ ...base, tableName: '' })).toThrow(CryptoError)
    expect(() => buildAad({ ...base, rowId: '' })).toThrow(CryptoError)
    expect(() => buildAad({ ...base, householdId: '' })).toThrow(CryptoError)
  })
})
