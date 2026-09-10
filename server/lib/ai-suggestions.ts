import { eq } from 'drizzle-orm'
import { aiGlobalUsage } from '../../drizzle/schema.js'
import { MAX_AI_PLANS_PER_HOUSEHOLD, MAX_AI_EDITS_PER_LEDGER, aiUsagePeriod } from './ai-counters.js'
import type { Household } from './household.js'
import type { Ledger } from './ledgers.js'
import type { db as Db } from './db.js'

/**
 * GET /api/ai-suggestions — D-024/D-025 AI import, step R5.
 *
 * The read side of the cap system: usage counters only, so the dashboard can
 * render a cap-exhausted state without firing a speculative POST (the proxy
 * itself is Chunk A and does not exist yet). No household data crosses this
 * boundary — counters, caps and one boolean, nothing else.
 */

export interface AiSuggestionsUsage {
  plansUsed: number
  plansCap: number
  editsUsed: number
  editsCap: number
  globalOpen: boolean
}

type ReadDb = Pick<typeof Db, 'select'>

/**
 * Reads the three D-024 counters for one household/ledger pair, plus the
 * current month's global-breaker state.
 *
 * `household` and `ledger` are rows the caller already resolved (and, for the
 * ledger, ownership-checked) — this never re-derives tenancy, matching
 * `getProjectionSettings`'s contract in `server/lib/projection-settings.ts`.
 *
 * `ai_global_usage` gets its row lazily, on the first call of a month, by
 * `server/lib/ai-counters.ts`'s `consumeGlobal`. This function only ever
 * reads, so a month with no row yet is read as `globalOpen: true` — zero
 * calls made, not a tripped breaker. Getting this backwards would report the
 * feature as unavailable at the start of every month until the first call
 * happened to create the row.
 */
export async function getAiSuggestionsUsage(
  db: ReadDb,
  household: Household,
  ledger: Ledger,
  now: () => Date = () => new Date(),
): Promise<AiSuggestionsUsage> {
  const period = aiUsagePeriod(now())
  const rows = await db.select().from(aiGlobalUsage).where(eq(aiGlobalUsage.period, period)).limit(1)
  const row = rows[0]
  const globalOpen = row ? row.callsUsed < row.capCalls : true

  return {
    plansUsed: household.aiPlansCreated,
    plansCap: MAX_AI_PLANS_PER_HOUSEHOLD,
    editsUsed: ledger.aiEditsUsed,
    editsCap: MAX_AI_EDITS_PER_LEDGER,
    globalOpen,
  }
}
