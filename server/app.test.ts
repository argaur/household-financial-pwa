import { describe, it, expect, vi } from 'vitest'

// app.ts imports lib/db.js at module load (for the /health route), which
// throws if DATABASE_URL isn't set — mock it out the same way the
// integration tests do, since these CORS tests never touch the DB.
vi.mock('./lib/db.js', () => ({
  db: { execute: () => Promise.resolve() },
}))

const { app } = await import('./app.js')

// CORS is defence-in-depth, not the primary auth boundary — the API is
// same-origin (Vercel serves the SPA and /api/* from the same domain) and
// every non-webhook route is bearer-JWT authenticated (server/lib/auth.ts).
// These tests just prove the allowlist behaves: allowed origins get the
// headers, unlisted origins don't, and the Clerk webhook (a server-to-server
// call with no browser Origin) is never blocked by it.
describe('CORS', () => {
  it('reflects Access-Control-Allow-Origin for the production origin', async () => {
    const res = await app.request('/api/health', {
      headers: { Origin: 'https://household-financial-pwa.vercel.app' },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://household-financial-pwa.vercel.app')
  })

  it('reflects Access-Control-Allow-Origin for the localhost dev origin', async () => {
    const res = await app.request('/api/health', {
      headers: { Origin: 'http://localhost:3000' },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000')
  })

  it('does not set Access-Control-Allow-Origin for an unlisted origin', async () => {
    const res = await app.request('/api/health', {
      headers: { Origin: 'https://evil.example.com' },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('does not set Access-Control-Allow-Origin when no Origin header is sent (server-to-server)', async () => {
    const res = await app.request('/api/health')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('leaves the Clerk webhook reachable from an unlisted/absent origin', async () => {
    // No CLERK_WEBHOOK_SECRET is set in the test env, so this hits the
    // "misconfigured" 500 branch rather than 404/blocked — proving the
    // request reached clerk-webhook.ts's handler at all, which is what
    // matters here: CORS middleware must not intercept or 403 this path.
    const res = await app.request('/api/clerk-webhook', {
      method: 'POST',
      headers: { Origin: 'https://evil.example.com', 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'user.deleted', data: { id: 'user_1' } }),
    })
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('webhook_not_configured')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
