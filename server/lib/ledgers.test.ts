import { describe, it, expect } from 'vitest'
import { ledgers } from '../../drizzle/schema.js'
import { ensureBaselineLedger, getBaselineLedger, BASELINE_LEDGER_NAME } from './ledgers.js'

/**
 * `ensureBaselineLedger` is the single point that decides what "Current" means
 * for a household, and both the v1 holdings-create path and household creation
 * now depend on it. The behaviour worth pinning is not that it inserts a row —
 * it is that it inserts *at most one*, and only when the household has none.
 */

type LedgerRow = {
  id: string
  householdId: string
  name: string
  isBaseline: boolean
  origin: string
}

/**
 * Minimal stand-in for the Drizzle chain the function actually calls. It throws
 * on any table it does not model rather than falling through to a default —
 * a silent fall-through in the integration fakes is what made this change's
 * first failure hard to read, so this one refuses to guess.
 */
function fakeDb(seed: LedgerRow[] = []) {
  const rows = [...seed]
  let inserts = 0

  const db = {
    select: () => ({
      from: (table: unknown) => {
        if (table !== ledgers) throw new Error('fake db: unexpected table in select()')
        return {
          where: (_cond: unknown) => {
            const matching = rows.filter((r) => r.isBaseline)
            const result = Promise.resolve(matching) as Promise<LedgerRow[]> & {
              limit: (n: number) => Promise<LedgerRow[]>
            }
            result.limit = (n: number) => Promise.resolve(matching.slice(0, n))
            return result
          },
        }
      },
    }),
    insert: (table: unknown) => {
      if (table !== ledgers) throw new Error('fake db: unexpected table in insert()')
      return {
        values: (row: Record<string, unknown>) => ({
          returning: () => {
            inserts += 1
            const created: LedgerRow = {
              id: `ledger-${inserts}`,
              householdId: String(row.householdId),
              name: String(row.name),
              isBaseline: Boolean(row.isBaseline),
              origin: String(row.origin),
            }
            rows.push(created)
            return Promise.resolve([created])
          },
        }),
      }
    },
  }

  return { db: db as never, rows, insertCount: () => inserts }
}

const HOUSEHOLD = '11111111-1111-4111-8111-111111111111'

describe('ensureBaselineLedger', () => {
  it("creates the household's Current ledger when it has none", async () => {
    const { db, insertCount } = fakeDb()

    const ledger = await ensureBaselineLedger(db, HOUSEHOLD)

    expect(insertCount()).toBe(1)
    expect(ledger.householdId).toBe(HOUSEHOLD)
    expect(ledger.name).toBe(BASELINE_LEDGER_NAME)
    expect(ledger.isBaseline).toBe(true)
    // Only an AI-originated ledger counts against the D-017 AI plan cap, so the
    // baseline must never be minted as one.
    expect(ledger.origin).toBe('manual')
  })

  it('returns the existing baseline instead of creating a second one', async () => {
    const existing: LedgerRow = {
      id: 'ledger-existing',
      householdId: HOUSEHOLD,
      name: BASELINE_LEDGER_NAME,
      isBaseline: true,
      origin: 'manual',
    }
    const { db, insertCount } = fakeDb([existing])

    const ledger = await ensureBaselineLedger(db, HOUSEHOLD)

    expect(ledger.id).toBe('ledger-existing')
    expect(insertCount()).toBe(0)
  })

  it('is idempotent across repeated calls — one Current, never a duplicate', async () => {
    const { db, insertCount } = fakeDb()

    const first = await ensureBaselineLedger(db, HOUSEHOLD)
    const second = await ensureBaselineLedger(db, HOUSEHOLD)
    const third = await ensureBaselineLedger(db, HOUSEHOLD)

    expect(insertCount()).toBe(1)
    expect(second.id).toBe(first.id)
    expect(third.id).toBe(first.id)
  })
})

describe('getBaselineLedger', () => {
  it('returns null when the household has no baseline ledger', async () => {
    const { db } = fakeDb()
    expect(await getBaselineLedger(db, HOUSEHOLD)).toBeNull()
  })

  it('never writes — it is a read path', async () => {
    const { db, insertCount } = fakeDb()
    await getBaselineLedger(db, HOUSEHOLD)
    expect(insertCount()).toBe(0)
  })
})
