import { LedgerCapReachedError, LedgerCopyError } from './ledgers-api'

/**
 * The one place a failed ledger create is turned into a sentence.
 *
 * It lives here rather than inside `new-ledger-modal.tsx` because a ledger is
 * now created from two places: the manual "+ New ledger" modal, and M3c's
 * Apply on an AI suggestion (`src/pages/Portfolio.tsx`). The 4-ledger cap is
 * the same cap in both, reached the same way and cleared the same way, so a
 * user must not meet two different explanations of it depending on which
 * button they pressed. `LedgerCapReachedError` is raised by `ledgers-api.ts`'s
 * own `fail()` on a 409 `ledger_cap_reached`; this function is the only
 * consumer of it that speaks.
 */
export function describeCreateError(err: unknown): string {
  if (err instanceof LedgerCapReachedError) {
    return 'You already have 4 ledgers, the most this household can hold. Delete one to create another.'
  }
  if (err instanceof LedgerCopyError) {
    return 'The copy could not be made, so nothing was changed. Try again, or start empty instead.'
  }
  return 'Something went wrong. Please try again.'
}
