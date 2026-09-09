import { encryptedFetch } from './encrypted-rows'
import type { AssetClass } from './allocation'

/**
 * The browser half of `/api/projection-settings` (server route from step E5,
 * `server/routes/projection-settings.ts`). This client is added in E7/E8 to
 * wire the horizon control and the editable rate rows.
 *
 * Rates and the horizon are plaintext by design (see the module doc on
 * `server/lib/projection-settings.ts`): a return ASSUMPTION says nothing
 * about what the household owns, so this file carries no vault, no
 * `sealRow`, no data key. It reuses `encryptedFetch` only for its
 * Authorization-header plumbing, same as every other bearer-token fetch in
 * this codebase.
 */

/**
 * `SPEC.md` G3: `horizonYears: number, 1..40`. The engine (`MAX_HORIZON_YEARS`
 * in `src/lib/projection/engine.ts`) and the server schema (1..100, see
 * `server/lib/projection-settings.ts`) both accept a wider range than this —
 * the UI range is the tighter one, and it is enforced here, at the control,
 * not by trusting either of those.
 */
export const MIN_HORIZON_YEARS_UI = 1
export const MAX_HORIZON_YEARS_UI = 40

/** Mirrors the numeric(5,2) ceiling in `server/lib/projection-settings.ts`. */
export const MAX_ANNUAL_RATE_PCT = 999.99
export const MIN_ANNUAL_RATE_PCT = -999.99

export interface ProjectionRateEntry {
  assetClass: AssetClass
  annualRatePct: number
}

export interface ProjectionSettings {
  ledgerId: string
  horizonYears: number | null
  rates: ProjectionRateEntry[]
}

export interface PutProjectionSettingsBody {
  ledgerId: string
  /** Omit to leave the ledger's horizon untouched; `null` clears it. */
  horizonYears?: number | null
  /**
   * The FULL desired set of overrides, not a patch — `putProjectionSettings`
   * on the server replaces every row for this ledger. An asset class left
   * out of this array is deleted server side even if it was overridden
   * before this call.
   */
  rates: ProjectionRateEntry[]
}

export class ProjectionSettingsApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ProjectionSettingsApiError'
  }
}

function fail(status: number, message: string): Error {
  return new ProjectionSettingsApiError(status, message)
}

export async function getProjectionSettings(token: string | null, ledgerId: string): Promise<ProjectionSettings> {
  const res = await encryptedFetch(`/api/projection-settings?ledgerId=${encodeURIComponent(ledgerId)}`, token, fail)
  return (await res.json()) as ProjectionSettings
}

export async function putProjectionSettings(token: string | null, body: PutProjectionSettingsBody): Promise<void> {
  await encryptedFetch('/api/projection-settings', token, fail, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
