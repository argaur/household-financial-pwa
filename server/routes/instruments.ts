import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { listInstruments, getInstrumentBySlug } from '../lib/instruments.js'

// Public, read-only, no auth — instruments are shared library content
// (DATA_MODEL.md: "no write routes exposed for them"), unlike every other
// route module which resolves a household from the Clerk session first.
//
// Everything hangs off the single '/' route with query params (?slug=,
// ?category=) rather than a '/:slug' path segment. This project's Vercel
// zero-config build (framework: vite, not Next.js) generates a routes
// manifest that only matches a single path segment under /api/ to the
// catch-all function — anything with a second segment (e.g. /api/
// instruments/foo) hits a hardcoded 404 rule Vercel itself generates,
// confirmed via `vercel build`'s .vercel/output/config.json. Query params
// sidestep this platform limitation entirely.
export const instrumentsRoutes = new Hono()

instrumentsRoutes.get('/', async (c) => {
  const slug = c.req.query('slug')
  if (slug !== undefined) {
    const item = await getInstrumentBySlug(db, slug)
    if (!item) return c.json({ error: 'not_found' }, 404)
    return c.json({ instrument: item })
  }

  const categoryParam = c.req.query('category')
  if (categoryParam !== undefined) {
    const category = Number(categoryParam)
    if (!Number.isInteger(category) || category < 1 || category > 6) {
      return c.json({ error: 'invalid_category' }, 400)
    }
    const items = await listInstruments(db, category)
    return c.json({ instruments: items })
  }

  const items = await listInstruments(db)
  return c.json({ instruments: items })
})
