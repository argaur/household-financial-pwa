import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

/**
 * Without this, `npm run db:migrate` and `npm run db:generate` fail with
 * "url: undefined" — drizzle-kit loads this config in its own process and does
 * not read `.env.local` on its own. `scripts/seed-instruments.ts` has always
 * done this; this file never did, which is why the documented migrate command
 * in `Documentation/deployment/RUNBOOK.md` had never successfully applied
 * anything. Found 2026-08-04, when migrations 0001 and 0002 turned out to have
 * been generated two days earlier and never to have reached Neon.
 */
config({ path: '.env.local' })

export default defineConfig({
  schema: './drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
