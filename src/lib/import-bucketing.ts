/**
 * D-025 step I7 — bucketing parsed import rows into four review buckets:
 * Ready, Needs attention, Possible duplicate, Skipped.
 *
 * State only, by design (SPEC.md §I4 "Review screen", D-025 decision 6).
 * Nothing in this module writes to a database or to localStorage,
 * sessionStorage, or IndexedDB — it only classifies rows the caller (I8, the
 * review screen, out of scope here) has already read from the uploaded
 * workbook. I12 later proves the absence of persistence; this module does
 * nothing that would make that proof false.
 *
 * Cell-level parsing (dates, amounts, the two India-specific traps) is I5's
 * job, `import-parser.ts`, reused here unchanged. Message wording is I6's
 * job, `import-validation-messages.ts`, reached only through I5's functions.
 * This module adds two things neither of those own: instrument identity
 * resolution, and possible-duplicate detection against the decrypted ledger.
 *
 * ---------------------------------------------------------------------------
 * THE SHARPEST RULE IN THIS STEP (D-025 decision 7, SPEC.md, both review
 * agents independently): fuzzy instrument matching may ONLY suggest a
 * candidate for explicit confirmation. It must NEVER auto-resolve. Auto-
 * resolving a fuzzy match silently files someone's money against the wrong
 * instrument — the same class of harm as I5's shorthand-amount rule: a wrong
 * guess about money is worse than a clear refusal.
 *
 * This is made structurally impossible, not just avoided by discipline:
 * `identifyInstrument`'s return type is a discriminated union whose `fuzzy`
 * and `none` branches carry no `instrumentId` field at all (see
 * `InstrumentMatch` below). There is no field to read a resolved id out of on
 * either branch, so a caller cannot wire a fuzzy suggestion into a holding
 * even by mistake — the compiler refuses it. `bucketOneRow` below only ever
 * builds a `resolved` payload (the thing I8/I11 would eventually seal and
 * commit) inside the `match.kind === 'exact'` branch.
 * ---------------------------------------------------------------------------
 */

import { parseAmountCell, parseDateCell, type CellValue, type ParseResult } from './import-parser'
import type { TemplateMember } from './import-template'
import type { Holding } from './holdings-api'
import type { Instrument } from './instruments-api'

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

/**
 * One data row, already read out of a member's sheet at the positions
 * `import-template.ts`'s `TEMPLATE_HEADERS` defines (asset class, a display
 * only column, is intentionally not carried here — nothing in this module
 * needs it). Reading the raw workbook into this shape is I8's job.
 */
export interface RawImportRow {
  member: TemplateMember
  /** 1-based position within the member's sheet, for messages and future reject exports (I9). */
  rowNumber: number
  slug: CellValue
  instrumentName: CellValue
  investedAmount: CellValue
  currentValue: CellValue
  units: CellValue
  monthlySip: CellValue
  startDate: CellValue
  maturityDate: CellValue
  nominee: CellValue
  emergencyFund: CellValue
  notes: CellValue
}

export interface BucketingInput {
  rows: RawImportRow[]
  /** The full instrument library — the same response the template was built from. */
  instruments: Instrument[]
  /**
   * Holdings already in the target ledger, DECRYPTED. Duplicate detection can
   * only run after the vault is unlocked, because that is the only place
   * both sides of the comparison exist in plaintext at once.
   */
  existingHoldings: Holding[]
}

// ---------------------------------------------------------------------------
// Instrument identity resolution — the structural guarantee lives here
// ---------------------------------------------------------------------------

/**
 * The three outcomes of trying to identify which library instrument a row
 * refers to. Only `exact` carries an `instrumentId`. `fuzzy` carries a
 * candidate to SHOW the user, never to file against. `none` carries nothing
 * resolvable at all.
 */
export type InstrumentMatch =
  | { kind: 'exact'; instrumentId: string; instrumentName: string; slug: string }
  | { kind: 'fuzzy'; suggestion: { slug: string; name: string } }
  | { kind: 'none' }

function normalizeText(raw: CellValue): string {
  if (typeof raw === 'string') return raw.trim()
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
  return ''
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Plain Levenshtein edit distance. No dependency, small inputs (instrument names), no need for anything fancier. */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  let prev = new Array<number>(n + 1)
  let curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j += 1) prev[j] = j

  for (let i = 1; i <= m; i += 1) {
    curr[0] = i
    for (let j = 1; j <= n; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + substitutionCost, // substitution
      )
    }
    const swap = prev
    prev = curr
    curr = swap
  }
  return prev[n]
}

/**
 * The closest instrument name within a conservative distance, or `null` if
 * nothing is close enough to be worth surfacing as a suggestion. Deliberately
 * conservative on two axes: very short names never fuzzy-match (too easy to
 * collide by accident), and the allowed distance scales down with name
 * length rather than using one fixed number, so a short name still needs a
 * near-exact hit while a long one tolerates a couple of typos.
 *
 * This function's result is ONLY ever placed into `InstrumentMatch`'s
 * `fuzzy` branch — see the module doc. It never returns an `instrumentId`.
 */
function findFuzzyCandidate(typedName: string, instruments: Instrument[]): Instrument | null {
  const normalizedTyped = normalizeName(typedName)
  if (normalizedTyped.length < 4) return null

  let best: { instrument: Instrument; distance: number } | null = null
  for (const instrument of instruments) {
    const distance = levenshteinDistance(normalizedTyped, normalizeName(instrument.name))
    if (best === null || distance < best.distance) {
      best = { instrument, distance }
    }
  }
  if (best === null || best.distance === 0) return null

  const threshold = Math.max(1, Math.floor(best.instrument.name.length * 0.2))
  return best.distance <= threshold ? best.instrument : null
}

/**
 * Resolves which library instrument a row refers to, in order: exact hidden
 * slug, then exact (case/whitespace-insensitive) instrument name, then a
 * fuzzy name suggestion, then nothing. The slug is checked first because it
 * is the hidden, machine-authored column the template ships with — the
 * display name is what a user is most likely to have edited.
 */
export function identifyInstrument(
  row: { slug: CellValue; instrumentName: CellValue },
  instruments: Instrument[],
): InstrumentMatch {
  const slug = normalizeText(row.slug)
  if (slug !== '') {
    const bySlug = instruments.find((instrument) => instrument.slug === slug)
    if (bySlug) {
      return { kind: 'exact', instrumentId: bySlug.id, instrumentName: bySlug.name, slug: bySlug.slug }
    }
  }

  const typedName = normalizeText(row.instrumentName)
  if (typedName !== '') {
    const byName = instruments.find((instrument) => normalizeName(instrument.name) === normalizeName(typedName))
    if (byName) {
      return { kind: 'exact', instrumentId: byName.id, instrumentName: byName.name, slug: byName.slug }
    }

    const candidate = findFuzzyCandidate(typedName, instruments)
    if (candidate) {
      return { kind: 'fuzzy', suggestion: { slug: candidate.slug, name: candidate.name } }
    }
  }

  return { kind: 'none' }
}

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

export type ImportBucket = 'ready' | 'needsAttention' | 'possibleDuplicate' | 'skipped'

/** The fields a Ready/Possible-duplicate row resolved to. Only ever built once identity and every cell are clean. */
export interface ResolvedRow {
  instrumentId: string
  instrumentName: string
  investedAmount: number
  currentValue: number
  units: number | null
  monthlySip: number | null
  startDate: string | null
  maturityDate: string | null
  nominee: string | null
  isEmergencyFund: boolean
  notes: string | null
}

export interface BucketedRow {
  bucket: ImportBucket
  member: TemplateMember
  rowNumber: number
  /** What to show as the row's instrument label, regardless of whether identity resolved. */
  instrumentLabel: string
  /** Plain-language reasons, I6-style: name the problem, never echo a cell value. Empty for Ready/Possible duplicate. */
  reasons: string[]
  /** Present only once identity, and every cell, are unambiguous. */
  resolved?: ResolvedRow
  /** Present only on a fuzzy match — a candidate to show the user, never auto-applied. */
  suggestedInstrument?: { slug: string; name: string }
}

export interface BucketedRows {
  ready: BucketedRow[]
  needsAttention: BucketedRow[]
  possibleDuplicate: BucketedRow[]
  skipped: BucketedRow[]
}

const COLUMN_LABELS = {
  investedAmount: 'Amount invested',
  currentValue: 'Current value',
  units: 'Units',
  monthlySip: 'Monthly SIP',
  startDate: 'Start date',
  maturityDate: 'Maturity date',
} as const

function isBlank(raw: CellValue): boolean {
  return normalizeText(raw) === ''
}

function parseBooleanCell(raw: CellValue): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw !== 0
  if (typeof raw === 'string') return /^(true|yes|y|1)$/i.test(raw.trim())
  return false
}

/**
 * The template prefills all 30 instruments per member; almost all of those
 * rows stay exactly as prefilled. A row nobody touched is not an error, it
 * is simply not part of the import — Skipped, silently, with a reason that
 * says so rather than something alarming.
 */
function isRowTouched(row: RawImportRow): boolean {
  return (
    !isBlank(row.investedAmount) ||
    !isBlank(row.currentValue) ||
    !isBlank(row.units) ||
    !isBlank(row.monthlySip) ||
    !isBlank(row.startDate) ||
    !isBlank(row.maturityDate) ||
    !isBlank(row.nominee) ||
    !isBlank(row.notes) ||
    parseBooleanCell(row.emergencyFund)
  )
}

/** A required amount: a parse failure or a blank cell both land in `reasons`, and the return value signals which. */
function requireAmount(result: ParseResult<number | null>, label: string, reasons: string[]): number | null {
  if (!result.ok) {
    reasons.push(result.message)
    return null
  }
  if (result.value === null) {
    reasons.push(`${label} is required.`)
    return null
  }
  return result.value
}

/** An optional amount: a parse failure lands in `reasons`; a blank cell is fine and comes back `null`. */
function optionalAmount(result: ParseResult<number | null>, reasons: string[]): number | null {
  if (!result.ok) {
    reasons.push(result.message)
    return null
  }
  return result.value
}

function optionalDate(result: ParseResult<string | null>, reasons: string[]): string | null {
  if (!result.ok) {
    reasons.push(result.message)
    return null
  }
  return result.value
}

function bucketOneRow(row: RawImportRow, instruments: Instrument[], existingHoldings: Holding[]): BucketedRow {
  const instrumentLabel = normalizeText(row.instrumentName) || normalizeText(row.slug) || '(blank)'

  if (!isRowTouched(row)) {
    return {
      bucket: 'skipped',
      member: row.member,
      rowNumber: row.rowNumber,
      instrumentLabel,
      reasons: ['Row left blank in the template.'],
    }
  }

  const match = identifyInstrument(row, instruments)

  if (match.kind === 'none') {
    return {
      bucket: 'skipped',
      member: row.member,
      rowNumber: row.rowNumber,
      instrumentLabel,
      reasons: ['Instrument is not in the library. Use one of the prefilled rows instead of typing a new one.'],
    }
  }

  const reasons: string[] = []

  const investedAmount = requireAmount(
    parseAmountCell(row.investedAmount, COLUMN_LABELS.investedAmount),
    COLUMN_LABELS.investedAmount,
    reasons,
  )
  const currentValue = requireAmount(
    parseAmountCell(row.currentValue, COLUMN_LABELS.currentValue),
    COLUMN_LABELS.currentValue,
    reasons,
  )
  const units = optionalAmount(parseAmountCell(row.units, COLUMN_LABELS.units), reasons)
  const monthlySip = optionalAmount(parseAmountCell(row.monthlySip, COLUMN_LABELS.monthlySip), reasons)
  const startDate = optionalDate(parseDateCell(row.startDate, COLUMN_LABELS.startDate), reasons)
  const maturityDate = optionalDate(parseDateCell(row.maturityDate, COLUMN_LABELS.maturityDate), reasons)

  // The fuzzy-match confirmation prompt. Never resolves anything -- see the
  // module doc. `match.suggestion` only exists on this branch, so there is
  // nothing here to wire into `resolved` even by mistake.
  if (match.kind === 'fuzzy') {
    reasons.push(
      `Instrument name doesn't exactly match the library. Did you mean "${match.suggestion.name}"? Use the library's prefilled row for that instrument to confirm.`,
    )
  }

  if (reasons.length === 0 && match.kind === 'exact' && investedAmount !== null && currentValue !== null) {
    const resolved: ResolvedRow = {
      instrumentId: match.instrumentId,
      instrumentName: match.instrumentName,
      investedAmount,
      currentValue,
      units,
      monthlySip,
      startDate,
      maturityDate,
      nominee: isBlank(row.nominee) ? null : normalizeText(row.nominee),
      isEmergencyFund: parseBooleanCell(row.emergencyFund),
      notes: isBlank(row.notes) ? null : normalizeText(row.notes),
    }

    // Possible duplicate = the target ledger already holds a decrypted
    // holding for the SAME instrument AND the SAME member. Amounts are
    // deliberately not part of the comparison: two holdings of the same
    // fund for the same person are still worth flagging for a human look
    // even when the numbers differ (a top-up, a correction, a genuine
    // second lot are all indistinguishable from a duplicate entry by amount
    // alone) -- conservative means "ask", not "guess it's fine because the
    // numbers don't match".
    const isDuplicate = existingHoldings.some(
      (holding) => holding.instrumentId === match.instrumentId && holding.memberId === row.member.id,
    )

    return {
      bucket: isDuplicate ? 'possibleDuplicate' : 'ready',
      member: row.member,
      rowNumber: row.rowNumber,
      instrumentLabel: match.instrumentName,
      reasons: [],
      resolved,
    }
  }

  return {
    bucket: 'needsAttention',
    member: row.member,
    rowNumber: row.rowNumber,
    instrumentLabel,
    reasons,
    suggestedInstrument: match.kind === 'fuzzy' ? match.suggestion : undefined,
  }
}

/** Classifies every row into exactly one of the four buckets. Pure — no I/O, no storage, state only. */
export function bucketImportRows(input: BucketingInput): BucketedRows {
  const result: BucketedRows = { ready: [], needsAttention: [], possibleDuplicate: [], skipped: [] }
  for (const row of input.rows) {
    const bucketed = bucketOneRow(row, input.instruments, input.existingHoldings)
    result[bucketed.bucket].push(bucketed)
  }
  return result
}
