export interface Instrument {
  id: string
  slug: string
  category: number
  name: string
  summary: string
  returns: string
  tax: string
  liquidity: string
  risk: string
  eligibility: string
  minInvestment: string
  rateValue: string | null
  rateAsOf: string | null
  // Projection-engine rate assumption (D-024 Chunk E). Distinct from
  // rateValue/rateAsOf above, which are the library display pair: the column
  // behind this one is assumed_rate_as_of, because rate_as_of was already
  // taken. Null for the 24 instruments with no defensible published rate,
  // which fall back to their asset-class default.
  //
  // Optional rather than required so that existing Instrument fixtures across
  // the component tests stay valid. The API always sends all three; a consumer
  // must handle absence the same way it handles null, which it must do anyway.
  assumedAnnualRatePct?: string | null
  rateSource?: string | null
  assumedRateAsOf?: string | null
  createdAt: string
}

interface InstrumentListResponse {
  instruments: Instrument[]
}

interface InstrumentResponse {
  instrument: Instrument
}

export class InstrumentsApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// Public read-only content — no auth token, unlike household/family-members-api.
async function publicFetch(path: string): Promise<Response> {
  const res = await fetch(path)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new InstrumentsApiError(res.status, body.error ?? res.statusText)
  }
  return res
}

export async function listInstruments(category?: number): Promise<Instrument[]> {
  const path = category ? `/api/instruments?category=${category}` : '/api/instruments'
  const res = await publicFetch(path)
  const body = (await res.json()) as InstrumentListResponse
  return body.instruments
}

export async function getInstrument(slug: string): Promise<Instrument> {
  // Query param, not a /:slug path segment — see server/routes/instruments.ts
  // for why (Vercel zero-config routing only matches single-segment /api/* paths).
  const res = await publicFetch(`/api/instruments?slug=${encodeURIComponent(slug)}`)
  const body = (await res.json()) as InstrumentResponse
  return body.instrument
}
