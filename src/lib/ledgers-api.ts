import { isCryptoError } from './crypto'
import { encryptedFetch, newRowId, openVault, sealRow, type SealedEnvelope, type Vault } from './encrypted-rows'
import { HOLDINGS_TABLE, holdingPayloadSchema, type Holding } from './holdings-api'

/**
 * The browser half of /api/ledgers — D-016 strategy ledgers.
 *
 * A ledger is a named container of holdings. "Current" is the baseline, the
 * record of what the household actually owns, and the invariant the feature
 * rests on is that Current never changes because another ledger exists.
 *
 * TWO THINGS ARE DIFFERENT HERE FROM THE OTHER API CLIENTS.
 *
 * 1. A ledger's `name` is a readable column by approved design (D-016). It is a
 *    label the user picked, not household financial data, so ledger metadata
 *    carries no envelope at all. Every *holding* a ledger carries is still
 *    sealed exactly as `holdings-api.ts` seals one.
 *
 * 2. The snapshot copy's crypto happens here and can happen nowhere else. The
 *    server holds no data key, and a row's ciphertext is bound by AAD to
 *    `{ tableName, householdId, rowId, version }` — so byte-copying a Current
 *    holding's ciphertext into a new row id yields a row that can NEVER be
 *    decrypted, by anyone, including its owner. {@link createLedgerFromCurrent}
 *    therefore mints a new row id per holding and re-encrypts the payload under
 *    that new id's AAD before anything crosses the wire.
 */

/** The version a freshly created row has once stored. The source row's version is irrelevant to the copy. */
const NEW_ROW_VERSION = 1

/** Mirrors MAX_LEDGER_HOLDINGS in server/lib/ledgers.ts. */
export const MAX_LEDGER_HOLDINGS = 200

/** Mirrors MAX_LEDGER_NAME_CHARS in server/lib/ledgers.ts. */
export const MAX_LEDGER_NAME_CHARS = 60

/** Mirrors `memberIdSchema` / `rowIdSchema` in server/lib/envelope.ts, which accept v4 UUIDs only. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const LEDGER_ORIGINS = ['manual', 'ai_suggestion'] as const
export type LedgerOrigin = (typeof LEDGER_ORIGINS)[number]

/** Exactly the columns server/routes/ledgers.ts serialises. No envelope: ledger metadata is readable. */
export interface Ledger {
  id: string
  householdId: string
  name: string
  isBaseline: boolean
  origin: LedgerOrigin
  /** The baseline this ledger was copied from, or `null` for a blank one. */
  snapshotOf: string | null
  createdAt: string
  updatedAt: string
}

interface LedgerListResponse {
  ledgers: Ledger[]
}
interface LedgerResponse {
  ledger: Ledger | null
}

/** One re-sealed holding as POST /api/ledgers accepts it: a new id, the same member, a fresh envelope. */
interface LedgerHoldingWrite extends SealedEnvelope {
  id: string
  memberId: string
}

export class LedgersApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'LedgersApiError'
  }
}

/**
 * The household already holds as many strategies as it may.
 *
 * Its own class so the UI can say "delete one first" rather than showing a
 * generic failure: the request was well-formed and the same request succeeds
 * unchanged once a ledger is removed.
 */
export class LedgerCapReachedError extends LedgersApiError {
  constructor(message = 'ledger_cap_reached') {
    super(409, message)
    this.name = 'LedgerCapReachedError'
  }
}

/** One source holding that could not be carried into the copy. Ids and codes only, never contents. */
export interface LedgerCopyFailure {
  /** The source row that failed, or `null` when the failure is about the set as a whole. */
  id: string | null
  reason: string
}

/**
 * The snapshot copy was abandoned before any network call.
 *
 * WHY THIS ABORTS RATHER THAN SKIPPING THE BAD ROW: a ledger the user believes
 * is a copy of what they own, but which is silently missing holdings, is the
 * worst outcome this feature can produce. They would compare a strategy against
 * an incomplete picture of their own finances with no way to tell. So a single
 * unreadable or unsealable source row means no ledger is created at all.
 */
export class LedgerCopyError extends Error {
  constructor(
    public readonly failures: LedgerCopyFailure[],
    public readonly sourceCount: number,
  ) {
    super(`ledger_copy_failed: ${failures.length} of ${sourceCount} source holdings could not be copied`)
    this.name = 'LedgerCopyError'
  }
}

/** 409 + `ledger_cap_reached` is the one error the UI branches on; everything else is generic. */
function fail(status: number, message: string): Error {
  if (status === 409 && message === 'ledger_cap_reached') return new LedgerCapReachedError(message)
  return new LedgersApiError(status, message)
}

/** A short, contents-free reason code for a row that could not be copied. */
function describeFailure(error: unknown): string {
  if (isCryptoError(error)) return error.code
  if (error instanceof Error && error.name === 'ZodError') return 'INVALID_PAYLOAD'
  if (error instanceof Error && error.message) return error.message
  return 'UNKNOWN'
}

export async function listLedgers(token: string | null): Promise<Ledger[]> {
  const res = await encryptedFetch('/api/ledgers', token, fail)
  const body = (await res.json()) as LedgerListResponse
  return body.ledgers ?? []
}

/**
 * Query param, not a /:id path segment — this project's zero-config Vercel
 * build only routes single-segment /api/* paths to the catch-all function, so a
 * second segment 404s at the platform level before Hono sees it.
 */
export async function deleteLedger(token: string | null, id: string): Promise<void> {
  await encryptedFetch(`/api/ledgers?id=${encodeURIComponent(id)}`, token, fail, { method: 'DELETE' })
}

export async function createBlankLedger(token: string | null, name: string): Promise<Ledger> {
  return postLedger(token, name, 'blank', [])
}

/**
 * Copy the household's Current holdings into a new ledger.
 *
 * `sourceHoldings` are the already-decrypted rows the caller is displaying;
 * they are not re-fetched here, so the copy is of exactly what the user was
 * looking at when they asked for it.
 *
 * Each holding is re-encrypted, never re-used: a NEW row id, the SAME payload,
 * the SAME memberId (a readable column that must keep pointing at the same
 * family member), and an AAD rebound to `{ holdings, householdId, newRowId, 1 }`.
 * The source row's id, iv, ciphertext and version are all discarded.
 *
 * Every row is sealed before the first byte is sent. If any one of them cannot
 * be sealed the whole operation throws {@link LedgerCopyError} and no request is
 * made — see that class for why a partial copy is unacceptable.
 */
export async function createLedgerFromCurrent(
  token: string | null,
  name: string,
  sourceHoldings: Holding[],
): Promise<Ledger> {
  const vault = await openVault()
  const holdings = await resealForCopy(vault, sourceHoldings)
  return postLedger(token, name, 'copy', holdings)
}

async function postLedger(
  token: string | null,
  name: string,
  source: 'blank' | 'copy',
  holdings: LedgerHoldingWrite[],
): Promise<Ledger> {
  const trimmed = name.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_LEDGER_NAME_CHARS) {
    throw new LedgersApiError(400, 'invalid_ledger_name')
  }

  const res = await encryptedFetch('/api/ledgers', token, fail, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: newRowId(), name: trimmed, source, holdings }),
  })
  const body = (await res.json()) as LedgerResponse
  if (!body.ledger) throw new LedgersApiError(500, 'ledger_missing_in_response')
  return body.ledger
}

/**
 * Re-seal every source holding, or throw having sealed none of them.
 *
 * `allSettled` rather than `all` on purpose: `all` rejects on the first failure
 * and the caller learns about one bad row when there may be several. Here every
 * row is attempted, and the error names all of them at once.
 */
async function resealForCopy(vault: Vault, source: Holding[]): Promise<LedgerHoldingWrite[]> {
  if (source.length > MAX_LEDGER_HOLDINGS) {
    throw new LedgerCopyError([{ id: null, reason: 'TOO_MANY_HOLDINGS' }], source.length)
  }

  const results = await Promise.allSettled(source.map((holding) => resealOne(vault, holding)))

  const failures: LedgerCopyFailure[] = []
  const rows: LedgerHoldingWrite[] = []
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') rows.push(result.value)
    else failures.push({ id: source[index]?.id ?? null, reason: describeFailure(result.reason) })
  })

  if (failures.length > 0) throw new LedgerCopyError(failures, source.length)
  return rows
}

async function resealOne(vault: Vault, source: Holding): Promise<LedgerHoldingWrite> {
  // The vault's household is what sealRow binds into the AAD. A source row from
  // some other household would be sealed under the wrong binding and land in the
  // wrong tenancy, so it is refused here rather than quietly rebound.
  if (source.householdId !== vault.householdId) {
    throw new Error('HOUSEHOLD_MISMATCH')
  }
  if (!UUID_PATTERN.test(source.memberId)) {
    throw new Error('INVALID_MEMBER_ID')
  }

  // Parsed, not spread: a row assembled by an older build of the app is
  // authentic and the wrong shape at the same time, and re-sealing it would
  // carry that wrongness into the copy under a fresh signature.
  const payload = holdingPayloadSchema.parse(source)

  const id = newRowId()
  const sealed = await sealRow(HOLDINGS_TABLE, vault, id, NEW_ROW_VERSION, payload)
  return { id, memberId: source.memberId, ...sealed }
}
