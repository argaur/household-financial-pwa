import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import * as Sentry from '@sentry/node'
import { sql } from 'drizzle-orm'
import { db } from './lib/db'
import { computeHealth } from './lib/health'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    release: process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
    environment: process.env.VERCEL_ENV || 'development',
    tracesSampleRate: 0.1,
  })
}

export const config = {
  runtime: 'nodejs',
}

const app = new Hono().basePath('/api')

app.get('/health', async (c) => {
  const result = await computeHealth(() => db.execute(sql`select 1`), {
    npm_package_version: process.env.npm_package_version,
    commit_sha: process.env.VERCEL_GIT_COMMIT_SHA,
  })
  if (result.db === 'error') {
    Sentry.captureMessage('Health check: database ping failed')
  }
  return c.json(result)
})

app.onError((err, c) => {
  Sentry.captureException(err)
  return c.json({ status: 'error', message: err.message }, 500)
})

export default handle(app)
