import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { verifySvixSignature } from '../lib/svix.js'
import { deleteHouseholdForOwner } from '../lib/account-deletion.js'

/**
 * Mounted at a FLAT single path segment (/api/clerk-webhook), not
 * /api/webhooks/clerk — this project's Vercel zero-config build only routes
 * single-path-segment /api/* requests to the api/[[...route]].ts catch-all
 * function; any second segment 404s at the platform level before reaching
 * Hono (documented in CLAUDE.md / PROGRESS.md's Slice 3 entry, verified
 * again for this route via `vercel build` + `.vercel/output/config.json`).
 *
 * This is a Clerk-server-to-server webhook, not a user-session route: it is
 * NOT gated by verifyUserId()/JWT — Clerk itself is the caller, authenticated
 * via a Svix HMAC signature over the raw body (see server/lib/svix.ts). An
 * unverified payload is never trusted for this destructive cascade-delete.
 */
export const clerkWebhookRoutes = new Hono()

interface ClerkUserDeletedEvent {
  type: string
  data: { id?: string }
}

clerkWebhookRoutes.post('/', async (c) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET
  if (!secret) {
    // Misconfiguration, not a client error — surfaces as 500 so it's loud in
    // logs/Sentry rather than silently no-oping on every delete.
    console.error('CLERK_WEBHOOK_SECRET is not set — cannot verify webhook signature')
    return c.json({ error: 'webhook_not_configured' }, 500)
  }

  const rawBody = await c.req.text()
  const verified = await verifySvixSignature(
    rawBody,
    {
      svixId: c.req.header('svix-id') ?? null,
      svixTimestamp: c.req.header('svix-timestamp') ?? null,
      svixSignature: c.req.header('svix-signature') ?? null,
    },
    secret,
  )
  if (!verified) return c.json({ error: 'invalid_signature' }, 401)

  const event = JSON.parse(rawBody) as ClerkUserDeletedEvent

  if (event.type !== 'user.deleted') {
    // Other Clerk event types may be sent to the same endpoint in future
    // (Clerk webhooks are typically configured per-endpoint, not per-event) —
    // acknowledge with 200 so Clerk doesn't retry, do nothing else.
    return c.json({ ok: true, ignored: event.type })
  }

  const clerkUserId = event.data.id
  if (!clerkUserId) return c.json({ error: 'missing_user_id' }, 400)

  const deleted = await deleteHouseholdForOwner(db, clerkUserId)
  return c.json({ ok: true, deleted })
})
