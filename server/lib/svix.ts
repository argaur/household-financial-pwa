/**
 * Manual Svix webhook signature verification via Web Crypto (crypto.subtle),
 * instead of the `svix` npm package. Same rationale as server/lib/auth.ts's
 * choice of `jose` over `@clerk/backend`: this route runs on the Vercel Edge
 * runtime (see api/[[...route]].ts's `runtime: 'edge'` config, required
 * because hono/vercel's handler needs the Web fetch API), and this project
 * has already hit one confirmed Edge-bundler incompatibility with a
 * Node-crypto-dependent package (@clerk/backend's `#crypto` import). Rather
 * than risk a second untested one, this reimplements Svix's documented
 * verification scheme (https://docs.svix.com/receiving/verifying-payloads/how-manual)
 * with only Web Crypto + atob/btoa, which are confirmed edge-safe (jose uses
 * the same primitives).
 *
 * Scheme: signedContent = `${svixId}.${svixTimestamp}.${body}`, HMAC-SHA256
 * over that with the base64-decoded secret (after stripping the `whsec_`
 * prefix), base64-encoded, compared against any `v1,<sig>` entry in the
 * space-separated svix-signature header.
 */

export interface SvixHeaders {
  svixId: string | null
  svixTimestamp: string | null
  svixSignature: string | null
}

// Reject webhooks whose timestamp is further than this from "now" — bounds
// replay-attack exposure. Svix's own guidance uses 5 minutes.
const TOLERANCE_SECONDS = 5 * 60

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: ArrayBuffer): string {
  let binary = ''
  const view = new Uint8Array(bytes)
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i])
  return btoa(binary)
}

async function hmacSha256Base64(secretBytes: Uint8Array, content: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(content))
  return bytesToBase64(signature)
}

/**
 * Verifies a webhook payload against Svix's signature headers. `secret` is
 * the raw `whsec_...` string as issued by the Clerk dashboard (never trust
 * an unverified payload for the destructive cascade-delete this gates).
 */
export async function verifySvixSignature(body: string, headers: SvixHeaders, secret: string): Promise<boolean> {
  const { svixId, svixTimestamp, svixSignature } = headers
  if (!svixId || !svixTimestamp || !svixSignature) return false

  const timestampSeconds = Number(svixTimestamp)
  if (!Number.isFinite(timestampSeconds)) return false
  const nowSeconds = Date.now() / 1000
  if (Math.abs(nowSeconds - timestampSeconds) > TOLERANCE_SECONDS) return false

  const secretBytes = base64ToBytes(secret.replace(/^whsec_/, ''))
  const signedContent = `${svixId}.${svixTimestamp}.${body}`
  const expected = await hmacSha256Base64(secretBytes, signedContent)

  const candidates = svixSignature
    .split(' ')
    .map((entry) => entry.split(',')[1])
    .filter((sig): sig is string => Boolean(sig))

  return candidates.some((candidate) => timingSafeEqual(candidate, expected))
}

// String equality without early-exit timing leakage — signature comparisons
// should never use plain `===`.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
