import { createRemoteJWKSet, jwtVerify } from 'jose'

/**
 * Manual Clerk session-token verification via jose (pure Web Crypto), instead
 * of @hono/clerk-auth / @clerk/backend. Those pull in a Node-specific `#crypto`
 * internal import that Vercel's Edge Function bundler cannot statically
 * resolve — it rejects the deploy with "referencing unsupported modules:
 * @clerk: #crypto" even though the package declares a valid edge-light
 * condition (a Vercel-side bundler limitation, reproduced with every recent
 * @clerk/backend version). jose has no such dependency and is the verification
 * approach Clerk itself documents for constrained/edge runtimes.
 */

function clerkFrontendApiHost(publishableKey: string): string {
  // atob (Web API), not Buffer (Node global, unavailable on Edge runtime).
  const encoded = publishableKey.replace(/^pk_(test|live)_/, '')
  return atob(encoded).replace(/\$$/, '')
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

function getJwks() {
  if (jwks) return jwks
  const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY
  if (!publishableKey) throw new Error('VITE_CLERK_PUBLISHABLE_KEY is not set')
  const host = clerkFrontendApiHost(publishableKey)
  jwks = createRemoteJWKSet(new URL(`https://${host}/.well-known/jwks.json`))
  return jwks
}

export async function verifyUserId(authorizationHeader: string | undefined | null): Promise<string | null> {
  const token = authorizationHeader?.match(/^Bearer\s+(.+)$/)?.[1]
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, getJwks())
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}
