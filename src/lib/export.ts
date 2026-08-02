import type { Household, HouseholdRead } from './household-api'
import type { FamilyMember, FamilyMemberList } from './family-members-api'
import type { Holding, HoldingList } from './holdings-api'
import type { Protection, ProtectionList } from './protection-api'

/**
 * "Download my data" — decrypt in the browser and save a file.
 *
 * This is not a nice-to-have. D-014 rules out any server-side copy of the key,
 * so a lost passphrase destroys the household's data permanently and a
 * server-side export is impossible by construction. This file is the only copy
 * that survives losing the key.
 *
 * Which is exactly why it must be honest about what it does *not* contain. An
 * export that silently drops rows it could not decrypt reads as a complete
 * backup, and the moment anyone discovers otherwise is the moment the original
 * is already gone.
 */

/** Bumped only on a breaking change to the file's shape. */
export const EXPORT_FORMAT_VERSION = 1

export interface BuildExportInput {
  household: HouseholdRead
  members: FamilyMemberList
  holdings: HoldingList
  protection: ProtectionList
  exportedAt: Date
}

export interface ExportMissing {
  unreadable: {
    household: boolean
    familyMembers: number
    holdings: number
    protection: number
  }
  /** Rows the export could not include, in total. Zero means it is complete. */
  total: number
}

export interface ExportNotYetEncrypted {
  familyMembers: number
  holdings: number
  protection: number
}

export interface HouseholdExport {
  formatVersion: number
  exportedAt: string
  /** False when anything at all could not be decrypted. */
  complete: boolean
  missing: ExportMissing
  /**
   * Rows written before encryption existed. They are present in the export and
   * fully readable — this counts them so the file cannot imply everything it
   * carries was encrypted at rest.
   */
  notYetEncrypted: ExportNotYetEncrypted
  household: Pick<Household, 'id' | 'name' | 'createdAt' | 'updatedAt'> | null
  familyMembers: FamilyMember[]
  holdings: Holding[]
  protection: Protection[]
}

export function buildHouseholdExport(input: BuildExportInput): HouseholdExport {
  const householdUnreadable = input.household.state === 'unreadable'

  const unreadable = {
    household: householdUnreadable,
    familyMembers: input.members.unreadableCount,
    holdings: input.holdings.unreadableCount,
    protection: input.protection.unreadableCount,
  }

  const total =
    (householdUnreadable ? 1 : 0) +
    unreadable.familyMembers +
    unreadable.holdings +
    unreadable.protection

  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: input.exportedAt.toISOString(),
    complete: total === 0,
    missing: { unreadable, total },
    notYetEncrypted: {
      familyMembers: input.members.notYetEncryptedCount,
      holdings: input.holdings.notYetEncryptedCount,
      protection: input.protection.notYetEncryptedCount,
    },
    // `ownerUserId` and `version` are deliberately dropped: the first is a Clerk
    // identifier that means nothing outside this system, the second is a
    // concurrency token for a row this file is not going to write back.
    household:
      input.household.state === 'ok'
        ? {
            id: input.household.household.id,
            name: input.household.household.name,
            createdAt: input.household.household.createdAt,
            updatedAt: input.household.household.updatedAt,
          }
        : null,
    familyMembers: input.members.members,
    holdings: input.holdings.holdings,
    protection: input.protection.protection,
  }
}

/** Indented on purpose — a backup a human cannot read is a worse backup. */
export function serializeExport(data: HouseholdExport): string {
  return JSON.stringify(data, null, 2)
}

export function exportFilename(exportedAt: Date): string {
  const date = exportedAt.toISOString().slice(0, 10)
  return `household-financial-plan-${date}.json`
}
