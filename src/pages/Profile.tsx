import { useEffect, useState } from 'react'
import { useAuth, useUser } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { ProtectionForm } from '@/components/protection-form'
import { MemberForm } from '@/components/member-form'
import { track } from '@/lib/analytics'
import { listFamilyMembers, removeFamilyMember, type FamilyMember } from '@/lib/family-members-api'
import { listProtection, type Protection } from '@/lib/protection-api'
import { fetchHousehold, updateHousehold, type Household } from '@/lib/household-api'
import { clearDashboardCache } from '@/lib/pwa-cache'

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

  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = await getToken()
        const [householdResult, membersResult, protectionResult] = await Promise.all([
          fetchHousehold(token),
          listFamilyMembers(token),
          listProtection(token),
        ])
        if (cancelled) return
        setHousehold(householdResult)
        setMembers(membersResult)
        setProtectionRecords(protectionResult)
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
    if (savingHouseholdName || householdNameDraft.trim().length === 0) return
    setSavingHouseholdName(true)
    setHouseholdNameError(null)
    try {
      const token = await getToken()
      const updated = await updateHousehold(token, householdNameDraft)
      setHousehold(updated)
      setEditingHouseholdName(false)
      track('feature_used', { feature_name: 'edit_household', action: 'rename_household' })
    } catch {
      setHouseholdNameError('Something went wrong — please try again.')
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

  async function handleSignOut() {
    track('feature_used', { feature_name: 'sign_out' })
    // Slice 8 — service-worker caches are origin-scoped, not user-scoped.
    // Without this, signing out and then going offline would still serve the
    // previous household's dashboard from the NetworkFirst cache on a shared
    // device. Multi-tenancy here is app-layer only, so the client has to
    // clean up after itself.
    await clearDashboardCache()
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
        "We couldn't delete your account. If this keeps happening, contact support — your data has not been changed.",
      )
      setDeletingAccount(false)
    }
  }

  const groupedByMember = members
    .map((member) => ({ member, memberRecords: protectionRecords.filter((p) => p.memberId === member.id) }))
    .filter((group) => group.memberRecords.length > 0)

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg py-12 space-y-6 pb-28">
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
                Term life cover is the foundation of a household financial plan — everything else builds on it.
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
