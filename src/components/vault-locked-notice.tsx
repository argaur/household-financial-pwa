/**
 * What a signed-in screen shows when this browser holds no household key.
 *
 * THE BUG THIS CLOSES (2026-09-13, reported from a second device): the vault
 * is per browser profile by design — the data key lives in IndexedDB as a
 * non-extractable `CryptoKey` and cannot travel with a Clerk session. Signing
 * in on a new phone is therefore supposed to land on `Unlock`, which re-derives
 * the key from the passphrase or the recovery code. `HouseholdGate` does route
 * there correctly.
 *
 * But only `/` goes through that gate. `/dashboard`, `/portfolio` and
 * `/profile` are mounted straight under `<SignedIn>`, and every encrypted API
 * client calls `openVault()`, which throws `VaultLockedError` when the vault
 * is locked. `Dashboard` branched on that error from the start. `Portfolio`
 * and `Profile` did not — their `catch` swallowed it into the generic `error`
 * state, so a new device that reached either screen (the masthead's "Holdings"
 * and "Profile" links do exactly that) got "We couldn't load your holdings.
 * Refresh to try again." Refreshing cannot help, because nothing is broken.
 * The account is fine, the data is fine, and the screen said neither.
 *
 * A locked vault is not an error and must not be worded as one. It is also not
 * a silent redirect: bouncing the user to `/` without a word is what made the
 * whole thing read as "this account is device specific". So the screen says
 * what happened, names the two things that open it, and links to the gate.
 *
 * The link is a plain `<a>`, not react-router's `<Link>`, on purpose: these
 * screens render outside a Router in their own tests, and a full load of `/`
 * is the correct behaviour anyway — it re-runs `resolveVaultState` from
 * scratch rather than trusting any state this locked screen still holds.
 */
/** The three signed-in screens that can be reached with a locked vault. */
export type VaultLockedSurface = 'dashboard' | 'portfolio' | 'profile'

/**
 * Whole headings, not a noun interpolated into a template: "holdings" and
 * "account" take different verbs, and a template that gets that wrong reads as
 * a bug on the one screen whose entire job is to say nothing is broken. Keyed
 * here rather than passed in, so all three screens cannot drift apart.
 */
const TITLES: Record<VaultLockedSurface, string> = {
  dashboard: 'Your plan is locked on this browser.',
  portfolio: 'Your holdings are locked on this browser.',
  profile: 'Your account is locked on this browser.',
}

export interface VaultLockedNoticeProps {
  /** Which screen the visitor was trying to reach. Picks the heading. */
  surface: VaultLockedSurface
}

export function VaultLockedNotice({ surface }: VaultLockedNoticeProps) {
  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg py-12 space-y-4">
        <h1 className="font-serif text-display">{TITLES[surface]}</h1>
        <p className="text-body text-muted-foreground">
          You are signed in, and nothing is missing. Your data is encrypted with a key that never leaves the browser
          you set it up in, so a new phone, a new browser, or cleared storage all start locked. This browser does not
          have that key yet.
        </p>
        <p className="text-body text-muted-foreground">
          Your passphrase opens it, and so does your recovery code. Either one works on any device, as often as you
          need.
        </p>
        <a
          href="/"
          className="inline-flex min-h-11 items-center text-body font-medium text-primary underline underline-offset-4"
        >
          Unlock your household
        </a>
      </div>
    </main>
  )
}
