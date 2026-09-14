import { VaultLockedError } from './encrypted-rows'

/**
 * What counts as a locked vault, in exactly one place.
 *
 * Every signed-in screen loads its data through a client that calls
 * `openVault()`, which throws {@link VaultLockedError} when this browser holds
 * no key for the household. That is not a load failure: the account is fine,
 * the rows are fine, and this browser simply has to be unlocked. Telling the
 * user to refresh is advice that cannot work.
 *
 * Dashboard, Portfolio and Profile all make that distinction, and before this
 * helper existed they made it three different ways (2026-09-13: two of them
 * did not make it at all, which is the bug that produced "even after
 * successful login I can't see my data on another device"). One function now
 * decides it, so a fourth screen cannot quietly disagree.
 */
export type LoadFailureState = 'locked' | 'error'

/** `'locked'` for a locked vault, `'error'` for everything else. */
export function classifyLoadFailure(err: unknown): LoadFailureState {
  return err instanceof VaultLockedError ? 'locked' : 'error'
}
