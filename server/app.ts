import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { sql } from 'drizzle-orm'
import { db } from './lib/db.js'
import { computeHealth } from './lib/health.js'
import { householdRoutes } from './routes/household.js'
import { householdKeysRoutes } from './routes/household-keys.js'
import { familyMembersRoutes } from './routes/family-members.js'
import { instrumentsRoutes } from './routes/instruments.js'
import { holdingsRoutes } from './routes/holdings.js'
import { protectionRoutes } from './routes/protection.js'
import { dashboardRoutes } from './routes/dashboard.js'
import { clerkWebhookRoutes } from './routes/clerk-webhook.js'

// @sentry/node is not Edge-compatible; server-side error capture for API
// routes is deferred until a slice needs it (Slice 0's Sentry smoke test
// is satisfied client-side — see src/lib/sentry.ts + HomeShell.tsx).
export const app = new Hono().basePath('/api')

// Defence in depth, not the primary auth boundary: the SPA and /api/* are
// same-origin in production (both served from finance.gauravg.dev, and from
// household-financial-pwa.vercel.app, which is retained as a redirect origin
// so links published before the 2026-08 domain move keep working),
// and every route below is bearer-JWT authenticated against Clerk's JWKS
// (server/lib/auth.ts) — there's no cookie/ambient-authority path for CORS to
// protect. This just stops a browser page on another origin from using a
// user's session token against this API cross-site.
//
// No Vercel preview-deployment wildcard: preview URLs are per-deploy
// (household-financial-pwa-<hash>-argaurs-projects.vercel.app) and Clerk's
// Preview environment keys/CLERK_WEBHOOK_SECRET aren't configured yet (see
// CLAUDE.md "Known gaps") — a preview build's API calls would fail on auth
// before CORS ever mattered. Add the preview pattern here if/when Preview
// env vars are wired up.
//
// vite.config.ts pins the dev server to port 3000 (no default-port
// assumption); Vite's own preview server (`vite preview`) defaults to 4173,
// included since it's used to smoke-test production builds locally.
app.use(
  '/*',
  cors({
    origin: [
      'https://finance.gauravg.dev',
      'https://household-financial-pwa.vercel.app',
      'http://localhost:3000',
      'http://localhost:4173',
    ],
  }),
)

app.get('/health', async (c) => {
  const result = await computeHealth(() => db.execute(sql`select 1`), {
    npm_package_version: process.env.npm_package_version,
    commit_sha: process.env.VERCEL_GIT_COMMIT_SHA,
  })
  return c.json(result)
})

app.route('/household', householdRoutes)
// Single path segment — see server/routes/household-keys.ts for why.
app.route('/household-keys', householdKeysRoutes)
app.route('/family-members', familyMembersRoutes)
app.route('/instruments', instrumentsRoutes)
app.route('/holdings', holdingsRoutes)
app.route('/protection', protectionRoutes)
app.route('/dashboard', dashboardRoutes)
app.route('/clerk-webhook', clerkWebhookRoutes)

app.onError((err, c) => {
  console.error(err)
  return c.json({ status: 'error', message: err.message }, 500)
})
