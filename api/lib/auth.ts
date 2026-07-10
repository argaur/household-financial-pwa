import type { Context } from 'hono'
import { getAuth } from '@hono/clerk-auth'

/**
 * The single place a Hono handler resolves "who is making this request."
 * Every household-scoped route must go through this — never trust a
 * client-supplied user or household ID.
 */
export function requireUserId(c: Context): string | null {
  const auth = getAuth(c)
  return auth?.userId ?? null
}
