/**
 * SEC-001 — in-process fixed-window rate limiter.
 *
 * HONEST LIMITATIONS, READ BEFORE RELYING ON THIS:
 * Vercel Functions are serverless. This limiter's counters live in the memory
 * of ONE function instance, so:
 *   - every cold start resets every counter to zero;
 *   - concurrent instances do not coordinate, so N warm instances multiply the
 *     effective limit by N;
 *   - an attacker who can force new instances (bursty parallel traffic) can
 *     dilute it further.
 * It is therefore best-effort friction that raises the cost of scraping wrapped
 * key material for offline guessing — NOT a security guarantee and NOT a
 * defence against a determined distributed attacker. A durable, shared store
 * (or Vercel's edge WAF rate limiting) is required for a hard guarantee; that
 * is deliberately out of scope here.
 *
 * The clock is injectable so window expiry is testable without real timers.
 */

export interface RateLimitResult {
  allowed: boolean
  /** Requests still permitted in the current window (0 when blocked). */
  remaining: number
  /** Seconds until the current window ends; 0 when the request was allowed. */
  retryAfterSeconds: number
}

export interface FixedWindowRateLimiterOptions {
  /** Maximum allowed requests per key per window. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
  /** Injectable clock; defaults to Date.now. */
  now?: () => number
  /**
   * Soft cap on tracked keys. Exceeding it triggers a sweep of expired
   * entries, so the map cannot leak one entry per user for the life of the
   * instance.
   */
  maxKeys?: number
}

interface Window {
  start: number
  count: number
}

export class FixedWindowRateLimiter {
  private readonly limit: number
  private readonly windowMs: number
  private readonly now: () => number
  private readonly maxKeys: number
  private readonly windows = new Map<string, Window>()

  constructor(options: FixedWindowRateLimiterOptions) {
    if (!Number.isFinite(options.limit) || options.limit < 1) {
      throw new Error('FixedWindowRateLimiter: limit must be >= 1')
    }
    if (!Number.isFinite(options.windowMs) || options.windowMs < 1) {
      throw new Error('FixedWindowRateLimiter: windowMs must be >= 1')
    }
    this.limit = options.limit
    this.windowMs = options.windowMs
    this.now = options.now ?? Date.now
    this.maxKeys = options.maxKeys ?? 10_000
  }

  /** Number of keys currently tracked — exposed for eviction tests. */
  get size(): number {
    return this.windows.size
  }

  /**
   * Records an attempt for `key` and reports whether it is allowed. A blocked
   * attempt does NOT extend the window (no lockout amplification).
   */
  check(key: string): RateLimitResult {
    const now = this.now()
    const existing = this.windows.get(key)

    if (!existing || now - existing.start >= this.windowMs) {
      if (this.windows.size >= this.maxKeys) this.sweep(now)
      this.windows.set(key, { start: now, count: 1 })
      return { allowed: true, remaining: this.limit - 1, retryAfterSeconds: 0 }
    }

    if (existing.count >= this.limit) {
      const msLeft = existing.start + this.windowMs - now
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil(msLeft / 1000)) }
    }

    existing.count += 1
    return { allowed: true, remaining: this.limit - existing.count, retryAfterSeconds: 0 }
  }

  /** Clears every counter. Used by tests; also safe at runtime. */
  reset(): void {
    this.windows.clear()
  }

  private sweep(now: number): void {
    for (const [key, window] of this.windows) {
      if (now - window.start >= this.windowMs) this.windows.delete(key)
    }
  }
}
