import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAiSuggestionsUsage, AiSuggestionsApiError } from './ai-suggestions-api'
import { jsonResponse } from '@/test/encrypted-fixtures'

function calls() {
  return vi.mocked(fetch).mock.calls as unknown as Array<[unknown, RequestInit | undefined]>
}

describe('ai-suggestions-api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('requests the single-segment route with ledgerId as a query param', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ plansUsed: 1, plansCap: 3, editsUsed: 0, editsCap: 5, globalOpen: true }),
    )
    await getAiSuggestionsUsage('token', 'ledger-1')
    expect(calls()[0][0]).toBe('/api/ai-suggestions?ledgerId=ledger-1')
  })

  it('attaches the bearer token', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ plansUsed: 1, plansCap: 3, editsUsed: 0, editsCap: 5, globalOpen: true }),
    )
    await getAiSuggestionsUsage('abc123', 'ledger-1')
    expect((calls()[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer abc123')
  })

  it('returns the five usage fields unchanged', async () => {
    const usage = { plansUsed: 2, plansCap: 3, editsUsed: 4, editsCap: 5, globalOpen: false }
    vi.mocked(fetch).mockResolvedValue(jsonResponse(usage))
    await expect(getAiSuggestionsUsage('token', 'ledger-1')).resolves.toEqual(usage)
  })

  it('throws AiSuggestionsApiError with the server error code on failure', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'forbidden' }, 403))
    await expect(getAiSuggestionsUsage('token', 'ledger-1')).rejects.toBeInstanceOf(AiSuggestionsApiError)
    await expect(getAiSuggestionsUsage('token', 'ledger-1')).rejects.toMatchObject({ status: 403 })
  })
})
