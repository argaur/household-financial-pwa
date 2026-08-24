import { pgTable, uuid, text, boolean, numeric, integer, timestamp, date, jsonb, uniqueIndex, index, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

/**
 * Schema source of truth: Documentation/design/DATA_MODEL.md.
 * Keep in sync — any field change here must be reflected there and vice versa.
 */

export const households = pgTable('households', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerUserId: text('owner_user_id').notNull(),
  name: text('name'),
  ciphertext: text('ciphertext'),
  iv: text('iv'),
  alg: text('alg'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  ownerUserIdIdx: uniqueIndex('households_owner_user_id_idx').on(t.ownerUserId),
}))

export const relationshipEnum = ['self', 'spouse', 'child', 'parent', 'other'] as const
export const riskProfileEnum = ['conservative', 'moderate', 'aggressive'] as const

export const familyMembers = pgTable('family_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  name: text('name'),
  relationship: text('relationship', { enum: relationshipEnum }),
  dateOfBirth: date('date_of_birth'),
  riskProfile: text('risk_profile', { enum: riskProfileEnum }),
  ciphertext: text('ciphertext'),
  iv: text('iv'),
  alg: text('alg'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  householdIdIdx: index('family_members_household_id_idx').on(t.householdId),
}))

export const instruments = pgTable('instruments', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull(),
  category: integer('category').notNull(), // 1=Equity 2=Debt 3=Gold 4=Hybrid/Guaranteed 5=Real Estate 6=Alternative
  name: text('name').notNull(),
  summary: text('summary').notNull(),
  returns: text('returns').notNull(),
  tax: text('tax').notNull(),
  liquidity: text('liquidity').notNull(),
  risk: text('risk').notNull(),
  eligibility: text('eligibility').notNull(),
  minInvestment: text('min_investment').notNull(),
  rateValue: numeric('rate_value'),
  rateAsOf: date('rate_as_of'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  slugIdx: uniqueIndex('instruments_slug_idx').on(t.slug),
}))

export const assetClassEnum = ['equity', 'debt', 'gold', 'hybrid', 'real-estate', 'alternative'] as const

export const ledgerOriginEnum = ['manual', 'ai_suggestion'] as const

export const ledgers = pgTable('ledgers', {
  id: uuid('id').defaultRandom().primaryKey(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  isBaseline: boolean('is_baseline').notNull().default(false),
  origin: text('origin', { enum: ledgerOriginEnum }).notNull().default('manual'),
  aiEditsUsed: integer('ai_edits_used').notNull().default(0),
  snapshotOf: uuid('snapshot_of').references((): AnyPgColumn => ledgers.id),
  projectionHorizonYears: integer('projection_horizon_years'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  householdIdIdx: index('ledgers_household_id_idx').on(t.householdId),
  householdBaselineIdx: uniqueIndex('ledgers_household_baseline_idx').on(t.householdId).where(sql`${t.isBaseline}`),
}))

export const holdings = pgTable('holdings', {
  id: uuid('id').defaultRandom().primaryKey(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').notNull().references(() => familyMembers.id, { onDelete: 'cascade' }),
  instrumentId: uuid('instrument_id').references(() => instruments.id),
  // NOT NULL since migration 0004, which ran only after 0003 added the column
  // nullable and scripts/backfill-ledgers.mjs proved every existing row had been
  // pointed at its household's baseline ledger. Additive -> backfill -> cutover,
  // in that order: adding this constraint in 0003 would have failed outright on
  // any database holding real rows.
  ledgerId: uuid('ledger_id').notNull().references(() => ledgers.id, { onDelete: 'cascade' }),
  assetClass: text('asset_class', { enum: assetClassEnum }),
  investedAmount: numeric('invested_amount'),
  currentValue: numeric('current_value'),
  units: numeric('units'),
  monthlySip: numeric('monthly_sip'),
  startDate: date('start_date'),
  maturityDate: date('maturity_date'),
  nominee: text('nominee'),
  priceSource: text('price_source').notNull().default('manual'),
  isEmergencyFund: boolean('is_emergency_fund').notNull().default(false),
  notes: text('notes'),
  ciphertext: text('ciphertext'),
  iv: text('iv'),
  alg: text('alg'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  householdIdIdx: index('holdings_household_id_idx').on(t.householdId),
  memberIdIdx: index('holdings_member_id_idx').on(t.memberId),
  ledgerIdIdx: index('holdings_ledger_id_idx').on(t.ledgerId),
}))

export const protectionTypeEnum = ['term-life', 'health', 'disability', 'other'] as const
export const protectionStatusEnum = ['active', 'lapsed', 'pending'] as const

export const protection = pgTable('protection', {
  id: uuid('id').defaultRandom().primaryKey(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').notNull().references(() => familyMembers.id, { onDelete: 'cascade' }),
  type: text('type', { enum: protectionTypeEnum }),
  coverAmount: numeric('cover_amount'),
  premium: numeric('premium'),
  provider: text('provider'),
  status: text('status', { enum: protectionStatusEnum }),
  ciphertext: text('ciphertext'),
  iv: text('iv'),
  alg: text('alg'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  householdIdIdx: index('protection_household_id_idx').on(t.householdId),
}))

// v1.5 — schema only, no UI/routes in v1 (Documentation/design/DATA_MODEL.md)
export const goals = pgTable('goals', {
  id: uuid('id').defaultRandom().primaryKey(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  targetAmount: numeric('target_amount').notNull(),
  horizonYears: integer('horizon_years').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  event: text('event').notNull(),
  properties: jsonb('properties').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  createdAtIdx: index('analytics_events_created_at_idx').on(t.createdAt),
}))

// Encryption-prep: per-household key material for client-side encryption.
// Schema only in this step — nothing reads/writes it yet (see drizzle/schema.ts header note).
export const householdKeys = pgTable('household_keys', {
  householdId: uuid('household_id').primaryKey().references(() => households.id, { onDelete: 'cascade' }),
  kdfAlg: text('kdf_alg').notNull(),
  kdfIterations: integer('kdf_iterations').notNull(),
  passphraseSalt: text('passphrase_salt').notNull(),
  wrappedDekPassphrase: text('wrapped_dek_passphrase').notNull(),
  passphraseWrapIv: text('passphrase_wrap_iv').notNull(),
  recoverySalt: text('recovery_salt').notNull(),
  wrappedDekRecovery: text('wrapped_dek_recovery').notNull(),
  recoveryWrapIv: text('recovery_wrap_iv').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const householdsRelations = relations(households, ({ many, one }) => ({
  familyMembers: many(familyMembers),
  holdings: many(holdings),
  protection: many(protection),
  goals: many(goals),
  ledgers: many(ledgers),
  householdKeys: one(householdKeys, { fields: [households.id], references: [householdKeys.householdId] }),
}))

export const ledgersRelations = relations(ledgers, ({ one, many }) => ({
  household: one(households, { fields: [ledgers.householdId], references: [households.id] }),
  holdings: many(holdings),
  snapshotOf: one(ledgers, {
    fields: [ledgers.snapshotOf],
    references: [ledgers.id],
    relationName: 'ledgerSnapshotOf',
  }),
  snapshots: many(ledgers, { relationName: 'ledgerSnapshotOf' }),
}))

export const familyMembersRelations = relations(familyMembers, ({ one, many }) => ({
  household: one(households, { fields: [familyMembers.householdId], references: [households.id] }),
  holdings: many(holdings),
  protection: many(protection),
}))

export const holdingsRelations = relations(holdings, ({ one }) => ({
  household: one(households, { fields: [holdings.householdId], references: [households.id] }),
  member: one(familyMembers, { fields: [holdings.memberId], references: [familyMembers.id] }),
  instrument: one(instruments, { fields: [holdings.instrumentId], references: [instruments.id] }),
  ledger: one(ledgers, { fields: [holdings.ledgerId], references: [ledgers.id] }),
}))

export const protectionRelations = relations(protection, ({ one }) => ({
  household: one(households, { fields: [protection.householdId], references: [households.id] }),
  member: one(familyMembers, { fields: [protection.memberId], references: [familyMembers.id] }),
}))

export const householdKeysRelations = relations(householdKeys, ({ one }) => ({
  household: one(households, { fields: [householdKeys.householdId], references: [households.id] }),
}))
