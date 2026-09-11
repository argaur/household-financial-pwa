/**
 * D-025 step I11 — the commit path. Seals every Ready row from the bulk
 * import review screen (I8) and posts them in one call to `POST
 * /api/holdings-batch` (I10).
 *
 * CROSS-PATH PARITY is the point of this module, not a side effect of it:
 * `toHoldingPayload` below builds exactly the same `HoldingPayload` shape
 * `toPayload` in `holdings-api.ts` builds for a hand-entered holding, and
 * every row is sealed with the same `sealRow(HOLDINGS_TABLE, vault, id, 1,
 * payload)` call `createHolding` makes — same table constant, same AAD
 * shape (`{ tableName, householdId, rowId, version }`), same starting
 * version. `import-commit.test.ts` proves the two paths agree at the level
 * of the decrypted payload, not just the wire shape a bug could satisfy by
 * accident.
 *
 * State discipline matches `import-bucketing.ts` (I7): this module reads
 * nothing from and writes nothing to localStorage, sessionStorage or
 * IndexedDB other than the vault read every encrypted API client already
 * makes. It holds parsed rows in memory only for the span of one call, the
 * same span I12 will prove nothing survives past.
 *
 * `holdings-batch.ts`'s error bodies deliberately mix conventions: success
 * and 409 answer with a `status` key, 400/403 answer with an `error` key
 * (see that file's header doc). `encryptedFetch` in `encrypted-rows.ts`
 * only ever reads `error`, so reusing it here would silently turn a 409
 * `ledger_full` into the generic HTTP status text. This module therefore
 * does its own fetch, reading whichever key the status code actually uses.
 *
 * An empty Ready set is not special-cased into a client-side no-op. The
 * review screen (I8) already disables its commit CTA at zero Ready rows, so
 * in ordinary use this module is never called with none — but if it is,
 * the request still goes to the server, which answers 400 `invalid_batch`
 * (`.min(1)` on the batch schema), and that error propagates exactly like
 * any other rejection. Suppressing the call and reporting success would
 * hide a real contract disagreement rather than surface it.
 */

import type { BucketedRow, BucketedRows, ResolvedRow } from './import-bucketing'
import type { Instrument } from './instruments-api'
import { LIBRARY_SECTIONS } from './library-sections'
import { HOLDINGS_TABLE, type AssetClass, type HoldingPayload } from './holdings-api'
import { newRowId, openVault, sealRow, type SealedEnvelope } from './encrypted-rows'
import { track } from './analytics'

export interface CommitImportInput {
  token: string | null
  /** Every row this batch writes into. Never carried per element — see `holdings-batch.ts`. */
  ledgerId: string
  /** The Ready bucket's rows, exactly as `ImportReviewScreen`'s `onCommit` hands them back. */
  readyRows: BucketedRow[]
  /** The same instrument library the rows were bucketed against, needed to resolve each row's asset class. */
  instruments: Instrument[]
}

export interface CommitImportResult {
  inserted: number
}

export class ImportCommitError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ImportCommitError'
  }
}

/** One sealed row exactly as `memberScopedCreateSchema` (server/lib/envelope.ts) accepts it. */
interface HoldingsBatchWireRow extends SealedEnvelope {
  id: string
  memberId: string
}

/**
 * A row's asset class is not on `ResolvedRow` (I7 never resolved one — it
 * only resolves instrument identity), so it is looked up here from the same
 * instrument library the row was bucketed against, via the same
 * category -> asset class mapping the template builder uses
 * (`import-template.ts`'s `assetClassLabel`, `library-sections.ts`'s
 * `LIBRARY_SECTIONS`). A row that reached Ready already has a real
 * `instrumentId` resolved by `identifyInstrument`, so this can only fail if
 * the instrument list handed in here is not the one the row was bucketed
 * against — a caller bug, reported loudly rather than guessed past.
 */
function assetClassForInstrument(instrumentId: string, instruments: Instrument[]): AssetClass {
  const instrument = instruments.find((candidate) => candidate.id === instrumentId)
  if (!instrument) throw new ImportCommitError(500, 'instrument_not_found')
  const section = LIBRARY_SECTIONS.find((candidate) => candidate.category === instrument.category)
  if (!section) throw new ImportCommitError(500, 'asset_class_not_found')
  return section.assetClass
}

/**
 * A parsed amount, as `ResolvedRow` carries it, in the same string form a
 * hand-typed form field would submit for the same value — `holdingPayloadSchema`
 * (and the database column behind it) take every amount as a string.
 */
function amountToString(value: number): string {
  return String(value)
}

/**
 * Exactly the `HoldingPayload` shape `toPayload` in `holdings-api.ts` builds,
 * field for field — see the module doc on cross-path parity.
 */
function toHoldingPayload(resolved: ResolvedRow, assetClass: AssetClass): HoldingPayload {
  return {
    instrumentId: resolved.instrumentId,
    assetClass,
    investedAmount: amountToString(resolved.investedAmount),
    currentValue: amountToString(resolved.currentValue),
    units: resolved.units === null ? null : amountToString(resolved.units),
    monthlySip: resolved.monthlySip === null ? null : amountToString(resolved.monthlySip),
    startDate: resolved.startDate,
    maturityDate: resolved.maturityDate,
    nominee: resolved.nominee,
    isEmergencyFund: resolved.isEmergencyFund,
    notes: resolved.notes,
  }
}

/** Seal one Ready row, exactly as `createHolding` seals a hand-entered one. */
async function sealReadyRow(
  vault: Awaited<ReturnType<typeof openVault>>,
  row: BucketedRow,
  instruments: Instrument[],
): Promise<HoldingsBatchWireRow> {
  // Structural guarantee, not a defensive filter: every row this module is
  // handed is asserted Ready before it is sealed, so a row missing its
  // `resolved` payload here is a caller contract violation, never a row
  // this module quietly drops.
  if (!row.resolved) throw new ImportCommitError(500, 'unresolved_row_in_commit')

  const assetClass = assetClassForInstrument(row.resolved.instrumentId, instruments)
  const payload = toHoldingPayload(row.resolved, assetClass)
  const id = newRowId()
  const sealed = await sealRow(HOLDINGS_TABLE, vault, id, 1, payload)
  return { id, memberId: row.member.id, ...sealed }
}

/**
 * `POST /api/holdings-batch` with whichever error-body key the status code
 * actually uses — see the module doc for why `encryptedFetch` is not reused
 * here.
 */
async function postBatch(
  token: string | null,
  ledgerId: string,
  holdings: HoldingsBatchWireRow[],
): Promise<CommitImportResult> {
  const res = await fetch('/api/holdings-batch', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ ledgerId, holdings }),
  })

  if (res.status === 201) {
    const body = (await res.json()) as { status: 'ok'; inserted: number }
    return { inserted: body.inserted }
  }

  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as { status?: string } | null
    throw new ImportCommitError(409, body?.status ?? 'ledger_full')
  }

  const body = (await res.json().catch(() => null)) as { error?: string } | null
  throw new ImportCommitError(res.status, body?.error ?? res.statusText)
}

/**
 * Seal every Ready row and commit them in one batch call.
 *
 * Every row is sealed before the first byte is sent, same discipline as
 * `resealForCopy` in `ledgers-api.ts` — a row that fails to seal aborts the
 * whole commit rather than silently shrinking the batch the user was shown.
 */
export async function commitImportBatch(input: CommitImportInput): Promise<CommitImportResult> {
  const vault = await openVault()
  const holdings = await Promise.all(
    input.readyRows.map((row) => sealReadyRow(vault, row, input.instruments)),
  )
  return postBatch(input.token, input.ledgerId, holdings)
}

/**
 * D-025 step I14 — fires `bulk_import_completed` (METRICS_PLAN.md D-016
 * table, feature 7 row) with row COUNTS only: `rows_clean` is the Ready
 * bucket actually committed, `rows_rejected` is everything that did not make
 * it (Needs attention + Possible duplicate + Skipped). Never a member name,
 * an amount, an instrument or a nominee — see METRICS_PLAN.md's
 * property-discipline note.
 *
 * Deliberately NOT called from `commitImportBatch` above.
 * `import-telemetry-scrubbing.test.ts` (I13) pins that the full
 * parse/review/rejects/commit flow fires zero analytics events today; that
 * pin is not weakened here. This function is the seam a future host calls
 * once, after `commitImportBatch` resolves successfully, with the same
 * `BucketedRows` the review screen (I8) was rendered from.
 */
export function trackImportCompleted(buckets: BucketedRows): void {
  const rowsClean = buckets.ready.length
  const rowsRejected = buckets.needsAttention.length + buckets.possibleDuplicate.length + buckets.skipped.length
  track('bulk_import_completed', { rows_clean: rowsClean, rows_rejected: rowsRejected })
}
