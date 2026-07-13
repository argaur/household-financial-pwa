import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ProtectionForm } from '@/components/protection-form'
import { listFamilyMembers, type FamilyMember } from '@/lib/family-members-api'
import { listProtection, type Protection } from '@/lib/protection-api'

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

/**
 * Profile screen — lives outside the locked 4-tab nav's tab set for now
 * (no bottom tab bar yet, same precedent as Explore/Portfolio). Slice 5
 * ships only the Protection card; Slice 9 extends this same file with
 * household/member editing, sign-out, and account deletion. Each capability
 * on this page is its own card so later additions don't require restructuring
 * — keep new cards as siblings of the Protection card below.
 */
export function Profile() {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>('loading')
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [protectionRecords, setProtectionRecords] = useState<Protection[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingProtection, setEditingProtection] = useState<Protection | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = await getToken()
        const [membersResult, protectionResult] = await Promise.all([listFamilyMembers(token), listProtection(token)])
        if (cancelled) return
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

  function handleSaved(record: Protection) {
    setProtectionRecords((prev) => {
      const exists = prev.some((p) => p.id === record.id)
      return exists ? prev.map((p) => (p.id === record.id ? record : p)) : [...prev, record]
    })
    setSheetOpen(false)
    setEditingProtection(null)
  }

  function openAddSheet() {
    setEditingProtection(null)
    setSheetOpen(true)
  }

  function openEditSheet(record: Protection) {
    setEditingProtection(record)
    setSheetOpen(true)
  }

  const groupedByMember = members
    .map((member) => ({ member, memberRecords: protectionRecords.filter((p) => p.memberId === member.id) }))
    .filter((group) => group.memberRecords.length > 0)

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      <div className="container max-w-lg py-12 space-y-6 pb-28">
        <header className="space-y-1">
          <h1 className="font-display text-display">Profile</h1>
        </header>

        {/* Protection card — Slice 5. Additional cards (household/member
            editing, sign-out, account deletion) land here in Slice 9. */}
        <section className="rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-title font-semibold">Protection</h2>
            {state === 'loaded' && (
              <Button variant="ghost" size="sm" onClick={openAddSheet}>
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
              <Button variant="ghost" onClick={openAddSheet}>
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
                      onClick={() => openEditSheet(record)}
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
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
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
              onSaved={handleSaved}
            />
          </div>
        </SheetContent>
      </Sheet>
    </main>
  )
}
