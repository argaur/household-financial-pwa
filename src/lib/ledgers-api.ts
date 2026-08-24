import { z } from 'zod'
import { isCryptoError } from './crypto'
import {
  decryptWireRow,
  decryptWireRows,
  encryptedFetch,
  newRowId,
  openVault,
  sealRow,
  type SealedEnvelope,
  type Vault,
  type WireEnvelope,
} from './encrypted-rows'
import { HOLDINGS_TABLE, holdingPayloadSchema, type Holding } from './holdings-api'

/**
 * The browser half of /api/ledgers — D-016 strategy ledgers, D-020 name
 * encryption.
 *
 * A ledger is a named container of holdings. "Current" is the baseline, the
 * record of what the household actually owns, and the invariant the feature
 * rests on is that Current never changes because another ledger exists.
 *
 * TWO THINGS ARE DIFFERENT HERE FROM THE OTHER API CLIENTS.
 *
 * 1. A ledger's `name` is sealed exactly like a holding's fields, EXCEPT for
 *    the one baseline row. "Current" is written server side by
 *    `ensureBaselineLedger` before the user has necessarily unlocked their
 *    vault, and it is not user data, so it alone travels as a plain `name`
 *    with no envelope. Every non-baseline ledger's name arrives as
 *    `{ ciphertext, iv, alg }` and this module decrypts it the same way
 *    `holdings-api.ts` decrypts a holding — a null `ciphertext` is the
 *    "not-yet-encrypted" outcome `decryptWireRow` already models, and here it
 *    means "this is the baseline row," not "this predates encryption."
 *
 * 2. The snapshot copy's crypto happens here and can happen nowhere else. The
 *    server holds no data key, and a row's ciphertext is bound by AAD to
 *    `{ tableName, householdId, rowId, version }` — so byte-copying a Current
 *    holding's ciphertext into a new row id yields a row that can NEVER be
 *    decrypted, by anyone, including its owner. {@link createLedgerFromCurrent}
 *    therefore mints a new row id per holding and re-encrypts the payload under
 *    that new id's AAD before anything crosses the wire.
 */

/**
 * Physical table name — part of the AAD every ledger name's ciphertext is
 * bound to. Mirrors `HOLDINGS_TABLE` in src/lib/holdings-api.ts.
 */
export const LEDGERS_TABLE = 'ledgers'

/** The version a freshly created row has once stored. The source row's version is irrelevant to the copy. */
const NEW_ROW_VERSION = 1

/** Mirrors MAX_LEDGER_HOLDINGS in server/lib/ledgers.ts. */
export const MAX_LEDGER_HOLDINGS = 200

/**
 * Mirrors the documented ceiling in server/lib/ledgers.ts, but this is now the
 * copy that actually enforces it — the server never sees a ledger name
 * plaintext, so it cannot check its length. `sealRow` cannot be asked to seal
 * an over-length name and reject it; this module's own validation is what
 * stands between a client bug and an oversized ciphertext.
 */
export const MAX_LEDGER_NAME_CHARS = 60

/** Mirrors `memberIdSchema` / `rowIdSchema` in server/lib/envelope.ts, which accept v4 UUIDs only. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const LEDGER_ORIGINS = ['manual', 'ai_suggestion'] as const
export type LedgerOrigin = (typeof LEDGER_ORIGINS)[number]

/** The one thing a ledger's envelope carries. */
const ledgerPayloadSchema = z.object({
  name: z.string().trim().min(1).max(MAX_LEDGER_NAME_CHARS),
})
type LedgerPayload = z.infer<typeof ledgerPayloadSchema>

/**
 * Exactly the columns server/routes/ledgers.ts serialises.
 *
 * `name` is `null` for every non-baseline ledger — its real value lives only
 * in `ciphertext`/`iv`/`alg` until decrypted. The baseline row is the reverse:
 * a plain `name` and a null envelope. A caller can tell the two apart by
 * whether `ciphertext` is null, exactly as any other encrypted table's caller
 * would.
 */
export interface Ledger {
  id: string
  householdId: string
  name: string | null
  ciphertext: string | null
  iv: string | null
  alg: string | null
  version: number
  isBaseline: boolean
  origin: LedgerOrigin
  /** The baseline this ledger was copied from, or `null` for a blank one. */
  snapshotOf: string | null
  createdAt: string
  updatedAt: string
}

interface LedgerWire extends WireEnvelope {
  name: string | null
  isBaseline: boolean
  origin: LedgerOrigin
  snapshotOf: string | null
}

interface LedgerListResponse {
  ledgers: LedgerWire[]
}
interface LedgerResponse {
  ledger: LedgerWire | null
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

/** A decrypted or baseline wire row, assembled back into a {@link Ledger}. */
function assemble(wire: LedgerWire, payload: LedgerPayload): Ledger {
  return { ...wire, name: payload.name }
}

/**
 * Decrypt every ledger's name, except the baseline row, which never carries a
 * ciphertext and keeps the plain `name` the server sent.
 *
 * An unreadable name (tampered ciphertext, wrong key) is dropped rather than
 * shown as `null` — a ledger whose name cannot be trusted is not one the UI
 * should present as if it were merely unnamed. This mirrors how
 * `listHoldings` handles an unreadable row, minus the count: with at most five
 * ledgers per household, a caller that needs one is better served fixing the
 * underlying key problem than acting on a count.
 */
async function decryptLedgers(dataKey: CryptoKey, wire: LedgerWire[]): Promise<Ledger[]> {
  const decrypted = await decryptWireRows(LEDGERS_TABLE, dataKey, wire, ledgerPayloadSchema, assemble)
  const ledgers: Ledger[] = []
  decrypted.outcomes.forEach((outcome, index) => {
    if (outcome.status === 'decrypted') ledgers.push(outcome.row)
    // The baseline row: no ciphertext by design, so `wire[index].name` is
    // already the plain, correct value.
    else if (outcome.status === 'not-yet-encrypted') ledgers.push({ ...wire[index] })
  })
  return ledgers
}

/** Decrypt the single row a create responds with, so a wrong-shaped write surfaces immediately. */
async function readBackLedger(dataKey: CryptoKey, wire: LedgerWire | null): Promise<Ledger> {
  if (!wire) throw new LedgersApiError(500, 'ledger_missing_in_response')
  const outcome = await decryptWireRow(LEDGERS_TABLE, dataKey, wire, ledgerPayloadSchema, assemble)
  // A freshly created non-baseline ledger always carries a ciphertext this
  // client just sealed — 'not-yet-encrypted' here would mean the server
  // dropped it, exactly the class of bug readBack in holdings-api.ts guards.
  if (outcome.status !== 'decrypted') throw new LedgersApiError(500, `ledger_${outcome.status}`)
  return outcome.row
}

export async function listLedgers(token: string | null): Promise<Ledger[]> {
  const vault = await openVault()
  const res = await encryptedFetch('/api/ledgers', token, fail)
  const body = (await res.json()) as LedgerListResponse
  return decryptLedgers(vault.dataKey, body.ledgers ?? [])
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
  const vault = await openVault()
  return postLedger(token, vault, name, 'blank', [])
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
  return postLedger(token, vault, name, 'copy', holdings)
}

/**
 * Seals `{ name }` under a freshly minted row id, then posts it alongside the
 * (already sealed, for a copy) holdings. `vault` is passed in rather than
 * opened here so `createLedgerFromCurrent` seals the name and the holdings
 * against the same unlocked vault rather than risking two separate reads of
 * it.
 */
async function postLedger(
  token: string | null,
  vault: Vault,
  name: string,
  source: 'blank' | 'copy',
  holdings: LedgerHoldingWrite[],
): Promise<Ledger> {
  const trimmed = name.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_LEDGER_NAME_CHARS) {
    throw new LedgersApiError(400, 'invalid_ledger_name')
  }

  const id = newRowId()
  const sealed = await sealRow(LEDGERS_TABLE, vault, id, NEW_ROW_VERSION, { name: trimmed })

  const res = await encryptedFetch('/api/ledgers', token, fail, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, source, holdings, ...sealed }),
  })
  const body = (await res.json()) as LedgerResponse
  return readBackLedger(vault.dataKey, body.ledger)
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
