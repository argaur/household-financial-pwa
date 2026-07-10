import { handle } from 'hono/vercel'
import { app } from '../server/app.js'

// hono/vercel's handler is a Web fetch-style function (Request -> Response),
// which requires the Edge runtime. Setting runtime: 'nodejs' silently drops
// the Response (Vercel logs "default export returned a Response" and the
// request hangs until timeout) — this bit us on the first Slice 0 deploy.
export const config = {
  runtime: 'edge',
}

export default handle(app)
