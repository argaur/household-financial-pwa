import { useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { NewLedgerModal } from '@/components/new-ledger-modal'
import { track } from '@/lib/analytics'
import { deleteLedger, type Ledger } from '@/lib/ledgers-api'
import type { Holding } from '@/lib/holdings-api'
import { cn } from '@/lib/utils'

/**
 * Documentation/design/DATA_MODEL.md's ledgers table: "Up to four additional
 * ledgers per household (D-018 §2 cap, a fixed constant enforced at the API
 * layer, not the DB)." The API layer's constant isn't exported from
 * src/lib/ledgers-api.ts (that file only exports the per-ledger holding cap
 * and the name-length cap), so this is the one place the UI's copy of the
 * 4-ledger cap lives.
 */
export const MAX_NON_BASELINE_LEDGERS = 4

interface LedgerTabStripProps {
  ledgers: Ledger[]
  activeLedgerId: string
  onSelect: (ledgerId: string) => void
  /** Current's already-decrypted holdings, passed through to the create modal for the copy option. */
  sourceHoldings: Holding[]
  /** Rows Current failed to decrypt — disables the copy option in the create modal. */
  unreadableCount: number
  onLedgerCreated: (ledger: Ledger) => void
  onLedgerDeleted: (ledgerId: string) => void
}

/**
 * `Current | <ledger names> | + New`. Chunk 2 only mounts and wires create/
 * delete — selecting a tab does not yet change the dashboard (Chunk 3), so
 * `onSelect` fires but no `ledger_switched` telemetry is sent here.
 */
export function LedgerTabStrip({
  ledgers,
  activeLedgerId,
  onSelect,
  sourceHoldings,
  unreadableCount,
  onLedgerCreated,
  onLedgerDeleted,
}: LedgerTabStripProps) {
  const { getToken } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const baseline = ledgers.find((l) => l.isBaseline)
  const others = ledgers.filter((l) => !l.isBaseline)
  const atCap = others.length >= MAX_NON_BASELINE_LEDGERS

  function handleNewClick() {
    if (atCap) {
      track('ledger_cap_reached', {})
      return
    }
    setModalOpen(true)
  }

  function handleCreated(ledger: Ledger) {
    onLedgerCreated(ledger)
    setModalOpen(false)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    setDeleteError(null)
    try {
      const token = await getToken()
      await deleteLedger(token, id)
      track('ledger_deleted', {})
      onLedgerDeleted(id)
    } catch {
      setDeleteError("Couldn't delete that ledger. Please try again.")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-2">
      <div data-testid="ledger-tab-scroll" className="w-full overflow-x-auto">
        <div className="flex w-max items-center gap-2 py-1">
          <div role="tablist" aria-label="Ledgers" className="flex items-center gap-2">
            {baseline && (
              <Tab ledger={baseline} active={activeLedgerId === baseline.id} onSelect={onSelect} canDelete={false} />
            )}
            {others.map((ledger) => (
              <Tab
                key={ledger.id}
                ledger={ledger}
                active={activeLedgerId === ledger.id}
                onSelect={onSelect}
                canDelete
                deleting={deletingId === ledger.id}
                onDelete={handleDelete}
              />
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('shrink-0', atCap && 'opacity-50')}
            aria-disabled={atCap}
            title={atCap ? `You've reached the ${MAX_NON_BASELINE_LEDGERS}-ledger limit for this household.` : undefined}
            onClick={handleNewClick}
          >
            + New
          </Button>
        </div>
      </div>

      {atCap && (
        <p className="text-caption text-muted-foreground">
          You've reached the {MAX_NON_BASELINE_LEDGERS}-ledger limit for this household. Delete one to create another.
        </p>
      )}
      {deleteError && <p className="text-caption text-destructive">{deleteError}</p>}

      <NewLedgerModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        sourceHoldings={sourceHoldings}
        unreadableCount={unreadableCount}
        onCreated={handleCreated}
      />
    </div>
  )
}

interface TabProps {
  ledger: Ledger
  active: boolean
  onSelect: (ledgerId: string) => void
  canDelete: boolean
  deleting?: boolean
  onDelete?: (id: string) => void
}

function Tab({ ledger, active, onSelect, canDelete, deleting, onDelete }: TabProps) {
  // `name` is `string | null` on the type — a decrypted or baseline ledger
  // always has one by the time it reaches this component (an unreadable name
  // is dropped in src/lib/ledgers-api.ts, never handed over as null), but this
  // still degrades to a label rather than rendering nothing if that ever
  // changes.
  const label = ledger.name ?? 'Untitled ledger'
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-full border pl-1 pr-1',
        active ? 'border-primary bg-primary/10' : 'border-input bg-background',
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => onSelect(ledger.id)}
        className={cn(
          'h-11 min-w-11 rounded-full px-4 text-sm font-medium transition-colors',
          active ? 'text-primary' : 'text-foreground hover:bg-accent hover:text-accent-foreground',
        )}
      >
        {label}
      </button>
      {canDelete && (
        <button
          type="button"
          aria-label={`Delete ${label}`}
          disabled={deleting}
          onClick={(e) => {
            e.stopPropagation()
            onDelete?.(ledger.id)
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-50"
        >
          {deleting ? '…' : '×'}
        </button>
      )}
    </div>
  )
}
