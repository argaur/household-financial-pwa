import { useEffect, useState } from 'react'
import { useAuth, useUser } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { ProtectionForm } from '@/components/protection-form'
import { MemberForm } from '@/components/member-form'
import { ChangePassphraseForm, ResetRecoveryCodeForm } from '@/components/credential-change-forms'
import { track } from '@/lib/analytics'
import { listFamilyMembers, removeFamilyMember, type FamilyMember } from '@/lib/family-members-api'
import { listProtection, type Protection } from '@/lib/protection-api'
import { fetchHousehold, updateHousehold, type Household } from '@/lib/household-api'
import { fetchHouseholdKeys, type HouseholdKeys } from '@/lib/household-keys-api'
import { listHoldings } from '@/lib/holdings-api'
import { buildHouseholdExport, serializeExport, exportFilename } from '@/lib/export'
import { triggerTextDownload } from '@/lib/download'
import * as Sentry from '@sentry/react'
import { clearDashboardCache } from '@/lib/pwa-cache'
import { clearVault } from '@/lib/crypto/key-store'

type State = 'loading' | 'loaded' | 'error'

const currency = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
function formatInr(value: string): string {
  return `₹${currency.format(Number(value))}`
}

const TYPE_LABELS: Record<Protection['type'], string> = {
  'term-life': 'Term life',
  health: 'Health',
  disability: 'Disability',
  other: 'Other',
}

const STATUS_LABELS: Record<Protection['status'], string> = {
  active: 'Active',
  lapsed: 'Lapsed',
  pending: 'Pending',
}

const RELATIONSHIP_LABELS: Record<FamilyMember['relationship'], string> = {
  self: 'Self',
  spouse: 'Spouse',
  child: 'Child',
  parent: 'Parent',
  other: 'Other',
}

/**
 * Profile screen — lives outside the locked 4-tab nav's tab set for now
 * (no bottom tab bar yet, same precedent as Explore/Portfolio). Slice 5
 * shipped the Protection card; Slice 9 extends this same file with
 * household/member editing, sign-out, and account deletion as sibling
 * cards — the Protection card below is untouched.
 */
export function Profile() {
  const { getToken, signOut } = useAuth()
  const { user } = useUser()
  const [state, setState] = useState<State>('loading')
  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [protectionRecords, setProtectionRecords] = useState<Protection[]>([])

  const [protectionSheetOpen, setProtectionSheetOpen] = useState(false)
  const [editingProtection, setEditingProtection] = useState<Protection | null>(null)

  const [editingHouseholdName, setEditingHouseholdName] = useState(false)
  const [householdNameDraft, setHouseholdNameDraft] = useState('')
  const [savingHouseholdName, setSavingHouseholdName] = useState(false)
  const [householdNameError, setHouseholdNameError] = useState<string | null>(null)

  const [memberSheetOpen, setMemberSheetOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null)
  const [removingMember, setRemovingMember] = useState<FamilyMember | null>(null)
  const [removingMemberBusy, setRemovingMemberBusy] = useState(false)

  const [householdKeys, setHouseholdKeys] = useState<HouseholdKeys | null>(null)
  const [passphraseSheetOpen, setPassphraseSheetOpen] = useState(false)
  const [recoverySheetOpen, setRecoverySheetOpen] = useState(false)

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportNotice, setExportNotice] = useState<string | null>(null)

  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = await getToken()
        const [householdResult, membersResult, protectionResult, keysResult] = await Promise.all([
          fetchHousehold(token),
          listFamilyMembers(token),
          listProtection(token),
          // Key material is the only one of the four that is allowed to fail
          // without failing the screen: the Security card simply does not
          // appear. Everything else on Profile still works without it.
          fetchHouseholdKeys(token).catch(() => null),
        ])
        if (cancelled) return
        setHousehold(householdResult.state === 'ok' ? householdResult.household : null)
        setMembers(membersResult.members)
        setProtectionRecords(protectionResult.protection)
        setHouseholdKeys(keysResult)
        setState('loaded')
      } catch {
        if (cancelled) return
        setState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [getToken])

  function handleProtectionSaved(record: Protection) {
    setProtectionRecords((prev) => {
      const exists = prev.some((p) => p.id === record.id)
      return exists ? prev.map((p) => (p.id === record.id ? record : p)) : [...prev, record]
    })
    setProtectionSheetOpen(false)
    setEditingProtection(null)
  }

  function openAddProtectionSheet() {
    setEditingProtection(null)
    setProtectionSheetOpen(true)
  }

  function openEditProtectionSheet(record: Protection) {
    setEditingProtection(record)
    setProtectionSheetOpen(true)
  }

  function startEditingHouseholdName() {
    setHouseholdNameDraft(household?.name ?? '')
    setHouseholdNameError(null)
    setEditingHouseholdName(true)
  }

  async function saveHouseholdName() {
    if (savingHouseholdName || householdNameDraft.trim().length === 0 || !household) return
    setSavingHouseholdName(true)
    setHouseholdNameError(null)
    try {
      const token = await getToken()
      const updated = await updateHousehold(token, householdNameDraft, household.version)
      setHousehold(updated)
      setEditingHouseholdName(false)
      track('feature_used', { feature_name: 'edit_household', action: 'rename_household' })
    } catch {
      setHouseholdNameError('Something went wrong. Please try again.')
      track('error_shown', { error_type: 'household_rename_failed', surface: 'profile', message: 'household_rename_failed' })
    } finally {
      setSavingHouseholdName(false)
    }
  }

  function openAddMemberSheet() {
    setEditingMember(null)
    setMemberSheetOpen(true)
  }

  function openEditMemberSheet(member: FamilyMember) {
    setEditingMember(member)
    setMemberSheetOpen(true)
  }

  function handleMemberSaved(member: FamilyMember) {
    setMembers((prev) => {
      const exists = prev.some((m) => m.id === member.id)
      return exists ? prev.map((m) => (m.id === member.id ? member : m)) : [...prev, member]
    })
    setMemberSheetOpen(false)
    setEditingMember(null)
  }

  async function confirmRemoveMember() {
    if (!removingMember || removingMemberBusy) return
    setRemovingMemberBusy(true)
    try {
      const token = await getToken()
      await removeFamilyMember(token, removingMember.id)
      const removedId = removingMember.id
      setMembers((prev) => prev.filter((m) => m.id !== removedId))
      // Removing a member cascades holdings/protection for that member at
      // the DB level (drizzle/schema.ts ON DELETE CASCADE) — drop any
      // protection rows we're still showing for them too, so the Protection
      // card doesn't show stale rows until next reload.
      setProtectionRecords((prev) => prev.filter((p) => p.memberId !== removedId))
      track('feature_used', { feature_name: 'edit_household', action: 'remove_member', member_id: removedId })
      setRemovingMember(null)
    } catch {
      track('error_shown', { error_type: 'remove_member_failed', surface: 'profile', message: 'remove_member_failed' })
    } finally {
      setRemovingMemberBusy(false)
    }
  }

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    setExportError(null)
    setExportNotice(null)
    try {
      const token = await getToken()
      // Fetched fresh rather than reusing page state: Profile does not hold
      // holdings at all, and a stale members list would silently produce an
      // incomplete backup — the one failure this feature cannot have.
      const [householdResult, membersResult, holdingsResult, protectionResult] = await Promise.all([
        fetchHousehold(token),
        listFamilyMembers(token),
        listHoldings(token),
        listProtection(token),
      ])

      const data = buildHouseholdExport({
        household: householdResult,
        members: membersResult,
        holdings: holdingsResult,
        protection: protectionResult,
        exportedAt: new Date(),
      })

      triggerTextDownload(exportFilename(new Date()), serializeExport(data))
      track('feature_used', { feature_name: 'data_export' })

      // Say it on screen as well as in the file. Someone who downloads a backup
      // and never opens it would otherwise never learn it was partial.
      setExportNotice(
        data.complete
          ? 'Downloaded. Keep it somewhere safe. It is readable by anyone who opens it.'
          : `Downloaded, but ${data.missing.total} record${data.missing.total === 1 ? '' : 's'} could not be read and ${data.missing.total === 1 ? 'is' : 'are'} not in the file.`,
      )
    } catch {
      setExportError('Could not build the download. Check your connection and try again.')
    } finally {
      setExporting(false)
    }
  }

  async function handleSignOut() {
    track('feature_used', { feature_name: 'sign_out' })
    // Slice 8 — service-worker caches are origin-scoped, not user-scoped.
    // Without this, signing out and then going offline would still serve the
    // previous household's dashboard from the NetworkFirst cache on a shared
    // device. Multi-tenancy here is app-layer only, so the client has to
    // clean up after itself.
    await clearDashboardCache()
    // D-014 — the cache above is the copy of the data; this is the thing that
    // opens it. `<SignedIn>` unmounting blanks the screen but leaves the data
    // key in IndexedDB, where it survives the tab, the browser restart and
    // every route change — the idle lock was its only other eviction path. On
    // the shared device the comment above is about, that means signing out and
    // back in reopens the household with no passphrase asked.
    //
    // Not fatal to the sign-out, deliberately. IndexedDB is unavailable in some
    // private-browsing modes and can reject on a corrupted store, and refusing
    // to sign out in that case removes no key while trapping someone in a
    // session they asked to leave. Reported rather than swallowed, because a
    // key that outlived its sign-out is exactly the kind of failure that must
    // not be silent.
    try {
      await clearVault()
    } catch (err) {
      Sentry.captureException(err, { tags: { area: 'signout_clear_vault' } })
      console.error('Sign-out could not clear the local key store; the vault may still be unlocked.', err)
    }
    // The cache above is the data and the vault is the key; these are the
    // labels that name the household. Left behind they keep a household id and
    // its health tier readable on a shared browser after sign-out. Swept by
    // prefix rather than by id, so a device that has held more than one
    // household does not keep the older one's marker forever.
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('dashboard:')) localStorage.removeItem(key)
    }
    await signOut()
  }

  async function confirmDeleteAccount() {
    if (deletingAccount || !user) return
    setDeletingAccount(true)
    setDeleteAccountError(null)
    try {
      track('feature_used', { feature_name: 'delete_account' })
      // Deleting the Clerk user (not just signing out) is what fires Clerk's
      // `user.deleted` webhook, which triggers the server-side hard-delete
      // cascade (server/routes/clerk-webhook.ts) — CLAUDE.md's "Data
      // retention" constraint. Clerk invalidates the session as part of
      // this, so no separate signOut() call is needed after it resolves.
      await user.delete()
    } catch {
      setDeleteAccountError(
        "We couldn't delete your account. If this keeps happening, contact support. Your data has not been changed.",
      )
      setDeletingAccount(false)
    }
  }

  const groupedByMember = members
    .map((member) => ({ member, memberRecords: protectionRecords.filter((p) => p.memberId === member.id) }))
    .filter((group) => group.memberRecords.length > 0)

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg md:max-w-2xl py-12 md:py-16 space-y-6 pb-28">
        <header className="space-y-1">
          <h1 className="font-display text-display">Your account</h1>
        </header>

        {/* Household card — Slice 9 */}
        <section className="rounded-lg border p-4 space-y-3">
          <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Your household</p>

          {state === 'loading' && <Skeleton className="h-10 w-full" />}

          {state === 'error' && (
            <p className="text-caption text-destructive">We couldn't load your household. Refresh to try again.</p>
          )}

          {state === 'loaded' && household && !editingHouseholdName && (
            <div className="flex items-center justify-between">
              <p className="text-body font-medium">{household.name}</p>
              <Button variant="ghost" size="sm" onClick={startEditingHouseholdName}>
                Edit
              </Button>
            </div>
          )}

          {state === 'loaded' && household && editingHouseholdName && (
            <div className="space-y-2">
              <Input
                value={householdNameDraft}
                onChange={(e) => setHouseholdNameDraft(e.target.value)}
                disabled={savingHouseholdName}
                autoFocus
              />
              {householdNameError && <p className="text-caption text-destructive">{householdNameError}</p>}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={saveHouseholdName}
                  disabled={savingHouseholdName || householdNameDraft.trim().length === 0}
                >
                  {savingHouseholdName ? 'Saving…' : 'Save changes'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingHouseholdName(false)}
                  disabled={savingHouseholdName}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Family members card — Slice 9 */}
        <section className="rounded-lg border p-4 space-y-4">
          <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Family members</p>

          {state === 'loading' && (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          )}

          {state === 'loaded' && (
            <div className="space-y-3">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <button type="button" onClick={() => openEditMemberSheet(member)} className="flex-1 text-left">
                    <p className="text-body font-medium">{member.name}</p>
                    <p className="text-caption text-muted-foreground">{RELATIONSHIP_LABELS[member.relationship]}</p>
                  </button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setRemovingMember(member)}>
                    Remove
                  </Button>
                </div>
              ))}
              <Button variant="ghost" onClick={openAddMemberSheet} className="px-0">
                Add a family member
              </Button>
            </div>
          )}
        </section>

        {/* Protection card — Slice 5. */}
        <section className="rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-title font-semibold">Protection</h2>
            {state === 'loaded' && (
              <Button variant="ghost" size="sm" onClick={openAddProtectionSheet}>
                Add
              </Button>
            )}
          </div>

          {state === 'loading' && (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {state === 'error' && (
            <p className="text-caption text-destructive">We couldn't load your protection cover. Refresh to try again.</p>
          )}

          {state === 'loaded' && protectionRecords.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
              <p className="text-body font-medium">No protection cover on record.</p>
              <p className="text-body text-muted-foreground">
                Term life cover is the foundation of a household financial plan. Everything else builds on it.
              </p>
              <Button variant="ghost" onClick={openAddProtectionSheet}>
                Add protection cover
              </Button>
            </div>
          )}

          {state === 'loaded' && protectionRecords.length > 0 && (
            <div className="space-y-4">
              {groupedByMember.map(({ member, memberRecords }) => (
                <div key={member.id} className="space-y-2">
                  <p className="text-body font-semibold">{member.name}</p>
                  {memberRecords.map((record) => (
                    <button
                      key={record.id}
                      type="button"
                      onClick={() => openEditProtectionSheet(record)}
                      className="w-full rounded-lg border p-3 text-left"
                    >
                      <p className="text-body font-medium">{TYPE_LABELS[record.type]}</p>
                      <p className="text-caption text-muted-foreground">
                        {formatInr(record.coverAmount)} cover · {STATUS_LABELS[record.status]}
                        {record.provider ? ` · ${record.provider}` : ''}
                      </p>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Security card — Slice 6b: passphrase change and recovery-code reset.
            Two separate actions in two separate sheets, on purpose: each one
            overwrites a wrapped copy that is one of only two ways back into
            this household's data, so they must never share a submit path. */}
        {state === 'loaded' && householdKeys && (
          <section className="rounded-lg border p-4 space-y-4">
            <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Security</p>
            <p className="text-body text-muted-foreground">
              Your passphrase and your recovery code each open the same key, here in your browser. Replacing one leaves
              the other working, and leaves everything you have recorded exactly as it is.
            </p>

            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full min-h-11 justify-start"
                onClick={() => setPassphraseSheetOpen(true)}
              >
                Change passphrase
              </Button>
              <Button
                variant="outline"
                className="w-full min-h-11 justify-start"
                onClick={() => setRecoverySheetOpen(true)}
              >
                Reset recovery code
              </Button>
            </div>
          </section>
        )}

        {/* Your data — D-014 step 10. Not a convenience feature: the server
            holds no key, so it cannot ever produce this file for you, and a
            forgotten passphrase is unrecoverable by design. This download is
            the only copy that survives losing the key. */}
        <section className="rounded-lg border p-4 space-y-4">
          <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Your data</p>
          <p className="text-body text-muted-foreground">
            Everything you have recorded, decrypted here in your browser and saved as a file. We cannot make this for
            you. The server has no key. If you forget your passphrase and your recovery code, this file is what is
            left.
          </p>
          <p className="text-body text-muted-foreground">
            It is plain, readable text. Anyone who opens it can read your numbers, so keep it somewhere you trust.
          </p>

          <Button
            variant="outline"
            className="w-full min-h-11 justify-start"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? 'Preparing your download…' : 'Download my data'}
          </Button>

          {exportNotice && (
            <p className="text-body" role="status">
              {exportNotice}
            </p>
          )}
          {exportError && (
            <p className="text-body text-destructive" role="alert">
              {exportError}
            </p>
          )}
        </section>

        {/* Account card — Slice 9: sign-out and delete-account */}
        <section className="rounded-lg border p-4 space-y-4">
          <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Account</p>
          {user?.primaryEmailAddress && <p className="text-body">{user.primaryEmailAddress.emailAddress}</p>}

          <div className="space-y-1">
            <button type="button" onClick={handleSignOut} className="block text-body text-destructive">
              Sign out
            </button>
            <button type="button" onClick={() => setDeleteAccountOpen(true)} className="block text-body text-destructive">
              Delete account
            </button>
          </div>
        </section>
      </div>

      <Sheet open={protectionSheetOpen} onOpenChange={setProtectionSheetOpen}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingProtection ? 'Update protection cover' : 'Add protection cover'}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <ProtectionForm
              members={members}
              initialProtection={editingProtection ?? undefined}
              submitLabel={editingProtection ? 'Save changes' : 'Add cover'}
              submittingLabel={editingProtection ? 'Saving…' : 'Adding…'}
              analyticsSurface="profile"
              onSaved={handleProtectionSaved}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={memberSheetOpen} onOpenChange={setMemberSheetOpen}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingMember ? 'Update family member' : 'Add a family member'}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <MemberForm
              initialMember={editingMember ?? undefined}
              submitLabel={editingMember ? 'Save changes' : 'Add to plan'}
              submittingLabel={editingMember ? 'Saving…' : 'Adding…'}
              analyticsSurface="profile"
              onSaved={handleMemberSaved}
            />
          </div>
        </SheetContent>
      </Sheet>

      {householdKeys && (
        <Sheet open={passphraseSheetOpen} onOpenChange={setPassphraseSheetOpen}>
          <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Change your passphrase</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <ChangePassphraseForm
                keys={householdKeys}
                onChanged={(updated) => {
                  setHouseholdKeys(updated)
                  setPassphraseSheetOpen(false)
                }}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {householdKeys && (
        <Sheet open={recoverySheetOpen} onOpenChange={setRecoverySheetOpen}>
          <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Reset your recovery code</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <ResetRecoveryCodeForm
                keys={householdKeys}
                onReset={(updated) => {
                  setHouseholdKeys(updated)
                  setRecoverySheetOpen(false)
                }}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

      <Dialog open={removingMember !== null} onOpenChange={(open) => !open && setRemovingMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removingMember?.name}?</DialogTitle>
            <DialogDescription>
              This will remove {removingMember?.name} and delete any holdings or protection cover recorded for them. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemovingMember(null)} disabled={removingMemberBusy}>
              Keep them
            </Button>
            <Button variant="destructive" onClick={confirmRemoveMember} disabled={removingMemberBusy}>
              {removingMemberBusy ? 'Removing…' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteAccountOpen} onOpenChange={(open) => !deletingAccount && setDeleteAccountOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This will permanently delete your household, family members, and all holdings. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteAccountError && <p className="text-caption text-destructive">{deleteAccountError}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteAccountOpen(false)} disabled={deletingAccount}>
              Keep my account
            </Button>
            <Button variant="destructive" onClick={confirmDeleteAccount} disabled={deletingAccount}>
              {deletingAccount ? 'Deleting…' : 'Yes, delete everything'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
