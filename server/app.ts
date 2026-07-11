import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { db } from './lib/db.js'
import { computeHealth } from './lib/health.js'
import { householdRoutes } from './routes/household.js'
import { familyMembersRoutes } from './routes/family-members.js'
import { instrumentsRoutes } from './routes/instruments.js'

// @sentry/node is not Edge-compatible; server-side error capture for API
// routes is deferred until a slice needs it (Slice 0's Sentry smoke test
// is satisfied client-side — see src/lib/sentry.ts + HomeShell.tsx).
export const app = new Hono().basePath('/api')

app.get('/health', async (c) => {
  const result = await computeHealth(() => db.execute(sql`select 1`), {
    npm_package_version: process.env.npm_package_version,
    commit_sha: process.env.VERCEL_GIT_COMMIT_SHA,
  })
  return c.json(result)
})

app.route('/household', householdRoutes)
app.route('/family-members', familyMembersRoutes)
app.route('/instruments', instrumentsRoutes)

app.onError((err, c) => {
  console.error(err)
  return c.json({ status: 'error', message: err.message }, 500)
})
