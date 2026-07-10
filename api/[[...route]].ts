import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import { sql } from 'drizzle-orm'
import { db } from './lib/db.js'
import { computeHealth } from './lib/health.js'

// hono/vercel's handler is a Web fetch-style function (Request -> Response),
// which requires the Edge runtime. Setting runtime: 'nodejs' silently drops
// the Response (Vercel logs "default export returned a Response" and the
// request hangs until timeout) — this bit us on the first Slice 0 deploy.
export const config = {
  runtime: 'edge',
}

// @sentry/node is not Edge-compatible; server-side error capture for API
// routes is deferred until a slice needs it (Slice 0's Sentry smoke test
// is satisfied client-side — see src/lib/sentry.ts + HomeShell.tsx).
const app = new Hono().basePath('/api')

app.get('/health', async (c) => {
  const result = await computeHealth(() => db.execute(sql`select 1`), {
    npm_package_version: process.env.npm_package_version,
    commit_sha: process.env.VERCEL_GIT_COMMIT_SHA,
  })
  return c.json(result)
})

app.onError((err, c) => {
  console.error(err)
  return c.json({ status: 'error', message: err.message }, 500)
})

export default handle(app)
