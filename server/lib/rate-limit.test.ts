import { describe, it, expect } from 'vitest'
import { FixedWindowRateLimiter } from './rate-limit.js'

// The clock is injected everywhere below — no real timers, no sleeps, so the
// window-expiry behaviour is asserted deterministically.
function makeClock(start = 1_000_000) {
  let now = start
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms
    },
  }
}

describe('FixedWindowRateLimiter', () => {
  it('allows requests up to the limit', () => {
    const clock = makeClock()
    const limiter = new FixedWindowRateLimiter({ limit: 3, windowMs: 60_000, now: clock.now })

    expect(limiter.check('user_a')).toEqual({ allowed: true, remaining: 2, retryAfterSeconds: 0 })
    expect(limiter.check('user_a')).toEqual({ allowed: true, remaining: 1, retryAfterSeconds: 0 })
    expect(limiter.check('user_a')).toEqual({ allowed: true, remaining: 0, retryAfterSeconds: 0 })
  })

  it('blocks the request past the limit and reports a retry delay', () => {
    const clock = makeClock()
    const limiter = new FixedWindowRateLimiter({ limit: 2, windowMs: 60_000, now: clock.now })

    limiter.check('user_a')
    limiter.check('user_a')
    clock.advance(10_000)

    const blocked = limiter.check('user_a')
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterSeconds).toBe(50)
  })

  it('keeps blocking for the rest of the window without extending it', () => {
    const clock = makeClock()
    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 10_000, now: clock.now })

    limiter.check('user_a')
    clock.advance(1_000)
    expect(limiter.check('user_a').allowed).toBe(false)
    clock.advance(1_000)
    // A blocked attempt must not restart the window: 2s elapsed of 10s.
    expect(limiter.check('user_a').retryAfterSeconds).toBe(8)
  })

  it('resets the window once the injected clock passes windowMs', () => {
    const clock = makeClock()
    const limiter = new FixedWindowRateLimiter({ limit: 2, windowMs: 60_000, now: clock.now })

    limiter.check('user_a')
    limiter.check('user_a')
    expect(limiter.check('user_a').allowed).toBe(false)

    clock.advance(60_000)
    expect(limiter.check('user_a')).toEqual({ allowed: true, remaining: 1, retryAfterSeconds: 0 })
  })

  it('counts each key independently', () => {
    const clock = makeClock()
    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 60_000, now: clock.now })

    expect(limiter.check('user_a').allowed).toBe(true)
    expect(limiter.check('user_b').allowed).toBe(true)
    expect(limiter.check('user_a').allowed).toBe(false)
    expect(limiter.check('user_b').allowed).toBe(false)
  })

  it('reset() clears all counters', () => {
    const clock = makeClock()
    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 60_000, now: clock.now })

    limiter.check('user_a')
    expect(limiter.check('user_a').allowed).toBe(false)

    limiter.reset()
    expect(limiter.check('user_a').allowed).toBe(true)
  })

  it('evicts expired keys so the map cannot grow without bound', () => {
    const clock = makeClock()
    const limiter = new FixedWindowRateLimiter({ limit: 5, windowMs: 60_000, now: clock.now, maxKeys: 2 })

    limiter.check('user_a')
    limiter.check('user_b')
    expect(limiter.size).toBe(2)

    clock.advance(60_001)
    limiter.check('user_c')
    // user_a and user_b's windows expired; the sweep triggered by exceeding
    // maxKeys drops them rather than leaking one entry per user forever.
    expect(limiter.size).toBe(1)
  })

  it('rejects a non-positive limit or window at construction', () => {
    expect(() => new FixedWindowRateLimiter({ limit: 0, windowMs: 1_000 })).toThrow()
    expect(() => new FixedWindowRateLimiter({ limit: 1, windowMs: 0 })).toThrow()
  })
})
