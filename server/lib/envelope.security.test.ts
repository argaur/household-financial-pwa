/**
 * INDEPENDENT VERIFICATION PROBE — written by the orchestrator, not the agent
 * that implemented step 5. Adversarial: it tries to get plaintext household
 * financial data past the server's schemas, the way a buggy client or an
 * attacker would. Every one of these MUST be rejected.
 */
import { describe, it, expect } from 'vitest'
import {
  encryptedCreateSchema,
  encryptedUpdateSchema,
  memberScopedCreateSchema,
  householdScopedCreateSchema,
  SUPPORTED_ROW_ALG,
} from './envelope'

const validEnvelope = {
  ciphertext: 'aGVsbG8td29ybGQtY2lwaGVydGV4dA',
  iv: 'YWJjZGVmZ2hpamts',
  alg: SUPPORTED_ROW_ALG,
}
const uuid = '11111111-1111-4111-8111-111111111111'

describe('INDEPENDENT: the server cannot be handed plaintext money data', () => {
  const plaintextAttempts: Array<[string, Record<string, unknown>]> = [
    ['an invested amount', { investedAmount: '250000' }],
    ['a current value', { currentValue: '310000' }],
    ['an asset class', { assetClass: 'equity' }],
    ['a monthly SIP', { monthlySip: '18500' }],
    ['a nominee name', { nominee: 'Priya Sharma' }],
    ['a free-text note', { notes: 'emergency fund' }],
    ['a member name', { name: 'Priya Sharma' }],
    ['a date of birth', { dateOfBirth: '1991-02-02' }],
    ['a risk profile', { riskProfile: 'aggressive' }],
    ['a cover amount', { coverAmount: '10000000' }],
    ['a premium', { premium: '24000' }],
    ['an insurance provider', { provider: 'Some Insurer' }],
    ['an instrument id', { instrumentId: uuid }],
  ]

  it.each(plaintextAttempts)('rejects a create body carrying %s', (_label, extra) => {
    expect(memberScopedCreateSchema.safeParse({ ...validEnvelope, id: uuid, memberId: uuid, ...extra }).success).toBe(false)
    expect(householdScopedCreateSchema.safeParse({ ...validEnvelope, id: uuid, ...extra }).success).toBe(false)
  })

  it.each(plaintextAttempts)('rejects an update body carrying %s', (_label, extra) => {
    expect(encryptedUpdateSchema.safeParse({ ...validEnvelope, expectedVersion: 1, ...extra }).success).toBe(false)
  })

  it('accepts the envelope alone, so the rejections above are about the extra field', () => {
    expect(encryptedCreateSchema.safeParse(validEnvelope).success).toBe(true)
    expect(memberScopedCreateSchema.safeParse({ ...validEnvelope, id: uuid, memberId: uuid }).success).toBe(true)
    expect(encryptedUpdateSchema.safeParse({ ...validEnvelope, expectedVersion: 1 }).success).toBe(true)
  })
})

describe('INDEPENDENT: the ciphertext column cannot be used to smuggle readable text', () => {
  it('rejects ciphertext that is not base64url', () => {
    for (const bad of [
      'invested amount 250000',
      'Priya Sharma',
      '{"investedAmount":"250000"}',
      'YWJj+ZGVm/Z2g=',
      'YWJj ZGVm',
      '₹1,23,456',
    ]) {
      expect(encryptedCreateSchema.safeParse({ ...validEnvelope, ciphertext: bad }).success).toBe(false)
    }
  })

  it('rejects an unbounded blob so the table cannot become a file store', () => {
    expect(encryptedCreateSchema.safeParse({ ...validEnvelope, ciphertext: 'A'.repeat(20_000) }).success).toBe(false)
  })

  it('rejects an algorithm the server does not support', () => {
    for (const alg of ['AES-128-GCM', 'none', 'plaintext', '']) {
      expect(encryptedCreateSchema.safeParse({ ...validEnvelope, alg }).success).toBe(false)
    }
  })
})

describe('INDEPENDENT: the concurrency check cannot be bypassed', () => {
  it('refuses an update that omits expectedVersion', () => {
    expect(encryptedUpdateSchema.safeParse(validEnvelope).success).toBe(false)
  })

  it('refuses a client-supplied new version — the server derives it', () => {
    expect(
      encryptedUpdateSchema.safeParse({ ...validEnvelope, expectedVersion: 1, version: 99 }).success,
    ).toBe(false)
  })

  it('refuses nonsense versions', () => {
    for (const v of [0, -1, 1.5, Number.NaN, '1']) {
      expect(encryptedUpdateSchema.safeParse({ ...validEnvelope, expectedVersion: v }).success).toBe(false)
    }
  })

  it('refuses a row id that is not a uuid, so ids cannot be chosen freely', () => {
    for (const id of ['not-a-uuid', '', '1', '../../etc/passwd']) {
      expect(householdScopedCreateSchema.safeParse({ ...validEnvelope, id }).success).toBe(false)
    }
  })
})
