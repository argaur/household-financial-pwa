import { describe, it, expect, vi, beforeEach } from 'vitest'

const jwtVerify = vi.fn()
vi.mock('jose', () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: (...args: unknown[]) => jwtVerify(...args),
}))

process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_ZmFrZS5jbGVyay5hY2NvdW50cy5kZXYk'

const { verifyUserId } = await import('./auth.js')

describe('verifyUserId', () => {
  beforeEach(() => {
    jwtVerify.mockReset()
  })

  it('returns null when the Authorization header is missing', async () => {
    expect(await verifyUserId(undefined)).toBeNull()
    expect(await verifyUserId(null)).toBeNull()
  })

  it('returns null when the header is not a Bearer token', async () => {
    expect(await verifyUserId('Basic abc123')).toBeNull()
  })

  it('returns the sub claim when the token verifies', async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: 'user_123' } })
    expect(await verifyUserId('Bearer good-token')).toBe('user_123')
  })

  it('returns null when verification throws', async () => {
    jwtVerify.mockRejectedValue(new Error('bad signature'))
    expect(await verifyUserId('Bearer bad-token')).toBeNull()
  })
})
