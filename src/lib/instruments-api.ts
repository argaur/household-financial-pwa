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
  const res = await publicFetch(`/api/instruments/${slug}`)
  const body = (await res.json()) as InstrumentResponse
  return body.instrument
}
