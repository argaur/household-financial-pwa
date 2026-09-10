import { encryptedFetch } from './encrypted-rows'

/**
 * The browser half of `GET /api/ai-suggestions` (server route from step R5,
 * `server/routes/ai-suggestions.ts`). Usage counters only — how many AI
 * plans/reviews this household has left — so the consent step (A2) and the
 * suggestion-triggering UI (A3/A6/C3, not built yet) can compute a remaining
 * count before ever spending a call.
 *
 * No household data crosses this boundary: counters and one boolean, nothing
 * else, so this file carries no vault, no `sealRow`, no data key, same
 * reasoning as `projection-settings-api.ts`. It reuses `encryptedFetch` only
 * for its Authorization-header plumbing.
 */

export interface AiSuggestionsUsage {
  plansUsed: number
  plansCap: number
  editsUsed: number
  editsCap: number
  globalOpen: boolean
}

export class AiSuggestionsApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'AiSuggestionsApiError'
  }
}

function fail(status: number, message: string): Error {
  return new AiSuggestionsApiError(status, message)
}

export async function getAiSuggestionsUsage(token: string | null, ledgerId: string): Promise<AiSuggestionsUsage> {
  const res = await encryptedFetch(`/api/ai-suggestions?ledgerId=${encodeURIComponent(ledgerId)}`, token, fail)
  return (await res.json()) as AiSuggestionsUsage
}
